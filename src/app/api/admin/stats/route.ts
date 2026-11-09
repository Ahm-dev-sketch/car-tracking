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
        data: {
          vehicles: { total: 0, available: 0, reserved: 0, inUse: 0, maintenance: 0, inactive: 0 },
          drivers: { online: 0, busy: 0, offline: 0 },
          bookings: { active: 0, searching: 0, completedToday: 0, actionRequired: 0 },
          byLocation: [],
        },
      },
      { status: 200 }
    );
  }
});
