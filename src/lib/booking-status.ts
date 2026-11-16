// Shared booking-status groupings. Centralized here so the Overview "next
// departure" selector and any future consumers agree on a single source of truth
// instead of scattering ad-hoc string literals across components.

/**
 * Statuses that still represent a genuine upcoming (pre-departure) trip.
 * Everything past `DRIVER_ASSIGNED` means the trip has effectively begun
 * (driver en route / arrived / in progress) or has already ended / stalled.
 */
export const PRE_DEPARTURE_STATUSES: readonly string[] = [
  'PENDING',
  'APPROVED',
  'SEARCHING_DRIVER',
  'DRIVER_NOTIFIED',
  'DRIVER_ASSIGNED',
];

/**
 * Terminal / post-trip / dead-end statuses that must never surface as an
 * upcoming departure: explicitly cancelled, rejected, completed, awaiting
 * receipt approval (`PENDING_COMPLETION` → "Menunggu Approval Nota"), or
 * stalled awaiting admin/another driver.
 */
export const TERMINAL_STATUSES: readonly string[] = [
  'CANCELLED',
  'REJECTED',
  'COMPLETED',
  'PENDING_COMPLETION',
  'NO_DRIVER_AVAILABLE',
  'ADMIN_INTERVENTION',
];

export interface NextDepartureInput {
  status: string;
  departureAt: string | Date;
}

/**
 * Select the soonest upcoming departure from a list of bookings.
 *
 * Strict allowlist: only `PRE_DEPARTURE_STATUSES` qualify (so a cancelled,
 * completed, or `PENDING_COMPLETION` booking can never leak in), and the
 * departure must be at or after `now`. Returns `undefined` when nothing matches.
 */
export function selectNextDeparture<T extends NextDepartureInput>(
  bookings: T[],
  now: Date = new Date(),
): T | undefined {
  const nowMs = now.getTime();
  return bookings
    .filter(
      (b) =>
        PRE_DEPARTURE_STATUSES.includes(b.status) &&
        new Date(b.departureAt).getTime() >= nowMs,
    )
    .sort((a, b) => new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime())[0];
}
