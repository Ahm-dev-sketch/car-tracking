import React from 'react';

type MovementType = 'MOVING' | 'STOPPED' | 'GPS_LOST' | 'OFFLINE' | string;

const movementStyles: Record<string, { bg: string; text: string; border: string; label: string }> = {
  MOVING: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Moving',
  },
  STOPPED: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
    label: 'Stopped',
  },
  GPS_LOST: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    label: 'GPS Lost',
  },
  OFFLINE: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    label: 'Offline',
  },
};

export function MovementBadge({ movement, className = '' }: { movement?: MovementType | null; className?: string }) {
  const norm = movement ? movement.toUpperCase() : 'OFFLINE';
  const conf = movementStyles[norm] || movementStyles.OFFLINE;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${conf.bg} ${conf.text} ${conf.border} ${className}`}
    >
      {conf.label}
    </span>
  );
}
