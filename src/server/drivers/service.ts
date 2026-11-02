import bcrypt from 'bcryptjs';
import { Prisma, DriverStatus, RoleCode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';

export interface CreateDriverInput {
  email: string;
  name: string;
  phone: string;
  password: string;
  licenseNumber: string;
  status?: DriverStatus;
}

export interface DriverQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: DriverStatus;
}

export async function createDriver(input: CreateDriverInput, actorUserId?: string) {
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
  });

  logAuditEvent({
    actorUserId,
    action: 'CREATE_DRIVER',
    entityType: 'Driver',
    entityId: driver.id,
    details: {
      userId: driver.userId,
      licenseNumber: driver.licenseNumber,
      status: driver.status,
    },
  });

  return driver;
}

export async function listDrivers(filters: DriverQueryFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.DriverWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
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

  const [total, data] = await Promise.all([
    prisma.driver.count({ where }),
    prisma.driver.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
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
