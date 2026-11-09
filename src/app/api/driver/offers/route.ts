import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { getDriverOffers, dispatchSweep } from '@/server/dispatch/service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  requireRole(user, 'DRIVER');

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  if (!driver) {
    console.error('[Driver Data Fetch Error] /api/driver/offers: Driver profile not found for user', user.id);
    return NextResponse.json({ data: [] });
  }

  // Lazy sweep on read: advance expired offers before listing
  try {
    await dispatchSweep();
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] lazy dispatch sweep in driver offers:', err);
    logger.warn({
      msg: 'Lazy dispatch sweep failed in driver offers read',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const offers = await getDriverOffers(driver.id);
    return NextResponse.json({ data: offers });
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/driver/offers getDriverOffers:', err);
    return NextResponse.json({ data: [] });
  }
});
