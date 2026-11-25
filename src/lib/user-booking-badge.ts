export const TERMINAL_BOOKING_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'] as const;

export interface UserBadgeBookingLike {
  id: string;
  status: string;
  rejectionSeenAt?: string | Date | null;
}

/**
 * Computes the user's "My bookings" badge count:
 * - Every booking whose status is NOT COMPLETED, CANCELLED, or REJECTED counts +1.
 * - A REJECTED booking counts +1 only if it has not been acknowledged
 *   (neither via server `rejectionSeenAt` nor via local seen IDs).
 */
export function computeUserActionBadgeCount(
  bookings: readonly UserBadgeBookingLike[],
  seenRejectedIds?: Iterable<string>
): number {
  const seenSet = seenRejectedIds ? new Set(seenRejectedIds) : null;
  let total = 0;

  for (const booking of bookings) {
    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      continue;
    }
    if (booking.status === 'REJECTED') {
      const isSeen = Boolean(booking.rejectionSeenAt) || Boolean(seenSet?.has(booking.id));
      if (!isSeen) {
        total += 1;
      }
      continue;
    }
    total += 1;
  }

  return total;
}

const SEEN_STORAGE_PREFIX = 'kcic_seen_rejected_bookings:';
const PENDING_ACK_STORAGE_PREFIX = 'kcic_pending_ack_rejected:';

function readIdList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeIdList(key: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = Array.from(new Set(ids)).slice(-100);
    window.localStorage.setItem(key, JSON.stringify(unique));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function getSeenRejectedIds(userId: string): string[] {
  return readIdList(`${SEEN_STORAGE_PREFIX}${userId}`);
}

export function markRejectedSeenLocally(userId: string, bookingId: string): string[] {
  const next = Array.from(new Set([...getSeenRejectedIds(userId), bookingId]));
  writeIdList(`${SEEN_STORAGE_PREFIX}${userId}`, next);
  return next;
}

export function getPendingRejectedAcks(userId: string): string[] {
  return readIdList(`${PENDING_ACK_STORAGE_PREFIX}${userId}`);
}

export function enqueuePendingRejectedAck(userId: string, bookingId: string): void {
  const next = Array.from(new Set([...getPendingRejectedAcks(userId), bookingId]));
  writeIdList(`${PENDING_ACK_STORAGE_PREFIX}${userId}`, next);
}

export function clearPendingRejectedAcks(userId: string, syncedIds: readonly string[]): void {
  const syncedSet = new Set(syncedIds);
  const remaining = getPendingRejectedAcks(userId).filter((id) => !syncedSet.has(id));
  writeIdList(`${PENDING_ACK_STORAGE_PREFIX}${userId}`, remaining);
}

export function applyPendingOfflineBadgeDeduction(
  serverCount: number,
  userId?: string | null
): number {
  if (!userId) return Math.max(0, serverCount);
  const pendingCount = getPendingRejectedAcks(userId).length;
  return Math.max(0, serverCount - pendingCount);
}
