import {
  BookingStatus,
  DriverSessionStatus,
  DriverStatus,
  MovementStatus,
  Prisma,
  RelocationStatus,
  TripStatus,
  VehicleStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth-guard';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { ensureVehicleAssignment } from '@/server/assignments/service';
import { logAuditEvent } from '@/server/audit';
import { notify, notifyAdmins } from '@/server/notifications/service';
import { publishEvent } from '@/server/realtime/hub';

export interface RelocationMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateRelocationInput {
  vehicleId: string;
  driverId?: string | null;
  fromLocationId?: string | null;
  toLocationId: string;
  scheduledAt: Date;
  startImmediately?: boolean;
  notes?: string | null;
}

export interface StartRelocationInput {
  driverId?: string | null;
  startLat?: number | null;
  startLng?: number | null;
}

export interface CompleteRelocationInput {
  endLat?: number | null;
  endLng?: number | null;
  notes?: string | null;
}

export interface CancelRelocationInput {
  reason?: string | null;
}

export interface RelocationQueryFilters {
  page?: number;
  limit?: number;
  status?: RelocationStatus;
  vehicleId?: string;
  driverId?: string;
  locationId?: string;
}

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
} satisfies Prisma.UserSelect;

const relocationInclude = {
  vehicle: {
    include: {
      homeLocation: { select: { id: true, name: true, code: true } },
      currentOperationalLocation: { select: { id: true, name: true, code: true } },
    },
  },
  driver: {
    include: {
      user: { select: publicUserSelect },
    },
  },
  fromLocation: { select: { id: true, name: true, code: true } },
  toLocation: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.VehicleRelocationInclude;

const committedBookingStatuses: BookingStatus[] = [
  BookingStatus.APPROVED,
  BookingStatus.DRIVER_ASSIGNED,
  BookingStatus.DRIVER_EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.IN_PROGRESS,
];

async function generateRelocationCode(
  tx: Prisma.TransactionClient,
  year: number
): Promise<string> {
  const prefix = `REL-${year}-`;
  const count = await tx.vehicleRelocation.count({
    where: { relocationCode: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

async function assertVehicleReadyForRelocation(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  excludeRelocationId?: string
) {
  await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', vehicleId);
  const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
  }
  if (vehicle.status !== VehicleStatus.AVAILABLE) {
    throw new ApiError(
      409,
      'VEHICLE_UNAVAILABLE',
      `Vehicle cannot be relocated while in status ${vehicle.status}`
    );
  }

  const activeTrip = await tx.trip.findFirst({
    where: { vehicleId, status: TripStatus.ACTIVE },
    select: { id: true },
  });
  if (activeTrip) {
    throw new ApiError(409, 'VEHICLE_IN_USE', 'Vehicle currently has an active trip');
  }

  const activeBooking = await tx.booking.findFirst({
    where: {
      vehicleId,
      status: { in: committedBookingStatuses },
    },
    select: { id: true, bookingNumber: true },
  });
  if (activeBooking) {
    throw new ApiError(
      409,
      'BOOKING_CONFLICT',
      `Vehicle is assigned to active booking ${activeBooking.bookingNumber}`
    );
  }

  const activeRelocation = await tx.vehicleRelocation.findFirst({
    where: {
      vehicleId,
      ...(excludeRelocationId ? { id: { not: excludeRelocationId } } : {}),
      status: { in: [RelocationStatus.SCHEDULED, RelocationStatus.IN_TRANSIT] },
    },
    select: { id: true, relocationCode: true },
  });
  if (activeRelocation) {
    throw new ApiError(
      409,
      'RELOCATION_EXISTS',
      `Vehicle already has an active relocation (${activeRelocation.relocationCode})`
    );
  }

  return vehicle;
}

async function assertDriverReadyForRelocation(
  tx: Prisma.TransactionClient,
  driverId: string,
  mustBeAvailableForTransit: boolean,
  excludeRelocationId?: string
) {
  await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', driverId);
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    include: { user: { select: { ...publicUserSelect, isActive: true } } },
  });
  if (!driver) {
    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
  }
  if (!driver.user.isActive) {
    throw new ApiError(409, 'DRIVER_INACTIVE', 'Driver account is inactive');
  }

  if (mustBeAvailableForTransit) {
    if (driver.status === DriverStatus.ON_TRIP) {
      throw new ApiError(409, 'DRIVER_BUSY', 'Driver is currently on an active trip');
    }
    const activeTrip = await tx.trip.findFirst({
      where: { driverId, status: TripStatus.ACTIVE },
      select: { id: true },
    });
    if (activeTrip) {
      throw new ApiError(409, 'DRIVER_BUSY', 'Driver currently has an active trip');
    }
    const otherTransit = await tx.vehicleRelocation.findFirst({
      where: {
        driverId,
        ...(excludeRelocationId ? { id: { not: excludeRelocationId } } : {}),
        status: RelocationStatus.IN_TRANSIT,
      },
      select: { id: true, relocationCode: true },
    });
    if (otherTransit) {
      throw new ApiError(
        409,
        'DRIVER_BUSY',
        `Driver is already relocating another unit (${otherTransit.relocationCode})`
      );
    }
    const committedBooking = await tx.booking.findFirst({
      where: {
        driverId,
        status: { in: committedBookingStatuses },
      },
      select: { id: true, bookingNumber: true },
    });
    if (committedBooking) {
      throw new ApiError(
        409,
        'DRIVER_CONFLICT',
        `Driver is assigned to active booking ${committedBooking.bookingNumber}`
      );
    }
  }

  return driver;
}

async function engageDriverAndVehicleForTransit(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  driverId: string,
  coords?: { lat?: number | null; lng?: number | null }
) {
  await ensureVehicleAssignment(tx, driverId, vehicleId);
  await tx.vehicle.updateMany({
    where: { currentDriverId: driverId, id: { not: vehicleId } },
    data: { currentDriverId: null },
  });
  await tx.driver.updateMany({
    where: { currentVehicleId: vehicleId, id: { not: driverId } },
    data: { currentVehicleId: null },
  });
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: { status: VehicleStatus.IN_USE, currentDriverId: driverId },
  });
  await tx.driver.update({
    where: { id: driverId },
    data: { status: DriverStatus.ON_TRIP, currentVehicleId: vehicleId },
  });

  const activeSession = await tx.driverSession.findFirst({
    where: { driverId, status: DriverSessionStatus.ACTIVE },
  });
  if (activeSession) {
    await tx.driverSession.updateMany({
      where: { driverId, status: DriverSessionStatus.ACTIVE },
      data: { vehicleId },
    });
  } else {
    await tx.driverSession.create({
      data: {
        driverId,
        vehicleId,
        status: DriverSessionStatus.ACTIVE,
        startLat: coords?.lat ?? null,
        startLng: coords?.lng ?? null,
      },
    });
  }

  if (
    coords?.lat !== null &&
    coords?.lat !== undefined &&
    coords?.lng !== null &&
    coords?.lng !== undefined
  ) {
    const now = new Date();
    await tx.vehicleLocation.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        driverId,
        lat: coords.lat,
        lng: coords.lng,
        accuracyM: 15,
        recordedAt: now,
        receivedAt: now,
        movement: MovementStatus.MOVING,
      },
      update: {
        driverId,
        lat: coords.lat,
        lng: coords.lng,
        accuracyM: 15,
        recordedAt: now,
        receivedAt: now,
        movement: MovementStatus.MOVING,
      },
    });
  }
}

