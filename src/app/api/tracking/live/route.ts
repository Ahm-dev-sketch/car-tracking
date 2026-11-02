import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getLiveTracking } from '@/server/tracking/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  const data = await getLiveTracking(user);
  return NextResponse.json({ data });
});
