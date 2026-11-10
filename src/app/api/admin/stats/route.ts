import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getAdminStats } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  let user;
  try {
    user = await getSessionUser();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw err;
    console.error('DB ERROR [GET /api/admin/stats auth]:', err);
    return NextResponse.json({ success: false, warning: 'Database busy' }, { status: 200 });
  }

  requireRole(user, 'ADMIN');

  try {
    const stats = await getAdminStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    console.error('DB ERROR [GET /api/admin/stats]:', error);
    return NextResponse.json(
      {
        success: false,
        warning: 'Database busy',
      },
      { status: 200 }
    );
  }
});
