import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';
import { notify, notifyAdmins } from '@/server/notifications/service';
import { AuthenticatedUser } from '@/lib/auth-guard';
import {
  TripStatus,
  VehicleStatus,
  DriverStatus,
  BookingStatus,
  MovementStatus,
  Prisma,
} from '@prisma/client';

export interface TripMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface StartTripInput {
  bookingId?: string | null;
  vehicleId?: string | null;
  startLat: number;
  startLng: number;
}

export interface EndTripInput {
  endLat?: number | null;
  endLng?: number | null;
  distanceMeters?: number | null;
}

export interface AbortTripInput {
  reason?: string | null;
}

export interface TripQueryFilters {
  page?: number;
  limit?: number;
  status?: TripStatus;
  vehicleId?: string;
  driverId?: string;
  startDate?: Date;
  endDate?: Date;
}

export async function startTrip(
  driverId: string,
  input: StartTripInput,
  ctx?: TripMutationContext
) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: { user: true },
  });

  if (!driver) {
    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
  }

  // Driver cannot start another trip if already ON_TRIP
  if (driver.status === DriverStatus.ON_TRIP) {
    throw new ApiError(409, 'DRIVER_BUSY', 'Driver is already on an active trip');
  }

  const existingActiveTrip = await prisma.trip.findFirst({
    where: { driverId, status: TripStatus.ACTIVE },
  });
  if (existingActiveTrip) {
    throw new ApiError(409, 'DRIVER_BUSY', 'Driver already has an active trip');
  }

  let targetVehicleId: string;
  let linkedBookingId: string | null = null;

  if (input.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { vehicle: true },
    });

    if (!booking) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    if (booking.driverId !== driver.id) {
      throw new ApiError(
        409,
        'BOOKING_NOT_ASSIGNED',
        'Booking is not assigned to this driver'
      );
    }

    if (
      booking.status !== BookingStatus.DRIVER_ASSIGNED &&
      booking.status !== BookingStatus.APPROVED
    ) {
      throw new ApiError(
        409,
        'INVALID_BOOKING_STATUS',
        `Cannot start trip for booking in status ${booking.status}`
      );
    }

    if (!booking.vehicleId) {
      throw new ApiError(400, 'NO_VEHICLE_ASSIGNED', 'Booking has no assigned vehicle');
    }

    targetVehicleId = booking.vehicleId;
    linkedBookingId = booking.id;
  } else if (input.vehicleId) {
    targetVehicleId = input.vehicleId;

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: targetVehicleId },
    });

    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
    }

    if (vehicle.status === VehicleStatus.IN_USE) {
      throw new ApiError(409, 'VEHICLE_IN_USE', 'Vehicle is currently in use');
    }

    if (
      vehicle.status === VehicleStatus.MAINTENANCE ||
      vehicle.status === VehicleStatus.INACTIVE
    ) {
      throw new ApiError(
        409,
        'VEHICLE_UNAVAILABLE',
        `Vehicle unavailable in status ${vehicle.status}`
      );
    }

    // Check open vehicle assignment row
    const openAssignment = await prisma.vehicleAssignment.findFirst({
      where: { vehicleId: targetVehicleId, unassignedAt: null },
    });

    if (openAssignment && openAssignment.driverId !== driver.id) {
      throw new ApiError(
        409,
        'VEHICLE_ALREADY_ASSIGNED',
        'Vehicle is actively assigned to another driver'
      );
    }
  } else {
    throw new ApiError(400, 'BAD_REQUEST', 'Either bookingId or vehicleId must be provided');
  }

  // Transaction: row lock vehicle, create trip, update vehicle and driver statuses
  const trip = await prisma.$transaction(async (tx) => {
    // 1. Row lock vehicle
    const lockedVehicles = await tx.$queryRawUnsafe<Array<{ id: string; status: VehicleStatus }>>(
      'SELECT id, status FROM vehicles WHERE id = $1 FOR UPDATE',
      targetVehicleId
    );

    if (!lockedVehicles || lockedVehicles.length === 0) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
    }

    const lockedVehicle = lockedVehicles[0];
    if (lockedVehicle.status === VehicleStatus.IN_USE) {
      throw new ApiError(409, 'VEHICLE_IN_USE', 'Vehicle is currently in use');
    }

    // 2. Create Trip
    const newTrip = await tx.trip.create({
      data: {
        bookingId: linkedBookingId,
        vehicleId: targetVehicleId,
        driverId: driver.id,
        startedAt: new Date(),
        startLat: input.startLat,
        startLng: input.startLng,
        status: TripStatus.ACTIVE,
      },
      include: {
        vehicle: true,
        driver: { include: { user: true } },
        booking: { include: { user: true } },
      },
    });

    // 3. Update vehicle status and currentDriverId
    await tx.vehicle.update({
      where: { id: targetVehicleId },
      data: {
        status: VehicleStatus.IN_USE,
        currentDriverId: driver.id,
      },
    });

    // 4. Update driver status and currentVehicleId
    await tx.driver.update({
      where: { id: driver.id },
      data: {
        status: DriverStatus.ON_TRIP,
        currentVehicleId: targetVehicleId,
      },
    });

    // 5. If booking, set status IN_PROGRESS
    if (linkedBookingId) {
      await tx.booking.update({
        where: { id: linkedBookingId },
        data: {
          status: BookingStatus.IN_PROGRESS,
          driverId: driver.id,
        },
      });
    }

    return newTrip;
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? driver.userId,
    action: 'trip.start',
    entityType: 'Trip',
    entityId: trip.id,
    newValue: {
      tripId: trip.id,
      vehicleId: targetVehicleId,
      driverId: driver.id,
      bookingId: linkedBookingId,
      startLat: input.startLat,
      startLng: input.startLng,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  if (trip.booking) {
    await notify(trip.booking.userId, {
      type: 'BOOKING_IN_PROGRESS',
      title: 'Trip Started',
      body: `Your trip for booking ${trip.booking.bookingNumber} has started`,
      data: { tripId: trip.id, bookingId: trip.booking.id },
    });
    await notifyAdmins({
      type: 'BOOKING_IN_PROGRESS',
      title: 'Trip Started',
      body: `Trip ${trip.id} started for booking ${trip.booking.bookingNumber}`,
      data: { tripId: trip.id, bookingId: trip.booking.id },
    });
  }

  return trip;
}

export async function endTrip(
  driverId: string,
  tripId: string,
  input: EndTripInput,
  ctx?: TripMutationContext
) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { booking: true },
  });

  if (!trip) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Trip not found');
  }

  if (trip.driverId !== driverId) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the assigned driver can end this trip');
  }

  if (trip.status !== TripStatus.ACTIVE) {
    throw new ApiError(409, 'TRIP_ALREADY_ENDED', `Trip is already in status ${trip.status}`);
  }

  const updatedTrip = await prisma.$transaction(async (tx) => {
    // 1. Update Trip
    const completed = await tx.trip.update({
      where: { id: tripId },
      data: {
        status: TripStatus.COMPLETED,
        endedAt: new Date(),
        endLat: input.endLat ?? undefined,
        endLng: input.endLng ?? undefined,
        distanceMeters: input.distanceMeters ?? undefined,
      },
      include: {
        vehicle: true,
        driver: { include: { user: true } },
        booking: { include: { user: true } },
      },
    });

    // 2. If linked booking, transition to COMPLETED
    if (trip.bookingId) {
      await tx.booking.update({
        where: { id: trip.bookingId },
        data: { status: BookingStatus.COMPLETED },
      });
    }

    // 3. Reset vehicle status to AVAILABLE.
    // NOTE: vehicle.currentDriverId mirror is KEPT until explicit admin unassignment per ARCHITECTURE.md §3 & §5
    await tx.vehicle.update({
      where: { id: trip.vehicleId },
      data: { status: VehicleStatus.AVAILABLE },
    });

    // 4. Reset driver status to AVAILABLE.
    // NOTE: driver.currentVehicleId mirror is KEPT until explicit admin unassignment
    await tx.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.AVAILABLE },
    });

    // 5. Mark vehicle_locations movement as OFFLINE
    await tx.vehicleLocation.updateMany({
      where: { vehicleId: trip.vehicleId },
      data: { movement: MovementStatus.OFFLINE },
    });

    return completed;
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? updatedTrip.driver.userId,
    action: 'trip.end',
    entityType: 'Trip',
    entityId: tripId,
    newValue: {
      status: TripStatus.COMPLETED,
      endedAt: updatedTrip.endedAt?.toISOString(),
      distanceMeters: updatedTrip.distanceMeters,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  if (updatedTrip.booking) {
    await notify(updatedTrip.booking.userId, {
      type: 'BOOKING_COMPLETED',
      title: 'Trip Completed',
      body: `Your trip for booking ${updatedTrip.booking.bookingNumber} is completed`,
      data: { tripId: updatedTrip.id, bookingId: updatedTrip.booking.id },
    });
    await notifyAdmins({
      type: 'BOOKING_COMPLETED',
      title: 'Trip Completed',
      body: `Trip ${updatedTrip.id} completed for booking ${updatedTrip.booking.bookingNumber}`,
      data: { tripId: updatedTrip.id, bookingId: updatedTrip.booking.id },
    });
  }

  return updatedTrip;
}

