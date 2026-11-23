'use client';

import React, { useEffect, useMemo } from 'react';
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

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const [lat, lng] = center;

  useEffect(() => {
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const latDiff = Math.abs(currentCenter.lat - lat);
    const lngDiff = Math.abs(currentCenter.lng - lng);
    const zoomChanged = currentZoom !== zoom;

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

  const pulseHtml = (isMoving || isSelected)
    ? `<span class="absolute -inset-1.5 rounded-full ${visual.pulseColor} opacity-75 animate-ping"></span>`
    : '';

  const selectedBorder = isSelected
    ? 'scale-110 shadow-lg border-2 border-white ring-2 ring-[#0f172a]/25'
    : 'border-2 border-white shadow-md';

  const badgeHtml = isEstimated
    ? `<span class="absolute -top-2 -right-3 rounded-full border border-[#fde68a] bg-[#fffbeb] px-1 py-0.5 text-[10px] font-semibold text-[#b45309] tabular-nums whitespace-nowrap">±${Math.round(accuracyM)}m</span>`
    : '';

  return L.divIcon({
    className: 'vehicle-div-icon',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full text-white cursor-pointer transition-transform ${selectedBorder}" style="background-color: ${visual.color};">
        ${pulseHtml}
        <svg class="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  const bg = isPickup ? '#059669' : '#C8102E';
  return L.divIcon({
    className: 'route-point-div-icon',
    html: `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div class="flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-[11px] font-semibold shadow-md border-2 border-white" style="background-color: ${bg};">
          <span class="size-2 rounded-full bg-white inline-block"></span>
          <span class="max-w-[130px] truncate">${label}</span>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}


export default function FleetMap({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  center = [-6.2088, 106.8456],
  zoom = 13,
  className = 'h-[500px] w-full',
  routePoints,
}: FleetMapProps) {
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

  const shouldFitBounds = fitPoints.length >= 2;

  return (
    <div className={`relative isolate overflow-hidden rounded-[var(--radius-xl)] ${className}`}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        className="z-0 h-full w-full"
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
              {typeof v.accuracyM === 'number' && v.accuracyM > 0 && (
                <Circle
                  center={[v.lat, v.lng]}
                  radius={Math.max(v.accuracyM, 5)}
                  pathOptions={{
                    color: '#0284C7',
                    fillColor: '#38BDF8',
                    fillOpacity: isSelected ? 0.2 : 0.12,
                    weight: isSelected ? 1.5 : 1,
                    opacity: 0.7,
                  }}
                >
                  <Tooltip direction="center" permanent={false} opacity={0.92}>
                    <span className="font-sans text-[0.6875rem] font-medium tabular-nums text-slate-700">
                      {v.accuracyM > 100
                        ? `Akurasi estimasi ±${Math.round(v.accuracyM)} m`
                        : `Akurasi ±${Math.round(v.accuracyM)} m`}
                    </span>
                  </Tooltip>
                </Circle>
              )}

              <Marker
                title={`${v.plateNumber} (${visual.badgeText})`}
                alt={`Kendaraan ${v.plateNumber}`}
                position={[v.lat, v.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onSelectVehicle?.(v),
                }}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="min-w-[200px] font-sans text-slate-900">
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <span className="mono-plate text-[0.8125rem] font-semibold">{v.plateNumber}</span>
                      <StatusBadge status={v.status} />
                    </div>

                    {(v.homeLocation || v.currentOperationalLocation) && (
                      <div className="mb-2 flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] pb-2">
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

                    <div className="space-y-1.5 text-[0.6875rem]">
                      {v.brand && (
                        <p className="font-medium text-slate-600">
                          {v.brand} {v.model}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-1.5">
                        <span className="text-slate-400">Kondisi</span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold text-white"
                          style={{ backgroundColor: visual.color }}
                        >
                          {visual.badgeText}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">Pergerakan</span>
                        <MovementBadge movement={v.movement} />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">Akurasi</span>
                        <GPSBadge accuracyM={v.accuracyM} showDetails={true} />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">Update</span>
                        <RelativeTime date={v.recordedAt} />
                      </div>

                      {v.driverName ? (
                        <div className="border-t border-[var(--border-subtle)] pt-2">
                          <p className="metric-label">Driver</p>
                          <p className="font-semibold text-slate-800">{v.driverName}</p>
                          {v.driverPhone && v.driverPhone !== 'REDACTED' && (
                            <div className="mt-1">
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[var(--status-active-fg)] hover:underline"
                                >
                                  <span className="mono-plate">WhatsApp {v.driverPhone}</span>
                                </a>
                              ) : (
                                <span className="mono-plate text-slate-600">{v.driverPhone}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="border-t border-[var(--border-subtle)] pt-2 text-[0.625rem] text-slate-400">
                          {v.status === 'MAINTENANCE'
                            ? 'Unit dalam perawatan bengkel'
                            : v.status === 'INACTIVE'
                              ? 'Unit non-operasional'
                              : 'Standby di pool stasiun'}
                        </p>
                      )}

                      {(v.tripOrigin || v.tripDestination) && (
                        <div className="space-y-0.5 border-t border-[var(--border-subtle)] pt-1.5 text-[0.625rem] text-slate-600">
                          {v.tripOrigin && <p>Dari: {v.tripOrigin}</p>}
                          {v.tripDestination && <p>Tujuan: {v.tripDestination}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

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
