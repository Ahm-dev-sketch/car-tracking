import React from 'react';
import { Icon } from './Icon';

type StatusType =
  // Booking
  | 'PENDING'
  | 'SEARCHING_DRIVER'
  | 'DRIVER_NOTIFIED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
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

const success = 'bg-success-50 text-success-700 border-success-200';
const info = 'bg-info-50 text-info-700 border-info-200';
const warning = 'bg-warning-50 text-warning-700 border-warning-200';
const danger = 'bg-danger-50 text-danger-700 border-danger-200';

const statusStyles: Record<string, string> = {
  // Booking — positive / live
  ARRIVED: success,
  IN_PROGRESS: success,
  COMPLETED: success,
  APPROVED: success,
  // Booking — standby / neutral
  DRIVER_NOTIFIED: info,
  DRIVER_ASSIGNED: info,
  DRIVER_EN_ROUTE: success,
  NO_DRIVER_AVAILABLE: info,
  CANCELLED: info,
  // Booking — pending / needs attention
  PENDING: warning,
  SEARCHING_DRIVER: warning,
  PENDING_COMPLETION: warning,
  ADMIN_INTERVENTION: warning,
  // Booking — rejected
  REJECTED: danger,

  // Vehicle
  AVAILABLE: info,
  RESERVED: info,
  IN_USE: info,
  MAINTENANCE: warning,
  INACTIVE: info,

  // Driver / Trip
  OFFLINE: info,
  ONLINE: success,
  BUSY: info,
  ON_TRIP: success,
  ACTIVE: success,
  ABORTED: danger,
};

/** States that represent a live, moving signal and earn the telemetry dot. */
const liveStates = new Set([
  'ACTIVE',
  'ON_TRIP',
  'IN_PROGRESS',
  'DRIVER_EN_ROUTE',
  'ONLINE',
]);

const dangerStates = new Set(['REJECTED', 'ABORTED']);

const dotStyles: Record<string, string> = {
  [success]: 'bg-success-600',
  [info]: 'bg-slate-400',
  [warning]: 'bg-warning-600',
  [danger]: 'bg-danger-600',
};

export function StatusBadge({ status, className = '' }: { status: StatusType; className?: string }) {
  const normalized = status ? status.toUpperCase() : 'UNKNOWN';
  const style = statusStyles[normalized] || info;
  const isLive = liveStates.has(normalized);
  const isDanger = dangerStates.has(normalized);
  const label =
    normalized === 'PENDING_COMPLETION'
      ? 'Menunggu Approval Nota'
      : normalized === 'PENDING'
      ? 'Menunggu Admin'
      : normalized.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${style} ${className}`}
    >
      {isDanger ? (
        <Icon name="alert" className="size-3 shrink-0" />
      ) : (
        <span
          aria-hidden="true"
          className={`relative inline-flex size-1.5 shrink-0 rounded-full ${dotStyles[style] ?? 'bg-slate-400'} ${isLive ? 'status-ping' : ''}`}
        />
      )}
      {label}
    </span>
  );
}
