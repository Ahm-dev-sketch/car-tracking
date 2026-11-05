import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { Prisma, RoleCode } from '@prisma/client';
import { publishEvent } from '@/server/realtime/hub';

export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}

export interface SerializedNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

function serializeNotification(row: {
  id: bigint;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Prisma.JsonValue | null;
  readAt: Date | null;
  createdAt: Date;
}): SerializedNotification {
  return {
    id: row.id.toString(),
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

// Phase 3 scope: in-app notifications persisted to database.
// Realtime push notifications via WebSockets / Cloudflare Durable Objects deferred to Phase 5 (ARCHITECTURE.md §1 & §4).
export async function notify(
  userId: string,
  payload: NotificationPayload
): Promise<SerializedNotification | null> {
  try {
    const row = await prisma.notification.create({
      data: {
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: (payload.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    const serialized = serializeNotification(row);
    await publishEvent({
      type: 'notification',
      data: {
        id: serialized.id,
        userId: serialized.userId,
        type: serialized.type,
        title: serialized.title,
        body: serialized.body,
        createdAt: serialized.createdAt.toISOString(),
      },
    });
    return serialized;
  } catch (error) {
    // Notification delivery must not turn a committed business action into an HTTP failure.
    logger.warn({ msg: 'Notification delivery failed', userId, type: payload.type, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function notifyAdmins(payload: NotificationPayload): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { code: RoleCode.ADMIN },
      },
      select: { id: true },
    });
    await Promise.all(admins.map((admin) => notify(admin.id, payload)));
  } catch (error) {
    logger.warn({ msg: 'Admin notification delivery failed', type: payload.type, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function listNotifications(
  userId: string,
  filters: { page?: number; limit?: number }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.NotificationWhereInput = { userId };

  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { readAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'desc' },
      ],
    }),
  ]);

  return {
    data: rows.map(serializeNotification),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function markAsRead(
  id: string,
  userId: string
): Promise<SerializedNotification> {
  let bigId: bigint;
  try {
    bigId = BigInt(id);
  } catch {
    throw new ApiError(400, 'INVALID_ID', 'Invalid notification id format');
  }

  const existing = await prisma.notification.findFirst({
    where: { id: bigId, userId },
  });

  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Notification not found');
  }

  const updated = await prisma.notification.update({
    where: { id: bigId },
    data: { readAt: new Date() },
  });

  return serializeNotification(updated);
}
