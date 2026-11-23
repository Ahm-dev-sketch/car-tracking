import React from 'react';
import { Icon } from './Icon';

type MovementType = 'MOVING' | 'STOPPED' | 'GPS_LOST' | 'OFFLINE' | string;

type Tone = 'success' | 'slate' | 'warning' | 'danger';

const movementStyles: Record<string, { tone: Tone; dot: string; label: string }> = {
  MOVING: {
    tone: 'success',
    dot: 'bg-success-600',
    label: 'Moving',
  },
  STOPPED: {
    tone: 'slate',
    dot: 'bg-slate-400',
    label: 'Stopped',
  },
  GPS_LOST: {
    tone: 'warning',
    dot: 'bg-warning-600',
    label: 'GPS Lost',
  },
  OFFLINE: {
    tone: 'danger',
    dot: 'bg-danger-600',
    label: 'Offline',
  },
};

const toneStyles: Record<Tone, string> = {
  success: 'bg-success-50 text-success-700 border-success-200',
  slate: 'bg-info-50 text-info-700 border-info-200',
  warning: 'bg-warning-50 text-warning-700 border-warning-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
};

/** Only MOVING is a live signal — that is the single state that pulses. */
const liveStates = new Set(['MOVING']);

export function MovementBadge({ movement, className = '' }: { movement?: MovementType | null; className?: string }) {
  const norm = movement ? movement.toUpperCase() : 'OFFLINE';
  const conf = movementStyles[norm] || movementStyles.OFFLINE;
  const isLive = liveStates.has(norm);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${toneStyles[conf.tone]} ${className}`}
    >
      {conf.tone === 'danger' ? (
        <Icon name="alert" className="size-3 shrink-0" />
      ) : (
        <span
          aria-hidden="true"
          className={`relative inline-flex size-1.5 shrink-0 rounded-full ${conf.dot} ${isLive ? 'status-ping' : ''}`}
        />
      )}
      {conf.label}
    </span>
  );
}
