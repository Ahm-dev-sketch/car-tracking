import React from 'react';

type MovementType = 'MOVING' | 'STOPPED' | 'GPS_LOST' | 'OFFLINE' | string;

const movementStyles: Record<string, { bg: string; label: string }> = {
  MOVING: {
    bg: 'bg-emerald-300 text-black',
    label: 'Moving',
  },
  STOPPED: {
    bg: 'bg-zinc-200 text-black',
    label: 'Stopped',
  },
  GPS_LOST: {
    bg: 'bg-amber-300 text-black',
    label: 'GPS Lost',
  },
  OFFLINE: {
    bg: 'bg-rose-300 text-black',
    label: 'Offline',
  },
};

export function MovementBadge({ movement, className = '' }: { movement?: MovementType | null; className?: string }) {
  const norm = movement ? movement.toUpperCase() : 'OFFLINE';
  const conf = movementStyles[norm] || movementStyles.OFFLINE;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border-2 border-black shadow-[2px_2px_0px_0px_#000] ${conf.bg} ${className}`}
    >
      {conf.label}
    </span>
  );
}
