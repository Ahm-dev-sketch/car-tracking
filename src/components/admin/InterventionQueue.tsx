'use client';

import React, { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FleetMap, VehicleMarkerData } from '@/components/map';
import { formatEta } from '@/components/booking/DispatchProgress';

export interface CandidateDriver {
  driverId: string;
  driverName?: string;
  name?: string;
  phone?: string | null;
  licenseNumber?: string;
  vehicleId?: string;
  plateNumber?: string;
  vehiclePlateNumber?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleType?: string;
  seatingCapacity?: number;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number;
  receivedAt?: string | Date | null;
  etaSeconds?: number | null;
  etaEstimated?: boolean;
  rank?: number;
}

export interface InterventionBooking {
  id: string;
  bookingNumber: string;
  pickupLocation: string;
  destination: string;
  departureAt: string;
  passengerCount: number;
  purpose: string;
  notes?: string | null;
  status: string;
  operationalLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export function InterventionQueue({ onAssigned }: { onAssigned?: () => void }) {
  const [bookings, setBookings] = useState<InterventionBooking[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDriver[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchInterventions = async () => {
    setLoadingBookings(true);
    try {
      const res = await fetch('/api/bookings?status=ADMIN_INTERVENTION&limit=20');
      if (res.ok) {
        const json = await res.json();
        const list: InterventionBooking[] = json.data || [];
        setBookings(list);
        if (list.length > 0 && !selectedBookingId) {
          setSelectedBookingId(list[0].id);
        } else if (list.length === 0) {
          setSelectedBookingId(null);
          setCandidates([]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    fetchInterventions();
    const interval = setInterval(fetchInterventions, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch candidates when a booking is selected
  useEffect(() => {
    if (!selectedBookingId) {
      setCandidates([]);
      return;
    }

    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      setActionError(null);
      try {
        const res = await fetch(`/api/admin/dispatch/${selectedBookingId}/candidates`);
        if (res.ok) {
          const json = await res.json();
          setCandidates(json.data || []);
        } else {
          const err = await res.json();
          setActionError(err.error?.message || 'Failed to load driver candidates');
        }
      } catch {
        setActionError('Network error loading candidate drivers');
      } finally {
        setLoadingCandidates(false);
      }
    };

    fetchCandidates();
  }, [selectedBookingId]);

  const handleManualAssign = async (driverId: string) => {
    if (!selectedBookingId) return;
    setAssigningDriverId(driverId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/bookings/${selectedBookingId}/manual-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId }),
      });

      if (res.ok) {
        setSuccessMessage('Driver manually assigned successfully.');
        onAssigned?.();
        await fetchInterventions();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to manually assign driver');
      }
    } catch {
      setActionError('Network error during manual assignment');
    } finally {
      setAssigningDriverId(null);
    }
  };

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId);

  // Map candidate locations into VehicleMarkerData for FleetMap
  const candidateMarkers: VehicleMarkerData[] = candidates
    .filter((c) => c.lat !== null && c.lat !== undefined && c.lng !== null && c.lng !== undefined)
    .map((c) => ({
      vehicleId: c.vehicleId || c.driverId,
      plateNumber: c.plateNumber || c.vehiclePlateNumber || 'VEHICLE',
      brand: c.vehicleBrand || '',
      model: c.vehicleModel || '',
      status: 'AVAILABLE',
      driverName: c.driverName || c.name || null,
      driverPhone: c.phone || null,
      lat: c.lat!,
      lng: c.lng!,
      accuracyM: c.accuracyM || 15,
      speedMps: null,
      headingDeg: null,
      recordedAt: c.receivedAt ? new Date(c.receivedAt).toISOString() : new Date().toISOString(),
      movement: 'STOPPED',
    }));

  if (loadingBookings && bookings.length === 0) {
    return (
      <div className="p-8 text-center bg-white border border-zinc-200 rounded-lg text-zinc-500 text-xs">
        <Spinner size="md" className="mb-2" />
        <p>Checking dispatch intervention queue...</p>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-semibold">Intervention Queue Clear</span>
          <span className="text-emerald-700">
            — All auto-dispatch requests have been fulfilled or assigned.
          </span>
        </div>
        <span className="text-[11px] font-mono text-emerald-800">0 PENDING ESCALATIONS</span>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-orange-300 rounded-lg p-5 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-orange-100 gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-950">
            Admin Intervention Queue ({bookings.length})
          </h2>
        </div>
        <span className="text-xs text-orange-800 font-medium">
          Auto-dispatch timeout reached — Manual driver assignment required
        </span>
      </div>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs font-medium">
          ✓ {successMessage}
        </div>
      )}

      {/* Select booking pill list if multiple */}
      {bookings.length > 1 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {bookings.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBookingId(b.id)}
              className={`px-3 py-1 text-xs rounded font-semibold border cursor-pointer transition-colors ${
                b.id === selectedBookingId
                  ? 'bg-orange-600 text-white border-orange-600'
                  : 'bg-orange-50 text-orange-900 border-orange-200 hover:bg-orange-100'
              }`}
            >
              #{b.bookingNumber} ({b.pickupLocation} → {b.destination})
            </button>
          ))}
        </div>
      )}

      {selectedBooking && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Booking Summary Card */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-zinc-900">
                #{selectedBooking.bookingNumber}
              </span>
              <StatusBadge status="ADMIN_INTERVENTION" />
            </div>

            {selectedBooking.operationalLocation && (
              <div className="text-zinc-600">
                <span className="font-semibold text-zinc-700">Hub: </span>
                {selectedBooking.operationalLocation.name} ({selectedBooking.operationalLocation.code})
              </div>
            )}

            <div className="space-y-1.5 pt-2 border-t border-zinc-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Pickup</span>
                <span className="font-semibold text-zinc-800">{selectedBooking.pickupLocation}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Destination</span>
                <span className="font-semibold text-zinc-800">{selectedBooking.destination}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200 text-zinc-600">
              <div>
                <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Passengers</span>
                <span className="font-medium text-zinc-800">{selectedBooking.passengerCount} Persons</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Departure</span>
                <span className="font-medium text-zinc-800">
                  {new Date(selectedBooking.departureAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {selectedBooking.purpose && (
              <div className="pt-2 border-t border-zinc-200 text-zinc-600">
                <span className="text-[10px] uppercase font-semibold text-zinc-400 block">Purpose</span>
                <p className="mt-0.5">{selectedBooking.purpose}</p>
              </div>
            )}
          </div>

          {/* Candidate Drivers & Mini Map */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                Eligible Candidate Drivers ({candidates.length})
              </span>
              {loadingCandidates && <Spinner size="sm" />}
            </div>

            {/* Mini Map of Candidate Drivers */}
            {candidateMarkers.length > 0 && (
              <div className="h-44 w-full rounded border border-zinc-200 overflow-hidden">
                <FleetMap
                  vehicles={candidateMarkers}
                  className="h-full w-full"
                />
              </div>
            )}

            {/* Candidate List */}
            {candidates.length === 0 ? (
              <div className="p-6 bg-zinc-50 border border-dashed border-zinc-300 rounded text-center text-xs text-zinc-500">
                {loadingCandidates
                  ? 'Scanning online drivers near pickup location...'
                  : 'No active eligible drivers found with fresh GPS in this location.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {candidates.map((c) => {
                  const driverName = c.driverName || c.name || 'Driver';
                  const plate = c.plateNumber || c.vehiclePlateNumber || '—';
                  const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
                  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
                  const isAssigning = assigningDriverId === c.driverId;
                  const etaText = formatEta(c.etaSeconds, c.etaEstimated);

                  return (
                    <div
                      key={c.driverId}
                      className="p-3 bg-white border border-zinc-200 hover:border-zinc-300 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900">{driverName}</span>
                          {c.phone && <span className="text-zinc-500">({c.phone})</span>}
                          {etaText && (
                            <span className="font-mono text-[10px] font-semibold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              ETA: {etaText}
                            </span>
                          )}
                        </div>

                        <div className="text-zinc-600 flex items-center gap-2">
                          <span className="font-mono font-semibold text-zinc-800">{plate}</span>
                          {(c.vehicleBrand || c.vehicleModel) && (
                            <span>
                              • {c.vehicleBrand} {c.vehicleModel}
                            </span>
                          )}
                          {c.seatingCapacity && <span>• {c.seatingCapacity} seats</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <span>💬 WhatsApp</span>
                          </a>
                        )}

                        <button
                          type="button"
                          disabled={Boolean(assigningDriverId)}
                          onClick={() => handleManualAssign(c.driverId)}
                          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                        >
                          {isAssigning ? <Spinner size="sm" /> : 'Assign Driver'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
