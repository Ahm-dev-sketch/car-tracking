import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getDriverById } from '@/server/drivers/service';

export const GET = withErrorHandling(
  async (_req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    await getSessionUser();

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing driver id' } },
        { status: 400 }
      );
    }

    const driver = await getDriverById(id);
    return NextResponse.json({ data: driver });
  }
);
