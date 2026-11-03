import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { arriveTrip } from '@/server/trips/service';

export const dynamic = 'force-dynamic';

async function handleArrived(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id: tripId } = await params;

  const ctx = getClientContext(req, user.id);
  const result = await arriveTrip(user, tripId, {
    actorUserId: user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ data: result });
}

export const POST = withErrorHandling(handleArrived);
export const PATCH = withErrorHandling(handleArrived);
