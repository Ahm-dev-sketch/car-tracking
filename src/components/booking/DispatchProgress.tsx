'use client';

import React from 'react';
import { Check, Clock, Timer } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';

export interface DispatchProgressProps {
  status: string;
  etaSeconds?: number | null;
  etaEstimated?: boolean;
  className?: string;
  compact?: boolean;
}

export function formatEta(
  etaSeconds: number | null | undefined,
  etaEstimated?: boolean
): string | null {
  if (etaSeconds === null || etaSeconds === undefined || etaSeconds < 0) return null;
  const mins = Math.max(1, Math.round(etaSeconds / 60));
  if (etaEstimated) {
    return `~${mins} mnt (estimasi)`;
  }
  return `${mins} mnt`;
}

const STEPS = [
  { key: 'SEARCHING_DRIVER', label: 'Mencari driver' },
  { key: 'DRIVER_NOTIFIED', label: 'Driver dinotifikasi' },
  { key: 'DRIVER_ASSIGNED', label: 'Driver ditugaskan' },
  { key: 'DRIVER_EN_ROUTE', label: 'Menuju penjemputan' },
  { key: 'ARRIVED', label: 'Tiba di lokasi' },
];

function EtaPill({ text }: { text: string }) {
  return (
    <span className="pill pill-standby">
      <Timer className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
      <span className="tabular-nums">ETA {text}</span>
    </span>
  );
}

export function DispatchProgress({
  status,
  etaSeconds,
  etaEstimated,
  className = '',
  compact = false,
}: DispatchProgressProps) {
  const normStatus = status?.toUpperCase() || '';
  const etaText = formatEta(etaSeconds, etaEstimated);

  if (normStatus === 'NO_DRIVER_AVAILABLE') {
    return (
      <div
        className={`rounded-[var(--radius-lg)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3.5 text-xs ${className}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="pill-dot text-[var(--status-error-fg)]" aria-hidden="true" />
            <span className="font-semibold text-[var(--status-error-fg)]">Driver tidak ditemukan</span>
          </div>
          <StatusBadge status="NO_DRIVER_AVAILABLE" />
        </div>
        <p className="mt-1.5 leading-relaxed text-[var(--status-error-fg)]/85">
          Sistem auto-dispatch tidak menemukan driver online yang tersedia di hub lokasi ini.
        </p>
      </div>
    );
  }

  if (normStatus === 'ADMIN_INTERVENTION') {
    return (
      <div
        className={`rounded-[var(--radius-lg)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3.5 text-xs ${className}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="pill-dot animate-pulse text-[var(--status-warning-fg)]" aria-hidden="true" />
            <span className="font-semibold text-[var(--status-warning-fg)]">Eskalasi penugasan admin</span>
          </div>
          <StatusBadge status="ADMIN_INTERVENTION" />
        </div>
        <p className="mt-1.5 leading-relaxed text-[var(--status-warning-fg)]/85">
          Percobaan auto-dispatch selesai. Admin operasional akan menugaskan driver dan mobil secara
          manual.
        </p>
      </div>
    );
  }

  const stepOrder = [
    'PENDING',
    'SEARCHING_DRIVER',
    'DRIVER_NOTIFIED',
    'DRIVER_ASSIGNED',
    'DRIVER_EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'COMPLETED',
  ];

  const currentIdx = stepOrder.indexOf(normStatus);

  if (compact) {
    const isSearching = normStatus === 'SEARCHING_DRIVER';
    return (
      <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <span className="relative flex size-2.5 shrink-0">
          {isSearching && (
            <span className="live-ping absolute inset-0 rounded-full bg-[var(--status-standby-fg)]" aria-hidden="true" />
          )}
          <span
            className={`relative size-2.5 rounded-full ${
              isSearching
                ? 'bg-[var(--status-standby-fg)]'
                : currentIdx >= 3
                  ? 'bg-[var(--status-active-fg)]'
                  : 'bg-slate-400'
            }`}
            aria-hidden="true"
          />
        </span>
        <span className="font-medium text-slate-700">
          {normStatus === 'SEARCHING_DRIVER'
            ? 'Mencari driver…'
            : normStatus === 'DRIVER_NOTIFIED'
              ? 'Driver dinotifikasi'
              : normStatus === 'DRIVER_ASSIGNED'
                ? 'Driver ditugaskan'
                : normStatus === 'DRIVER_EN_ROUTE'
                  ? 'Menuju lokasi jemput'
                  : normStatus === 'ARRIVED'
                    ? 'Driver tiba di lokasi'
                    : normStatus.replace(/_/g, ' ')}
        </span>
        {etaText && <EtaPill text={etaText} />}
      </div>
    );
  }

  return (
    <div className={`card space-y-3.5 p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {normStatus === 'SEARCHING_DRIVER' ? (
            <span className="relative flex size-2.5">
              <span className="live-ping absolute inset-0 rounded-full bg-[var(--status-standby-fg)]" aria-hidden="true" />
              <span className="relative size-2.5 rounded-full bg-[var(--status-standby-fg)]" aria-hidden="true" />
            </span>
          ) : (
            <span
              className={`size-2.5 rounded-full ${
                currentIdx >= 4
                  ? 'bg-[var(--status-active-fg)]'
                  : currentIdx >= 2
                    ? 'bg-[var(--status-standby-fg)]'
                    : 'bg-slate-300'
              }`}
              aria-hidden="true"
            />
          )}
          <span className="eyebrow">Status dispatch</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {etaText && <EtaPill text={etaText} />}
          <StatusBadge status={status} />
        </div>
      </div>

      <ol className="grid grid-cols-1 gap-1.5 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-5">
        {STEPS.map((step, idx) => {
          const stepTargetIdx = stepOrder.indexOf(step.key);
          const isDone = currentIdx > stepTargetIdx;
          const isCurrent = currentIdx === stepTargetIdx;

          return (
            <li
              key={step.key}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-1.5 text-[0.6875rem] transition-colors ${
                isCurrent
                  ? 'border-[var(--slate-navy)] bg-[var(--slate-navy)] font-medium text-white'
                  : isDone
                    ? 'border-[var(--status-active-border)] bg-[var(--status-active-bg)] text-[var(--status-active-fg)]'
                    : 'border-[var(--border-subtle)] bg-[var(--canvas)] text-slate-400'
              }`}
            >
              <span
                className={`grid size-4 shrink-0 place-items-center rounded-full text-[0.625rem] font-semibold tabular-nums ${
                  isCurrent
                    ? 'bg-white text-[var(--slate-navy)]'
                    : isDone
                      ? 'bg-[var(--status-active-fg)] text-white'
                      : 'bg-[var(--border-strong)]/40 text-slate-500'
                }`}
                aria-hidden="true"
              >
                {isDone ? <Check className="size-2.5" strokeWidth={3} /> : idx + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </li>
          );
        })}
      </ol>

      {normStatus === 'PENDING_COMPLETION' && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-xs text-[var(--status-warning-fg)]">
          <Clock className="mt-px size-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span className="leading-relaxed">
            Perjalanan telah selesai. Silakan lampirkan Nota Dinas untuk verifikasi admin.
          </span>
        </div>
      )}
    </div>
  );
}