export async function abortTrip(
  actor: AuthenticatedUser,
  tripId: string,
  input?: AbortTripInput,
  ctx?: TripMutationContext
) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { driver: true, booking: true },
  });

  if (!trip) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Trip not found');
  }

  const isAssignedDriver =
    trip.driver.userId === actor.id || trip.driver.id === actor.id;
  const isAdmin = actor.role === 'ADMIN';

  if (!isAssignedDriver && !isAdmin) {
    throw new ApiError(403, 'FORBIDDEN', 'Only assigned driver or admin can abort this trip');
  }

  if (trip.status !== TripStatus.ACTIVE) {
    throw new ApiError(409, 'TRIP_ALREADY_ENDED', `Trip is already in status ${trip.status}`);
  }

  const updatedTrip = await prisma.$transaction(async (tx) => {
    const aborted = await tx.trip.update({
      where: { id: tripId },
      data: {
        status: TripStatus.ABORTED,
        endedAt: new Date(),
      },
      include: {
        vehicle: true,
        driver: { include: { user: true } },
        booking: { include: { user: true } },
      },
    });

    // Decision: booking returns to DRIVER_ASSIGNED state so it can be retried
    if (trip.bookingId) {
      await tx.booking.update({
        where: { id: trip.bookingId },
        data: { status: BookingStatus.DRIVER_ASSIGNED },
      });
    }

    // Reset vehicle and driver status
    await tx.vehicle.update({
      where: { id: trip.vehicleId },
      data: { status: VehicleStatus.AVAILABLE },
    });

    await tx.driver.update({
      where: { id: trip.driverId },
      data: { status: DriverStatus.AVAILABLE },
    });

    await tx.vehicleLocation.updateMany({
      where: { vehicleId: trip.vehicleId },
      data: { movement: MovementStatus.OFFLINE },
    });

    return aborted;
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? actor.id,
    action: 'trip.abort',
    entityType: 'Trip',
    entityId: tripId,
    newValue: {
      status: TripStatus.ABORTED,
      reason: input?.reason ?? null,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return updatedTrip;
}

export async function listTrips(
  actor: AuthenticatedUser,
  filters: TripQueryFilters
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.TripWhereInput = {};

  if (actor.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: actor.id },
    });
    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }
    where.driverId = driver.id;
  } else if (actor.role === 'ADMIN') {
    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
  } else {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to trip listings');
  }

  if (filters.status) where.status = filters.status;
  if (filters.startDate || filters.endDate) {
    where.startedAt = {
      ...(filters.startDate ? { gte: filters.startDate } : {}),
      ...(filters.endDate ? { lte: filters.endDate } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.trip.count({ where }),
    prisma.trip.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startedAt: 'desc' },
      include: {
        vehicle: true,
        driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
        booking: { select: { id: true, bookingNumber: true, purpose: true, userId: true } },
      },
    }),
  ]);

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTripById(tripId: string, actor: AuthenticatedUser) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      vehicle: true,
      driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
      booking: { select: { id: true, bookingNumber: true, purpose: true, userId: true } },
    },
  });

  if (!trip) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Trip not found');
  }

  const isAdmin = actor.role === 'ADMIN';
  const isDriver =
    trip.driver.userId === actor.id || trip.driver.id === actor.id;
  const isBookingOwner = trip.booking?.userId === actor.id;

  if (!isAdmin && !isDriver && !isBookingOwner) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to this trip');
  }

  return trip;
}
