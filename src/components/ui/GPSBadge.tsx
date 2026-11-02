import React from 'react';

interface GPSBadgeProps {
  accuracyM?: number | null;
  signal?: 'green' | 'amber' | 'red';
  showDetails?: boolean;
  className?: string;
}

export function GPSBadge({
  accuracyM,
  signal,
  showDetails = true,
  className = '',
}: GPSBadgeProps) {
  let quality: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let dotColor = 'bg-rose-500';

  if (accuracyM !== undefined && accuracyM !== null) {
    if (accuracyM <= 30) {
      quality = 'HIGH';
      dotColor = 'bg-emerald-500';
    } else if (accuracyM <= 100) {
      quality = 'MEDIUM';
      dotColor = 'bg-amber-500';
    } else {
      quality = 'LOW';
      dotColor = 'bg-rose-500';
    }
  }

  if (signal) {
    if (signal === 'green') dotColor = 'bg-emerald-500';
    else if (signal === 'amber') dotColor = 'bg-amber-500';
    else dotColor = 'bg-rose-500';
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono ${className}`}>
      <span className={`w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
      {showDetails && (
        <span>
          {quality} {accuracyM !== undefined && accuracyM !== null ? `(±${Math.round(accuracyM)}m)` : ''}
        </span>
      )}
    </div>
  );
}