async function releaseDriverAndVehicleFromTransit(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  driverId: string | null,
  reason: string,
  vehicleUpdate: Prisma.VehicleUpdateInput,
  coords?: { lat?: number | null; lng?: number | null }
) {
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...vehicleUpdate,
      currentDriver: { disconnect: true },
    },
  });

  if (driverId) {
    await tx.vehicleAssignment.updateMany({
      where: { vehicleId, driverId, unassignedAt: null },
      data: { unassignedAt: new Date(), reason },
    });
    await tx.driverSession.updateMany({
      where: { driverId, vehicleId, status: DriverSessionStatus.ACTIVE },
      data: { status: DriverSessionStatus.ENDED, endedAt: new Date() },
    });
    await tx.driver.updateMany({
      where: { id: driverId, currentVehicleId: vehicleId },
      data: { status: DriverStatus.OFFLINE, currentVehicleId: null },
    });
  }

  if (
    coords?.lat !== null &&
    coords?.lat !== undefined &&
    coords?.lng !== null &&
    coords?.lng !== undefined &&
    driverId
  ) {
    const now = new Date();
    await tx.vehicleLocation.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        driverId,
        lat: coords.lat,
        lng: coords.lng,
        accuracyM: 15,
        speedMps: 0,
        recordedAt: now,
        receivedAt: now,
        movement: MovementStatus.STOPPED,
      },
      update: {
        lat: coords.lat,
        lng: coords.lng,
        speedMps: 0,
        recordedAt: now,
        receivedAt: now,
        movement: MovementStatus.STOPPED,
      },
    });
  } else {
    await tx.vehicleLocation.updateMany({
      where: { vehicleId },
      data: { speedMps: 0, movement: MovementStatus.STOPPED },
    });
  }
}

