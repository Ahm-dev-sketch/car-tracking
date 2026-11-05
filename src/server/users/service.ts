import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';
import { assertDriverCanDeactivate } from '@/server/drivers/service';

export interface UserMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  phone: string;
  password: string;
  roleId: string;
}

export interface UpdateUserInput {
  isActive?: boolean;
  password?: string;
}

export interface UserQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
}

export async function createUser(
  input: CreateUserInput,
  ctx?: UserMutationContext
) {
  const email = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, 'USER_EXISTS', 'A user with this email already exists');
  }

  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) {
    throw new ApiError(400, 'INVALID_ROLE', 'The specified role does not exist');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      phone: input.phone,
      passwordHash,
      roleId: input.roleId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      isActive: true,
      role: { select: { id: true, code: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'CREATE_USER',
    entityType: 'User',
    entityId: user.id,
    newValue: { email: user.email, role: user.role.code },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return user;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  ctx?: UserMutationContext
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }
  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, 10);
  }

  const user = await prisma.$transaction(async (tx) => {
    if (input.isActive === false) {
      const driver = await tx.driver.findUnique({ where: { userId: id } });
      if (driver) {
        await assertDriverCanDeactivate(tx, driver.id);
        await tx.driver.update({ where: { id: driver.id }, data: { status: 'OFFLINE' } });
      }
    }
    return tx.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        isActive: true,
        role: { select: { id: true, code: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'UPDATE_USER',
    entityType: 'User',
    entityId: user.id,
    oldValue: { isActive: existing.isActive },
    newValue: {
      isActive: user.isActive,
      passwordReset: Boolean(input.password),
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return user;
}

export async function listUsers(filters: UserQueryFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};
  if (filters.search) {
    const s = filters.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        isActive: true,
        role: { select: { id: true, code: true, name: true } },
        createdAt: true,
        updatedAt: true,
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
