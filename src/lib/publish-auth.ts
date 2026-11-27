import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export type PublisherAuth = {
  /** Raw bearer token; never log or persist it. */
  token: string;
  /** Stable, non-reversible publisher identity. */
  publisherId: string;
};

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/** Deploy-issued tokens. Comma-separated so one deploy can serve several publishers. */
function configuredTokens(): string[] {
  return (process.env.PUBLISH_TOKENS ?? process.env.PAPER_READER_TOKEN ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function publisherIdFor(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Fail closed when no publisher tokens are configured. */
export function isPublishConfigured(): boolean {
  return configuredTokens().length > 0;
}

export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(BEARER_PATTERN);
  return match ? match[1].trim() : null;
}

/** Resolve a configured publisher from the request bearer token. */
export function authenticatePublisher(req: NextRequest): PublisherAuth | null {
  const token = bearerToken(req);
  if (!token) return null;
  for (const candidate of configuredTokens()) {
    if (safeEqual(token, candidate)) {
      return { token, publisherId: publisherIdFor(token) };
    }
  }
  return null;
}

/** Admin token for takedowns. Never a publisher identity. */
export function isAdminRequest(req: NextRequest): boolean {
  const admin = process.env.ADMIN_TOKEN?.trim();
  if (!admin) return false;
  const token = bearerToken(req);
  return token !== null && safeEqual(token, admin);
}
