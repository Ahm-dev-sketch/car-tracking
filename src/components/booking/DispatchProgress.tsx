'use client';

import React from 'react';
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
    return `~${mins} min (estimate)`;
  }
  return `${mins} min`;
}

const STEPS = [
  { key: 'SEARCHING_DRIVER', label: 'Searching for driver…' },
  { key: 'DRIVER_NOTIFIED', label: 'Driver notified' },
  { key: 'DRIVER_ASSIGNED', label: 'Driver assigned — vehicle reserved' },
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
      <div className={`p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-400" />
            <span className="font-semibold text-zinc-800">No Driver Available</span>
          </div>
          <StatusBadge status="NO_DRIVER_AVAILABLE" />
        </div>
        <p className="text-zinc-600 mt-1">
          Auto-dispatch could not find an available online driver at this location.
        </p>
      </div>
    );
  }

  if (normStatus === 'ADMIN_INTERVENTION') {
    return (
      <div className={`p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="font-semibold text-orange-900">Dispatch Escalated to Admin</span>
          </div>
          <StatusBadge status="ADMIN_INTERVENTION" />
        </div>
        <p className="text-orange-800 mt-1">
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

  if (compact) {
    const isSearching = normStatus === 'SEARCHING_DRIVER';
    return (
      <div className={`flex items-center gap-2 text-xs ${className}`}>
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {isSearching && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isSearching
                ? 'bg-amber-500'
                : currentIdx >= 3
                ? 'bg-emerald-500'
                : 'bg-indigo-500'
            }`}
          />
        </span>
        <span className="font-medium text-zinc-900">
          {normStatus === 'SEARCHING_DRIVER'
            ? 'Searching for driver…'
            : normStatus === 'DRIVER_NOTIFIED'
            ? 'Driver notified'
            : normStatus === 'DRIVER_ASSIGNED'
            ? 'Driver assigned'
            : normStatus === 'DRIVER_EN_ROUTE'
            ? 'Driver en route'
            : normStatus === 'ARRIVED'
            ? 'Driver arrived'
            : normStatus.replace(/_/g, ' ')}
        </span>
        {etaText && (
          <span className="font-mono text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
            ETA: {etaText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white border border-zinc-200 rounded-lg space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {normStatus === 'SEARCHING_DRIVER' ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
          ) : (
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                currentIdx >= 4
                  ? 'bg-emerald-600'
                  : currentIdx >= 2
                  ? 'bg-indigo-600'
                  : 'bg-zinc-400'
              }`}
            />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
            Dispatch Status
          </span>
        </div>
        <div className="flex items-center gap-2">
          {etaText && (
            <span className="text-xs font-mono font-medium text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              ETA: {etaText}
            </span>
          )}
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Visual step timeline */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-zinc-100">
        {STEPS.map((step, idx) => {
          const stepTargetIdx = stepOrder.indexOf(step.key);
          const isDone = currentIdx > stepTargetIdx;
          const isCurrent = currentIdx === stepTargetIdx;

          return (
            <div
              key={step.key}
              className={`p-2 rounded border transition-colors ${
                isCurrent
                  ? isCurrent && step.key === 'SEARCHING_DRIVER'
                    ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                    : 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                  : isDone
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-700'
                  : 'bg-zinc-50/50 border-zinc-100 text-zinc-400'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                    isCurrent
                      ? step.key === 'SEARCHING_DRIVER'
                        ? 'bg-amber-500 text-white animate-pulse'
                        : 'bg-indigo-600 text-white'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-200 text-zinc-500'
                  }`}
                >
                  {isDone ? '✓' : idx + 1}
                </span>
                <span className="truncate">{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
