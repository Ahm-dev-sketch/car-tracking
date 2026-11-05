import { Prisma, BookingStatus, VehicleStatus, VehicleType, Transmission } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';

export interface VehicleMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateVehicleInput {
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType: VehicleType;
  seatingCapacity: number;
  transmission?: Transmission | null;
  imageUrl?: string | null;
  status?: VehicleStatus;
}

export interface UpdateVehicleInput {
  plateNumber?: string;
  brand?: string;
  model?: string;
  vehicleType?: VehicleType;
  seatingCapacity?: number;
  transmission?: Transmission | null;
  imageUrl?: string | null;
  status?: VehicleStatus;
}

export interface VehicleQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
  seats?: number;
  status?: VehicleStatus;
  locationId?: string;
  isAdmin?: boolean;
  actor?: AuthenticatedUser;
  sortBy?: 'created_at' | 'plate_number' | 'brand' | 'status';
  sortOrder?: 'asc' | 'desc';
}

const driverVisibleBookingStatuses: BookingStatus[] = [
  BookingStatus.APPROVED,
  BookingStatus.DRIVER_ASSIGNED,
  BookingStatus.DRIVER_EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.IN_PROGRESS,
];

function redactDriver<T extends { licenseNumber: string; user: { id: string; phone: string } }>(
  driver: T | null,
  actor: AuthenticatedUser | undefined,
  canViewVehicleDriver: boolean
) {
  if (!driver || canViewVehicleDriver || (actor?.role === 'DRIVER' && driver.user.id === actor.id)) {
    return driver;
  }
  return { ...driver, licenseNumber: 'REDACTED', user: { ...driver.user, phone: 'REDACTED' } };
}

