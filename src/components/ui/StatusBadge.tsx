import React from 'react';

type StatusType =
  // Booking
  | 'PENDING'
  | 'SEARCHING_DRIVER'
  | 'DRIVER_NOTIFIED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'PENDING_COMPLETION'
  | 'COMPLETED'
  | 'NO_DRIVER_AVAILABLE'
  | 'ADMIN_INTERVENTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  // Vehicle
  | 'AVAILABLE'
  | 'RESERVED'
  | 'IN_USE'
  | 'MAINTENANCE'
  | 'INACTIVE'
  // Driver
  | 'OFFLINE'
  | 'ONLINE'
  | 'AVAILABLE'
  | 'BUSY'
  | 'ON_TRIP'
  // Trip
  | 'ACTIVE'
  | 'ABORTED'
  | string;

/**
 * Tone mapping only — the actual colours come from the four fixed status
 * token sets in globals.css (.pill-active / -standby / -warning / -error).
 */
type Tone = 'active' | 'standby' | 'warning' | 'error' | 'neutral';

const statusTones: Record<string, Tone> = {
  // Booking
  PENDING: 'standby',
  SEARCHING_DRIVER: 'standby',
  DRIVER_NOTIFIED: 'standby',
  DRIVER_ASSIGNED: 'standby',
  DRIVER_EN_ROUTE: 'active',
  ARRIVED: 'active',
  IN_PROGRESS: 'active',
  PENDING_COMPLETION: 'warning',
  COMPLETED: 'active',
  NO_DRIVER_AVAILABLE: 'error',
  ADMIN_INTERVENTION: 'warning',
  APPROVED: 'active',
  REJECTED: 'error',
  CANCELLED: 'error',

  // Vehicle
  AVAILABLE: 'active',
  RESERVED: 'standby',
  IN_USE: 'active',
  MAINTENANCE: 'warning',
  INACTIVE: 'error',

  // Driver / Trip
  OFFLINE: 'error',
  ONLINE: 'active',
  BUSY: 'warning',
  ON_TRIP: 'active',
  ACTIVE: 'active',
  ABORTED: 'error',
};

const pulseStates = new Set(['SEARCHING_DRIVER', 'PENDING_COMPLETION']);

const humanize = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export function StatusBadge({ status, className = '' }: { status: StatusType; className?: string }) {
  const normalized = status ? status.toUpperCase() : 'UNKNOWN';
  const tone = statusTones[normalized] ?? 'neutral';

  const label =
    normalized === 'PENDING_COMPLETION'
      ? 'Menunggu Approval Nota'
      : normalized === 'PENDING'
        ? 'Menunggu Admin'
        : normalized === 'NO_DRIVER_AVAILABLE'
          ? 'Tanpa Driver'
          : normalized === 'ADMIN_INTERVENTION'
            ? 'Perlu Intervensi'
            : normalized === 'DRIVER_EN_ROUTE'
              ? 'Menuju Jemput'
              : normalized === 'DRIVER_ASSIGNED'
                ? 'Driver Ditugaskan'
                : normalized === 'DRIVER_NOTIFIED'
                  ? 'Driver Dihubungi'
                  : normalized === 'IN_PROGRESS'
                    ? 'Berjalan'
                    : normalized === 'IN_USE'
                      ? 'Sedang Dipakai'
                      : normalized === 'ON_TRIP'
                        ? 'On Trip'
                        : normalized === 'INACTIVE'
                          ? 'Non-aktif'
                          : humanize(normalized);

  return (
    <span
      className={`pill ${tone === 'neutral' ? '' : `pill-${tone}`} ${className}`}
      data-status={normalized}
    >
      <span
        className={`pill-dot ${pulseStates.has(normalized) ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <span title={label}>{label}</span>
    </span>
  );
}
