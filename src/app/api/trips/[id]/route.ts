import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getTripById } from '@/server/trips/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(
  async (_req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing trip id' } },
        { status: 400 }
      );
    }

    const trip = await getTripById(id, user);
    return NextResponse.json({ data: trip });
  }
);
