import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getLiveTracking } from '@/server/tracking/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  try {
    const user = await getSessionUser();
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get('locationId') ?? searchParams.get('location_id') ?? undefined;
    const data = await getLiveTracking(user, locationId);
    return NextResponse.json({ data });
  } catch (error: unknown) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    console.error('ERROR [GET /api/tracking/live]:', error);
    return NextResponse.json({ data: [], warning: 'Database busy' }, { status: 200 });
  }
});
