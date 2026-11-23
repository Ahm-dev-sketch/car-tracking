'use client';

import React, { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FleetMap, VehicleMarkerData } from '@/components/map';
import { formatEta } from '@/components/booking/DispatchProgress';
import { Icon } from '@/components/ui/Icon';

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

  const fetchInterventions = async (isInitial = false) => {
    if (isInitial) setLoadingBookings(true);
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
      if (isInitial) setLoadingBookings(false);
    }
  };

  useEffect(() => {
    fetchInterventions(true);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchInterventions(false);
      }
    }, 20000);
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
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500" role="status">
        <Spinner size="md" className="mb-2" />
        <p className="font-medium">Checking dispatch intervention queue...</p>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex size-2 shrink-0 rounded-full bg-success-600" aria-hidden="true" />
          <span className="font-semibold text-success-700">Intervention Queue Clear</span>
          <span className="font-medium text-success-700">
            — All auto-dispatch requests have been fulfilled or assigned.
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-success-200 bg-white px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-success-700">
          0 PENDING ESCALATIONS
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex size-2 shrink-0 rounded-full bg-warning-600 status-ping" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Admin Intervention Queue <span className="font-mono tabular-nums text-slate-400">({bookings.length})</span>
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-[11px] font-medium text-warning-700">
          <Icon name="alert" className="size-3 shrink-0" />
          Auto-dispatch timeout reached — Manual driver assignment required
        </span>
      </div>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2.5 text-xs font-medium text-success-700">
          <Icon name="check" className="size-4 shrink-0 text-success-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Select booking pill list if multiple */}
      {bookings.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {bookings.map((b) => {
            const active = b.id === selectedBookingId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBookingId(b.id)}
                aria-pressed={active}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  active
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="font-mono tabular-nums">#{b.bookingNumber}</span> ({b.pickupLocation} → {b.destination})
              </button>
            );
          })}
        </div>
      )}

      {selectedBooking && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Booking Summary Card */}
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-xs">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                #{selectedBooking.bookingNumber}
              </span>
              <StatusBadge status="ADMIN_INTERVENTION" />
            </div>

            {selectedBooking.operationalLocation && (
              <div className="font-medium text-slate-500">
                <span className="font-semibold text-slate-700">Hub: </span>
                {selectedBooking.operationalLocation.name} ({selectedBooking.operationalLocation.code})
              </div>
            )}

            <div className="space-y-2 border-t border-slate-100 pt-2">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pickup</span>
                <span className="font-medium text-slate-800">{selectedBooking.pickupLocation}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Destination</span>
                <span className="font-medium text-slate-800">{selectedBooking.destination}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Passengers</span>
                <span className="font-medium tabular-nums text-slate-800">{selectedBooking.passengerCount} Persons</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Departure</span>
                <span className="font-mono font-medium tabular-nums text-slate-800">
                  {new Date(selectedBooking.departureAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {selectedBooking.purpose && (
              <div className="border-t border-slate-100 pt-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Purpose</span>
                <p className="mt-0.5 font-medium text-slate-700">{selectedBooking.purpose}</p>
              </div>
            )}
          </div>

          {/* Candidate Drivers & Mini Map */}
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Eligible Candidate Drivers <span className="font-mono tabular-nums">({candidates.length})</span>
              </span>
              {loadingCandidates && <Spinner size="sm" />}
            </div>

            {/* Mini Map of Candidate Drivers */}
            {candidateMarkers.length > 0 && (
              <div className="h-44 w-full overflow-hidden rounded-lg border border-slate-200">
                <FleetMap
                  vehicles={candidateMarkers}
                  className="h-full w-full"
                />
              </div>
            )}

            {/* Candidate List */}
            {candidates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs font-medium text-slate-500">
                {loadingCandidates
                  ? 'Scanning online drivers near pickup location...'
                  : 'No active eligible drivers found with fresh GPS in this location.'}
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
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
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{driverName}</span>
                          {c.phone && <span className="font-mono tabular-nums text-slate-400">({c.phone})</span>}
                          {etaText && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-info-200 bg-info-50 px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums text-info-700">
                              ETA: {etaText}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 font-medium text-slate-500">
                          <span className="font-mono font-semibold tracking-wide tabular-nums text-slate-700">{plate}</span>
                          {(c.vehicleBrand || c.vehicleModel) && (
                            <span className="truncate">
                              • {c.vehicleBrand} {c.vehicleModel}
                            </span>
                          )}
                          {c.seatingCapacity && <span>• {c.seatingCapacity} seats</span>}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                          >
                            <Icon name="message" className="size-3.5 shrink-0" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        <button
                          type="button"
                          disabled={Boolean(assigningDriverId)}
                          onClick={() => handleManualAssign(c.driverId)}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isAssigning ? <Spinner size="sm" className="text-white" /> : 'Assign Driver'}
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
