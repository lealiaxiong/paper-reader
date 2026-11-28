#!/usr/bin/env node
/**
 * Generate a strong bearer token for PUBLISH_TOKENS or ADMIN_TOKEN.
 * Usage: node scripts/generate-token.mjs [bytes]
 * The token has no `=` padding; it is safe for env files and shell exports.
 */
import { randomBytes } from "node:crypto";

const bytes = Number(process.argv[2] ?? "32");
if (!Number.isInteger(bytes) || bytes < 16 || bytes > 1024) {
  console.error("usage: node scripts/generate-token.mjs [bytes]  (16-1024)");
  process.exit(1);
}

console.log(randomBytes(bytes).toString("base64url"));
