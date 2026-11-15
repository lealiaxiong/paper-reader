import { Redis } from "@upstash/redis";

/**
 * Vercel-injected credentials (`KV_*`) are only honored on Vercel itself.
 * `vercel env pull` copies them into `.env.local`, so accepting them anywhere
 * would make local dev silently read and write the production database.
 *
 * Local dev therefore uses the in-memory fallback by default. To exercise
 * Redis locally, point `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
 * at your own (non-production) Upstash database.
 */
const onVercel = Boolean(process.env.VERCEL);
const url = onVercel
  ? (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)
  : process.env.UPSTASH_REDIS_REST_URL;
const token = onVercel
  ? (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)
  : process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
