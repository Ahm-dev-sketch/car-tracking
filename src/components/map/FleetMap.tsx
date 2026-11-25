'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { getVehicleConditionVisual, ConditionVisual } from './condition';

export type { ConditionVisual };
export { getVehicleConditionVisual };

export interface RoutePoint {
  lat: number;
  lng: number;
  label: string;
  type?: 'pickup' | 'destination';
}

export interface VehicleMarkerData {
  vehicleId: string;
  plateNumber: string;
  brand?: string;
  model?: string;
  status: string;
  driverName?: string | null;
  driverPhone?: string | null;
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  recordedAt: string;
  movement: string;
  tripOrigin?: string | null;
  tripDestination?: string | null;
  homeLocation?: { id: string; name: string; code: string } | null;
  currentOperationalLocation?: { id: string; name: string; code: string } | null;
}

interface FleetMapProps {
  vehicles: VehicleMarkerData[];
  selectedVehicleId?: string | null;
  onSelectVehicle?: (vehicle: VehicleMarkerData) => void;
  center?: [number, number];
  zoom?: number;
  className?: string;
  routePoints?: RoutePoint[];
}

/* Flat 2.0 chrome for Leaflet UI. Leaflet renders popups/tooltips outside React,
   so the shared look is injected once per document through a single style tag. */
const MAP_CHROME_ID = 'kcic-flat-leaflet-chrome';
const MAP_CHROME_CSS = `
.leaflet-container { font-family: var(--font-geist-sans), system-ui, sans-serif; font-variant-numeric: tabular-nums; }
/* Surfaces/text read from the inverted theme tokens so this chrome follows .dark.
   --color-white is #0f172a under .dark, --color-slate-200 -> #1e293b, etc. */
.leaflet-popup-content-wrapper {
  border: 1px solid var(--color-slate-200); border-radius: 0.75rem; background: var(--color-white);
  box-shadow: 0 8px 28px rgba(15,23,42,0.14); padding: 0;
}
.leaflet-popup-content { margin: 0.75rem; line-height: 1.45; }
.leaflet-popup-tip { border: 1px solid var(--color-slate-200); box-shadow: none; background: var(--color-white); }
.leaflet-popup-close-button {
  top: 0.5rem !important; right: 0.5rem !important; width: 1.5rem !important; height: 1.5rem !important;
  border-radius: 0.375rem; color: var(--color-slate-500) !important; font-size: 1rem !important; line-height: 1.5rem !important;
}
.leaflet-popup-close-button:hover { background: var(--color-slate-100); color: var(--color-slate-900) !important; }
.leaflet-tooltip {
  border: 1px solid var(--color-slate-200); border-radius: 0.5rem; background: var(--color-white); color: var(--color-slate-700);
  box-shadow: 0 2px 8px rgba(15,23,42,0.08); padding: 0.25rem 0.5rem;
}
.leaflet-tooltip-top:before, .leaflet-tooltip-bottom:before,
.leaflet-tooltip-left:before, .leaflet-tooltip-right:before { display: none; }
.leaflet-bar, .leaflet-bar a { border-color: var(--color-slate-200); }
.leaflet-control-attribution { background: rgba(255,255,255,0.82); border-radius: 0.375rem 0 0 0; color: var(--color-slate-500); }
.leaflet-control-attribution a { color: var(--color-slate-600); }
.dark .leaflet-control-attribution { background: rgba(15,23,42,0.82); }
.dark .leaflet-popup-content-wrapper, .dark .leaflet-popup-tip { box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
/* Leaflet builds divIcon HTML outside React, so the marker pulse is defined here
   instead of relying on a Tailwind class that may not be emitted for this tree.
   Values mirror condition.ts pulseColor: bg-orange-400 / bg-slate-400 / bg-amber-400 */
.vehicle-div-icon .pulse-dot {
  animation: kcic-marker-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
  background-color: currentColor;
}
.vehicle-div-icon .pulse-orange { color: #fb923c; }
.vehicle-div-icon .pulse-slate { color: #94a3b8; }
.vehicle-div-icon .pulse-amber { color: #fbbf24; }
@keyframes kcic-marker-ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .vehicle-div-icon .pulse-dot { animation: none; opacity: 0.35; }
}
`;

