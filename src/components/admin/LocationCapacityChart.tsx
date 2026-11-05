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

  return (
    <section aria-labelledby="capacity-chart-heading" className="surface min-w-0 space-y-6 p-5 sm:p-7">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-black bg-rose-200 text-rose-950 shadow-[1px_1px_0px_0px_#000]">
              <Icon name="route" className="h-3.5 w-3.5" />
            </span>
            <p className="eyebrow">Monitoring Kapasitas & Beban Hub</p>
          </div>
          <h2 id="capacity-chart-heading" className="section-title mt-2">
            Kapasitas & Penggunaan Armada per Lokasi
          </h2>
          <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-600 sm:text-sm">
            Pantau batas maksimal penerimaan permintaan, armada yang sedang bertugas, dan unit yang tersedia di setiap stasiun KCIC.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-black bg-zinc-50 p-2.5 text-xs font-bold shadow-[2px_2px_0px_0px_#000]">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-black bg-[#be123c]" />
            <span className="text-zinc-700">Maks Kapasitas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-black bg-emerald-500" />
            <span className="text-zinc-700">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-black bg-amber-400" />
            <span className="text-zinc-700">Sedang Digunakan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-black bg-sky-500" />
            <span className="text-zinc-700">Permintaan Masuk</span>
          </div>
        </div>
      </div>

      {/* Location Filter Pills */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
          Filter Lokasi Operasional:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectLocation('')}
            className={`cursor-pointer rounded-lg border-2 border-black px-3 py-1.5 text-xs font-black transition-all ${
              !selectedLocationId
                ? 'bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-zinc-800 shadow-[1.5px_1.5px_0px_0px_#000] hover:bg-zinc-100'
            }`}
          >
            Semua Hub ({locations.length})
          </button>
          {locations.map((loc) => {
            const isSelected = selectedLocationId === loc.locationId;
            const avail = loc.availableVehicles ?? (loc.vehicles - (loc.inUseVehicles ?? 0));
            return (
              <button
                key={loc.locationId}
                type="button"
                onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-black px-3 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000]'
                    : 'bg-white text-zinc-800 shadow-[1.5px_1.5px_0px_0px_#000] hover:bg-zinc-100'
                }`}
              >
                <span>{loc.name}</span>
                <span
                  className={`font-mono text-[10px] px-1 py-0.2 rounded border ${
                    isSelected
                      ? 'border-white/50 bg-white/20 text-white'
                      : 'border-zinc-300 bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {loc.code}
                </span>
                <span
                  className={`text-[10px] font-black rounded-full px-1.5 py-0.2 ${
                    avail > 0
                      ? isSelected ? 'bg-emerald-400 text-black' : 'bg-emerald-100 text-emerald-800'
                      : isSelected ? 'bg-zinc-200 text-black' : 'bg-zinc-200 text-zinc-700'
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
      <div className="overflow-x-auto rounded-2xl border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000]">
        <div className="min-w-[620px]">
          <svg
            viewBox={`0 0 ${locations.length * 110 + 60} ${chartHeight}`}
            className="w-full h-56 select-none"
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
                    stroke="#e4e4e7"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x="35"
                    y={y + 4}
                    textAnchor="end"
                    className="font-mono text-[10px] fill-zinc-400 font-bold"
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
              stroke="#000"
              strokeWidth="2"
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

              return (
                <g
                  key={loc.locationId}
                  className="cursor-pointer transition-opacity"
                  opacity={selectedLocationId && !isSelected ? 0.45 : 1}
                  onMouseEnter={() => setHoveredLocationId(loc.locationId)}
                  onMouseLeave={() => setHoveredLocationId(null)}
                  onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                >
                  {/* Highlight pill behind column */}
                  {(isSelected || isHovered) && (
                    <rect
                      x={groupX - 8}
                      y={paddingTop - 10}
                      width={barW * 4 + 22}
                      height={usableHeight + 20}
                      rx="8"
                      fill={isSelected ? '#fff1f2' : '#f4f4f5'}
                      stroke="#000"
                      strokeWidth="1.5"
                      strokeDasharray={isSelected ? 'none' : '2 2'}
                    />
                  )}

                  {/* Bar 1: Max Capacity (Armada Total) */}
                  <rect
                    x={groupX}
                    y={baseY - hMax}
                    width={barW}
                    height={Math.max(2, hMax)}
                    fill="#be123c"
                    stroke="#000"
                    strokeWidth="1.5"
                    rx="3"
                  />
                  <text
                    x={groupX + barW / 2}
                    y={baseY - hMax - 5}
                    textAnchor="middle"
                    className="font-mono text-[9px] font-black fill-[#be123c]"
                  >
                    {maxCap}
                  </text>

                  {/* Bar 2: Available (Siap Pakai) */}
                  <rect
                    x={groupX + barW + 2}
                    y={baseY - hAvail}
                    width={barW}
                    height={Math.max(2, hAvail)}
                    fill="#10b981"
                    stroke="#000"
                    strokeWidth="1.5"
                    rx="3"
                  />
                  <text
                    x={groupX + barW + 2 + barW / 2}
                    y={baseY - hAvail - 5}
                    textAnchor="middle"
                    className="font-mono text-[9px] font-black fill-emerald-700"
                  >
                    {avail}
                  </text>

                  {/* Bar 3: Sedang Digunakan (In Use) */}
                  <rect
                    x={groupX + (barW + 2) * 2}
                    y={baseY - hInUse}
                    width={barW}
                    height={Math.max(2, hInUse)}
                    fill="#f59e0b"
                    stroke="#000"
                    strokeWidth="1.5"
                    rx="3"
                  />
                  <text
                    x={groupX + (barW + 2) * 2 + barW / 2}
                    y={baseY - hInUse - 5}
                    textAnchor="middle"
                    className="font-mono text-[9px] font-black fill-amber-700"
                  >
                    {inUse}
                  </text>

                  {/* Bar 4: Permintaan Masuk (Active Requests) */}
                  <rect
                    x={groupX + (barW + 2) * 3}
                    y={baseY - hReqs}
                    width={barW}
                    height={Math.max(2, hReqs)}
                    fill="#0284c7"
                    stroke="#000"
                    strokeWidth="1.5"
                    rx="3"
                  />
                  <text
                    x={groupX + (barW + 2) * 3 + barW / 2}
                    y={baseY - hReqs - 5}
                    textAnchor="middle"
                    className="font-mono text-[9px] font-black fill-sky-800"
                  >
                    {reqs}
                  </text>

                  {/* X-axis Hub Label */}
                  <text
                    x={groupX + (barW * 4 + 6) / 2}
                    y={chartHeight - paddingBottom + 18}
                    textAnchor="middle"
                    className="text-[11px] font-black fill-zinc-950"
                  >
                    {loc.name.length > 10 ? `${loc.name.substring(0, 9)}…` : loc.name}
                  </text>
                  <text
                    x={groupX + (barW * 4 + 6) / 2}
                    y={chartHeight - paddingBottom + 32}
                    textAnchor="middle"
                    className="font-mono text-[10px] font-bold fill-zinc-500"
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              className={`rounded-2xl border-2 border-black p-4.5 transition-all shadow-[4px_4px_0px_0px_#000] ${
                isSelected ? 'bg-amber-50 ring-2 ring-[#be123c]' : 'bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-black tracking-tight text-zinc-950">
                    {loc.name}
                  </h3>
                  <p className="font-mono text-xs font-bold text-zinc-500">Hub Code: {loc.code}</p>
                </div>
                <span
                  className={`rounded-md border-2 border-black px-2 py-0.5 text-xs font-black shadow-[1px_1px_0px_0px_#000] ${
                    avail > 0 ? 'bg-emerald-300 text-zinc-950' : 'bg-rose-300 text-rose-950'
                  }`}
                >
                  {avail > 0 ? `Siap +${avail} Order` : 'Kapasitas Penuh'}
                </span>
              </div>

              {/* Progress Bar of Capacity */}
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-zinc-600">Beban Penggunaan Hub:</span>
                  <span className="font-mono font-black text-zinc-950">{utilRate}% Terpakai</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full border border-black bg-zinc-100 flex">
                  <div
                    style={{ width: `${maxCap > 0 ? (inUse / maxCap) * 100 : 0}%` }}
                    className="bg-amber-400 h-full transition-all"
                    title={`Sedang digunakan: ${inUse} unit`}
                  />
                  <div
                    style={{ width: `${maxCap > 0 ? (avail / maxCap) * 100 : 0}%` }}
                    className="bg-emerald-400 h-full transition-all"
                    title={`Tersedia: ${avail} unit`}
                  />
                </div>
              </div>

              {/* Metric Breakdown Grid */}
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-xl border border-black bg-rose-50 p-2.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                  <dt className="text-[10px] font-black uppercase tracking-wider text-rose-900">
                    Maks Kapasitas
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-black text-rose-900">
                    {maxCap} <span className="text-xs font-bold">unit</span>
                  </dd>
                  <span className="text-[10px] text-zinc-500 font-medium">Batas order simultan</span>
                </div>

                <div className="rounded-xl border border-black bg-emerald-50 p-2.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                  <dt className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                    Sedang Available
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-black text-emerald-800">
                    {avail} <span className="text-xs font-bold">unit</span>
                  </dd>
                  <span className="text-[10px] text-zinc-500 font-medium">Siap terima order</span>
                </div>

                <div className="rounded-xl border border-black bg-amber-50 p-2.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                  <dt className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                    Sedang Digunakan
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-black text-amber-900">
                    {inUse} <span className="text-xs font-bold">unit</span>
                  </dd>
                  <span className="text-[10px] text-zinc-500 font-medium">Dalam perjalanan</span>
                </div>

                <div className="rounded-xl border border-black bg-sky-50 p-2.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                  <dt className="text-[10px] font-black uppercase tracking-wider text-sky-900">
                    Permintaan Masuk
                  </dt>
                  <dd className="mt-1 font-mono text-xl font-black text-sky-900">
                    {reqs} <span className="text-xs font-bold">trip</span>
                  </dd>
                  <span className="text-[10px] text-zinc-500 font-medium">Booking aktif</span>
                </div>
              </dl>

              {/* Action buttons */}
              <div className="mt-4 flex items-center justify-between border-t-2 border-black/10 pt-3 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => onSelectLocation(isSelected ? '' : loc.locationId)}
                  className="text-zinc-800 hover:text-rose-700 underline cursor-pointer"
                >
                  {isSelected ? 'Batal Filter Hub' : 'Fokus Hub Ini'}
                </button>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/vehicles?locationId=${loc.locationId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-black bg-white px-2 py-1 text-[11px] font-bold text-zinc-900 hover:bg-zinc-100 shadow-[1px_1px_0px_0px_#000]"
                  >
                    Armada ({loc.vehicles})
                  </Link>
                  <Link
                    href={`/admin/bookings?locationId=${loc.locationId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-black bg-white px-2 py-1 text-[11px] font-bold text-zinc-900 hover:bg-zinc-100 shadow-[1px_1px_0px_0px_#000]"
                  >
                    Booking ({loc.bookings})
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
