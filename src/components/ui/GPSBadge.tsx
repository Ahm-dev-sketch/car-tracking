import React from 'react';
import { Icon } from './Icon';

interface GPSBadgeProps {
  accuracyM?: number | null;
  signal?: 'green' | 'amber' | 'red';
  showDetails?: boolean;
  className?: string;
}

type Tone = 'success' | 'warning' | 'danger';

const toneStyles: Record<Tone, string> = {
  success: 'bg-success-50 text-success-700 border-success-200',
  warning: 'bg-warning-50 text-warning-700 border-warning-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
};

const dotStyles: Record<Tone, string> = {
  success: 'bg-success-600',
  warning: 'bg-warning-600',
  danger: 'bg-danger-600',
};

export function GPSBadge({
  accuracyM,
  signal,
  showDetails = true,
  className = '',
}: GPSBadgeProps) {
  let label = 'LOW';
  let subtext = '';
  let tone: Tone = 'danger';
  let isEstimated = false;

  if (accuracyM !== undefined && accuracyM !== null) {
    if (accuracyM < 20) {
      label = 'Akurasi Tinggi';
      subtext = 'Satelit Lock';
      tone = 'success';
    } else if (accuracyM <= 100) {
      label = 'Sedang';
      tone = 'warning';
    } else {
      label = 'Akurasi Estimasi';
      subtext = 'Seluler/Wi-Fi';
      tone = 'warning';
      isEstimated = true;
    }
  }

  if (signal) {
    if (signal === 'green') tone = 'success';
    else if (signal === 'amber') tone = 'warning';
    else tone = 'danger';
  }

  const roundedM = accuracyM !== undefined && accuracyM !== null ? Math.round(accuracyM) : null;

  return (
    <div
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${toneStyles[tone]} ${className}`}
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
      {tone === 'danger' ? (
        <Icon name="alert" className="size-3 shrink-0" />
      ) : tone === 'success' ? (
        <span aria-hidden="true" className={`relative inline-flex size-1.5 shrink-0 rounded-full ${dotStyles[tone]} status-ping`} />
      ) : (
        <span aria-hidden="true" className={`inline-flex size-1.5 shrink-0 rounded-full ${dotStyles[tone]}`} />
      )}
      {showDetails && (
        <span className="truncate">
          <span className="font-medium">{label}</span>
          {roundedM !== null && (
            <span className="ml-1 font-mono tabular-nums font-semibold">{`±${roundedM}m`}</span>
          )}
          {subtext && <span className="opacity-80">{` · ${subtext}`}</span>}
        </span>
      )}
    </div>
  );
}
