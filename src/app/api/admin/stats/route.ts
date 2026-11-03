import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getAdminStats } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const stats = await getAdminStats();
  return NextResponse.json({ data: stats });
});
