import React from 'react';

type StatusType =
  // Booking
  | 'PENDING'
  | 'APPROVED'
  | 'DRIVER_ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
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
  | 'ON_TRIP'
  // Trip
  | 'ACTIVE'
  | 'ABORTED'
  | string;

const statusStyles: Record<string, string> = {
  // Booking
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-blue-50 text-blue-800 border-blue-200',
  DRIVER_ASSIGNED: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  IN_PROGRESS: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  COMPLETED: 'border border-emerald-600 text-emerald-700 bg-white font-semibold',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200',
  CANCELLED: 'bg-rose-50 text-rose-800 border-rose-200',

  // Vehicle
  AVAILABLE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  RESERVED: 'bg-amber-50 text-amber-800 border-amber-200',
  IN_USE: 'bg-blue-50 text-blue-800 border-blue-200',
  MAINTENANCE: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  INACTIVE: 'bg-rose-50 text-rose-800 border-rose-200',

  // Driver / Trip
  OFFLINE: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  ON_TRIP: 'bg-blue-50 text-blue-800 border-blue-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  ABORTED: 'bg-rose-50 text-rose-800 border-rose-200',
};

export function StatusBadge({ status, className = '' }: { status: StatusType; className?: string }) {
  const normalized = status ? status.toUpperCase() : 'UNKNOWN';
  const style = statusStyles[normalized] || 'bg-zinc-100 text-zinc-700 border-zinc-200';
  const label = normalized.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style} ${className}`}
    >
      {label}
    </span>
  );
}
