import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveMapsLink } from '@/lib/google-maps-resolve';

export const dynamic = 'force-dynamic';

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    await getSessionUser();

    let body: { url?: unknown };
    try {
      body = (await req.json()) as { url?: unknown };
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'url is required');
    }

    const url = body?.url;
    if (typeof url !== 'string' || url.trim() === '') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'url is required');
    }

    const result = await resolveMapsLink(url.trim(), fetch);
    return NextResponse.json({ data: result });
  }),
  { limit: 30, windowMs: 60_000 }
);