export async function listVehicles(filters: VehicleQueryFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;
  const isAdmin = filters.actor ? filters.actor.role === 'ADMIN' : filters.isAdmin === true;

  const where: Prisma.VehicleWhereInput = {};

  if (!isAdmin) {
    if (filters.status && filters.status === VehicleStatus.INACTIVE) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    where.status = filters.status ?? { not: VehicleStatus.INACTIVE };
  } else if (filters.status) {
    where.status = filters.status;
  }

  if (filters.seats) {
    where.seatingCapacity = { gte: filters.seats };
  }

  if (filters.locationId) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { homeLocationId: filters.locationId },
          { currentLocationId: filters.locationId },
        ],
      },
    ];
  }

  if (filters.search) {
    const s = filters.search.trim();
    where.OR = [
      { plateNumber: { contains: s, mode: 'insensitive' } },
      { brand: { contains: s, mode: 'insensitive' } },
      { model: { contains: s, mode: 'insensitive' } },
    ];
  }

  let orderBy: Prisma.VehicleOrderByWithRelationInput = { createdAt: 'desc' };
  const sortDir = filters.sortOrder ?? 'desc';
  if (filters.sortBy === 'plate_number') {
    orderBy = { plateNumber: sortDir };
  } else if (filters.sortBy === 'brand') {
    orderBy = { brand: sortDir };
  } else if (filters.sortBy === 'status') {
    orderBy = { status: sortDir };
  } else if (filters.sortBy === 'created_at') {
    orderBy = { createdAt: sortDir };
  }

  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        homeLocation: { select: { id: true, name: true, code: true } },
        currentOperationalLocation: { select: { id: true, name: true, code: true } },
        currentDriver: {
          select: {
            id: true,
            licenseNumber: true,
            status: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        assignments: {
          where: { unassignedAt: null },
          take: 1,
          include: {
            driver: {
              include: {
                user: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const bookings = filters.actor?.role === 'USER' && vehicles.length > 0
    ? await prisma.booking.findMany({
        where: {
          userId: filters.actor.id,
          vehicleId: { in: vehicles.map((vehicle) => vehicle.id) },
          status: { in: driverVisibleBookingStatuses },
        },
        select: { vehicleId: true },
      })
    : [];
  const bookedVehicleIds = new Set(bookings.map((booking) => booking.vehicleId));

  const data = vehicles.map((v) => {
    let currentAssignment = null;
    if (isAdmin && v.assignments && v.assignments.length > 0) {
      const a = v.assignments[0];
      currentAssignment = {
        id: a.id.toString(),
        assignedAt: a.assignedAt,
        driverId: a.driverId,
        driverName: a.driver.user.name,
        driverPhone: a.driver.user.phone,
        licenseNumber: a.driver.licenseNumber,
      };
    }

    const { assignments: _omittedAssignments, ...vehicleFields } = v;
    return {
      ...vehicleFields,
      currentDriver: redactDriver(v.currentDriver, filters.actor, isAdmin || bookedVehicleIds.has(v.id)),
      ...(isAdmin ? { currentAssignment } : {}),
    };
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

// An omitted actor is reserved for trusted internal callers; public routes must pass one.
export async function getVehicleById(id: string, actor?: AuthenticatedUser) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      currentDriver: {
        select: {
          id: true,
          licenseNumber: true,
          status: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      },
      assignments: {
        where: { unassignedAt: null },
        take: 1,
        include: {
          driver: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      },
    },
  });

  if (!vehicle) {
    throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
  }

  const activeBooking = actor?.role === 'USER'
    ? await prisma.booking.findFirst({
        where: { userId: actor.id, vehicleId: id, status: { in: driverVisibleBookingStatuses } },
        select: { id: true },
      })
    : null;
  const canViewVehicleDriver = !actor || actor.role === 'ADMIN' || Boolean(activeBooking);
  const activeAssignment = vehicle.assignments?.[0];
  const assignedDriver = activeAssignment
    ? redactDriver(activeAssignment.driver, actor, canViewVehicleDriver)
    : null;
  const { assignments: _omitted, ...cleanVehicle } = vehicle;

  return {
    ...cleanVehicle,
    currentDriver: redactDriver(vehicle.currentDriver, actor, canViewVehicleDriver),
    currentAssignment: activeAssignment && assignedDriver
      ? {
          id: activeAssignment.id.toString(),
          assignedAt: activeAssignment.assignedAt,
          driverId: activeAssignment.driverId,
          driverName: activeAssignment.driver.user.name,
          driverPhone: assignedDriver.user.phone,
          licenseNumber: assignedDriver.licenseNumber,
        }
      : null,
  };
}

export async function createVehicle(
  input: CreateVehicleInput,
  ctx?: VehicleMutationContext
) {
  if (input.status === VehicleStatus.IN_USE) {
    throw new ApiError(400, 'INVALID_STATUS', 'IN_USE status is reserved for the trip lifecycle');
  }
  const plateNumber = input.plateNumber.trim().toUpperCase();

  const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
  if (existing) {
    throw new ApiError(409, 'PLATE_EXISTS', 'A vehicle with this plate number already exists');
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber,
      brand: input.brand,
      model: input.model,
      vehicleType: input.vehicleType,
      seatingCapacity: input.seatingCapacity,
      transmission: input.transmission ?? null,
      imageUrl: input.imageUrl ?? null,
      status: input.status ?? VehicleStatus.AVAILABLE,
    },
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'CREATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    newValue: {
      plateNumber: vehicle.plateNumber,
      brand: vehicle.brand,
      model: vehicle.model,
      status: vehicle.status,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return vehicle;
}

export async function updateVehicle(
  id: string,
  input: UpdateVehicleInput,
  ctx?: VehicleMutationContext
) {
  const { vehicle, existing } = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', id);
    const existing = await tx.vehicle.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
    }

    const data: Prisma.VehicleUpdateInput = {};

    if (input.plateNumber) {
      const plateNumber = input.plateNumber.trim().toUpperCase();
      if (plateNumber !== existing.plateNumber) {
        const duplicate = await tx.vehicle.findUnique({ where: { plateNumber } });
        if (duplicate) {
          throw new ApiError(409, 'PLATE_EXISTS', 'A vehicle with this plate number already exists');
        }
        data.plateNumber = plateNumber;
      }
    }

    if (input.brand) data.brand = input.brand;
    if (input.model) data.model = input.model;
    if (input.vehicleType) data.vehicleType = input.vehicleType;
    if (input.seatingCapacity !== undefined) data.seatingCapacity = input.seatingCapacity;
    if (input.transmission !== undefined) data.transmission = input.transmission;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;

    if (input.status && input.status !== existing.status) {
      if (input.status === VehicleStatus.IN_USE) {
        throw new ApiError(400, 'INVALID_STATUS', 'IN_USE status is reserved for the trip lifecycle');
      }
      const activeTrip = await tx.trip.findFirst({ where: { vehicleId: id, status: 'ACTIVE' } });
      if (existing.status === VehicleStatus.IN_USE || activeTrip) {
        throw new ApiError(409, 'VEHICLE_IN_USE', 'Cannot change vehicle status during an active trip');
      }
      if (input.status === VehicleStatus.MAINTENANCE || input.status === VehicleStatus.INACTIVE) {
        await assertVehicleCanWithdraw(tx, id);
      }

      data.status = input.status;
    }

    const vehicle = await tx.vehicle.update({ where: { id }, data });
    return { vehicle, existing };
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'UPDATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    oldValue: {
      plateNumber: existing.plateNumber,
      status: existing.status,
    },
    newValue: {
      plateNumber: vehicle.plateNumber,
      status: vehicle.status,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return vehicle;
}

async function assertVehicleCanWithdraw(tx: Prisma.TransactionClient, id: string) {
  const activeTrip = await tx.trip.findFirst({ where: { vehicleId: id, status: 'ACTIVE' } });
  if (activeTrip) {
    throw new ApiError(409, 'VEHICLE_IN_USE', 'Cannot withdraw a vehicle with an active trip');
  }
  const activeAssignment = await tx.vehicleAssignment.findFirst({
    where: { vehicleId: id, unassignedAt: null },
  });
  const driver = await tx.driver.findFirst({
    where: { OR: [{ currentVehicleId: id }, { drivenVehicle: { id } }] },
  });
  if (activeAssignment || driver) {
    throw new ApiError(409, 'VEHICLE_ASSIGNED', 'Unassign the vehicle before withdrawing it');
  }
  const booking = await tx.booking.findFirst({
    where: {
      vehicleId: id,
      status: { in: ['APPROVED', 'SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ADMIN_INTERVENTION'] },
    },
  });
  if (booking) {
    throw new ApiError(409, 'ACTIVE_BOOKING', 'Resolve assigned bookings before withdrawing the vehicle');
  }
  const session = await tx.driverSession.findFirst({ where: { vehicleId: id, status: 'ACTIVE' } });
  if (session) {
    throw new ApiError(409, 'ACTIVE_SESSION', 'End the online session before withdrawing the vehicle');
  }
}

export async function deleteVehicle(
  id: string,
  ctx?: VehicleMutationContext
) {
  const { vehicle, existing } = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', id);
    const existing = await tx.vehicle.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
    }

    if (existing.status === VehicleStatus.IN_USE) {
      throw new ApiError(409, 'VEHICLE_IN_USE', 'Cannot deactivate a vehicle currently in use');
    }

    await assertVehicleCanWithdraw(tx, id);

    const vehicle = await tx.vehicle.update({
      where: { id },
      data: {
        status: VehicleStatus.INACTIVE,
        currentDriver: { disconnect: true },
      },
    });
    return { vehicle, existing };
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'DEACTIVATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    oldValue: { status: existing.status },
    newValue: { status: VehicleStatus.INACTIVE },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return vehicle;
}