export async function createRelocation(
  actor: AuthenticatedUser,
  input: CreateRelocationInput,
  ctx?: RelocationMutationContext
) {
  if (actor.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only administrators can create vehicle relocations');
  }

  const startImmediately = Boolean(input.startImmediately);
  if (startImmediately && !input.driverId) {
    throw new ApiError(400, 'DRIVER_REQUIRED', 'Driver is required when starting relocation immediately');
  }

  const year = input.scheduledAt.getFullYear();
  let retries = 3;
  let created: Prisma.VehicleRelocationGetPayload<{ include: typeof relocationInclude }> | null = null;

  while (retries > 0) {
    try {
      created = await prisma.$transaction(
        async (tx) => {
          const vehicle = await assertVehicleReadyForRelocation(tx, input.vehicleId);
          const fromLocationId =
            input.fromLocationId ?? vehicle.currentLocationId ?? vehicle.homeLocationId;

          if (!fromLocationId) {
            throw new ApiError(
              400,
              'ORIGIN_LOCATION_REQUIRED',
              'Vehicle has no current hub; please specify fromLocationId'
            );
          }

          if (fromLocationId === input.toLocationId) {
            throw new ApiError(
              400,
              'SAME_LOCATION',
              'Destination hub must be different from origin hub'
            );
          }

          const [fromLoc, toLoc] = await Promise.all([
            tx.location.findUnique({ where: { id: fromLocationId } }),
            tx.location.findUnique({ where: { id: input.toLocationId } }),
          ]);

          if (!fromLoc) {
            throw new ApiError(404, 'LOCATION_NOT_FOUND', 'Origin hub not found');
          }
          if (!toLoc || !toLoc.isActive) {
            throw new ApiError(404, 'LOCATION_NOT_FOUND', 'Destination hub not found or inactive');
          }

          if (input.driverId) {
            await assertDriverReadyForRelocation(tx, input.driverId, startImmediately);
          }

          const relocationCode = await generateRelocationCode(tx, year);
          const now = new Date();

          if (startImmediately && input.driverId) {
            await engageDriverAndVehicleForTransit(tx, vehicle.id, input.driverId);
          }

          return tx.vehicleRelocation.create({
            data: {
              relocationCode,
              vehicleId: vehicle.id,
              driverId: input.driverId ?? null,
              fromLocationId,
              toLocationId: input.toLocationId,
              status: startImmediately ? RelocationStatus.IN_TRANSIT : RelocationStatus.SCHEDULED,
              scheduledAt: input.scheduledAt,
              departedAt: startImmediately ? now : null,
              notes: input.notes ?? null,
              createdById: actor.id,
            },
            include: relocationInclude,
          });
        },
        { maxWait: 15000, timeout: 20000 }
      );
      break;
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        retries--;
        if (retries === 0) {
          throw new ApiError(
            409,
            'RELOCATION_CODE_COLLISION',
            'Failed to generate unique relocation code. Please retry.'
          );
        }
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Failed to create vehicle relocation');
  }

  void Promise.resolve(
    logAuditEvent({
      actorUserId: ctx?.actorUserId ?? actor.id,
      action: 'relocation.created',
      entityType: 'VehicleRelocation',
      entityId: created.id,
      newValue: {
        relocationCode: created.relocationCode,
        vehicleId: created.vehicleId,
        driverId: created.driverId,
        fromLocationId: created.fromLocationId,
        toLocationId: created.toLocationId,
        status: created.status,
      },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    })
  ).catch((err) => console.warn('[Audit Log Warning]:', err));

  if (created.driver?.userId) {
    void notify(created.driver.userId, {
      type: 'RELOCATION_ASSIGNED',
      title: 'Tugas Relokasi Armada',
      body: `Anda ditugaskan membawa unit ${created.vehicle.plateNumber} (${created.fromLocation.name} → ${created.toLocation.name}).`,
      data: { relocationId: created.id, relocationCode: created.relocationCode },
    }).catch((err) => console.warn('[Relocation Notification Warning]:', err));
  }

  return created;
}

export async function startRelocation(
  relocationId: string,
  actor: AuthenticatedUser,
  input: StartRelocationInput = {},
  ctx?: RelocationMutationContext
) {
  const updated = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM vehicle_relocations WHERE id = $1 FOR UPDATE',
        relocationId
      );
      const existing = await tx.vehicleRelocation.findUnique({
        where: { id: relocationId },
        include: relocationInclude,
      });
      if (!existing) {
        throw new ApiError(404, 'NOT_FOUND', 'Relocation record not found');
      }

      const isAdmin = actor.role === 'ADMIN';
      const isAssignedDriver =
        actor.role === 'DRIVER' && existing.driver?.userId === actor.id;
      if (!isAdmin && !isAssignedDriver) {
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Only administrators or the assigned driver can start this relocation'
        );
      }

      if (existing.status !== RelocationStatus.SCHEDULED) {
        throw new ApiError(
          409,
          'INVALID_TRANSITION',
          `Cannot start relocation in status ${existing.status}`
        );
      }

      const targetDriverId =
        isAdmin && input.driverId ? input.driverId : existing.driverId;
      if (!targetDriverId) {
        throw new ApiError(
          400,
          'DRIVER_REQUIRED',
          'Assign a driver before starting this relocation'
        );
      }

      await assertVehicleReadyForRelocation(tx, existing.vehicleId, existing.id);
      await assertDriverReadyForRelocation(tx, targetDriverId, true, existing.id);
      await engageDriverAndVehicleForTransit(tx, existing.vehicleId, targetDriverId, {
        lat: input.startLat,
        lng: input.startLng,
      });

      return tx.vehicleRelocation.update({
        where: { id: existing.id },
        data: {
          status: RelocationStatus.IN_TRANSIT,
          driverId: targetDriverId,
          departedAt: new Date(),
        },
        include: relocationInclude,
      });
    },
    { maxWait: 15000, timeout: 20000 }
  );

  void Promise.resolve(
    logAuditEvent({
      actorUserId: ctx?.actorUserId ?? actor.id,
      action: 'relocation.started',
      entityType: 'VehicleRelocation',
      entityId: updated.id,
      oldValue: { status: RelocationStatus.SCHEDULED },
      newValue: { status: updated.status, driverId: updated.driverId },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    })
  ).catch((err) => console.warn('[Audit Log Warning]:', err));

  if (
    input.startLat !== null &&
    input.startLat !== undefined &&
    input.startLng !== null &&
    input.startLng !== undefined
  ) {
    void publishEvent({
      type: 'location:update',
      data: {
        vehicleId: updated.vehicleId,
        lat: input.startLat,
        lng: input.startLng,
        accuracyM: 15,
        speedMps: 0,
        headingDeg: null,
        recordedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        movement: MovementStatus.MOVING,
        driverName: updated.driver?.user?.name ?? null,
        driverPhone: updated.driver?.user?.phone ?? null,
        plateNumber: updated.vehicle.plateNumber,
        tripOrigin: `${updated.fromLocation.name} (${updated.fromLocation.code})`,
        tripDestination: `${updated.toLocation.name} (${updated.toLocation.code})`,
      },
    }).catch(() => {});
  }

  void notifyAdmins({
    type: 'RELOCATION_STARTED',
    title: 'Relokasi Unit Berangkat',
    body: `Unit ${updated.vehicle.plateNumber} (${updated.relocationCode}) berangkat dari ${updated.fromLocation.name} menuju ${updated.toLocation.name}.`,
    data: { relocationId: updated.id, relocationCode: updated.relocationCode },
  }).catch(() => {});

  return updated;
}

