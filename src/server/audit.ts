import { logger } from '@/lib/logger';

export interface AuditEvent {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

// Phase 1 scope: structured JSON logging for audit events.
// DB audit_logs table arrives in Phase 2+ per ARCHITECTURE.md §3 and §8.
export function logAuditEvent(event: AuditEvent): void {
  logger.info({
    msg: `AUDIT: ${event.action} on ${event.entityType}:${event.entityId}`,
    audit: true,
    ...event,
  });
}
