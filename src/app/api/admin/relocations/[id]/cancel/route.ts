import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { cancelRelocationSchema } from '@/lib/validation';
import { cancelRelocation } from '@/server/relocations/service';

export const dynamic = 'force-dynamic';

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const { id } = await context.params;
    const rawBody = await req.json().catch(() => ({}));
    const validated = cancelRelocationSchema.parse(rawBody ?? {});

    const ctx = getClientContext(req, user.id);
    const updated = await cancelRelocation(id, user, validated, ctx);
    return NextResponse.json({ data: updated });
  }),
  RATE_LIMIT_CONFIG.ADMIN_MUTATION
);
