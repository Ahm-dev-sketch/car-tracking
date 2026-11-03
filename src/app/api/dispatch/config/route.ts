import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { DISPATCH_CONFIG } from '@/server/dispatch/config';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await getSessionUser();

  return NextResponse.json({
    config: {
      ...DISPATCH_CONFIG,
      etaMode: 'haversine_estimate',
    },
  });
});
