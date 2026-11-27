import { NextResponse, type NextRequest } from "next/server";
import { HandoffStorageError, deleteHandoff, getHandoff, SLUG_PATTERN } from "@/lib/handoff";
import { apiError } from "@/lib/http";
import { authenticatePublisher, isAdminRequest } from "@/lib/publish-auth";


type RouteContext = {
  params: Promise<{ slug: string }>;
};

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) {
    return apiError(
      404,
      "HANDOFF_NOT_FOUND",
      "That handoff does not exist.",
      undefined,
      NO_STORE,
    );
  }

  let record;
  try {
    record = await getHandoff(slug);
  } catch (err) {
    if (err instanceof HandoffStorageError) {
      console.error("Handoff read failure:", err);
      return apiError(
        503,
        "STORAGE_UNAVAILABLE",
        "The handoff could not be read; retry shortly.",
        undefined,
        NO_STORE,
      );
    }
    throw err;
  }

  if (!record) {
    return apiError(
      410,
      "HANDOFF_EXPIRED",
      "This handoff has expired. Re-run your agent to generate a new link.",
      undefined,
      NO_STORE,
    );
  }

  return NextResponse.json(
    {
      data: record.payload,
      provenance: "byom",
      arxivId: record.arxivId,
      expiresAt: new Date(record.expiresAt).toISOString(),
      createdAt: new Date(record.createdAt).toISOString(),
      ...(record.client ? { client: record.client } : {}),
    },
    { headers: NO_STORE },
  );
}

/** Takedown: the owning publisher or an admin token. */
export async function DELETE(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const publisher = authenticatePublisher(req);
  const admin = isAdminRequest(req);
  if (!publisher && !admin) {
    return apiError(401, "UNAUTHORIZED", "A valid publisher or admin token is required.");
  }

  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) {
    return apiError(404, "HANDOFF_NOT_FOUND", "That handoff does not exist.");
  }

  let record;
  try {
    record = await getHandoff(slug);
  } catch (err) {
    if (err instanceof HandoffStorageError) {
      console.error("Handoff read failure:", err);
      return apiError(
        503,
        "STORAGE_UNAVAILABLE",
        "The handoff could not be read; retry shortly.",
      );
    }
    throw err;
  }

  if (!record) {
    return apiError(404, "HANDOFF_NOT_FOUND", "That handoff does not exist.");
  }

  if (!admin && publisher?.publisherId !== record.publisherId) {
    return apiError(403, "FORBIDDEN", "This handoff belongs to another publisher.");
  }

  try {
    await deleteHandoff(slug);
  } catch (err) {
    if (err instanceof HandoffStorageError) {
      console.error("Handoff delete failure:", err);
      return apiError(
        503,
        "STORAGE_UNAVAILABLE",
        "The handoff could not be deleted; retry shortly.",
      );
    }
    throw err;
  }

  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
