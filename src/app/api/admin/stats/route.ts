import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getAdminStats } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  try {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const stats = await getAdminStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    console.error('FATAL DB ERROR [GET /api/admin/stats]:', error);
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : 'Failed to retrieve admin stats';
    return NextResponse.json(
      {
        success: false,
        error: { code: 'STATS_FETCH_FAILED', message },
        message,
      },
      { status: 503 }
    );
  }
});
