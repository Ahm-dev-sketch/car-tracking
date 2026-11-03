import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { listCandidates } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(
  async (_req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const { bookingId } = await params;
    const candidates = await listCandidates(user.id, bookingId);

    return NextResponse.json({ data: candidates });
  }
);
