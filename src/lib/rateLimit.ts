// Token-bucket-style rate limiting via Upstash Redis.
// Falls back to a no-op limiter if UPSTASH_REDIS_REST_URL is missing,
// so you can deploy gradually (limits enable themselves once env vars exist).
//
// Use:
//   const r = await checkRateLimit("intent:user-or-ip", { limit: 10, window: 60 });
//   if (!r.ok) return apiError(429);

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function key(window: number, limit: number): string {
  return `${limit}@${window}`;
}

export interface RateLimitOptions {
  limit:  number;       // requests
  window: number;       // seconds
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;        // ms epoch when the bucket refills
}

/**
 * Checks and decrements the bucket for `identifier` under the given limit.
 * If Upstash isn't configured, allows the request (no-op).
 */
export async function checkRateLimit(identifier: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const r = getRedis();
  if (!r) {
    return { ok: true, limit: opts.limit, remaining: opts.limit, reset: Date.now() + opts.window * 1000 };
  }
  const k = key(opts.window, opts.limit);
  let lim = limiters.get(k);
  if (!lim) {
    lim = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(opts.limit, `${opts.window} s`),
      analytics: false,
      prefix: "rl",
    });
    limiters.set(k, lim);
  }
  const { success, limit, remaining, reset } = await lim.limit(identifier);
  return { ok: success, limit, remaining, reset };
}
