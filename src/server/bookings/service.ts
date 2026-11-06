import { Prisma, BookingStatus, VehicleStatus, DriverStatus, OfferStatus, DriverSessionStatus, TripStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';
import { notify, notifyAdmins } from '@/server/notifications/service';
import { AuthenticatedUser } from '@/lib/auth-guard';
import { publishEvent } from '@/server/realtime/hub';
import { endTrip } from '@/server/trips/service';

export interface BookingMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateBookingInput {
  vehicleId?: string | null;
  operationalLocationId?: string;
  vehiclePreferenceId?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  pickupLocation: string;
  destination: string;
  departureAt: Date;
  expectedReturnAt: Date;
  passengerCount: number;
  purpose: string;
  notes?: string | null;
  serviceType?: 'DROP_OFF' | 'STANDBY';
  notaDinasUrl?: string | null;
  notaDinasFilename?: string | null;
  status?: BookingStatus;
}

export interface BookingQueryFilters {
  driverWorkflow?: boolean;
  page?: number;
  limit?: number;
  userId?: string;
  vehicleId?: string;
  locationId?: string;
  status?: BookingStatus;
  startDate?: Date;
  endDate?: Date;
}

// Row lock and overlap prevention helper per ARCHITECTURE.md §5 decision 1
export async function assertVehicleAvailableForWindow(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  departureAt: Date,
  expectedReturnAt: Date,
  excludeBookingId?: string,
  includePending: boolean = false
) {
  // 1. Transactional row lock: serialize concurrent requests for this vehicle
  const locked = await tx.$queryRawUnsafe<Array<{ id: string; status: VehicleStatus }>>(
    'SELECT id, status FROM vehicles WHERE id = $1 FOR UPDATE',
    vehicleId
  );

  if (!locked || locked.length === 0) {
    throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
  }

  const vehicle = locked[0];

  // 2. Reject if vehicle is physically unavailable
  if (
    vehicle.status === VehicleStatus.MAINTENANCE ||
    vehicle.status === VehicleStatus.INACTIVE ||
    vehicle.status === VehicleStatus.IN_USE
  ) {
    throw new ApiError(
      409,
      'VEHICLE_UNAVAILABLE',
      `Vehicle cannot be booked in status ${vehicle.status}`
    );
  }

  // 3. Time-window intersection check: departure_at < other.expected_return AND expected_return_at > other.departure
  const conflictingStatuses: BookingStatus[] = includePending
    ? [
        BookingStatus.PENDING,
        BookingStatus.APPROVED,
        BookingStatus.DRIVER_ASSIGNED,
        BookingStatus.DRIVER_EN_ROUTE,
        BookingStatus.ARRIVED,
        BookingStatus.IN_PROGRESS,
      ]
    : [
        BookingStatus.APPROVED,
        BookingStatus.DRIVER_ASSIGNED,
        BookingStatus.DRIVER_EN_ROUTE,
        BookingStatus.ARRIVED,
        BookingStatus.IN_PROGRESS,
      ];

  const conflict = await tx.booking.findFirst({
    where: {
      vehicleId,
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { in: conflictingStatuses },
      departureAt: { lt: expectedReturnAt },
      expectedReturnAt: { gt: departureAt },
    },
    select: { id: true, bookingNumber: true },
  });

  if (conflict) {
    throw new ApiError(
      409,
      'BOOKING_CONFLICT',
      `Vehicle is already reserved for an overlapping time window by booking ${conflict.bookingNumber}`
    );
  }
}

export async function lockAssignmentDriver(
  tx: Prisma.TransactionClient,
  driverId: string,
  requestedVehicleId?: string | null
) {
  const include = { user: true, sessions: { where: { status: DriverSessionStatus.ACTIVE }, take: 1 } } as const;
  const snapshot = await tx.driver.findUnique({ where: { id: driverId }, include });
  if (!snapshot) throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
  const vehicleId = requestedVehicleId ?? snapshot.sessions[0]?.vehicleId ?? snapshot.currentVehicleId;
  // Match the vehicle-first lock order used by assignments and trips.
  if (vehicleId) {
    await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', vehicleId);
  }
  await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', driverId);
  const driver = await tx.driver.findUniqueOrThrow({ where: { id: driverId }, include });
  if (requestedVehicleId && driver.currentVehicleId && driver.currentVehicleId !== requestedVehicleId) {
    if (driver.status === DriverStatus.ON_TRIP) {
      throw new ApiError(409, 'DRIVER_BUSY', 'Driver is currently on an active trip with another vehicle');
    }
  }
  const currentVehicleId = requestedVehicleId ?? driver.sessions[0]?.vehicleId ?? driver.currentVehicleId;
  if (currentVehicleId !== vehicleId) {
    throw new ApiError(409, 'ASSIGNMENT_CHANGED', 'Driver vehicle changed during assignment; please retry');
  }
  return { driver, vehicleId };
}

// Generates human-readable booking numbers: BK-{YYYY}-{0001}
async function generateBookingNumber(
  tx: Prisma.TransactionClient,
  year: number
): Promise<string> {
  const prefix = `BK-${year}-`;
  const count = await tx.booking.count({
    where: {
      bookingNumber: { startsWith: prefix },
    },
  });

  const nextSeq = String(count + 1).padStart(4, '0');
  return `${prefix}${nextSeq}`;
}

export async function createBooking(
  userId: string,
  input: CreateBookingInput,
  ctx?: BookingMutationContext
) {
  if (input.expectedReturnAt <= input.departureAt) {
    throw new ApiError(
      400,
      'INVALID_DATES',
      'Expected return time must be strictly after departure time'
    );
  }

  // Ensure operationalLocationId fallback for backwards compatibility with legacy tests
  let operationalLocationId = input.operationalLocationId;
  if (!operationalLocationId) {
    const loc = await prisma.location.findFirst({ select: { id: true } });
    if (loc) {
      operationalLocationId = loc.id;
    } else {
      const createdLoc = await prisma.location.create({
        data: { name: 'Default Location', code: 'DEF' },
        select: { id: true },
      });
      operationalLocationId = createdLoc.id;
    }
  }

  const year = input.departureAt.getFullYear();
  let retries = 3;
  let created = null;

  while (retries > 0) {
    try {
      created = await prisma.$transaction(async (tx) => {
        if (input.vehicleId) {
          await assertVehicleAvailableForWindow(
            tx,
            input.vehicleId,
            input.departureAt,
            input.expectedReturnAt,
            undefined,
            true // include pending to prevent concurrent overlapping submissions
          );
        }

        const bookingNumber = await generateBookingNumber(tx, year);

        return tx.booking.create({
          data: {
            bookingNumber,
            userId,
            vehicleId: input.vehicleId ?? null,
            operationalLocationId: operationalLocationId!,
            vehiclePreferenceId: input.vehiclePreferenceId ?? null,
            pickupLat: input.pickupLat ?? null,
            pickupLng: input.pickupLng ?? null,
            destinationLat: input.destinationLat ?? null,
            destinationLng: input.destinationLng ?? null,
            pickupLocation: input.pickupLocation,
            destination: input.destination,
            departureAt: input.departureAt,
            expectedReturnAt: input.expectedReturnAt,
            passengerCount: input.passengerCount,
            purpose: input.purpose,
            notes: input.notes ?? null,
            serviceType: input.serviceType ?? 'DROP_OFF',
            notaDinasUrl: input.notaDinasUrl ?? null,
            notaDinasFilename: input.notaDinasFilename ?? null,
            status: input.status ?? BookingStatus.PENDING,
          },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            vehicle: true,
            operationalLocation: true,
          },
        });
      });
      break;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        retries--;
        if (retries === 0) {
          throw new ApiError(
            409,
            'BOOKING_NUMBER_COLLISION',
            'Failed to generate unique booking number. Please retry.'
          );
        }
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Failed to create booking');
  }

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? userId,
    action: 'booking.created',
    entityType: 'Booking',
    entityId: created.id,
    newValue: {
      bookingNumber: created.bookingNumber,
      departureAt: created.departureAt.toISOString(),
      expectedReturnAt: created.expectedReturnAt.toISOString(),
      status: created.status,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  // In-app notification to admins
  await notifyAdmins({
    type: 'BOOKING_CREATED',
    title: 'New Booking Request',
    body: `Booking ${created.bookingNumber} created by ${created.user.name}`,
    data: { bookingId: created.id, bookingNumber: created.bookingNumber },
  });

  return created;
}

const bookingMutationInclude = {
  user: { select: { id: true, name: true, email: true, phone: true } },
  vehicle: true,
  driver: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
  operationalLocation: true,
} satisfies Prisma.BookingInclude;

export async function transitionBooking(
  bookingId: string,
  to: BookingStatus,
  actor: AuthenticatedUser,
  ctx?: BookingMutationContext,
  payload?: { reason?: string; driverId?: string; vehicleId?: string }
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      driver: { include: { user: { select: { id: true, name: true } } } },
      vehicle: true,
      operationalLocation: true,
    },
  });

  if (!booking) {
    throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
  }

  // 1. Status Machine validation
  const from = booking.status;
  const isValidTransition =
    (from === BookingStatus.PENDING &&
      (to === BookingStatus.APPROVED ||
        to === BookingStatus.REJECTED ||
        to === BookingStatus.CANCELLED ||
        to === BookingStatus.SEARCHING_DRIVER)) ||
    (from === BookingStatus.APPROVED &&
      (to === BookingStatus.DRIVER_ASSIGNED || to === BookingStatus.CANCELLED)) ||
    (from === BookingStatus.SEARCHING_DRIVER &&
      (to === BookingStatus.DRIVER_NOTIFIED ||
        to === BookingStatus.NO_DRIVER_AVAILABLE ||
        to === BookingStatus.ADMIN_INTERVENTION ||
        to === BookingStatus.DRIVER_ASSIGNED ||
        to === BookingStatus.CANCELLED)) ||
    (from === BookingStatus.DRIVER_NOTIFIED &&
      (to === BookingStatus.DRIVER_ASSIGNED ||
        to === BookingStatus.SEARCHING_DRIVER ||
        to === BookingStatus.ADMIN_INTERVENTION ||
        to === BookingStatus.CANCELLED)) ||
    (from === BookingStatus.DRIVER_ASSIGNED &&
      (to === BookingStatus.DRIVER_EN_ROUTE ||
        to === BookingStatus.CANCELLED)) ||
    (from === BookingStatus.DRIVER_EN_ROUTE &&
      (to === BookingStatus.ARRIVED ||
        to === BookingStatus.CANCELLED)) ||
    (from === BookingStatus.ARRIVED &&
      (to === BookingStatus.IN_PROGRESS || to === BookingStatus.CANCELLED)) ||
    (from === BookingStatus.IN_PROGRESS &&
      (to === BookingStatus.PENDING_COMPLETION || to === BookingStatus.COMPLETED)) ||
    (from === BookingStatus.PENDING_COMPLETION && to === BookingStatus.COMPLETED) ||
    (from === BookingStatus.ADMIN_INTERVENTION &&
      (to === BookingStatus.DRIVER_ASSIGNED || to === BookingStatus.CANCELLED)) ||
    (from === BookingStatus.NO_DRIVER_AVAILABLE &&
      (to === BookingStatus.ADMIN_INTERVENTION || to === BookingStatus.CANCELLED));

  if (!isValidTransition) {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      to === BookingStatus.CANCELLED && from === BookingStatus.IN_PROGRESS
        ? 'Cannot cancel an in-progress booking; abort or end its trip first'
        : `Cannot transition booking from ${from} to ${to}`
    );
  }

  // 2. Actor permissions
  if (to === BookingStatus.APPROVED || to === BookingStatus.REJECTED) {
    if (actor.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only administrators can approve or reject bookings');
    }
  } else if (to === BookingStatus.DRIVER_ASSIGNED) {
    if (actor.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only administrators can assign drivers');
    }
  } else if (to === BookingStatus.CANCELLED) {
    const isOwner = actor.id === booking.userId;
    const isAdmin = actor.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ApiError(403, 'FORBIDDEN', 'Only the booking owner or an administrator can cancel this booking');
    }
  } else if (
    to === BookingStatus.SEARCHING_DRIVER ||
    to === BookingStatus.DRIVER_NOTIFIED ||
    to === BookingStatus.NO_DRIVER_AVAILABLE ||
    to === BookingStatus.ADMIN_INTERVENTION
  ) {
    if (actor.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only administrators can update dispatch status');
    }
  } else if (
    to === BookingStatus.DRIVER_EN_ROUTE ||
    to === BookingStatus.ARRIVED ||
    to === BookingStatus.IN_PROGRESS
  ) {
    if (!booking.driverId) {
      throw new ApiError(409, 'ACTIVE_TRIP_REQUIRED', 'Start the matching trip before updating booking progress');
    }
    const isAssignedDriver = actor.role === 'DRIVER' && booking.driver?.userId === actor.id;
    if (!isAssignedDriver && actor.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only the assigned driver can update trip progress');
    }
  } else if (to === BookingStatus.PENDING_COMPLETION) {
    const isAssignedDriver = actor.role === 'DRIVER' && booking.driver?.userId === actor.id;
    if (!isAssignedDriver && actor.role !== 'ADMIN') {
      throw new ApiError(403, 'FORBIDDEN', 'Only the assigned driver or administrator can mark trip complete');
    }
  } else if (to === BookingStatus.COMPLETED) {
    if (from === BookingStatus.PENDING_COMPLETION) {
      if (actor.role !== 'ADMIN') {
        throw new ApiError(403, 'FORBIDDEN', 'Only administrators can approve completion of bookings');
      }
    } else {
      if (!booking.driverId) {
        throw new ApiError(409, 'ACTIVE_TRIP_REQUIRED', 'Start the matching trip before updating booking progress');
      }
      const isAssignedDriver = actor.role === 'DRIVER' && booking.driver?.userId === actor.id;
      if (!isAssignedDriver && actor.role !== 'ADMIN') {
        throw new ApiError(403, 'FORBIDDEN', 'Only the assigned driver can update trip progress');
      }
    }
  }

  if (to === BookingStatus.COMPLETED) {
    if (from === BookingStatus.PENDING_COMPLETION) {
      const completed = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.COMPLETED, rejectedReason: null },
        include: bookingMutationInclude,
      });
      await logAuditEvent({
        actorUserId: ctx?.actorUserId ?? actor.id,
        action: 'booking.completed',
        entityType: 'Booking',
        entityId: bookingId,
        oldValue: { status: from },
        newValue: { status: BookingStatus.COMPLETED, driverId: booking.driverId },
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      });
      await publishEvent({ type: 'booking:update', data: { bookingId, status: completed.status, userId: completed.userId } });
      await notify(completed.userId, {
        type: 'BOOKING_COMPLETED',
        title: 'Booking Selesai & Disetujui',
        body: `Nota dinas dan penyelesaian booking ${completed.bookingNumber} telah disetujui admin.`,
        data: { bookingId: completed.id },
      });
      return completed;
    }

    const trip = booking.driverId && booking.vehicleId
      ? await prisma.trip.findFirst({
          where: { bookingId, driverId: booking.driverId, vehicleId: booking.vehicleId, status: TripStatus.ACTIVE },
        })
      : null;
    if (!trip) {
      throw new ApiError(409, 'ACTIVE_TRIP_REQUIRED', 'Booking has no matching active trip to complete');
    }
    // endTrip owns the booking/vehicle/driver/trip locks and lifecycle side effects.
    await endTrip(trip.driverId, trip.id, {}, { ...ctx, actorUserId: ctx?.actorUserId ?? actor.id });
    await logAuditEvent({
      actorUserId: ctx?.actorUserId ?? actor.id, action: 'booking.completed',
      entityType: 'Booking', entityId: bookingId, oldValue: { status: from },
      newValue: { status: BookingStatus.COMPLETED, driverId: trip.driverId },
      ip: ctx?.ip, userAgent: ctx?.userAgent,
    });
    const completed = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingMutationInclude });
    await publishEvent({ type: 'booking:update', data: { bookingId, status: completed.status, userId: completed.userId } });
    return completed;
  }

  if (to === BookingStatus.PENDING_COMPLETION) {
    const trip = booking.driverId && booking.vehicleId
      ? await prisma.trip.findFirst({
          where: { bookingId, driverId: booking.driverId, vehicleId: booking.vehicleId, status: TripStatus.ACTIVE },
        })
      : null;
    if (trip) {
      await endTrip(trip.driverId, trip.id, {}, { ...ctx, actorUserId: ctx?.actorUserId ?? actor.id });
      const completed = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingMutationInclude });
      await publishEvent({ type: 'booking:update', data: { bookingId, status: completed.status, userId: completed.userId } });
      return completed;
    }
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.PENDING_COMPLETION },
      include: bookingMutationInclude,
    });
    await logAuditEvent({
      actorUserId: ctx?.actorUserId ?? actor.id,
      action: 'booking.pending_completion',
      entityType: 'Booking',
      entityId: bookingId,
      oldValue: { status: from },
      newValue: { status: BookingStatus.PENDING_COMPLETION },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
    await publishEvent({ type: 'booking:update', data: { bookingId, status: updated.status, userId: updated.userId } });
    return updated;
  }

  // 3. Execute transition in transaction
  const updated = await prisma.$transaction(async (tx) => {
    // Row lock booking to serialize concurrent transitions
    const lockedBookings = await tx.$queryRawUnsafe<
      Array<{ id: string; status: BookingStatus }>
    >('SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE', bookingId);

    if (!lockedBookings || lockedBookings.length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
    }

    const currentStatus = lockedBookings[0].status;
    if (currentStatus !== from) {
      throw new ApiError(
        409,
        'INVALID_TRANSITION',
        `Cannot transition booking from ${currentStatus} to ${to}`
      );
    }

    if (
      to === BookingStatus.DRIVER_EN_ROUTE ||
      to === BookingStatus.ARRIVED ||
      to === BookingStatus.IN_PROGRESS
    ) {
      if (!booking.vehicleId || !booking.driverId) {
        throw new ApiError(409, 'ACTIVE_TRIP_REQUIRED', 'Start the matching trip before updating booking progress');
      }
      await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', booking.vehicleId);
      await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', booking.driverId);
      const trips = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT id FROM trips WHERE booking_id = $1 AND vehicle_id = $2 AND driver_id = $3 AND status = 'ACTIVE' FOR UPDATE",
        bookingId, booking.vehicleId, booking.driverId
      );
      if (!trips.length) {
        throw new ApiError(409, 'ACTIVE_TRIP_REQUIRED', 'Start the matching trip before updating booking progress');
      }
    }

    if (to === BookingStatus.APPROVED) {
      if (booking.vehicleId) {
        await assertVehicleAvailableForWindow(
          tx,
          booking.vehicleId,
          booking.departureAt,
          booking.expectedReturnAt,
          booking.id,
          false
        );
        await tx.vehicle.update({
          where: { id: booking.vehicleId },
          data: { status: VehicleStatus.RESERVED },
        });
      }

      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.APPROVED },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.REJECTED) {
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.REJECTED,
          rejectedReason: payload?.reason ?? null,
        },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.SEARCHING_DRIVER) {
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.SEARCHING_DRIVER },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.DRIVER_NOTIFIED) {
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.DRIVER_NOTIFIED },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.DRIVER_EN_ROUTE) {
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.DRIVER_EN_ROUTE },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.ARRIVED) {
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.ARRIVED },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.NO_DRIVER_AVAILABLE) {
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.NO_DRIVER_AVAILABLE },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.ADMIN_INTERVENTION) {
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.ADMIN_INTERVENTION },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.DRIVER_ASSIGNED) {
      if (!payload?.driverId) {
        throw new ApiError(400, 'DRIVER_REQUIRED', 'driverId is required for driver assignment');
      }

      const { driver, vehicleId: targetVehicleId } = await lockAssignmentDriver(
        tx, payload.driverId, payload.vehicleId ?? booking.vehicleId ?? booking.vehiclePreferenceId
      );

      if (!driver) {
        throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
      }

      if (!driver.user.isActive || driver.status !== DriverStatus.AVAILABLE) {
        throw new ApiError(
          409,
          'DRIVER_UNAVAILABLE',
          `Driver cannot be assigned in status ${driver.status}`
        );
      }

      // Check overlapping driver assignments
      const driverConflict = await tx.booking.findFirst({
        where: {
          driverId: payload.driverId,
          id: { not: booking.id },
          status: {
            in: [
              BookingStatus.APPROVED,
              BookingStatus.DRIVER_ASSIGNED,
              BookingStatus.DRIVER_EN_ROUTE,
              BookingStatus.ARRIVED,
              BookingStatus.IN_PROGRESS,
            ],
          },
          departureAt: { lt: booking.expectedReturnAt },
          expectedReturnAt: { gt: booking.departureAt },
        },
        select: { id: true, bookingNumber: true },
      });

      if (driverConflict) {
        throw new ApiError(
          409,
          'DRIVER_CONFLICT',
          `Driver already assigned to an overlapping booking (${driverConflict.bookingNumber})`
        );
      }

      if (!targetVehicleId) {
        throw new ApiError(409, 'NO_VEHICLE_ASSIGNED', 'No vehicle assigned to driver or booking');
      }

      // Check vehicle availability and active assignment conflict
      if (targetVehicleId) {
        await assertVehicleAvailableForWindow(
          tx,
          targetVehicleId,
          booking.departureAt,
          booking.expectedReturnAt,
          booking.id,
          false
        );

        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: targetVehicleId } });
        if (vehicle.seatingCapacity < booking.passengerCount) {
          throw new ApiError(409, 'INSUFFICIENT_CAPACITY', 'Vehicle has insufficient passenger capacity');
        }
        if (vehicle.currentDriverId && vehicle.currentDriverId !== driver.id) {
          throw new ApiError(409, 'VEHICLE_ALREADY_ASSIGNED', 'Vehicle is assigned to another driver');
        }
        const openVehicleAssignment = await tx.vehicleAssignment.findFirst({
          where: { vehicleId: targetVehicleId, unassignedAt: null },
        });

        if (
          openVehicleAssignment &&
          openVehicleAssignment.driverId !== payload.driverId
        ) {
          throw new ApiError(
            409,
            'VEHICLE_ALREADY_ASSIGNED',
            'Vehicle already actively assigned to another driver'
          );
        }

        await tx.vehicle.update({
          where: { id: targetVehicleId },
          data: { status: VehicleStatus.RESERVED },
        });
      }

      await tx.bookingOffer.updateMany({
        where: { bookingId, status: OfferStatus.SENT },
        data: { status: OfferStatus.CANCELLED, respondedAt: new Date() },
      });
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.DRIVER_ASSIGNED,
          driverId: payload.driverId,
          ...(targetVehicleId ? { vehicleId: targetVehicleId } : {}),
        },
        include: bookingMutationInclude,
      });
    }

    if (to === BookingStatus.IN_PROGRESS) {

      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.IN_PROGRESS },
        include: bookingMutationInclude,
      });
    }


    if (to === BookingStatus.CANCELLED) {
      if (booking.vehicleId) {
        await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', booking.vehicleId);
      }
      const activeTrip = await tx.trip.findFirst({ where: { bookingId, status: TripStatus.ACTIVE } });
      if (activeTrip) {
        throw new ApiError(409, 'ACTIVE_TRIP_EXISTS', 'Abort or end the active trip before cancelling this booking');
      }
      if (booking.vehicleId) {
        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: booking.vehicleId } });
        const standingAssignment = await tx.vehicleAssignment.findFirst({
          where: { vehicleId: booking.vehicleId, unassignedAt: null },
        });
        const committedBooking = await tx.booking.findFirst({
          where: {
            vehicleId: booking.vehicleId, id: { not: bookingId },
            status: { in: [BookingStatus.APPROVED, BookingStatus.DRIVER_ASSIGNED, BookingStatus.DRIVER_EN_ROUTE, BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS] },
          },
        });
        const vehicleTrip = await tx.trip.findFirst({ where: { vehicleId: booking.vehicleId, status: TripStatus.ACTIVE } });
        if (
          vehicle.status === VehicleStatus.RESERVED &&
          (!vehicle.currentDriverId || vehicle.currentDriverId === booking.driverId) &&
          !standingAssignment && !committedBooking && !vehicleTrip
        ) {
          await tx.vehicle.updateMany({
            where: { id: booking.vehicleId, status: VehicleStatus.RESERVED },
            data: { status: VehicleStatus.AVAILABLE },
          });
        }
      }
      await tx.bookingOffer.updateMany({
        where: { bookingId, status: OfferStatus.SENT },
        data: { status: OfferStatus.CANCELLED, respondedAt: new Date() },
      });
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledReason: payload?.reason ?? null,
        },
        include: bookingMutationInclude,
      });
    }

    throw new ApiError(400, 'UNHANDLED_TRANSITION', 'Unhandled status transition');
  });

  // 4. Audit logging
  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? actor.id,
    action: `booking.${to.toLowerCase()}`,
    entityType: 'Booking',
    entityId: updated.id,
    oldValue: { status: from },
    newValue: {
      status: to,
      driverId: updated.driverId,
      reason: payload?.reason,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  // 5. In-app notifications
  if (to === BookingStatus.APPROVED) {
    await notify(updated.userId, {
      type: 'BOOKING_APPROVED',
      title: 'Booking Approved',
      body: `Your booking ${updated.bookingNumber} has been approved`,
      data: { bookingId: updated.id },
    });
  } else if (to === BookingStatus.REJECTED) {
    await notify(updated.userId, {
      type: 'BOOKING_REJECTED',
      title: 'Booking Rejected',
      body: `Your booking ${updated.bookingNumber} was rejected: ${payload?.reason ?? 'No reason provided'}`,
      data: { bookingId: updated.id, reason: payload?.reason },
    });
  } else if (to === BookingStatus.DRIVER_ASSIGNED) {
    await notify(updated.userId, {
      type: 'DRIVER_ASSIGNED',
      title: 'Driver Assigned',
      body: `A driver has been assigned to your booking ${updated.bookingNumber}`,
      data: { bookingId: updated.id, driverId: updated.driverId },
    });
    if (updated.driver?.userId) {
      await notify(updated.driver.userId, {
        type: 'TRIP_ASSIGNED',
        title: 'New Trip Assigned',
        body: `You have been assigned to booking ${updated.bookingNumber}`,
        data: { bookingId: updated.id },
      });
    }
  } else if (to === BookingStatus.CANCELLED) {
    if (actor.id !== updated.userId) {
      await notify(updated.userId, {
        type: 'BOOKING_CANCELLED',
        title: 'Booking Cancelled',
        body: `Your booking ${updated.bookingNumber} was cancelled by administrator: ${payload?.reason ?? 'No reason provided'}`,
        data: { bookingId: updated.id },
      });
    } else {
      await notifyAdmins({
        type: 'BOOKING_CANCELLED',
        title: 'Booking Cancelled by User',
        body: `Booking ${updated.bookingNumber} was cancelled by user`,
        data: { bookingId: updated.id },
      });
    }
  } else if (to === BookingStatus.DRIVER_EN_ROUTE) {
    await notify(updated.userId, {
      type: 'DRIVER_EN_ROUTE',
      title: 'Driver En Route',
      body: `Driver is on the way to pick you up for booking ${updated.bookingNumber}`,
      data: { bookingId: updated.id },
    });
  } else if (to === BookingStatus.ARRIVED) {
    await notify(updated.userId, {
      type: 'DRIVER_ARRIVED',
      title: 'Driver Arrived',
      body: `Your driver has arrived at the pickup location for booking ${updated.bookingNumber}`,
      data: { bookingId: updated.id },
    });
  } else if (to === BookingStatus.NO_DRIVER_AVAILABLE) {
    await notify(updated.userId, {
      type: 'NO_DRIVER_AVAILABLE',
      title: 'No Driver Available',
      body: `We could not find an available driver for booking ${updated.bookingNumber}`,
      data: { bookingId: updated.id },
    });
  } else if (to === BookingStatus.ADMIN_INTERVENTION) {
    await notifyAdmins({
      type: 'ADMIN_INTERVENTION',
      title: 'Admin Intervention Required',
      body: `Booking ${updated.bookingNumber} needs manual driver assignment`,
      data: { bookingId: updated.id },
    });
  } else if (to === BookingStatus.IN_PROGRESS) {
    await notify(updated.userId, {
      type: 'BOOKING_IN_PROGRESS',
      title: 'Trip Started',
      body: `Your trip for booking ${updated.bookingNumber} has started`,
      data: { bookingId: updated.id },
    });
    await notifyAdmins({
      type: 'BOOKING_IN_PROGRESS',
      title: 'Trip In Progress',
      body: `Booking ${updated.bookingNumber} is now in progress`,
      data: { bookingId: updated.id },
    });

  }

  await publishEvent({
    type: 'booking:update',
    data: {
      bookingId: updated.id,
      status: updated.status,
      userId: updated.userId,
    },
  });

  return updated;
}

