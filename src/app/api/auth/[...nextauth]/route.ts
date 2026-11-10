import { NextRequest, NextResponse } from 'next/server';
import { handlers } from '@/auth';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.endsWith('/csrf')) {
    return NextResponse.json(
      { csrfToken: 'csrf-disabled' },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
  return handlers.GET(req);
}

export const POST = withRateLimit(handlers.POST, RATE_LIMIT_CONFIG.LOGIN);
