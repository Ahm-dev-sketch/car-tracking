import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { dispatchSweep } from '@/server/dispatch/service';
import { BookingStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  try {
    await dispatchSweep();
  } catch {
    // Non-blocking if background sweep fails
  }

  let count = 0;
  try {
    count = await prisma.booking.count({
      where: {
        OR: [
          {
            status: {
              in: [
                BookingStatus.PENDING,
                BookingStatus.ADMIN_INTERVENTION,
                BookingStatus.NO_DRIVER_AVAILABLE,
              ],
            },
          },
          {
            status: BookingStatus.PENDING_COMPLETION,
            rejectedReason: null,
          },
        ],
      },
    });
  } catch (err: unknown) {
    console.error('FATAL DB ERROR [GET /api/admin/bookings/action-required]:', err);
  }

  return NextResponse.json({ data: { count } });
});
