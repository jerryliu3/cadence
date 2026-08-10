/**
 * Process-local sliding-window rate limiter.
 *
 * Suitable as a cheap footgun guard on expensive/authenticated routes.
 * Not a distributed limiter — under multi-instance serverless each instance
 * keeps its own counters. Prefer quota RPCs for durable per-user budgets.
 */

interface RateLimitBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  if (limit < 1 || windowMs < 1) {
    return { allowed: true, remaining: limit, retryAfterMs: 0 };
  }

  const bucket = buckets.get(key) ?? { timestamps: [] };
  const windowStart = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(1, oldest + windowMs - now),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    retryAfterMs: 0,
  };
}

export function resetRateLimitBucketsForTests() {
  buckets.clear();
}
