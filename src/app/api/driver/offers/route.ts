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
    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
  }

  // Lazy sweep on read: advance expired offers before listing
  try {
    await dispatchSweep();
  } catch (err: unknown) {
    logger.warn({
      msg: 'Lazy dispatch sweep failed in driver offers read',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const offers = await getDriverOffers(driver.id);
  return NextResponse.json({ data: offers });
});
