'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export interface LocationStatItem {
  locationId: string;
  name: string;
  code: string;
  vehicles: number;
  drivers: number;
  bookings: number;
  maxCapacity?: number;
  inUseVehicles?: number;
  availableVehicles?: number;
  maintenanceVehicles?: number;
  remainingCapacity?: number;
  activeRequests?: number;
  pendingRequests?: number;
  utilizationRate?: number;
}

interface LocationCapacityChartProps {
  locations: LocationStatItem[];
  selectedLocationId: string;
  onSelectLocation: (locationId: string) => void;
}

/* Series palette — same semantics as before, aligned to the KCIC token layer. */
const SERIES = {
  maxCapacity: '#C8102E', // brand crimson
  available: '#16a34a', // success
  inUse: '#d97706', // warning
  requests: '#0284c7', // info / sky
} as const;

const GRID = '#E2E8F0';
const AXIS_TEXT = '#94a3b8';

export function LocationCapacityChart({
  locations,
  selectedLocationId,
  onSelectLocation,
}: LocationCapacityChartProps) {
  const [hoveredLocationId, setHoveredLocationId] = useState<string | null>(null);

  if (!locations || locations.length === 0) {
    return null;
  }

  // Calculate highest metric for SVG bar scaling
  const maxVal = Math.max(
    1,
    ...locations.map((loc) =>
      Math.max(
        loc.maxCapacity ?? loc.vehicles ?? 0,
        loc.availableVehicles ?? 0,
        loc.inUseVehicles ?? 0,
        loc.bookings ?? 0
      )
    )
  );

  const selectedLoc = locations.find((l) => l.locationId === selectedLocationId);

  // SVG dimensions
  const chartHeight = 220;
  const paddingBottom = 48;
  const paddingTop = 24;
  const usableHeight = chartHeight - paddingBottom - paddingTop;

  const legend = [
    { label: 'Maks Kapasitas', color: SERIES.maxCapacity },
    { label: 'Available', color: SERIES.available },
    { label: 'Sedang Digunakan', color: SERIES.inUse },
    { label: 'Permintaan Masuk', color: SERIES.requests },
  ];

  return (
    <section aria-labelledby="capacity-chart-heading" className="min-w-0 space-y-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
              <Icon name="route" className="size-3.5" />
            </span>
            <p className="eyebrow">Monitoring Kapasitas & Beban Hub</p>
          </div>
          <h2 id="capacity-chart-heading" className="section-title mt-2">
            Kapasitas & Penggunaan Armada per Lokasi
          </h2>
          <p className="mt-1 text-xs font-normal leading-relaxed text-slate-500 sm:text-sm">
            Pantau batas maksimal penerimaan permintaan, armada yang sedang bertugas, dan unit yang tersedia di setiap stasiun KCIC.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="font-medium text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Location Filter Pills */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Filter Lokasi Operasional:
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectLocation('')}
            aria-pressed={!selectedLocationId}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              !selectedLocationId
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            Semua Hub <span className="font-mono tabular-nums opacity-70">({locations.length})</span>
          </button>
          {locations.map((loc) => {
            const isSelected = selectedLocationId === loc.locationId;
            const avail = loc.availableVehicles ?? (loc.vehicles - (loc.inUseVehicles ?? 0));
            return (
              <button
                key={loc.locationId}
                type="button"
                onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                aria-pressed={isSelected}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  isSelected
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>{loc.name}</span>
                <span
                  className={`rounded font-mono text-[10px] tabular-nums ${
                    isSelected ? 'text-brand-600' : 'text-slate-500'
                  }`}
                >
                  {loc.code}
                </span>
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${
                    avail > 0
                      ? 'bg-success-50 text-success-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                  title={`${avail} unit siap operasi`}
                >
                  {avail} ready
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Multi-Bar Comparison Chart */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">
        <div className="min-w-[620px]">
          <svg
            viewBox={`0 0 ${locations.length * 110 + 60} ${chartHeight}`}
            className="h-56 w-full select-none"
            role="img"
            aria-label="Perbandingan kapasitas dan penggunaan armada per lokasi operasional"
          >
            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = paddingTop + usableHeight * (1 - ratio);
              const val = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1="45"
                    y1={y}
                    x2={locations.length * 110 + 50}
                    y2={y}
                    stroke={GRID}
                    strokeWidth="1"
                  />
                  <text
                    x="35"
                    y={y + 4}
                    textAnchor="end"
                    className="font-mono text-[10px] font-medium tabular-nums"
                    fill={AXIS_TEXT}
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Baseline */}
            <line
              x1="45"
              y1={chartHeight - paddingBottom}
              x2={locations.length * 110 + 50}
              y2={chartHeight - paddingBottom}
              stroke={GRID}
              strokeWidth="1"
            />

            {/* Per-location grouped bars */}
            {locations.map((loc, idx) => {
              const groupX = 65 + idx * 110;
              const isSelected = selectedLocationId === loc.locationId;
              const isHovered = hoveredLocationId === loc.locationId;

              const maxCap = loc.maxCapacity ?? loc.vehicles ?? 0;
              const avail = loc.availableVehicles ?? Math.max(0, maxCap - (loc.inUseVehicles ?? 0));
              const inUse = loc.inUseVehicles ?? 0;
              const reqs = loc.bookings ?? 0;

              // Bar heights
              const hMax = (maxCap / maxVal) * usableHeight;
              const hAvail = (avail / maxVal) * usableHeight;
              const hInUse = (inUse / maxVal) * usableHeight;
              const hReqs = (reqs / maxVal) * usableHeight;

              const barW = 14;
              const baseY = chartHeight - paddingBottom;

              const bars = [
                { value: maxCap, height: hMax, offset: 0, fill: SERIES.maxCapacity, textFill: '#9f1239' },
                { value: avail, height: hAvail, offset: barW + 2, fill: SERIES.available, textFill: '#15803d' },
                { value: inUse, height: hInUse, offset: (barW + 2) * 2, fill: SERIES.inUse, textFill: '#b45309' },
                { value: reqs, height: hReqs, offset: (barW + 2) * 3, fill: SERIES.requests, textFill: '#075985' },
              ];

              return (
                <g
                  key={loc.locationId}
                  className="cursor-pointer transition-opacity"
                  opacity={selectedLocationId && !isSelected ? 0.5 : 1}
                  onMouseEnter={() => setHoveredLocationId(loc.locationId)}
                  onMouseLeave={() => setHoveredLocationId(null)}
                  onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                >
                  {/* Soft highlight behind column */}
                  {(isSelected || isHovered) && (
                    <rect
                      x={groupX - 8}
                      y={paddingTop - 10}
                      width={barW * 4 + 22}
                      height={usableHeight + 20}
                      rx="8"
                      fill={isSelected ? '#FEF2F3' : '#F1F5F9'}
                      stroke={isSelected ? '#FBC9CE' : GRID}
                      strokeWidth="1"
                    />
                  )}

                  {bars.map((bar) => (
                    <React.Fragment key={bar.offset}>
                      <rect
                        x={groupX + bar.offset}
                        y={baseY - bar.height}
                        width={barW}
                        height={Math.max(2, bar.height)}
                        fill={bar.fill}
                        rx="3"
                      />
                      <text
                        x={groupX + bar.offset + barW / 2}
                        y={baseY - bar.height - 5}
                        textAnchor="middle"
                        className="font-mono text-[9px] font-semibold tabular-nums"
                        fill={bar.textFill}
                      >
                        {bar.value}
                      </text>
                    </React.Fragment>
                  ))}

                  {/* X-axis Hub Label */}
                  <text
                    x={groupX + (barW * 4 + 6) / 2}
                    y={chartHeight - paddingBottom + 18}
                    textAnchor="middle"
                    className="text-[11px] font-semibold"
                    fill="#0f172a"
                  >
                    {loc.name.length > 10 ? `${loc.name.substring(0, 9)}…` : loc.name}
                  </text>
                  <text
                    x={groupX + (barW * 4 + 6) / 2}
                    y={chartHeight - paddingBottom + 32}
                    textAnchor="middle"
                    className="font-mono text-[10px] font-medium tabular-nums"
                    fill={AXIS_TEXT}
                  >
                    ({loc.code})
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Location Details & Capacity Status Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(selectedLoc ? [selectedLoc] : locations).map((loc) => {
          const maxCap = loc.maxCapacity ?? loc.vehicles ?? 0;
          const avail = loc.availableVehicles ?? Math.max(0, maxCap - (loc.inUseVehicles ?? 0));
          const inUse = loc.inUseVehicles ?? 0;
          const reqs = loc.bookings ?? 0;
          const isSelected = selectedLocationId === loc.locationId;
          const utilRate = maxCap > 0 ? Math.round((inUse / maxCap) * 100) : 0;

          return (
            <article
              key={loc.locationId}
              className={`rounded-lg border p-4 transition-colors ${
                isSelected ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                    {loc.name}
                  </h3>
                  <p className="font-mono text-[11px] font-medium tabular-nums text-slate-400">Hub {loc.code}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    avail > 0
                      ? 'border-success-200 bg-success-50 text-success-700'
                      : 'border-danger-200 bg-danger-50 text-danger-700'
                  }`}
                >
                  {avail > 0 ? `Siap +${avail} Order` : 'Kapasitas Penuh'}
                </span>
              </div>

              {/* Capacity progress bar */}
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="text-slate-500">Beban Penggunaan Hub:</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900">{utilRate}% Terpakai</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  <div
                    style={{ width: `${maxCap > 0 ? (inUse / maxCap) * 100 : 0}%` }}
                    className="h-full bg-warning-600 transition-all"
                    title={`Sedang digunakan: ${inUse} unit`}
                  />
                  <div
                    style={{ width: `${maxCap > 0 ? (avail / maxCap) * 100 : 0}%` }}
                    className="h-full bg-success-600 transition-all"
                    title={`Tersedia: ${avail} unit`}
                  />
                </div>
              </div>

              {/* Metric breakdown */}
              <dl className="mt-4 grid grid-cols-2 gap-1.5 text-xs">
                <div className="rounded-md border border-brand-200 bg-white p-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                    Maks Kapasitas
                  </dt>
                  <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {maxCap} <span className="text-[11px] font-medium text-slate-400">unit</span>
                  </dd>
                </div>

                <div className="rounded-md border border-success-200 bg-white p-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-success-700">
                    Sedang Available
                  </dt>
                  <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {avail} <span className="text-[11px] font-medium text-slate-400">unit</span>
                  </dd>
                </div>

                <div className="rounded-md border border-warning-200 bg-white p-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-warning-700">
                    Sedang Digunakan
                  </dt>
                  <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {inUse} <span className="text-[11px] font-medium text-slate-400">unit</span>
                  </dd>
                </div>

                <div className="rounded-md border border-info-200 bg-white p-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-info-600">
                    Permintaan Masuk
                  </dt>
                  <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {reqs} <span className="text-[11px] font-medium text-slate-400">trip</span>
                  </dd>
                </div>
              </dl>

              {/* Action buttons */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs">
                <button
                  type="button"
                  onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                  className="cursor-pointer font-medium text-slate-600 underline-offset-4 hover:text-brand-600 hover:underline"
                >
                  {isSelected ? 'Batal Filter Hub' : 'Fokus Hub Ini'}
                </button>
                <div className="flex gap-1.5">
                  <Link
                    href={`/admin/vehicles?locationId=${loc.locationId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  >
                    Armada <span className="font-mono tabular-nums">({loc.vehicles})</span>
                  </Link>
                  <Link
                    href={`/admin/bookings?locationId=${loc.locationId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  >
                    Booking <span className="font-mono tabular-nums">({loc.bookings})</span>
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
