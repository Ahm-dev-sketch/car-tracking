import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getVehicleTracking } from '@/server/tracking/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(
  async (_req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing vehicle id' } },
        { status: 400 }
      );
    }

    const data = await getVehicleTracking(id, user);
    return NextResponse.json({ data });
  }
);
