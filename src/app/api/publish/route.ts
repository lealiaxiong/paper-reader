import { NextResponse, type NextRequest } from "next/server";
import {
  ArxivMetadataUnavailableError,
  fetchArxivMetadata,
  metadataMatches,
  type ArxivMetadata,
} from "@/lib/arxiv-metadata";
import {
  HandoffStorageError,
  createHandoff,
  type CreateHandoffResult,
} from "@/lib/handoff";
import {
  MAX_PAYLOAD_BYTES,
  PublishPayloadError,
  buildHandoffPayload,
  type BuiltHandoff,
} from "@/lib/handoff-payload";
import { apiError } from "@/lib/http";
import { probePaperHtml } from "@/lib/paper";
import {
  authenticatePublisher,
  isPublishConfigured,
} from "@/lib/publish-auth";
import { clientIp, publishLimiter } from "@/lib/ratelimit";
import { sourcePath } from "@/lib/sources";

export const maxDuration = 30;

/** BYOM ingest: validate, sanitize, verify, and hand off without caching. */
export async function POST(req: NextRequest) {
  if (!isPublishConfigured()) {
    return apiError(
      503,
      "PUBLISH_DISABLED",
      "Publishing is not configured on this deployment.",
    );
  }

  const auth = authenticatePublisher(req);
  if (!auth) {
    return apiError(401, "UNAUTHORIZED", "A valid publisher token is required.");
  }

  if (publishLimiter) {
    try {
      const { success, reset } = await publishLimiter.limit(
        `${auth.publisherId}:${clientIp(req)}`,
      );
      if (!success) {
        return apiError(
          429,
          "RATE_LIMITED",
          "Too many publishes. Please wait a minute and try again.",
          undefined,
          {
            "Retry-After": String(
              Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
            ),
          },
        );
      }
    } catch (err) {
      // Never let a limiter outage block a valid publish.
      console.warn("Publish rate limit check failed (allowing request):", err);
    }
  }

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAYLOAD_BYTES) {
    return apiError(413, "PAYLOAD_TOO_LARGE", "The payload is too large.");
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return apiError(400, "INVALID_JSON", "The request body could not be read.");
  }
  if (Buffer.byteLength(raw) > MAX_PAYLOAD_BYTES) {
    return apiError(413, "PAYLOAD_TOO_LARGE", "The payload is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }

  let built: BuiltHandoff;
  try {
    built = buildHandoffPayload(body);
  } catch (err) {
    if (err instanceof PublishPayloadError) {
      return apiError(err.status, err.code, err.message, err.details);
    }
    console.error("Unexpected publish validation failure:", err);
    return apiError(400, "INVALID_SCHEMA", "The payload could not be validated.");
  }

  const probe = await probePaperHtml(built.arxivId);
  if (probe.available) {
    return apiError(
      409,
      "HTML_AVAILABLE",
      "This paper already has a deterministic HTML reader; use that instead.",
      {
        url: sourcePath({ source: "arxiv", id: built.arxivId }),
        source: probe.provider,
      },
    );
  }

  let metadata: ArxivMetadata | null;
  try {
    metadata = await fetchArxivMetadata(built.arxivId);
  } catch (err) {
    if (err instanceof ArxivMetadataUnavailableError) {
      return apiError(
        503,
        "METADATA_UNAVAILABLE",
        "arXiv metadata is temporarily unavailable; retry shortly.",
      );
    }
    throw err;
  }

  if (!metadata) {
    return apiError(
      422,
      "ARXIV_METADATA_MISMATCH",
      "No arXiv metadata was found for this ID.",
    );
  }

  const match = metadataMatches(
    { title: built.title, authors: built.authors },
    metadata,
  );
  if (!match.ok) {
    return apiError(
      422,
      "ARXIV_METADATA_MISMATCH",
      match.reason === "title"
        ? "The title does not match the arXiv record."
        : "The authors do not match the arXiv record.",
      {
        field: match.reason,
        expected: { title: metadata.title, authors: metadata.authors },
      },
    );
  }

  let result: CreateHandoffResult;
  try {
    result = await createHandoff({
      arxivId: built.arxivId,
      publisherId: auth.publisherId,
      payload: built.payload,
      client: built.client,
    });
  } catch (err) {
    if (err instanceof HandoffStorageError) {
      console.error("Handoff storage failure:", err);
      return apiError(
        503,
        "STORAGE_UNAVAILABLE",
        "The handoff could not be stored; retry shortly.",
      );
    }
    throw err;
  }

  return NextResponse.json(
    {
      slug: result.record.slug,
      url: `${sourcePath({ source: "arxiv", id: built.arxivId })}?h=${result.record.slug}`,
      expiresAt: new Date(result.record.expiresAt).toISOString(),
      deduped: result.deduped,
    },
    { status: result.deduped ? 200 : 201 },
  );
}
