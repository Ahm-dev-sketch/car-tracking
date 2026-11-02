import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';

// Rate limiting: In-memory/Redis sliding-window rate limiter scheduled for Phase 2+ (ARCHITECTURE.md §4).
// Stub note: rate limiting checks will return 429 RATE_LIMIT_EXCEEDED when enabled.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RouteHandler<T = unknown> = (
  req: NextRequest,
  ctx?: T
) => Promise<NextResponse> | NextResponse;

export function withErrorHandling<T = unknown>(handler: RouteHandler<T>): RouteHandler<T> {
  return async (req: NextRequest, ctx?: T): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status >= 500) {
          logger.error({ msg: err.message, code: err.code, status: err.status });
        }
        return NextResponse.json(
          {
            error: {
              code: err.code,
              message: err.message,
              ...(err.details ? { details: err.details } : {}),
            },
          },
          { status: err.status }
        );
      }

      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input data',
              details: err.flatten().fieldErrors,
            },
          },
          { status: 400 }
        );
      }

      const message = err instanceof Error ? err.message : 'Internal server error';
      logger.error({ msg: 'Unhandled error in API route', error: message, path: req.nextUrl?.pathname });

      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        },
        { status: 500 }
      );
    }
  };
}