export async function listBookings(
  actor: AuthenticatedUser,
  filters: BookingQueryFilters
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.BookingWhereInput = {};

  // Role gating: regular users only see their own bookings
  if (actor.role === 'USER') {
    where.userId = actor.id;
  } else if (actor.role === 'DRIVER') {
    where.OR = [{ userId: actor.id }, { driver: { userId: actor.id } }];
    if (filters.userId) where.userId = filters.userId;
  } else if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.vehicleId) {
    where.vehicleId = filters.vehicleId;
  }

  if (filters.driverWorkflow && actor.role === 'DRIVER') {
    where.driver = { userId: actor.id };
    where.status = { in: [BookingStatus.APPROVED, BookingStatus.DRIVER_ASSIGNED, BookingStatus.DRIVER_EN_ROUTE, BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS] };
  } else if (filters.status) {
    where.status = filters.status;
  }

  if (filters.locationId) {
    where.operationalLocationId = filters.locationId;
  }

  if (filters.startDate || filters.endDate) {
    where.departureAt = {
      ...(filters.startDate ? { gte: filters.startDate } : {}),
      ...(filters.endDate ? { lte: filters.endDate } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        vehicle: true,
        operationalLocation: { select: { id: true, name: true, code: true } },
        driver: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    }),
  ]);

  // Redact driver phone if not active booking or not admin
  const data = rows.map((b) => {
    const isOwnerActive =
      b.userId === actor.id &&
      (b.status === BookingStatus.APPROVED ||
        b.status === BookingStatus.DRIVER_ASSIGNED ||
        b.status === BookingStatus.DRIVER_EN_ROUTE ||
        b.status === BookingStatus.ARRIVED ||
        b.status === BookingStatus.IN_PROGRESS);
    const canSeeDriverPhone = actor.role === 'ADMIN' || isOwnerActive;

    if (b.driver?.user && !canSeeDriverPhone) {
      return {
        ...b,
        driver: {
          ...b.driver,
          user: {
            ...b.driver.user,
            phone: 'REDACTED',
          },
        },
      };
    }

    return b;
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getBookingById(
  id: string,
  actor: AuthenticatedUser
) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      vehicle: true,
      operationalLocation: { select: { id: true, name: true, code: true } },
      offers: { orderBy: { attemptNo: 'desc' } },
      driver: {
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  if (!booking) {
    throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
  }

  const isOwner = booking.userId === actor.id;
  const isAdmin = actor.role === 'ADMIN';
  const isDriver = booking.driver?.userId === actor.id || booking.driver?.id === actor.id;

  if (!isOwner && !isAdmin && !isDriver) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to this booking');
  }

  // Driver info panel gating: phone exposed only to owner of active booking or admin
  const isOwnerActive =
    isOwner &&
    (booking.status === BookingStatus.APPROVED ||
      booking.status === BookingStatus.DRIVER_ASSIGNED ||
      booking.status === BookingStatus.DRIVER_EN_ROUTE ||
      booking.status === BookingStatus.ARRIVED ||
      booking.status === BookingStatus.IN_PROGRESS);

  const canSeeDriverPhone = isAdmin || isOwnerActive;

  if (booking.driver?.user && !canSeeDriverPhone) {
    return {
      ...booking,
      driver: {
        ...booking.driver,
        user: {
          ...booking.driver.user,
          phone: 'REDACTED',
        },
      },
    };
  }

  return booking;
}
