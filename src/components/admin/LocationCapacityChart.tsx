'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Route } from 'lucide-react';

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

const BARS = [
  { key: 'max', label: 'Maks kapasitas', color: '#C8102E', text: 'fill-[#C8102E]' },
  { key: 'avail', label: 'Tersedia', color: '#10b981', text: 'fill-emerald-600' },
  { key: 'inUse', label: 'Digunakan', color: '#f59e0b', text: 'fill-amber-600' },
  { key: 'reqs', label: 'Order aktif', color: '#0284c7', text: 'fill-sky-600' },
] as const;

export function LocationCapacityChart({
  locations,
  selectedLocationId,
  onSelectLocation,
}: LocationCapacityChartProps) {
  const [hoveredLocationId, setHoveredLocationId] = useState<string | null>(null);

  if (!locations || locations.length === 0) {
    return null;
  }

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

  return (
    <section className="card overflow-hidden" aria-labelledby="capacity-chart-heading">
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">
            <Route className="size-3" strokeWidth={2} aria-hidden="true" />
            Monitoring kapasitas hub
          </span>
          <h2 id="capacity-chart-heading" className="section-title mt-1">
            Kapasitas &amp; beban armada per stasiun
          </h2>
          <p className="mt-1 max-w-xl text-[0.6875rem] leading-relaxed text-slate-500">
            Batas maksimal pesanan simultan, unit standby, dan armada yang sedang bertugas di setiap
            stasiun KCIC.
          </p>
        </div>

        {/* Legend */}
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-full border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-1.5">
          {BARS.map((bar) => (
            <li key={bar.key} className="flex items-center gap-1.5 text-[0.6875rem] text-slate-600">
              <span
                className="size-2 rounded-[2px]"
                style={{ backgroundColor: bar.color }}
                aria-hidden="true"
              />
              <span>{bar.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Hub filter */}
        <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
          <span className="shrink-0 pr-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Filter
          </span>
          <button
            type="button"
            onClick={() => onSelectLocation('')}
            aria-pressed={!selectedLocationId}
            className="chip shrink-0"
          >
            <span>Semua hub</span>
            <span className="tabular-nums opacity-60">{locations.length}</span>
          </button>
          {locations.map((loc) => {
            const isSelected = selectedLocationId === loc.locationId;
            const avail = loc.availableVehicles ?? loc.vehicles - (loc.inUseVehicles ?? 0);
            return (
              <button
                key={loc.locationId}
                type="button"
                onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                aria-pressed={isSelected}
                className="chip shrink-0"
              >
                <span>{loc.name}</span>
                <span className="mono-plate text-[0.625rem] opacity-60">{loc.code}</span>
                <span
                  className={`rounded-full px-1.5 text-[0.625rem] font-semibold tabular-nums ${
                    avail > 0
                      ? isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--status-active-bg)] text-[var(--status-active-fg)]'
                      : isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--border-subtle)] text-slate-500'
                  }`}
                >
                  {avail}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bar chart */}
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3">
          <div className="min-w-[560px]">
            <svg
              viewBox={`0 0 ${locations.length * 110 + 60} ${chartHeight}`}
              className="h-52 w-full select-none"
              role="img"
              aria-label="Perbandingan kapasitas, ketersediaan, dan pemakaian armada per stasiun"
            >
              {/* Grid lines */}
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
                      stroke="#f1f5f9"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x="35"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 font-mono text-[10px] tabular-nums"
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
                stroke="#e2e8f0"
                strokeWidth="1.5"
              />

              {/* Grouped bars */}
              {locations.map((loc, idx) => {
                const groupX = 65 + idx * 110;
                const isSelected = selectedLocationId === loc.locationId;
                const isHovered = hoveredLocationId === loc.locationId;

                const maxCap = loc.maxCapacity ?? loc.vehicles ?? 0;
                const avail = loc.availableVehicles ?? Math.max(0, maxCap - (loc.inUseVehicles ?? 0));
                const inUse = loc.inUseVehicles ?? 0;
                const reqs = loc.bookings ?? 0;

                const heights = {
                  max: (maxCap / maxVal) * usableHeight,
                  avail: (avail / maxVal) * usableHeight,
                  inUse: (inUse / maxVal) * usableHeight,
                  reqs: (reqs / maxVal) * usableHeight,
                };
                const values = { max: maxCap, avail, inUse, reqs };

                const barW = 14;
                const baseY = chartHeight - paddingBottom;

                return (
                  <g
                    key={loc.locationId}
                    className="cursor-pointer"
                    opacity={selectedLocationId && !isSelected ? 0.35 : 1}
                    onMouseEnter={() => setHoveredLocationId(loc.locationId)}
                    onMouseLeave={() => setHoveredLocationId(null)}
                    onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                  >
                    {(isSelected || isHovered) && (
                      <rect
                        x={groupX - 8}
                        y={paddingTop - 10}
                        width={barW * 4 + 22}
                        height={usableHeight + 20}
                        rx="12"
                        fill={isSelected ? '#fef2f2' : '#f8fafc'}
                        stroke={isSelected ? '#fecaca' : '#e2e8f0'}
                        strokeWidth="1"
                      />
                    )}

                    {BARS.map((bar, barIdx) => {
                      const h = heights[bar.key];
                      const x = groupX + (barW + 2) * barIdx;
                      return (
                        <g key={bar.key}>
                          <rect
                            x={x}
                            y={baseY - h}
                            width={barW}
                            height={Math.max(2, h)}
                            fill={bar.color}
                            rx="3"
                          />
                          <text
                            x={x + barW / 2}
                            y={baseY - h - 5}
                            textAnchor="middle"
                            className={`font-mono text-[10px] font-semibold tabular-nums ${bar.text}`}
                          >
                            {values[bar.key]}
                          </text>
                        </g>
                      );
                    })}

                    <text
                      x={groupX + (barW * 4 + 6) / 2}
                      y={chartHeight - paddingBottom + 18}
                      textAnchor="middle"
                      className="fill-slate-700 text-[11px] font-semibold"
                    >
                      {loc.name.length > 10 ? `${loc.name.substring(0, 9)}…` : loc.name}
                    </text>
                    <text
                      x={groupX + (barW * 4 + 6) / 2}
                      y={chartHeight - paddingBottom + 32}
                      textAnchor="middle"
                      className="fill-slate-400 font-mono text-[10px]"
                    >
                      {loc.code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Hub cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(selectedLoc ? [selectedLoc] : locations).map((loc) => {
            const maxCap = loc.maxCapacity ?? loc.vehicles ?? 0;
            const avail = loc.availableVehicles ?? Math.max(0, maxCap - (loc.inUseVehicles ?? 0));
            const inUse = loc.inUseVehicles ?? 0;
            const reqs = loc.bookings ?? 0;
            const isSelected = selectedLocationId === loc.locationId;
            const utilRate = maxCap > 0 ? Math.round((inUse / maxCap) * 100) : 0;

            return (
              <div
                key={loc.locationId}
                className={`rounded-[var(--radius-lg)] border p-4 transition-colors ${
                  isSelected
                    ? 'border-[var(--kcic-red)]/40 bg-[var(--kcic-red-soft)]'
                    : 'border-[var(--border)] bg-white hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[0.8125rem] font-semibold text-slate-900">
                      {loc.name}
                    </h3>
                    <p className="mono-plate mt-0.5 text-[0.625rem] text-slate-400">
                      Kode {loc.code}
                    </p>
                  </div>
                  <span
                    className={`pill shrink-0 ${avail > 0 ? 'pill-active' : 'pill-error'}`}
                  >
                    <span>{avail > 0 ? `Siap +${avail}` : 'Penuh'}</span>
                  </span>
                </div>

                {/* Load bar */}
                <div className="mt-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[0.6875rem]">
                    <span className="text-slate-500">Beban hub</span>
                    <span className="font-semibold tabular-nums text-slate-900">{utilRate}%</span>
                  </div>
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
                    <div
                      style={{ width: `${maxCap > 0 ? (inUse / maxCap) * 100 : 0}%` }}
                      className="h-full bg-[var(--status-warning-fg)] transition-all"
                    />
                    <div
                      style={{ width: `${maxCap > 0 ? (avail / maxCap) * 100 : 0}%` }}
                      className="h-full bg-[var(--status-active-fg)] transition-all"
                    />
                  </div>
                </div>

                <dl className="mt-3.5 grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Maks', value: maxCap, tone: '' },
                    { label: 'Tersedia', value: avail, tone: 'bg-[var(--status-active-bg)]' },
                    { label: 'Digunakan', value: inUse, tone: 'bg-[var(--status-warning-bg)]' },
                    { label: 'Order', value: reqs, tone: 'bg-[var(--status-standby-bg)]' },
                  ].map((cell) => (
                    <div
                      key={cell.label}
                      className={`rounded-[var(--radius-sm)] py-1.5 text-center ${
                        cell.tone || 'bg-[var(--canvas)]'
                      }`}
                    >
                      <dt className="metric-label">{cell.label}</dt>
                      <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                        {cell.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                    className="cursor-pointer text-[0.6875rem] font-semibold text-slate-600 transition-colors hover:text-[var(--kcic-red)]"
                  >
                    {isSelected ? 'Batal filter' : 'Fokus hub'}
                  </button>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/vehicles?locationId=${loc.locationId}`}
                      className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-white px-2 py-1 text-[0.625rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)]"
                    >
                      Armada <span className="tabular-nums opacity-60">{loc.vehicles}</span>
                    </Link>
                    <Link
                      href={`/admin/bookings?locationId=${loc.locationId}`}
                      className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-white px-2 py-1 text-[0.625rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)]"
                    >
                      Order <span className="tabular-nums opacity-60">{loc.bookings}</span>
                      <ArrowRight className="size-2.5" strokeWidth={2.6} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
