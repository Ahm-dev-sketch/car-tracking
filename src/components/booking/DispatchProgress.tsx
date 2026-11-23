'use client';

import React from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Icon } from '@/components/ui/Icon';

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
    return `~${mins} min (estimate)`;
  }
  return `${mins} min`;
}

const STEPS = [
  { key: 'SEARCHING_DRIVER', label: 'Searching for driver…' },
  { key: 'DRIVER_NOTIFIED', label: 'Driver notified' },
  { key: 'DRIVER_ASSIGNED', label: 'Driver assigned' },
  { key: 'DRIVER_EN_ROUTE', label: 'Driver en route' },
  { key: 'ARRIVED', label: 'Driver arrived' },
];

export function DispatchProgress({
  status,
  etaSeconds,
  etaEstimated,
  className = '',
  compact = false,
}: DispatchProgressProps) {
  const normStatus = status?.toUpperCase() || '';
  const etaText = formatEta(etaSeconds, etaEstimated);

  // If status is one of the failure or cancellation states
  if (normStatus === 'NO_DRIVER_AVAILABLE') {
    return (
      <div className={`rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="alert" className="size-4 shrink-0 text-slate-500" />
            <span className="font-semibold text-slate-900">No Driver Available</span>
          </div>
          <StatusBadge status="NO_DRIVER_AVAILABLE" />
        </div>
        <p className="mt-2 leading-relaxed text-slate-600">
          Auto-dispatch could not find an available online driver at this location.
        </p>
      </div>
    );
  }

  if (normStatus === 'ADMIN_INTERVENTION') {
    return (
      <div className={`rounded-xl border border-warning-200 bg-warning-50 p-4 text-xs ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex size-2 shrink-0 rounded-full" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-warning-600" />
              <span className="absolute inset-0 rounded-full bg-warning-600 status-ping" />
            </span>
            <span className="font-semibold text-warning-700">Dispatch Escalated to Admin</span>
          </div>
          <StatusBadge status="ADMIN_INTERVENTION" />
        </div>
        <p className="mt-2 leading-relaxed text-warning-700">
          Auto-dispatch retries exhausted. A fleet manager will assign a driver manually.
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

  const statusLabel =
    normStatus === 'SEARCHING_DRIVER'
      ? 'Searching for driver…'
      : normStatus === 'DRIVER_NOTIFIED'
      ? 'Driver notified'
      : normStatus === 'DRIVER_ASSIGNED'
      ? 'Driver assigned'
      : normStatus === 'DRIVER_EN_ROUTE'
      ? 'Driver en route'
      : normStatus === 'ARRIVED'
      ? 'Driver arrived'
      : normStatus.replace(/_/g, ' ');

  if (compact) {
    // Anything before DRIVER_ASSIGNED is still in flight; crimson marks the live step.
    const isPendingDispatch = currentIdx >= 1 && currentIdx <= 2;
    const isAssigned = currentIdx >= 3;

    return (
      <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <span className="relative inline-flex size-2 shrink-0 rounded-full" aria-hidden="true">
          <span
            className={`absolute inset-0 rounded-full ${
              isPendingDispatch ? 'bg-warning-600' : isAssigned ? 'bg-success-600' : 'bg-slate-300'
            }`}
          />
          {isPendingDispatch && (
            <span className="absolute inset-0 rounded-full bg-warning-600 status-ping" />
          )}
        </span>
        <span
          className={`font-medium ${
            isPendingDispatch ? 'text-warning-700' : isAssigned ? 'text-success-700' : 'text-slate-500'
          }`}
        >
          {statusLabel}
        </span>
        {etaText && (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-slate-600">
            ETA {etaText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative inline-flex size-2 shrink-0 rounded-full" aria-hidden="true">
            <span
              className={`absolute inset-0 rounded-full ${
                currentIdx >= 4 ? 'bg-success-600' : currentIdx >= 1 ? 'bg-brand-600' : 'bg-slate-300'
              }`}
            />
            {currentIdx >= 1 && currentIdx < 4 && (
              <span className="absolute inset-0 rounded-full bg-brand-600 status-ping" />
            )}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Dispatch progress
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {etaText && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-slate-600">
              ETA {etaText}
            </span>
          )}
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Timeline: completed = success green, active = KCIC crimson */}
      <ol className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {STEPS.map((step, idx) => {
          const stepTargetIdx = stepOrder.indexOf(step.key);
          const isDone = currentIdx > stepTargetIdx;
          const isCurrent = currentIdx === stepTargetIdx;

          return (
            <li
              key={step.key}
              aria-current={isCurrent ? 'step' : undefined}
              className={`relative flex min-w-0 items-start gap-2.5 px-3 py-3 ${
                isCurrent ? 'bg-brand-50/70' : ''
              }`}
            >
              {isCurrent && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-0.5 bg-brand-600 sm:inset-y-0 sm:left-0 sm:right-auto sm:h-auto sm:w-0.5"
                />
              )}
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold tabular-nums ${
                  isCurrent
                    ? 'bg-brand-600 text-white'
                    : isDone
                    ? 'bg-success-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-400'
                }`}
              >
                {isDone ? <Icon name="check" className="size-3" /> : idx + 1}
              </span>
              <span
                className={`min-w-0 text-[11px] leading-snug ${
                  isCurrent
                    ? 'font-semibold text-brand-700'
                    : isDone
                    ? 'font-medium text-success-700'
                    : 'font-medium text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {normStatus === 'PENDING_COMPLETION' && (
        <div className="flex items-start gap-2 border-t border-warning-200 bg-warning-50 px-4 py-3 text-xs font-medium leading-relaxed text-warning-700">
          <Icon name="clock" className="mt-px size-4 shrink-0 text-warning-600" />
          <span>
            Perjalanan telah selesai. Silakan lampirkan Nota Dinas untuk verifikasi &amp; persetujuan admin.
          </span>
        </div>
      )}
    </div>
  );
}
