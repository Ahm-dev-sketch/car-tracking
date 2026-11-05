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
      <div className={`p-4 bg-zinc-100 border-[2.5px] border-black rounded-xl text-xs shadow-[3px_3px_0px_0px_#000] ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-black bg-zinc-500" />
            <span className="font-extrabold text-black">No Driver Available</span>
          </div>
          <StatusBadge status="NO_DRIVER_AVAILABLE" />
        </div>
        <p className="text-zinc-700 font-medium mt-1.5 leading-relaxed">
          Auto-dispatch could not find an available online driver at this location.
        </p>
      </div>
    );
  }

  if (normStatus === 'ADMIN_INTERVENTION') {
    return (
      <div className={`p-4 bg-orange-100 border-[2.5px] border-black rounded-xl text-xs shadow-[3px_3px_0px_0px_#000] ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-black bg-orange-500 animate-pulse" />
            <span className="font-extrabold text-black">Dispatch Escalated to Admin</span>
          </div>
          <StatusBadge status="ADMIN_INTERVENTION" />
        </div>
        <p className="text-orange-950 font-medium mt-1.5 leading-relaxed">
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
      <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <span className="relative flex h-3 w-3 shrink-0">
          {isSearching && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-3 w-3 border border-black ${
              isSearching
                ? 'bg-amber-400'
                : currentIdx >= 3
                ? 'bg-emerald-500'
                : 'bg-sky-400'
            }`}
          />
        </span>
        <span className="font-bold text-black">
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
          <span className="font-mono text-[11px] font-black text-black bg-amber-300 px-2 py-0.5 rounded-md border-1.5 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
            ETA: {etaText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white border-[2.5px] border-black rounded-xl space-y-3.5 shadow-[4px_4px_0px_0px_#000] ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {normStatus === 'SEARCHING_DRIVER' ? (
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 border border-black bg-amber-400" />
            </span>
          ) : (
            <span
              className={`w-3 h-3 rounded-full border border-black ${
                currentIdx >= 4
                  ? 'bg-emerald-500'
                  : currentIdx >= 2
                  ? 'bg-sky-400'
                  : 'bg-zinc-300'
              }`}
            />
          )}
          <span className="text-xs font-black uppercase tracking-wider text-black">
            Dispatch Status
          </span>
        </div>
        <div className="flex items-center gap-2">
          {etaText && (
            <span className="text-xs font-mono font-black text-black bg-amber-300 px-2 py-0.5 rounded-md border-1.5 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
              ETA: {etaText}
            </span>
          )}
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Visual step timeline */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t-2 border-black/15">
        {STEPS.map((step, idx) => {
          const stepTargetIdx = stepOrder.indexOf(step.key);
          const isDone = currentIdx > stepTargetIdx;
          const isCurrent = currentIdx === stepTargetIdx;

          return (
            <div
              key={step.key}
              className={`p-2 rounded-lg border-2 border-black transition-all ${
                isCurrent
                  ? isCurrent && step.key === 'SEARCHING_DRIVER'
                    ? 'bg-amber-300 text-black font-extrabold shadow-[2px_2px_0px_0px_#000]'
                    : 'bg-sky-300 text-black font-extrabold shadow-[2px_2px_0px_0px_#000]'
                  : isDone
                  ? 'bg-emerald-300 text-black font-bold shadow-[2px_2px_0px_0px_#000]'
                  : 'bg-zinc-100 text-zinc-500 font-medium'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={`w-4 h-4 rounded-md border border-black flex items-center justify-center text-[10px] shrink-0 font-black ${
                    isCurrent
                      ? step.key === 'SEARCHING_DRIVER'
                        ? 'bg-black text-white animate-pulse'
                        : 'bg-black text-white'
                      : isDone
                      ? 'bg-black text-white'
                      : 'bg-white text-black'
                  }`}
                >
                  {isDone ? (
                    <Icon name="check" className="size-2.5 text-white" />
                  ) : (
                    idx + 1
                  )}
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
