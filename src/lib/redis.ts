import { Redis } from "@upstash/redis";

/**
 * Upstash integration env names differ by provisioning path (own Upstash
 * project vs Vercel Marketplace), so accept both. Null when not configured:
 * callers fall back to in-memory behavior or skip the write.
 */
const url =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
