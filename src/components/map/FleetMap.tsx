'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { LocationBadge } from '@/components/ui/LocationBadge';

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

function createVehicleIcon(movement: string, isSelected: boolean) {
  const normMovement = movement ? movement.toUpperCase() : 'STOPPED';
  const isMoving = normMovement === 'MOVING';
  const isGpsLost = normMovement === 'GPS_LOST';
  const isOffline = normMovement === 'OFFLINE';

  let color = '#62766b'; // stationary
  if (isMoving) color = '#18765b'; // moving
  else if (isGpsLost) color = '#d97706'; // amber
  else if (isOffline) color = '#dc2626'; // red

  const pulseHtml = (isMoving || isSelected)
    ? `<span class="absolute -inset-1 rounded-full bg-emerald-400 opacity-60 animate-ping"></span>`
    : '';

  return L.divIcon({
    className: 'vehicle-div-icon',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full text-white border-2 border-white cursor-pointer" style="background-color: ${color};">
        ${pulseHtml}
        <svg class="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" d="m5 8 2-4h10l2 4 2 3v7h-3v-2H6v2H3v-7l2-3Zm0 0h14M3 12h18M7 13v1m10-1v1" />
        </svg>
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
          const icon = createVehicleIcon(v.movement, isSelected);
          const rawPhone = v.driverPhone ? v.driverPhone.replace(/\D/g, '') : '';
          const waUrl = rawPhone ? `https://wa.me/${rawPhone}` : null;

          return (
            <React.Fragment key={v.vehicleId}>
              {/* GPS Accuracy Circle */}
              {v.accuracyM && v.accuracyM > 0 && v.accuracyM <= 500 && (
                <Circle
                  center={[v.lat, v.lng]}
                  radius={v.accuracyM}
                  pathOptions={{
                    color: v.movement === 'MOVING' ? '#18765b' : '#7b8f84',
                    fillColor: v.movement === 'MOVING' ? '#18765b' : '#7b8f84',
                    fillOpacity: 0.12,
                    weight: 1,
                  }}
                />
              )}

              {/* Vehicle Marker */}
              <Marker
                title={v.plateNumber}
                alt={`Vehicle ${v.plateNumber}`}
                position={[v.lat, v.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onSelectVehicle?.(v),
                }}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="p-1 min-w-[200px] text-zinc-900 font-sans">
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
                        <div className="text-zinc-600">
                          {v.brand} {v.model}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-100">
                        <span className="text-zinc-500">Movement:</span>
                        <MovementBadge movement={v.movement} />
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-zinc-500">Accuracy:</span>
                        <GPSBadge accuracyM={v.accuracyM} showDetails={true} />
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-zinc-500">Updated:</span>
                        <RelativeTime date={v.recordedAt} />
                      </div>

                      {v.driverName && (
                        <div className="pt-2 border-t border-zinc-100">
                          <div className="text-zinc-500 text-[11px]">Driver:</div>
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
