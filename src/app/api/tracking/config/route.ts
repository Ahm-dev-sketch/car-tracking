import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { encode } from 'next-auth/jwt';
import { TRACKING_CONFIG } from '@/server/tracking/config';
import { DISPATCH_CONFIG } from '@/server/dispatch/config';
import { prisma } from '@/lib/prisma';
import { TripStatus, DriverSessionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();

  let activeTrip = null;
  let activeSession = null;
  let driverProfile = null;
  if (user.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });
    driverProfile = driver;
    if (driver) {
      activeTrip = await prisma.trip.findFirst({
        where: { driverId: driver.id, status: TripStatus.ACTIVE },
        include: {
          vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
          booking: {
            select: {
              id: true,
              bookingNumber: true,
              pickupLocation: true,
              destination: true,
              status: true,
              passengerCount: true,
              pickupLat: true,
              pickupLng: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
          },
        },
      });

      activeSession = await prisma.driverSession.findFirst({
        where: { driverId: driver.id, status: DriverSessionStatus.ACTIVE },
        include: {
          vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
        },
      });
    }
  }

  let realtimeToken: string | null = null;
  const authSecret = process.env.AUTH_SECRET;
  if (authSecret) {
    try {
      realtimeToken = await encode({
        token: {
          userId: user.id,
          sub: user.id,
          role: user.role,
          driverId: driverProfile?.id,
          exp: Math.floor(Date.now() / 1000) + 3600 * 24,
        },
        secret: authSecret,
        salt: 'authjs.session-token',
      });
    } catch {
      // Non-fatal if encoding fails
    }
  }

  return NextResponse.json({
    config: TRACKING_CONFIG,
    dispatchConfig: DISPATCH_CONFIG,
    realtimeToken,
    sessionState: {
      role: user.role,
      activeTrip,
      activeSession,
    },
  });
});
