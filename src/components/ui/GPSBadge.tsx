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
      dotColor = 'bg-amber-400';
    } else {
      quality = 'LOW';
      dotColor = 'bg-rose-500';
    }
  }

  if (signal) {
    if (signal === 'green') dotColor = 'bg-emerald-500';
    else if (signal === 'amber') dotColor = 'bg-amber-400';
    else dotColor = 'bg-rose-500';
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-white text-black border-2 border-black font-mono font-bold shadow-[2px_2px_0px_0px_#000] ${className}`}>
      <span className={`w-2.5 h-2.5 rounded-full border border-black ${dotColor}`} aria-hidden="true" />
      {showDetails && (
        <span>
          {quality} {accuracyM !== undefined && accuracyM !== null ? `(±${Math.round(accuracyM)}m)` : ''}
        </span>
      )}
    </div>
  );
}
