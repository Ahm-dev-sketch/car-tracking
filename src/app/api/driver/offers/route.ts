import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { getDriverOffers, dispatchSweep } from '@/server/dispatch/service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  let user = null;
  try {
    user = await getSessionUser();
    requireRole(user, 'DRIVER');
  } catch (authErr: unknown) {
    if (authErr instanceof ApiError && (authErr.status === 401 || authErr.status === 403)) {
      throw authErr;
    }
    console.error('[Driver Data Fetch Error] /api/driver/offers auth lookup:', authErr);
    return NextResponse.json({ data: [] });
  }

  let driver = null;
  try {
    driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });
  } catch (driverErr: unknown) {
    console.error('[Driver Data Fetch Error] /api/driver/offers driver lookup:', driverErr);
    return NextResponse.json({ data: [] });
  }

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
