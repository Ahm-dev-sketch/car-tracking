import bcrypt from 'bcryptjs';
import { Prisma, DriverStatus, RoleCode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';

export interface DriverMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateDriverInput {
  email: string;
  name: string;
  phone: string;
  password: string;
  licenseNumber: string;
  status?: DriverStatus;
}

export interface UpdateDriverInput {
  licenseNumber?: string;
  status?: DriverStatus;
}

export interface DriverQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: DriverStatus;
  locationId?: string;
  assignment?: 'assigned' | 'unassigned' | 'all';
  sortBy?: 'name' | 'license_number' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export async function createDriver(
  input: CreateDriverInput,
  ctx?: DriverMutationContext
) {
  if (input.status === DriverStatus.ON_TRIP) {
    throw new ApiError(400, 'INVALID_STATUS', 'ON_TRIP status is reserved for the trip lifecycle');
  }
  const email = input.email.toLowerCase().trim();
  const licenseNumber = input.licenseNumber.trim();

  const [existingUser, existingDriver, driverRole] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.driver.findUnique({ where: { licenseNumber } }),
    prisma.role.findUnique({ where: { code: RoleCode.DRIVER } }),
  ]);

  if (existingUser) {
    throw new ApiError(409, 'USER_EXISTS', 'A user with this email already exists');
  }

  if (existingDriver) {
    throw new ApiError(409, 'LICENSE_EXISTS', 'A driver with this license number already exists');
  }

  if (!driverRole) {
    throw new ApiError(500, 'ROLE_MISSING', 'Driver role not configured in database');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const driver = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: input.name,
        phone: input.phone,
        passwordHash,
        roleId: driverRole.id,
      },
    });

    return tx.driver.create({
      data: {
        userId: user.id,
        licenseNumber,
        status: input.status ?? DriverStatus.OFFLINE,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            isActive: true,
          },
        },
        currentVehicle: {
          select: {
            id: true,
            plateNumber: true,
            brand: true,
            model: true,
          },
        },
      },
    });
  }, {
    maxWait: 15000,
    timeout: 20000,
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'CREATE_DRIVER',
    entityType: 'Driver',
    entityId: driver.id,
    newValue: {
      userId: driver.userId,
      licenseNumber: driver.licenseNumber,
      status: driver.status,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return driver;
}

export async function getDriverById(id: string) {
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          isActive: true,
          avatarUrl: true,
        },
      },
      currentVehicle: {
        select: {
          id: true,
          plateNumber: true,
          brand: true,
          model: true,
          status: true,
        },
      },
      assignments: {
        where: { unassignedAt: null },
        take: 1,
        include: {
          vehicle: {
            select: {
              id: true,
              plateNumber: true,
              brand: true,
              model: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!driver) {
    throw new ApiError(404, 'NOT_FOUND', 'Driver not found');
  }

  const activeAssignment = driver.assignments?.[0];
  const { assignments: _omitted, ...cleanDriver } = driver;

  return {
    ...cleanDriver,
    currentAssignment: activeAssignment
      ? {
          id: activeAssignment.id.toString(),
          vehicleId: activeAssignment.vehicleId,
          assignedAt: activeAssignment.assignedAt,
          vehicle: activeAssignment.vehicle,
        }
      : null,
  };
}

export async function updateDriver(
  id: string,
  input: UpdateDriverInput,
  ctx?: DriverMutationContext
) {
  const { existing, updated } = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', id);
    const existing = await tx.driver.findUnique({
      where: { id },
      include: { user: true, currentVehicle: true },
    });

    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'Driver not found');
    }

    const data: Prisma.DriverUpdateInput = {};

    if (input.licenseNumber) {
      const licenseNumber = input.licenseNumber.trim();
      if (licenseNumber !== existing.licenseNumber) {
        const duplicate = await tx.driver.findUnique({ where: { licenseNumber } });
        if (duplicate) {
          throw new ApiError(409, 'LICENSE_EXISTS', 'A driver with this license number already exists');
        }
        data.licenseNumber = licenseNumber;
      }
    }

    if (input.status && (input.status !== existing.status || input.status === DriverStatus.OFFLINE)) {
      const activeTrip = await tx.trip.findFirst({ where: { driverId: id, status: 'ACTIVE' } });
      if (existing.status === DriverStatus.ON_TRIP || activeTrip) {
        throw new ApiError(409, 'DRIVER_BUSY', 'Cannot change driver status during an active trip');
      }
      if (input.status === DriverStatus.ON_TRIP) {
        throw new ApiError(
          400,
          'INVALID_STATUS',
          'Cannot set ON_TRIP status manually; reserved for trip lifecycle'
        );
      }

      if (input.status === DriverStatus.AVAILABLE && !existing.user.isActive) {
        throw new ApiError(409, 'DRIVER_INACTIVE', 'Cannot make an inactive driver available');
      }
      if (input.status === DriverStatus.AVAILABLE &&
        existing.currentVehicle && ['INACTIVE', 'MAINTENANCE', 'IN_USE'].includes(existing.currentVehicle.status)) {
        throw new ApiError(409, 'VEHICLE_UNAVAILABLE', 'Driver requires an available assigned vehicle');
      }
      if (input.status === DriverStatus.AVAILABLE && !existing.currentVehicleId) {
        throw new ApiError(
          400,
          'NO_VEHICLE_ASSIGNED',
          'Cannot set AVAILABLE status without an assigned vehicle'
        );
      }

      if (input.status === DriverStatus.OFFLINE) {
        const booking = await tx.booking.findFirst({
          where: {
            driverId: id,
            status: { in: ['APPROVED', 'SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ADMIN_INTERVENTION'] },
          },
        });
        if (booking) {
          throw new ApiError(409, 'ACTIVE_BOOKING', 'Resolve assigned bookings before taking the driver offline');
        }
        await tx.driverSession.updateMany({
          where: { driverId: id, status: 'ACTIVE' },
          data: { status: 'ENDED', endedAt: new Date() },
        });
        await tx.vehicleLocation.updateMany({ where: { driverId: id }, data: { movement: 'OFFLINE' } });
      }
      data.status = input.status;
    }

    const updated = await tx.driver.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            isActive: true,
          },
        },
        currentVehicle: {
          select: {
            id: true,
            plateNumber: true,
            brand: true,
            model: true,
          },
        },
      },
    });
    return { existing, updated };
  }, {
    maxWait: 15000,
    timeout: 20000,
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'UPDATE_DRIVER',
    entityType: 'Driver',
    entityId: updated.id,
    oldValue: {
      licenseNumber: existing.licenseNumber,
      status: existing.status,
    },
    newValue: {
      licenseNumber: updated.licenseNumber,
      status: updated.status,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return updated;
}

export async function assertDriverCanDeactivate(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', id);
  const driver = await tx.driver.findUnique({ where: { id }, include: { user: true, drivenVehicle: true } });
  if (!driver) {
    throw new ApiError(404, 'NOT_FOUND', 'Driver not found');
  }
  const activeTrip = await tx.trip.findFirst({ where: { driverId: id, status: 'ACTIVE' } });
  if (driver.status === DriverStatus.ON_TRIP || activeTrip) {
    throw new ApiError(409, 'DRIVER_BUSY', 'Cannot deactivate a driver during an active trip');
  }
  const activeAssignment = await tx.vehicleAssignment.findFirst({
    where: { driverId: id, unassignedAt: null },
  });
  if (activeAssignment || driver.currentVehicleId || driver.drivenVehicle) {
    throw new ApiError(409, 'DRIVER_ASSIGNED', 'Unassign the vehicle before deactivating the driver');
  }
  const booking = await tx.booking.findFirst({
    where: {
      driverId: id,
      status: { in: ['APPROVED', 'SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ADMIN_INTERVENTION'] },
    },
  });
  if (booking) {
    throw new ApiError(409, 'ACTIVE_BOOKING', 'Resolve assigned bookings before deactivating the driver');
  }
  const session = await tx.driverSession.findFirst({ where: { driverId: id, status: 'ACTIVE' } });
  if (session) {
    throw new ApiError(409, 'ACTIVE_SESSION', 'End the online session before deactivating the driver');
  }
  return driver;
}

export async function deactivateDriver(
  id: string,
  ctx?: DriverMutationContext
) {
  const { result, driver } = await prisma.$transaction(async (tx) => {
    const driver = await assertDriverCanDeactivate(tx, id);
    await tx.user.update({
      where: { id: driver.userId },
      data: { isActive: false },
    });

    const result = await tx.driver.update({
      where: { id },
      data: {
        status: DriverStatus.OFFLINE,
        currentVehicleId: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            isActive: true,
          },
        },
      },
    });
    return { result, driver };
  }, {
    maxWait: 15000,
    timeout: 20000,
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'DEACTIVATE_DRIVER',
    entityType: 'Driver',
    entityId: result.id,
    oldValue: { isActive: driver.user.isActive, status: driver.status },
    newValue: { isActive: false, status: DriverStatus.OFFLINE },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return result;
}

export async function listDrivers(filters: DriverQueryFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.DriverWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.assignment === 'assigned') {
    where.currentVehicleId = { not: null };
  } else if (filters.assignment === 'unassigned') {
    where.currentVehicleId = null;
  }

  if (filters.locationId) {
    where.currentVehicle = {
      OR: [
        { homeLocationId: filters.locationId },
        { currentLocationId: filters.locationId },
      ],
    };
  }

  if (filters.search) {
    const s = filters.search.trim();
    where.OR = [
      { licenseNumber: { contains: s, mode: 'insensitive' } },
      { user: { name: { contains: s, mode: 'insensitive' } } },
      { user: { email: { contains: s, mode: 'insensitive' } } },
      { user: { phone: { contains: s, mode: 'insensitive' } } },
    ];
  }

  let orderBy: Prisma.DriverOrderByWithRelationInput = { createdAt: 'desc' };
  const sortDir = filters.sortOrder ?? 'desc';
  if (filters.sortBy === 'name') {
    orderBy = { user: { name: sortDir } };
  } else if (filters.sortBy === 'license_number') {
    orderBy = { licenseNumber: sortDir };
  } else if (filters.sortBy === 'created_at') {
    orderBy = { createdAt: sortDir };
  }

  const [total, drivers] = await Promise.all([
    prisma.driver.count({ where }),
    prisma.driver.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            isActive: true,
          },
        },
        currentVehicle: {
          select: {
            id: true,
            plateNumber: true,
            brand: true,
            model: true,
            status: true,
            homeLocation: { select: { id: true, name: true, code: true } },
            currentOperationalLocation: { select: { id: true, name: true, code: true } },
          },
        },
        assignments: {
          where: { unassignedAt: null },
          take: 1,
        },
      },
    }),
  ]);

  const data = drivers.map((d) => {
    const active = d.assignments?.[0];
    const { assignments: _omitted, ...cleanDriver } = d;
    return {
      ...cleanDriver,
      activeAssignmentId: active ? active.id.toString() : null,
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
