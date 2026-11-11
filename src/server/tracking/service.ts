import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { TRACKING_CONFIG } from './config';
import { MovementStatus, TripStatus, BookingStatus, DriverSessionStatus } from '@prisma/client';
import { AuthenticatedUser } from '@/lib/auth-guard';
import { publishEvent } from '@/server/realtime/hub';

export interface LocationPointInput {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  recordedAt: Date;
}

export interface IngestResult {
  accepted: number;
  rejected: Array<{ index: number; reason: string }>;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function classifyMovement(
  prev: { lat: number; lng: number } | null,
  cur: { lat: number; lng: number; speedMps?: number | null }
): MovementStatus {
  if (cur.speedMps !== null && cur.speedMps !== undefined && cur.speedMps > 2) {
    return MovementStatus.MOVING;
  }
  if (prev) {
    const delta = haversineDistanceMeters(prev.lat, prev.lng, cur.lat, cur.lng);
    if (delta > 50) {
      return MovementStatus.MOVING;
    }
  }
  return MovementStatus.STOPPED;
}

export async function markStale(
  staleThresholdSec?: number
): Promise<number> {
  const now = Date.now();
  const tripCutoff = new Date(now - (staleThresholdSec ?? TRACKING_CONFIG.tripIntervalSec * TRACKING_CONFIG.maxStaleMultiplier) * 1000);
  const idleCutoff = new Date(now - (staleThresholdSec ?? TRACKING_CONFIG.idleIntervalSec * TRACKING_CONFIG.maxStaleMultiplier) * 1000);
  const updated = await prisma.vehicleLocation.updateMany({
    where: {
      movement: { notIn: [MovementStatus.OFFLINE, MovementStatus.GPS_LOST] },
      OR: [
        { trip: { is: { status: TripStatus.ACTIVE } }, receivedAt: { lt: tripCutoff } },
        { trip: { is: null }, receivedAt: { lt: idleCutoff } },
        { trip: { is: { status: { not: TripStatus.ACTIVE } } }, receivedAt: { lt: idleCutoff } },
      ],
    },
    data: {
      movement: MovementStatus.GPS_LOST,
    },
  });
  return updated.count;
}

export async function ingestLocations(
  driverId: string,
  rawPoints: LocationPointInput[]
): Promise<IngestResult> {
  const activeTrip = await prisma.trip.findFirst({
    where: { driverId, status: TripStatus.ACTIVE },
    include: {
      driver: { include: { user: true } },
      vehicle: true,
      booking: true,
    },
  });

  const activeSession = await prisma.driverSession.findFirst({
    where: { driverId, status: DriverSessionStatus.ACTIVE },
    include: {
      driver: { include: { user: true } },
      vehicle: true,
    },
  });

  if (!activeTrip && !activeSession) {
    throw new ApiError(
      403,
      'TRACKING_SESSION_REQUIRED',
      'No active tracking session / trip found for driver'
    );
  }

  const isTrip = Boolean(activeTrip);
  const targetVehicleId =
    activeTrip?.vehicleId ??
    activeSession?.vehicleId ??
    activeSession?.driver.currentVehicleId;

  if (!targetVehicleId) {
    throw new ApiError(
      400,
      'VEHICLE_REQUIRED_FOR_TRACKING',
      'No vehicle associated with active session or driver'
    );
  }

  const now = Date.now();
  const maxFutureSkewMs = TRACKING_CONFIG.maxFutureSkewSec * 1000;
  const intervalSec = isTrip
    ? TRACKING_CONFIG.tripIntervalSec
    : TRACKING_CONFIG.idleIntervalSec;
  const maxStaleMs =
    intervalSec * TRACKING_CONFIG.maxStaleMultiplier * 1000;
  const accuracyCap = isTrip
    ? TRACKING_CONFIG.accuracyCapTripM
    : TRACKING_CONFIG.accuracyCapIdleM;

  const accepted: LocationPointInput[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];

    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      rejected.push({ index: i, reason: 'Invalid latitude or longitude coordinate' });
      continue;
    }

    if (!Number.isFinite(p.accuracyM) || p.accuracyM < 0 || p.accuracyM > 5000) {
      rejected.push({ index: i, reason: 'Accuracy out of range (0-5000m)' });
      continue;
    }

    if (p.accuracyM > accuracyCap) {
      rejected.push({
        index: i,
        reason: `Accuracy ${p.accuracyM}m exceeds trip cap ${accuracyCap}m`,
      });
      continue;
    }

    if (
      p.speedMps !== null &&
      p.speedMps !== undefined &&
      (!Number.isFinite(p.speedMps) || p.speedMps < 0 || p.speedMps > TRACKING_CONFIG.maxSpeedMps)
    ) {
      rejected.push({ index: i, reason: `Speed out of bounds (0-${TRACKING_CONFIG.maxSpeedMps} m/s)` });
      continue;
    }

