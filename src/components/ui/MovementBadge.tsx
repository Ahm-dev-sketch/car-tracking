import React from 'react';
import { Clock, Navigation, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';

type MovementType = 'MOVING' | 'STOPPED' | 'GPS_LOST' | 'OFFLINE' | string;

type Tone = 'active' | 'standby' | 'warning' | 'error' | 'neutral';

const movementStyles: Record<string, { tone: Tone; label: string; Icon: LucideIcon }> = {
  MOVING: { tone: 'active', label: 'Bergerak', Icon: Navigation },
  STOPPED: { tone: 'neutral', label: 'Berhenti', Icon: Clock },
  GPS_LOST: { tone: 'warning', label: 'GPS Hilang', Icon: TriangleAlert },
  OFFLINE: { tone: 'error', label: 'Offline', Icon: WifiOff },
};

export function MovementBadge({
  movement,
  className = '',
}: {
  movement?: MovementType | null;
  className?: string;
}) {
  const norm = movement ? movement.toUpperCase() : 'OFFLINE';
  const conf = movementStyles[norm] || movementStyles.OFFLINE;
  const { Icon } = conf;

  return (
    <span className={`pill ${conf.tone === 'neutral' ? '' : `pill-${conf.tone}`} ${className}`}>
      <Icon className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>{conf.label}</span>
    </span>
  );
}
