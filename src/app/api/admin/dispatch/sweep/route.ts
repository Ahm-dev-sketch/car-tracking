import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { dispatchSweep } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async () => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const result = await dispatchSweep();
  return NextResponse.json({
    ok: true,
    sweptAt: result.sweptAt,
  });
});
