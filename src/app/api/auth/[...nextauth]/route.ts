import { NextRequest, NextResponse } from 'next/server';
import { handlers } from '@/auth';
import { getClientIp, rateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';

export const { GET } = handlers;

export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/callback/credentials')) {
    let email = 'unknown';
    try {
      const contentType = req.headers.get('content-type') ?? '';
      const cloned = req.clone();
      if (contentType.includes('application/json')) {
        const body = await cloned.json();
        if (typeof body?.email === 'string' && body.email.trim()) {
          email = body.email.trim().toLowerCase();
        }
      } else {
        const formData = await cloned.formData();
        const rawEmail = formData.get('email');
        if (typeof rawEmail === 'string' && rawEmail.trim()) {
          email = rawEmail.trim().toLowerCase();
        }
      }
    } catch {
      // Fallback to IP-only bucket if request body cannot be inspected
    }

    const ip = getClientIp(req);
    const result = rateLimit({
      key: `login:${email}:${ip}`,
      limit: RATE_LIMIT_CONFIG.LOGIN.limit,
      windowMs: RATE_LIMIT_CONFIG.LOGIN.windowMs,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts. Please try again later.',
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
  }

  return handlers.POST(req);
}
