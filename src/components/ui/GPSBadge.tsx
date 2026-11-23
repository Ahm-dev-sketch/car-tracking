import React from 'react';
import { Crosshair, Wifi } from 'lucide-react';

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
  let tone: 'active' | 'warning' | 'error' = 'error';
  let isEstimated = false;

  if (accuracyM !== undefined && accuracyM !== null) {
    if (accuracyM < 20) {
      label = 'Akurasi Tinggi';
      subtext = 'Satelit lock';
      tone = 'active';
    } else if (accuracyM <= 100) {
      label = 'Akurasi Sedang';
      tone = 'warning';
    } else {
      label = 'Akurasi Estimasi';
      subtext = 'Seluler/Wi-Fi';
      tone = 'warning';
      isEstimated = true;
    }
  } else {
    tone = 'warning';
  }

  if (signal === 'green') tone = 'active';
  else if (signal === 'amber') tone = 'warning';
  else if (signal === 'red') tone = 'error';

  const roundedM = accuracyM !== undefined && accuracyM !== null ? Math.round(accuracyM) : null;
  const Icon = isEstimated ? Wifi : Crosshair;

  return (
    <span
      className={`pill pill-${tone} ${className}`}
      title={
        roundedM !== null
          ? isEstimated
            ? `Akurasi estimasi: ±${roundedM} m (triangulasi seluler/Wi-Fi)`
            : subtext
              ? `${label}: ±${roundedM} m (${subtext})`
              : `Akurasi: ±${roundedM} m`
          : undefined
      }
    >
      <Icon className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      {showDetails && (
        <span className="tabular-nums">
          {label}
          {roundedM !== null ? ` · ±${roundedM} m` : ''}
        </span>
      )}
    </span>
  );
}