    if (
      p.headingDeg !== null &&
      p.headingDeg !== undefined &&
      (!Number.isFinite(p.headingDeg) || p.headingDeg < 0 || p.headingDeg > 360)
    ) {
      rejected.push({ index: i, reason: 'Heading out of bounds (0-360 degrees)' });
      continue;
    }

    const recordedMs = p.recordedAt.getTime();
    if (!Number.isFinite(recordedMs)) {
      rejected.push({ index: i, reason: 'Invalid recorded timestamp' });
      continue;
    }
    if (recordedMs > now + maxFutureSkewMs) {
      rejected.push({ index: i, reason: 'Recorded timestamp is in the future' });
      continue;
    }

    if (recordedMs < now - maxStaleMs) {
      rejected.push({ index: i, reason: 'Recorded timestamp is stale' });
      continue;
    }

    accepted.push(p);
  }

  if (accepted.length > 0) {
    // Sort accepted points ascending by recordedAt
    accepted.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    // Validate the live session under locks before writing either history or snapshot.
    const latestPoint = accepted[accepted.length - 1];
    const movement = await prisma.$transaction(async (tx) => {
      // Serialize snapshot updates so delayed batches cannot rewind live telemetry.
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${targetVehicleId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${driverId} FOR UPDATE`;
      // Session/trip shutdown uses the same driver lock. An in-flight upload must
      // never revive an OFFLINE snapshot or attach old points to a new journey.
      const currentTrip = await tx.trip.findFirst({ where: { driverId, status: TripStatus.ACTIVE } });
      const currentSession = currentTrip ? null : await tx.driverSession.findFirst({
        where: { driverId, status: DriverSessionStatus.ACTIVE },
        include: { driver: { select: { currentVehicleId: true } } },
      });
      const currentVehicleId = currentTrip?.vehicleId ?? currentSession?.vehicleId ?? currentSession?.driver.currentVehicleId;
      if ((!currentTrip && !currentSession) || currentTrip?.id !== activeTrip?.id || currentVehicleId !== targetVehicleId || (!currentTrip && currentSession?.id !== activeSession?.id)) {
        throw new ApiError(409, 'TRACKING_SESSION_CHANGED', 'Tracking session changed during upload. Refresh the driver dashboard.');
      }
      for (const p of accepted) {
        await tx.driverLocation.create({
          data: {
            driverId,
            vehicleId: targetVehicleId,
            tripId: activeTrip?.id ?? null,
            lat: p.lat,
            lng: p.lng,
            accuracyM: p.accuracyM,
            speedMps: p.speedMps ?? null,
            headingDeg: p.headingDeg ?? null,
            recordedAt: p.recordedAt,
            receivedAt: new Date(),
          },
        });
      }
      const prevLocation = await tx.vehicleLocation.findUnique({
        where: { vehicleId: targetVehicleId },
      });

      if (prevLocation && prevLocation.recordedAt >= latestPoint.recordedAt) {
        return null;
      }
      const movement = classifyMovement(
        prevLocation ? { lat: prevLocation.lat, lng: prevLocation.lng } : null,
        latestPoint
      );

      await tx.vehicleLocation.upsert({
        where: { vehicleId: targetVehicleId },
        create: {
          vehicleId: targetVehicleId,
          driverId,
          tripId: activeTrip?.id ?? null,
          lat: latestPoint.lat,
          lng: latestPoint.lng,
          accuracyM: latestPoint.accuracyM,
          speedMps: latestPoint.speedMps ?? null,
          headingDeg: latestPoint.headingDeg ?? null,
          recordedAt: latestPoint.recordedAt,
          receivedAt: new Date(),
          movement,
        },
        update: {
          driverId,
          tripId: activeTrip?.id ?? null,
          lat: latestPoint.lat,
          lng: latestPoint.lng,
          accuracyM: latestPoint.accuracyM,
          speedMps: latestPoint.speedMps ?? null,
          headingDeg: latestPoint.headingDeg ?? null,
          recordedAt: latestPoint.recordedAt,
          receivedAt: new Date(),
          movement,
        },
      });

      return movement;
    }, { maxWait: 15000, timeout: 20000 });

    if (movement !== null) {
      void Promise.resolve(
        publishEvent({
          type: 'location:update',
          data: {
            vehicleId: targetVehicleId,
            lat: latestPoint.lat,
            lng: latestPoint.lng,
            accuracyM: latestPoint.accuracyM,
            speedMps: latestPoint.speedMps ?? null,
            headingDeg: latestPoint.headingDeg ?? null,
            recordedAt: latestPoint.recordedAt.toISOString(),
            receivedAt: new Date().toISOString(),
            movement,
            driverName: activeTrip?.driver?.user?.name ?? activeSession?.driver?.user?.name ?? null,
            driverPhone: activeTrip?.driver?.user?.phone ?? activeSession?.driver?.user?.phone ?? null,
            plateNumber: activeTrip?.vehicle?.plateNumber ?? activeSession?.vehicle?.plateNumber ?? null,
            tripOrigin: activeTrip?.booking?.pickupLocation ?? null,
            tripDestination: activeTrip?.booking?.destination ?? null,
          },
        })
      ).catch((err) => console.warn('[Publish Event Warning]:', err));
    }
  }

  return {
    accepted: accepted.length,
    rejected,
  };
}

export async function getVehicleTracking(
  vehicleId: string,
  actor: AuthenticatedUser
) {
  await markStale();

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      currentLocation: true,
      currentDriver: {
        include: { user: { select: { id: true, name: true, phone: true } } },
      },
    },
  });

  if (!vehicle) {
    throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
  }

  const isAdmin = actor.role === 'ADMIN';

  // Check if user has an active booking on this vehicle
  let isOwnerActive = false;
  if (!isAdmin) {
    const activeBooking = await prisma.booking.findFirst({
      where: {
        userId: actor.id,
        vehicleId,
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
    });
    if (activeBooking) {
      isOwnerActive = true;
    }
  }

  if (!isAdmin && !isOwnerActive) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to vehicle tracking');
  }

  // Active trip origin/destination
  const activeTrip = await prisma.trip.findFirst({
    where: { vehicleId, status: TripStatus.ACTIVE },
    include: {
      driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
      booking: {
        select: {
          pickupLocation: true,
          destination: true,
          bookingNumber: true,
        },
      },
    },
  });

  const canSeePhone = isAdmin || isOwnerActive;
  const driver = activeTrip?.driver ?? vehicle.currentDriver;

  return {
    vehicle: {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      brand: vehicle.brand,
      model: vehicle.model,
      status: vehicle.status,
    },
    location: vehicle.currentLocation,
    driver: driver?.user
      ? {
          id: driver.id,
          name: driver.user.name,
          phone: canSeePhone ? driver.user.phone : 'REDACTED',
        }
      : null,
    activeTrip: activeTrip
      ? {
          id: activeTrip.id,
          startedAt: activeTrip.startedAt,
          startLat: activeTrip.startLat,
          startLng: activeTrip.startLng,
          origin: activeTrip.booking?.pickupLocation ?? null,
          destination: activeTrip.booking?.destination ?? null,
          bookingNumber: activeTrip.booking?.bookingNumber ?? null,
        }
      : null,
  };
}

export async function getLiveTracking(
  actor: AuthenticatedUser,
  locationId?: string
) {
  try {
    await markStale();
  } catch (staleErr) {
    console.warn('[getLiveTracking] markStale non-blocking error:', staleErr);
  }

  const isAdmin = actor.role === 'ADMIN';

  let vehicleIds: string[] | null = null;

  if (!isAdmin) {
    const userBookings = await prisma.booking.findMany({
      where: {
        userId: actor.id,
        vehicleId: { not: null },
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
      select: { vehicleId: true },
    });
    vehicleIds = userBookings
      .map((b) => b.vehicleId)
      .filter((id): id is string => Boolean(id));
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(vehicleIds !== null ? { id: { in: vehicleIds } } : {}),
      ...(locationId
        ? {
            OR: [
              { homeLocationId: locationId },
              { currentLocationId: locationId },
            ],
          }
        : {}),
      currentLocation: { isNot: null },
    },
    include: {
      currentLocation: true,
      homeLocation: { select: { id: true, name: true, code: true } },
      currentOperationalLocation: { select: { id: true, name: true, code: true } },
      trips: {
        where: { status: TripStatus.ACTIVE },
        take: 1,
        include: { driver: { include: { user: { select: { id: true, name: true, phone: true } } } } },
      },
      currentDriver: {
        include: { user: { select: { id: true, name: true, phone: true } } },
      },
    },
  });

  return vehicles.map((v) => {
    const isOwner = Boolean(vehicleIds && vehicleIds.includes(v.id));
    const canSeePhone = isAdmin || isOwner;
    const driver = v.trips[0]?.driver ?? v.currentDriver;

    return {
      vehicleId: v.id,
      plateNumber: v.plateNumber,
      brand: v.brand,
      model: v.model,
      status: v.status,
      homeLocation: v.homeLocation,
      currentLocationInfo: v.currentOperationalLocation,
      location: v.currentLocation,
      driver: driver?.user
        ? {
            id: driver.id,
            name: driver.user.name,
            phone: canSeePhone ? driver.user.phone : 'REDACTED',
          }
        : null,
    };
  });
}
