import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

export interface AuditEvent {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const newVal = (event.newValue ?? event.details ?? null) as Prisma.InputJsonValue | undefined;
  const oldVal = (event.oldValue ?? null) as Prisma.InputJsonValue | undefined;

  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        oldValue: oldVal,
        newValue: newVal,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error({
      msg: 'Failed to persist audit log to DB, falling back to console logger',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info({
    msg: `AUDIT: ${event.action} on ${event.entityType}:${event.entityId ?? 'none'}`,
    audit: true,
    ...event,
  });
}
