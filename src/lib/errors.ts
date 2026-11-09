import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';

// Rate limiting: In-memory sliding-window limiter per user+IP (Phase 2).
// Cloudflare edge migration note: swap to Durable Objects or Redis for distributed rate-limiting.

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

export type RouteHandler<T = any> = (
  req: NextRequest,
  ctx: T
) => Promise<Response> | Response;

export function withErrorHandling<T = any>(
  handler: (req: NextRequest, ctx: T) => Promise<Response> | Response
): (req: NextRequest, ctx: T) => Promise<Response> {
  return async (req: NextRequest, ctx: T): Promise<Response> => {
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
      console.error('[Driver Data Fetch Error]:', err);
      logger.error({
        msg: 'Unhandled error in API route',
        error: message,
        path: req.nextUrl?.pathname,
      });

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