export async function completeRelocation(
  relocationId: string,
  actor: AuthenticatedUser,
  input: CompleteRelocationInput = {},
  ctx?: RelocationMutationContext
) {
  const updated = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM vehicle_relocations WHERE id = $1 FOR UPDATE',
        relocationId
      );
      const existing = await tx.vehicleRelocation.findUnique({
        where: { id: relocationId },
        include: relocationInclude,
      });
      if (!existing) {
        throw new ApiError(404, 'NOT_FOUND', 'Relocation record not found');
      }

      const isAdmin = actor.role === 'ADMIN';
      const isAssignedDriver =
        actor.role === 'DRIVER' && existing.driver?.userId === actor.id;
      if (!isAdmin && !isAssignedDriver) {
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Only administrators or the assigned driver can complete this relocation'
        );
      }

      if (existing.status !== RelocationStatus.IN_TRANSIT) {
        throw new ApiError(
          409,
          'INVALID_TRANSITION',
          `Cannot complete relocation in status ${existing.status}`
        );
      }

      await tx.$queryRawUnsafe(
        'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE',
        existing.vehicleId
      );
      if (existing.driverId) {
        await tx.$queryRawUnsafe(
          'SELECT id FROM drivers WHERE id = $1 FOR UPDATE',
          existing.driverId
        );
      }

      // 1. Move vehicle permanently to destination hub & restore AVAILABLE status
      await releaseDriverAndVehicleFromTransit(
        tx,
        existing.vehicleId,
        existing.driverId,
        `Relocation ${existing.relocationCode} completed`,
        {
          status: VehicleStatus.AVAILABLE,
          homeLocation: { connect: { id: existing.toLocationId } },
          currentOperationalLocation: { connect: { id: existing.toLocationId } },
        },
        { lat: input.endLat, lng: input.endLng }
      );

      // 2. Mark relocation COMPLETED with timestamp
      const mergedNotes = input.notes
        ? [existing.notes, input.notes].filter(Boolean).join(' | ')
        : existing.notes;

      return tx.vehicleRelocation.update({
        where: { id: existing.id },
        data: {
          status: RelocationStatus.COMPLETED,
          completedAt: new Date(),
          ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
        },
        include: relocationInclude,
      });
    },
    { maxWait: 15000, timeout: 20000 }
  );

  void Promise.resolve(
    logAuditEvent({
      actorUserId: ctx?.actorUserId ?? actor.id,
      action: 'relocation.completed',
      entityType: 'VehicleRelocation',
      entityId: updated.id,
      oldValue: {
        status: RelocationStatus.IN_TRANSIT,
        locationId: updated.fromLocationId,
      },
      newValue: {
        status: updated.status,
        locationId: updated.toLocationId,
        completedAt: updated.completedAt?.toISOString(),
      },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    })
  ).catch((err) => console.warn('[Audit Log Warning]:', err));

  void notifyAdmins({
    type: 'RELOCATION_COMPLETED',
    title: 'Relokasi Unit Tiba di Hub Tujuan',
    body: `Unit ${updated.vehicle.plateNumber} (${updated.relocationCode}) telah tiba di ${updated.toLocation.name} dan berstatus AVAILABLE.`,
    data: { relocationId: updated.id, relocationCode: updated.relocationCode },
  }).catch(() => {});

  return updated;
}

