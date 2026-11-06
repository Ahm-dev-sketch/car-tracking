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

const statusStyles: Record<string, string> = {
  // Booking
  PENDING: 'bg-amber-300 text-black',
  SEARCHING_DRIVER: 'bg-amber-400 text-black animate-pulse',
  DRIVER_NOTIFIED: 'bg-sky-300 text-black',
  DRIVER_ASSIGNED: 'bg-violet-300 text-black',
  DRIVER_EN_ROUTE: 'bg-indigo-300 text-black',
  ARRIVED: 'bg-teal-300 text-black',
  IN_PROGRESS: 'bg-emerald-300 text-black',
  PENDING_COMPLETION: 'bg-amber-300 text-black animate-pulse',
  COMPLETED: 'bg-emerald-400 text-black',
  NO_DRIVER_AVAILABLE: 'bg-zinc-200 text-black',
  ADMIN_INTERVENTION: 'bg-orange-300 text-black',
  APPROVED: 'bg-sky-300 text-black',
  REJECTED: 'bg-rose-300 text-black',
  CANCELLED: 'bg-rose-300 text-black',

  // Vehicle
  AVAILABLE: 'bg-emerald-300 text-black',
  RESERVED: 'bg-amber-300 text-black',
  IN_USE: 'bg-sky-300 text-black',
  MAINTENANCE: 'bg-zinc-200 text-black',
  INACTIVE: 'bg-rose-300 text-black',

  // Driver / Trip
  OFFLINE: 'bg-zinc-200 text-black',
  ONLINE: 'bg-emerald-300 text-black',
  BUSY: 'bg-sky-300 text-black',
  ON_TRIP: 'bg-sky-300 text-black',
  ACTIVE: 'bg-emerald-300 text-black',
  ABORTED: 'bg-rose-300 text-black',
};

export function StatusBadge({ status, className = '' }: { status: StatusType; className?: string }) {
  const normalized = status ? status.toUpperCase() : 'UNKNOWN';
  const style = statusStyles[normalized] || 'bg-zinc-200 text-black';
  const label =
    normalized === 'PENDING_COMPLETION'
      ? 'Menunggu Approval Nota'
      : normalized.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex max-w-full items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase border-2 border-black shadow-[2px_2px_0px_0px_#000] ${style} ${className}`}
    >
      {label}
    </span>
  );
}