function injectMapChrome() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(MAP_CHROME_ID)) return;
  const style = document.createElement('style');
  style.id = MAP_CHROME_ID;
  style.textContent = MAP_CHROME_CSS;
  document.head.appendChild(style);
}

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const [lat, lng] = center;

  useEffect(() => {
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const latDiff = Math.abs(currentCenter.lat - lat);
    const lngDiff = Math.abs(currentCenter.lng - lng);
    const zoomChanged = currentZoom !== zoom;

    // Only update Leaflet view when coordinates or zoom actually change
    if (latDiff > 0.0002 || lngDiff > 0.0002 || zoomChanged) {
      map.setView([lat, lng], zoom, { animate: true });
    }
  }, [lat, lng, zoom, map]);

  return null;
}

function FitBounds({ points, maxZoom }: { points: [number, number][]; maxZoom?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length < 2) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: maxZoom ?? 15 });
  }, [map, points, maxZoom]);

  return null;
}

function createVehicleIcon(status: string, movement: string, isSelected: boolean, accuracyM?: number) {
  const visual = getVehicleConditionVisual(status, movement);
  const isMoving = movement?.toUpperCase() === 'MOVING';
  const isEstimated = typeof accuracyM === 'number' && accuracyM > 100;

  // condition.ts owns the pulse colour (bg-orange-400 / bg-slate-400 / bg-amber-400).
  // Map it to a self-defined class so the pulse never depends on Tailwind emitting it.
  const pulseTone =
    visual.pulseColor === 'bg-slate-400'
      ? 'pulse-slate'
      : visual.pulseColor === 'bg-amber-400'
      ? 'pulse-amber'
      : 'pulse-orange';

  const pulseHtml = (isMoving || isSelected)
    ? `<span class="pulse-dot ${pulseTone} absolute -inset-1.5 rounded-full opacity-60"></span>`
    : '';

  // Flat 2.0 chrome only: 1px ring, soft shadow. The fill colour stays owned by condition.ts.
  // The halo sits on the (dark-inverted) tile layer, so it must stay light in both themes.
  const ring = isSelected
    ? 'ring-2 ring-[#f8fafc] scale-110'
    : 'ring-1 ring-[#f8fafc]';
  const shadow = isSelected
    ? 'shadow-[0_4px_12px_rgba(15,23,42,0.35)]'
    : 'shadow-[0_1px_3px_rgba(15,23,42,0.3)]';

  const badgeHtml = isEstimated
    ? `<span class="absolute -top-2 -right-3.5 z-20 whitespace-nowrap rounded-full border border-warning-200 bg-warning-50 px-1.5 py-px text-[9px] font-semibold tabular-nums text-warning-700 pointer-events-none" title="Akurasi Estimasi: ±${Math.round(accuracyM as number)}m">±${Math.round(accuracyM as number)}m</span>`
    : '';

  return L.divIcon({
    className: 'vehicle-div-icon',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-transform ${ring} ${shadow}" style="background-color: ${visual.color}; color: #fff;">
        ${pulseHtml}
        <svg class="w-4 h-4 relative z-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
          ${visual.iconSvg}
        </svg>
        ${badgeHtml}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function createPointIcon(type: 'pickup' | 'destination', label: string) {
  const isPickup = type === 'pickup';
  // Pickup = slate structure, destination = KCIC crimson
  const bg = isPickup ? '#0f172a' : '#c8102e';
  const dot = isPickup
    ? '<span class="inline-block h-1.5 w-1.5 rounded-full" style="background-color: rgba(255,255,255,0.9);"></span>'
    : '<span class="inline-block h-1.5 w-1.5 rotate-45" style="background-color: rgba(255,255,255,0.9);"></span>';
  return L.divIcon({
    className: 'route-point-div-icon',
    html: `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-[0_2px_6px_rgba(15,23,42,0.28)]" style="background-color: ${bg}; color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.55), 0 2px 6px rgba(15,23,42,0.28);">
          ${dot}
          <span class="max-w-[120px] truncate">${label}</span>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/* Inline SVG glyphs for Leaflet tooltips. Raw HTML cannot render React icons,
   so these mirror Icon's alert / check paths with a uniform 2px stroke. */
const ICON_ALERT_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4m0 4h.01" /></svg>';
const ICON_CHECK_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>';

export default function FleetMap({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  center = [-6.2088, 106.8456], // Default Jakarta / Ops center
  zoom = 13,
  className = 'h-[500px] w-full',
  routePoints,
}: FleetMapProps) {
  useEffect(() => {
    injectMapChrome();
  }, []);

  // Center on selected vehicle if explicitly chosen, otherwise use center prop (e.g. selected Hub)
  const targetVehicle = selectedVehicleId
    ? vehicles.find((v) => v.vehicleId === selectedVehicleId)
    : null;

  const mapCenter: [number, number] = targetVehicle && !isNaN(targetVehicle.lat) && !isNaN(targetVehicle.lng)
    ? [targetVehicle.lat, targetVehicle.lng]
    : center;

  const fitPoints = useMemo<[number, number][]>(
    () =>
      (routePoints ?? [])
        .filter((p) => !isNaN(p.lat) && !isNaN(p.lng))
        .map((p) => [p.lat, p.lng] as [number, number]),
    [routePoints]
  );

  // Fit bounds to the full route whenever both pickup and destination are present.
  // The vehicle marker still renders inside the fitted view (it lies on the route).
  const shouldFitBounds = fitPoints.length >= 2;

  return (
    <div data-lenis-prevent className={`relative overflow-hidden isolate ${className}`}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {!shouldFitBounds && <MapUpdater center={mapCenter} zoom={zoom} />}
        {shouldFitBounds && <FitBounds points={fitPoints} />}

        {vehicles.map((v) => {
          if (isNaN(v.lat) || isNaN(v.lng)) return null;
          const isSelected = v.vehicleId === selectedVehicleId;
          const visual = getVehicleConditionVisual(v.status, v.movement);
          const icon = createVehicleIcon(v.status, v.movement, isSelected, v.accuracyM);
          const rawPhone = v.driverPhone ? v.driverPhone.replace(/\D/g, '') : '';
          const waUrl = rawPhone ? `https://wa.me/${rawPhone}` : null;

          return (
            <React.Fragment key={v.vehicleId}>
              {/* GPS Accuracy Radius Circle */}
              {typeof v.accuracyM === 'number' && v.accuracyM > 0 && (
                <Circle
                  center={[v.lat, v.lng]}
                  radius={Math.max(v.accuracyM, 5)}
                  pathOptions={{
                    color: '#94a3b8',
                    fillColor: '#cbd5e1',
                    fillOpacity: isSelected ? 0.22 : 0.16,
                    weight: isSelected ? 1.5 : 1,
                    opacity: 0.7,
                  }}
                >
                  <Tooltip direction="center" permanent={false} opacity={0.92}>
                    <span className="font-sans text-xs font-medium text-slate-700">
                      {v.accuracyM > 100
                        ? `Akurasi Estimasi: ±${Math.round(v.accuracyM)} m (Wi-Fi/Seluler)`
                        : v.accuracyM < 20
                        ? `Akurasi Tinggi: ±${Math.round(v.accuracyM)} m (Satelit Lock)`
                        : `Akurasi: ±${Math.round(v.accuracyM)} m`}
                    </span>
                  </Tooltip>
                </Circle>
              )}

              {/* Vehicle Marker */}
              <Marker
                title={`${v.plateNumber} (${visual.badgeText})`}
                alt={`Vehicle ${v.plateNumber}`}
                position={[v.lat, v.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onSelectVehicle?.(v),
                }}
              >
                {v.accuracyM > 100 && (
                  <Tooltip direction="top" offset={[0, -20]} permanent opacity={0.95}>
                    <span className="inline-flex items-center gap-1 font-sans text-[10px] font-semibold tabular-nums text-warning-700">
                      <span className="inline-flex shrink-0 text-warning-600" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_ALERT_SVG }} />
                      Akurasi Estimasi: ±{Math.round(v.accuracyM)} m
                    </span>
                  </Tooltip>
                )}
                <Popup className="custom-leaflet-popup">
                  <div className="min-w-[210px] font-sans text-slate-900">
                    <div className="mb-2 flex items-start justify-between gap-2 border-b border-slate-200 pb-2 pr-5">
                      <span className="font-mono text-sm font-semibold tracking-wide tabular-nums text-slate-900">{v.plateNumber}</span>
                      <StatusBadge status={v.status} />
                    </div>

                    {(v.homeLocation || v.currentOperationalLocation) && (
                      <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-slate-100 pb-2">
                        {v.homeLocation && (
                          <LocationBadge
                            type="home"
                            name={v.homeLocation.name}
                            code={v.homeLocation.code}
                          />
                        )}
                        {v.currentOperationalLocation && (
                          <LocationBadge
                            type="current"
                            name={v.currentOperationalLocation.name}
                            code={v.currentOperationalLocation.code}
                          />
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5 text-xs">
                      {v.brand && (
                        <div className="font-medium text-slate-500">
                          {v.brand} {v.model}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="font-medium text-slate-500">Condition:</span>
                        <span
                          className="rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide"
                          style={{ backgroundColor: visual.color, borderColor: visual.color, color: '#fff' }}
                        >
                          {visual.badgeText}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Movement:</span>
                        <MovementBadge movement={v.movement} />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Accuracy:</span>
                        <GPSBadge accuracyM={v.accuracyM} showDetails={true} />
                      </div>
                      {typeof v.accuracyM === 'number' && v.accuracyM > 100 && (
                        <div className="flex items-start gap-1.5 rounded-md border border-warning-200 bg-warning-50 px-1.5 py-1 text-[10px] font-medium text-warning-700">
                          <span className="mt-px inline-flex shrink-0 text-warning-600" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_ALERT_SVG }} />
                          <span>Posisi estimasi seluler/Wi-Fi (radius ±{Math.round(v.accuracyM)} m)</span>
                        </div>
                      )}
                      {typeof v.accuracyM === 'number' && v.accuracyM < 20 && (
                        <div className="flex items-start gap-1.5 rounded-md border border-success-200 bg-success-50 px-1.5 py-1 text-[10px] font-medium text-success-700">
                          <span className="mt-px inline-flex shrink-0 text-success-600" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_CHECK_SVG }} />
                          <span>Akurasi tinggi (satelit GPS terkunci)</span>
                        </div>
                      )}

                      {typeof v.speedMps === 'number' && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500">Speed:</span>
                          <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-700">{(v.speedMps * 3.6).toFixed(0)} km/h</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Updated:</span>
                        <RelativeTime date={v.recordedAt} />
                      </div>

                      {v.driverName ? (
                        <div className="border-t border-slate-100 pt-2">
                          <div className="text-[11px] text-slate-500">Assigned Driver:</div>
                          <div className="font-semibold text-slate-800">{v.driverName}</div>
                          {v.driverPhone && v.driverPhone !== 'REDACTED' && (
                            <div className="mt-1">
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                                >
                                  <span>WhatsApp: {v.driverPhone}</span>
                                </a>
                              ) : (
                                <span className="text-slate-600">{v.driverPhone}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="border-t border-slate-100 pt-2 text-[11px] italic text-slate-400">
                          {v.status === 'MAINTENANCE'
                            ? 'Unit under workshop maintenance'
                            : v.status === 'INACTIVE'
                            ? 'Unit non-operational'
                            : 'Standby in operational pool'}
                        </div>
                      )}

                      {(v.tripOrigin || v.tripDestination) && (
                        <div className="space-y-0.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-600">
                          {v.tripOrigin && <div>From: {v.tripOrigin}</div>}
                          {v.tripDestination && <div>To: {v.tripDestination}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Route Points (Pickup & Destination) */}
        {routePoints?.map((pt, idx) => {
          if (isNaN(pt.lat) || isNaN(pt.lng)) return null;
          return (
            <Marker
              key={`route-pt-${idx}-${pt.lat}-${pt.lng}`}
              position={[pt.lat, pt.lng]}
              icon={createPointIcon(pt.type || 'pickup', pt.label)}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
