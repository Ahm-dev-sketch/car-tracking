import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';

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

export async function createUser(input: CreateUserInput, actorUserId?: string) {
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

  logAuditEvent({
    actorUserId,
    action: 'CREATE_USER',
    entityType: 'User',
    entityId: user.id,
    details: { email: user.email, role: user.role.code },
  });

  return user;
}

export async function updateUser(id: string, input: UpdateUserInput, actorUserId?: string) {
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

  const user = await prisma.user.update({
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

  logAuditEvent({
    actorUserId,
    action: 'UPDATE_USER',
    entityType: 'User',
    entityId: user.id,
    details: { isActive: user.isActive, passwordReset: Boolean(input.password) },
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
