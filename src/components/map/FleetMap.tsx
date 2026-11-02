'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';

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
}

interface FleetMapProps {
  vehicles: VehicleMarkerData[];
  selectedVehicleId?: string | null;
  onSelectVehicle?: (vehicle: VehicleMarkerData) => void;
  center?: [number, number];
  zoom?: number;
  className?: string;
}

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function createVehicleIcon(movement: string, isSelected: boolean) {
  const normMovement = movement ? movement.toUpperCase() : 'STOPPED';
  const isMoving = normMovement === 'MOVING';
  const isGpsLost = normMovement === 'GPS_LOST';
  const isOffline = normMovement === 'OFFLINE';

  let color = '#2563eb'; // blue
  if (isMoving) color = '#059669'; // emerald
  else if (isGpsLost) color = '#d97706'; // amber
  else if (isOffline) color = '#dc2626'; // red

  const pulseHtml = (isMoving || isSelected)
    ? `<span class="absolute -inset-1 rounded-full bg-emerald-400 opacity-60 animate-ping"></span>`
    : '';

  return L.divIcon({
    className: 'vehicle-div-icon',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full text-white shadow-lg border-2 border-white cursor-pointer" style="background-color: ${color};">
        ${pulseHtml}
        <svg class="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h8m-8 4h8m-4 4h4m2 4H6a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2z" />
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

export default function FleetMap({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  center = [-6.2088, 106.8456], // Default Jakarta / Ops center
  zoom = 13,
  className = 'h-[500px] w-full',
}: FleetMapProps) {
  // If there are vehicles, center on the first one or selected one
  const targetVehicle = selectedVehicleId
    ? vehicles.find((v) => v.vehicleId === selectedVehicleId)
    : vehicles[0];

  const mapCenter: [number, number] = targetVehicle && !isNaN(targetVehicle.lat) && !isNaN(targetVehicle.lng)
    ? [targetVehicle.lat, targetVehicle.lng]
    : center;

  return (
    <div className={`relative rounded-lg overflow-hidden border border-zinc-200 ${className}`}>
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

        {targetVehicle && <MapUpdater center={mapCenter} zoom={zoom} />}

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
                    color: v.movement === 'MOVING' ? '#10b981' : '#3b82f6',
                    fillColor: v.movement === 'MOVING' ? '#10b981' : '#3b82f6',
                    fillOpacity: 0.12,
                    weight: 1,
                  }}
                />
              )}

              {/* Vehicle Marker */}
              <Marker
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
      </MapContainer>
    </div>
  );
}
