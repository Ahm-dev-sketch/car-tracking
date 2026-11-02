import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { TRACKING_CONFIG } from '@/server/tracking/config';
import { prisma } from '@/lib/prisma';
import { TripStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();

  let activeTrip = null;
  if (user.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });
    if (driver) {
      activeTrip = await prisma.trip.findFirst({
        where: { driverId: driver.id, status: TripStatus.ACTIVE },
        include: {
          vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
          booking: { select: { id: true, bookingNumber: true, pickupLocation: true, destination: true } },
        },
      });
    }
  }

  return NextResponse.json({
    config: TRACKING_CONFIG,
    sessionState: {
      role: user.role,
      activeTrip,
    },
  });
});
