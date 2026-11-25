import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { completeRelocationSchema } from '@/lib/validation';
import { completeRelocation } from '@/server/relocations/service';

export const dynamic = 'force-dynamic';

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN', 'DRIVER');

    const { id } = await context.params;
    const rawBody = await req.json().catch(() => ({}));
    const validated = completeRelocationSchema.parse(rawBody ?? {});

    const ctx = getClientContext(req, user.id);
    const updated = await completeRelocation(id, user, validated, ctx);
    return NextResponse.json({ data: updated });
  }),
  RATE_LIMIT_CONFIG.ASSIGNMENT
);
