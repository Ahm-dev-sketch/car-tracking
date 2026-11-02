import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { markAsRead } from '@/server/notifications/service';

export const PATCH = withErrorHandling(
  async (_req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing notification id' } },
        { status: 400 }
      );
    }

    const updated = await markAsRead(id, user.id);
    return NextResponse.json({ data: updated });
  }
);
