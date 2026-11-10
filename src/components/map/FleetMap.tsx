'use client';

import React, { useEffect, useState } from 'react';
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

    // Only update Leaflet view when coordinates or zoom actually change
    if (latDiff > 0.0002 || lngDiff > 0.0002 || zoomChanged) {
      map.setView([lat, lng], zoom, { animate: true });
    }
  }, [lat, lng, zoom, map]);

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
    ? 'border-2 border-black ring-2 ring-white scale-110 shadow-lg'
    : 'border-2 border-white shadow-md';

  const badgeHtml = isEstimated
    ? `<span class="absolute -top-2 -right-3.5 px-1 py-0.2 bg-amber-300 text-amber-950 border border-black rounded text-[9px] font-black shadow-[1px_1px_0px_0px_#000] z-20 pointer-events-none whitespace-nowrap" title="Akurasi Estimasi: ±${Math.round(accuracyM)}m">±${Math.round(accuracyM)}m</span>`
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
  const bg = isPickup ? '#047857' : '#e11d48';
  return L.divIcon({
    className: 'route-point-div-icon',
    html: `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-bold shadow-lg border-2 border-white" style="background-color: ${bg};">
          <span>${isPickup ? '●' : '■'}</span>
          <span class="max-w-[120px] truncate">${label}</span>
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
  center = [-6.2088, 106.8456], // Default Jakarta / Ops center
  zoom = 13,
  className = 'h-[500px] w-full',
  routePoints,
}: FleetMapProps) {
  // Center on selected vehicle if explicitly chosen, otherwise use center prop (e.g. selected Hub)
  const targetVehicle = selectedVehicleId
    ? vehicles.find((v) => v.vehicleId === selectedVehicleId)
    : null;

  const mapCenter: [number, number] = targetVehicle && !isNaN(targetVehicle.lat) && !isNaN(targetVehicle.lng)
    ? [targetVehicle.lat, targetVehicle.lng]
    : center;

  return (
    <div className={`relative rounded-[1.625rem] overflow-hidden isolate ${className}`}>
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

        <MapUpdater center={mapCenter} zoom={zoom} />

        {vehicles.map((v) => {
          if (isNaN(v.lat) || isNaN(v.lng)) return null;
          const isSelected = v.vehicleId === selectedVehicleId;
          const visual = getVehicleConditionVisual(v.status, v.movement);
          const icon = createVehicleIcon(v.status, v.movement, isSelected, v.accuracyM);
          const rawPhone = v.driverPhone ? v.driverPhone.replace(/\D/g, '') : '';
          const waUrl = rawPhone ? `https://wa.me/${rawPhone}` : null;
          const isMoving = v.movement === 'MOVING';

          return (
            <React.Fragment key={v.vehicleId}>
              {/* GPS Accuracy Radius Circle */}
              {typeof v.accuracyM === 'number' && v.accuracyM > 0 && (
                <Circle
                  center={[v.lat, v.lng]}
                  radius={Math.max(v.accuracyM, 5)}
                  pathOptions={{
                    color: '#2563eb',
                    fillColor: '#3b82f6',
                    fillOpacity: isSelected ? 0.22 : 0.16,
                    weight: isSelected ? 1.5 : 1,
                    opacity: 0.7,
                  }}
                >
                  <Tooltip direction="center" permanent={false} opacity={0.92}>
                    <span className="font-sans text-xs font-bold text-zinc-900">
                      {v.accuracyM > 100
                        ? `⚠️ Akurasi Estimasi: ±${Math.round(v.accuracyM)} m (Wi-Fi/Seluler)`
                        : v.accuracyM < 20
                        ? `✓ Akurasi Tinggi: ±${Math.round(v.accuracyM)} m (Satelit Lock)`
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
                    <span className="font-sans text-[10px] font-black text-amber-950 bg-amber-100 border border-amber-600 px-1.5 py-0.5 rounded shadow-xs">
                      ⚠️ Akurasi Estimasi: ±{Math.round(v.accuracyM)} m
                    </span>
                  </Tooltip>
                )}
                <Popup className="custom-leaflet-popup">
                  <div className="p-1 min-w-[210px] text-zinc-900 font-sans">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-200 pb-2 mb-2">
                      <span className="font-bold text-sm tracking-tight">{v.plateNumber}</span>
                      <StatusBadge status={v.status} />
                    </div>

                    {(v.homeLocation || v.currentOperationalLocation) && (
                      <div className="flex flex-wrap items-center gap-1 pb-2 mb-2 border-b border-zinc-100">
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
                        <div className="text-zinc-600 font-semibold">
                          {v.brand} {v.model}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-100">
                        <span className="text-zinc-500 font-medium">Condition:</span>
                        <span
                          className="font-bold text-[10px] px-2 py-0.5 rounded text-white tracking-wide"
                          style={{ backgroundColor: visual.color }}
                        >
                          {visual.badgeText}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-zinc-500">Movement:</span>
                        <MovementBadge movement={v.movement} />
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-zinc-500">Accuracy:</span>
                        <GPSBadge accuracyM={v.accuracyM} showDetails={true} />
                      </div>
                      {typeof v.accuracyM === 'number' && v.accuracyM > 100 && (
                        <div className="rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          ⚠️ Posisi estimasi seluler/Wi-Fi (radius ±{Math.round(v.accuracyM)} m)
                        </div>
                      )}
                      {typeof v.accuracyM === 'number' && v.accuracyM < 20 && (
                        <div className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                          ✓ Akurasi tinggi (satelit GPS terkunci)
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-zinc-500">Updated:</span>
                        <RelativeTime date={v.recordedAt} />
                      </div>

                      {v.driverName ? (
                        <div className="pt-2 border-t border-zinc-100">
                          <div className="text-zinc-500 text-[11px]">Assigned Driver:</div>
                          <div className="font-semibold text-zinc-800">{v.driverName}</div>
                          {v.driverPhone && v.driverPhone !== 'REDACTED' && (
                            <div className="mt-1">
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline text-xs"
                                >
                                  <span>WhatsApp: {v.driverPhone}</span>
                                </a>
                              ) : (
                                <span className="text-zinc-600">{v.driverPhone}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-400 italic">
                          {v.status === 'MAINTENANCE'
                            ? 'Unit under workshop maintenance'
                            : v.status === 'INACTIVE'
                            ? 'Unit non-operational'
                            : 'Standby in operational pool'}
                        </div>
                      )}

                      {(v.tripOrigin || v.tripDestination) && (
                        <div className="pt-1.5 border-t border-zinc-100 text-[11px] text-zinc-600">
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
