// ─── Rate Limiting Utility ────────────────────────────────────────────────────
// Uses Upstash Redis for distributed rate limiting.
// Falls back to in-memory rate limiting if Redis is not configured.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Check if Upstash Redis is configured
const hasUpstashRedis = !!(
  process.env.UPSTASH_REDIS_REST_URL && 
  process.env.UPSTASH_REDIS_REST_TOKEN
);

// Initialize Redis client if configured
const redis = hasUpstashRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Rate limiters for different use cases
export const rateLimiters = {
  // Payment endpoints - 10 requests per minute per IP
  payment: hasUpstashRedis
    ? new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "opscentre:ratelimit:payment",
        analytics: true,
      })
    : null,

  // Authentication endpoints - 5 requests per minute per IP
  auth: hasUpstashRedis
    ? new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(5, "1 m"),
        prefix: "opscentre:ratelimit:auth",
        analytics: true,
      })
    : null,

  // API endpoints - 100 requests per minute per IP
  api: hasUpstashRedis
    ? new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(100, "1 m"),
        prefix: "opscentre:ratelimit:api",
        analytics: true,
      })
    : null,

  // Broadcast endpoints - 3 requests per minute per user
  broadcast: hasUpstashRedis
    ? new Ratelimit({
        redis: redis!,
        limiter: Ratelimit.slidingWindow(3, "1 m"),
        prefix: "opscentre:ratelimit:broadcast",
        analytics: true,
      })
    : null,
};

// In-memory fallback rate limiter (for development/testing)
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

function inMemoryRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const key = identifier;
  const record = inMemoryStore.get(key);

  if (!record || now > record.resetAt) {
    // Reset or create new record
    inMemoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, reset: now + windowMs };
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0, reset: record.resetAt };
  }

  record.count++;
  return { success: true, remaining: limit - record.count, reset: record.resetAt };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of inMemoryStore) {
    if (now > record.resetAt) {
      inMemoryStore.delete(key);
    }
  }
}, 60_000); // Clean up every minute

// ── Rate limit check function ─────────────────────────────────────────────────
export async function checkRateLimit(
  type: keyof typeof rateLimiters,
  identifier: string
): Promise<{
  success: boolean;
  remaining: number;
  reset: number;
}> {
  const limiter = rateLimiters[type];

  // Use Upstash rate limiter if available
  if (limiter) {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  }

  // Fallback to in-memory rate limiting
  const limits: Record<string, { limit: number; windowMs: number }> = {
    payment: { limit: 10, windowMs: 60_000 },
    auth: { limit: 5, windowMs: 60_000 },
    api: { limit: 100, windowMs: 60_000 },
    broadcast: { limit: 3, windowMs: 60_000 },
  };

  const config = limits[type] ?? { limit: 100, windowMs: 60_000 };
  return inMemoryRateLimit(`${type}:${identifier}`, config.limit, config.windowMs);
}

// ── Helper to get client IP ───────────────────────────────────────────────────
export function getClientIP(headers: Headers): string {
  // Check various headers that might contain the real IP
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  const cfIP = headers.get("cf-connecting-ip");
  if (cfIP) {
    return cfIP;
  }

  // Fallback for development
  return "127.0.0.1";
}

// ── Rate limit response helper ────────────────────────────────────────────────
export function rateLimitResponse(reset: number) {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      message: "Please wait before trying again",
      retryAfter: Math.ceil((reset - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
        "X-RateLimit-Limit": "See endpoint documentation",
        "X-RateLimit-Reset": String(reset),
      },
    }
  );
}