export async function cancelRelocation(
  relocationId: string,
  actor: AuthenticatedUser,
  input: CancelRelocationInput = {},
  ctx?: RelocationMutationContext
) {
  if (actor.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only administrators can cancel relocations');
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM vehicle_relocations WHERE id = $1 FOR UPDATE',
        relocationId
      );
      const existing = await tx.vehicleRelocation.findUnique({
        where: { id: relocationId },
        include: relocationInclude,
      });
      if (!existing) {
        throw new ApiError(404, 'NOT_FOUND', 'Relocation record not found');
      }

      if (
        existing.status !== RelocationStatus.SCHEDULED &&
        existing.status !== RelocationStatus.IN_TRANSIT
      ) {
        throw new ApiError(
          409,
          'INVALID_TRANSITION',
          `Cannot cancel relocation in status ${existing.status}`
        );
      }

      if (existing.status === RelocationStatus.IN_TRANSIT) {
        await tx.$queryRawUnsafe(
          'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE',
          existing.vehicleId
        );
        if (existing.driverId) {
          await tx.$queryRawUnsafe(
            'SELECT id FROM drivers WHERE id = $1 FOR UPDATE',
            existing.driverId
          );
        }
        await releaseDriverAndVehicleFromTransit(
          tx,
          existing.vehicleId,
          existing.driverId,
          `Relocation ${existing.relocationCode} cancelled`,
          { status: VehicleStatus.AVAILABLE }
        );
      }

      const mergedNotes = input.reason
        ? [existing.notes, `Dibatalkan: ${input.reason}`].filter(Boolean).join(' | ')
        : existing.notes;

      return tx.vehicleRelocation.update({
        where: { id: existing.id },
        data: {
          status: RelocationStatus.CANCELLED,
          ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
        },
        include: relocationInclude,
      });
    },
    { maxWait: 15000, timeout: 20000 }
  );

  void Promise.resolve(
    logAuditEvent({
      actorUserId: ctx?.actorUserId ?? actor.id,
      action: 'relocation.cancelled',
      entityType: 'VehicleRelocation',
      entityId: updated.id,
      newValue: { status: updated.status, reason: input.reason ?? null },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    })
  ).catch((err) => console.warn('[Audit Log Warning]:', err));

  if (updated.driver?.userId) {
    void notify(updated.driver.userId, {
      type: 'RELOCATION_CANCELLED',
      title: 'Relokasi Unit Dibatalkan',
      body: `Relokasi ${updated.vehicle.plateNumber} (${updated.relocationCode}) telah dibatalkan oleh admin.`,
      data: { relocationId: updated.id, relocationCode: updated.relocationCode },
    }).catch(() => {});
  }

  return updated;
}

export async function listRelocations(
  actor: AuthenticatedUser,
  filters: RelocationQueryFilters = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.VehicleRelocationWhereInput = {};

  if (actor.role === 'DRIVER') {
    where.driver = { userId: actor.id };
    where.status = filters.status ?? {
      in: [RelocationStatus.SCHEDULED, RelocationStatus.IN_TRANSIT],
    };
  } else if (actor.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to vehicle relocations');
  } else {
    if (filters.status) where.status = filters.status;
    if (filters.driverId) where.driverId = filters.driverId;
  }

  if (filters.vehicleId) {
    where.vehicleId = filters.vehicleId;
  }

  if (filters.locationId) {
    where.OR = [
      { fromLocationId: filters.locationId },
      { toLocationId: filters.locationId },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.vehicleRelocation.count({ where }),
    prisma.vehicleRelocation.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ status: 'asc' }, { scheduledAt: 'desc' }],
      include: relocationInclude,
    }),
  ]);

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
