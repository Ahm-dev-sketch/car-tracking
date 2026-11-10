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
  let label = 'LOW';
  let subtext = '';
  let dotColor = 'bg-rose-500';
  let isEstimated = false;

  if (accuracyM !== undefined && accuracyM !== null) {
    if (accuracyM < 20) {
      label = 'Akurasi Tinggi';
      subtext = 'Satelit Lock';
      dotColor = 'bg-emerald-500';
    } else if (accuracyM <= 100) {
      label = 'Sedang';
      dotColor = 'bg-amber-400';
    } else {
      label = 'Akurasi Estimasi';
      subtext = 'Seluler/Wi-Fi';
      dotColor = 'bg-amber-500';
      isEstimated = true;
    }
  }

  if (signal) {
    if (signal === 'green') dotColor = 'bg-emerald-500';
    else if (signal === 'amber') dotColor = 'bg-amber-400';
    else dotColor = 'bg-rose-500';
  }

  const roundedM = accuracyM !== undefined && accuracyM !== null ? Math.round(accuracyM) : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
        isEstimated ? 'bg-amber-50 text-amber-950 border-amber-900' : 'bg-white text-black'
      } ${className}`}
      title={
        roundedM !== null
          ? isEstimated
            ? `Akurasi Estimasi: ±${roundedM} m (Berdasarkan Triangulasi Seluler/Wi-Fi)`
            : subtext
            ? `Akurasi Tinggi: ±${roundedM} m (${subtext})`
            : `Akurasi: ±${roundedM} m`
          : undefined
      }
    >
      <span className={`w-2.5 h-2.5 shrink-0 rounded-full border border-black ${dotColor}`} aria-hidden="true" />
      {showDetails && (
        <span className="truncate">
          {label} {roundedM !== null ? `(±${roundedM}m)` : ''}
          {subtext ? ` · ${subtext}` : ''}
        </span>
      )}
    </div>
  );
}
