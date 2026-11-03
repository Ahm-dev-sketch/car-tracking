import { NextRequest, NextResponse } from 'next/server';
import { RouteHandler } from './errors';

// In-memory sliding window rate limiter (Worker-safe pure TypeScript, no dependencies).
// Note for Cloudflare Workers: this in-memory Map resets per isolate / Worker instance.
// For distributed production rate limiting at the edge, swap to Cloudflare Durable Objects or Redis.

interface RateLimitEntry {
  timestamps: number[];
  lastActivity: number;
}

const store = new Map<string, RateLimitEntry>();

// Sweep idle entries periodically so the Map doesn't grow unbounded
// (unique keys accumulate from login attempts across many IPs/emails).
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweepStaleEntries(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  const maxWindowMs = Math.max(
    ...Object.values(RATE_LIMIT_CONFIG).map((c) => c.windowMs)
  );
  for (const [key, entry] of store) {
    if (now - entry.lastActivity > maxWindowMs) {
      store.delete(key);
    }
  }
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
}

export function rateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = now - options.windowMs;

  sweepStaleEntries();

  let entry = store.get(options.key);
  if (!entry) {
    entry = { timestamps: [], lastActivity: now };
    store.set(options.key, entry);
  }
  entry.lastActivity = now;

  // Remove timestamps outside window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= options.limit) {
    const oldestTimestamp = entry.timestamps[0];
    const resetMs = oldestTimestamp ? oldestTimestamp + options.windowMs - now : options.windowMs;
    return {
      success: false,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  entry.timestamps.push(now);

  return {
    success: true,
    remaining: options.limit - entry.timestamps.length,
    resetMs: options.windowMs,
  };
}

// Reset store - useful for testing
export function resetRateLimitStore(): void {
  store.clear();
}

export const RATE_LIMIT_CONFIG = {
  // Login brute force: 10 attempts per 15 minutes per email+IP
  LOGIN: {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  },
  // Admin resource mutations: 30 requests per minute
  ADMIN_MUTATION: {
    limit: 30,
    windowMs: 60 * 1000,
  },
  // Assignment endpoints: 30 requests per minute
  ASSIGNMENT: {
    limit: 30,
    windowMs: 60 * 1000,
  },
  // User booking creation: 10 requests per minute
  BOOKING_CREATE: {
    limit: 10,
    windowMs: 60 * 1000,
  },
  // GPS location ingest: 120 requests per minute per driver
  LOCATION_INGEST: {
    limit: 120,
    windowMs: 60 * 1000,
  },
  // Driver session start: 30 requests per minute
  DRIVER_SESSION: {
    limit: 30,
    windowMs: 60 * 1000,
  },
} as const;

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

export interface WithRateLimitConfig {
  limit: number;
  windowMs: number;
  keyGenerator?: (req: NextRequest) => Promise<string> | string;
}

export function withRateLimit<T = any>(
  handler: RouteHandler<T>,
  config: WithRateLimitConfig
): (req: NextRequest, ctx: T) => Promise<Response> {
  return async (req: NextRequest, ctx: T): Promise<Response> => {
    let key: string;
    if (config.keyGenerator) {
      key = await config.keyGenerator(req);
    } else {
      const ip = getClientIp(req);
      key = `${ip}:${req.nextUrl?.pathname ?? 'api'}`;
    }

    const result = rateLimit({
      key,
      limit: config.limit,
      windowMs: config.windowMs,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil(result.resetMs / 1000).toString(),
          },
        }
      );
    }

    return handler(req, ctx);
  };
}
