'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { DispatchProgress, formatEta } from './DispatchProgress';

export interface LocationOption {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface PreferredVehicle {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType?: string;
  seatingCapacity: number;
  status?: string;
  homeLocationId?: string | null;
  currentLocationId?: string | null;
}

export interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (booking: any) => void;
  initialVehiclePreference?: PreferredVehicle | null;
  initialLocationId?: string;
}

export function BookingModal({
  isOpen,
  onClose,
  onSuccess,
  initialVehiclePreference,
  initialLocationId,
}: BookingModalProps) {
  const router = useRouter();

  // Locations list
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Form inputs
  const [operationalLocationId, setOperationalLocationId] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [departureAt, setDepartureAt] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [passengerCount, setPassengerCount] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

  // Specific vehicle preference (Option B)
  const [preferredVehicle, setPreferredVehicle] = useState<PreferredVehicle | null>(null);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [vehicleSearchResults, setVehicleSearchResults] = useState<PreferredVehicle[]>([]);
  const [isSearchingVehicles, setIsSearchingVehicles] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dispatch progress / Result states
  const [submittedBooking, setSubmittedBooking] = useState<any | null>(null);
  const [noDriverState, setNoDriverState] = useState<{
    booking: any;
    alternatives: Array<{ id: string; plateNumber: string; brand: string; model: string; seatingCapacity?: number }>;
  } | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setSubmittedBooking(null);
      setNoDriverState(null);
      setFormError(null);
      return;
    }

    // Default dates: now + 1hr, return now + 4hr
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const returnTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setDepartureAt(toLocalISO(now));
    setExpectedReturnAt(toLocalISO(returnTime));
    setPassengerCount(1);
    setPurpose('');
    setNotes('');
    setFormError(null);
    setSubmittedBooking(null);
    setNoDriverState(null);

    // Initial vehicle preference
    if (initialVehiclePreference) {
      setPreferredVehicle(initialVehiclePreference);
      if (initialVehiclePreference.currentLocationId) {
        setOperationalLocationId(initialVehiclePreference.currentLocationId);
      } else if (initialVehiclePreference.homeLocationId) {
        setOperationalLocationId(initialVehiclePreference.homeLocationId);
      }
    } else {
      setPreferredVehicle(null);
    }

    if (initialLocationId) {
      setOperationalLocationId(initialLocationId);
    }

    // Fetch operational locations
    async function loadLocations() {
      setLoadingLocations(true);
      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          const list: LocationOption[] = json.data || [];
          setLocations(list);
          if (list.length > 0 && !operationalLocationId && !initialLocationId && !initialVehiclePreference) {
            setOperationalLocationId(list[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingLocations(false);
      }
    }

    loadLocations();
  }, [isOpen, initialVehiclePreference, initialLocationId]);

  // Search vehicles when typing in vehicle preference search
  useEffect(() => {
    if (!vehicleSearchQuery.trim() || vehicleSearchQuery.trim().length < 2) {
      setVehicleSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingVehicles(true);
      try {
        const params = new URLSearchParams({
          search: vehicleSearchQuery.trim(),
          limit: '6',
        });
        if (operationalLocationId) {
          params.set('locationId', operationalLocationId);
        }
        const res = await fetch(`/api/vehicles?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          const list = json.data || json.vehicles || [];
          setVehicleSearchResults(list);
        }
      } catch {
        // ignore
      } finally {
        setIsSearchingVehicles(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [vehicleSearchQuery, operationalLocationId]);

  // Live polling for dispatch progress when booking submitted
  useEffect(() => {
    if (!submittedBooking || !submittedBooking.id) return;

    const bookingId = submittedBooking.id;
    const terminalStatuses = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_DRIVER_AVAILABLE'];

    const poll = async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        if (res.ok) {
          const json = await res.json();
          const updated = json.data || json.booking || json;
          setSubmittedBooking((prev: any) => ({
            ...prev,
            ...updated,
          }));

          if (terminalStatuses.includes(updated.status)) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
        }
      } catch {
        // ignore polling error
      }
    };

    pollIntervalRef.current = setInterval(poll, 3000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [submittedBooking?.id]);

  const handleSubmit = async (e?: React.FormEvent, overrideVehiclePreferenceId?: string) => {
    if (e) e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    if (!operationalLocationId) {
      setFormError('Operational location is required');
      setIsSubmitting(false);
      return;
    }

    if (!pickupLocation.trim()) {
      setFormError('Pickup location is required');
      setIsSubmitting(false);
      return;
    }

    if (!destination.trim()) {
      setFormError('Destination is required');
      setIsSubmitting(false);
      return;
    }

    const depDate = new Date(departureAt);
    const retDate = new Date(expectedReturnAt);

    if (isNaN(depDate.getTime()) || isNaN(retDate.getTime())) {
      setFormError('Please enter valid departure and return dates');
      setIsSubmitting(false);
      return;
    }

    if (retDate <= depDate) {
      setFormError('Return time must be after departure time');
      setIsSubmitting(false);
      return;
    }

    const vehiclePrefId =
      overrideVehiclePreferenceId !== undefined
        ? overrideVehiclePreferenceId
        : preferredVehicle?.id || undefined;

    try {
      const payload = {
        operationalLocationId,
        pickupLocation: pickupLocation.trim(),
        destination: destination.trim(),
        departureAt: depDate.toISOString(),
        expectedReturnAt: retDate.toISOString(),
        passengerCount: Number(passengerCount),
        purpose: purpose.trim(),
        notes: notes.trim() || undefined,
        vehiclePreferenceId: vehiclePrefId || undefined,
      };

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setFormError(json.error?.message || 'Failed to submit booking');
        return;
      }

      const bookingData = json.data || json;
      onSuccess?.(bookingData);

      // Check dispatchState
      if (bookingData.dispatchState === 'NO_DRIVER_AVAILABLE') {
        setNoDriverState({
          booking: bookingData,
          alternatives: bookingData.alternatives || [],
        });
      } else {
        setSubmittedBooking(bookingData);
      }
    } catch {
      setFormError('Network error submitting reservation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookAlternative = (alt: { id: string; plateNumber: string; brand: string; model: string; seatingCapacity?: number }) => {
    setPreferredVehicle({
      id: alt.id,
      plateNumber: alt.plateNumber,
      brand: alt.brand,
      model: alt.model,
      seatingCapacity: alt.seatingCapacity || passengerCount,
    });
    setNoDriverState(null);
    handleSubmit(undefined, alt.id);
  };

  // If showing dispatch progress view
  if (submittedBooking) {
    const isAssigned = [
      'DRIVER_ASSIGNED',
      'DRIVER_EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
    ].includes(submittedBooking.status);

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Reservation Submitted"
        description={`Booking Reference #${submittedBooking.bookingNumber || ''}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <DispatchProgress
            status={submittedBooking.status}
            etaSeconds={submittedBooking.etaSeconds}
            etaEstimated={submittedBooking.etaEstimated}
          />

          {/* Details */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs space-y-2">
            <div className="flex justify-between text-zinc-600">
              <span className="font-semibold text-zinc-800">Route:</span>
              <span className="text-right">
                {submittedBooking.pickupLocation} → {submittedBooking.destination}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span className="font-semibold text-zinc-800">Passengers:</span>
              <span>{submittedBooking.passengerCount} passenger(s)</span>
            </div>
            {submittedBooking.vehicle && (
              <div className="flex justify-between text-zinc-600 pt-1 border-t border-zinc-200">
                <span className="font-semibold text-zinc-800">Reserved Vehicle:</span>
                <span className="font-mono font-medium text-zinc-900">
                  {submittedBooking.vehicle.plateNumber} ({submittedBooking.vehicle.brand}{' '}
                  {submittedBooking.vehicle.model})
                </span>
              </div>
            )}
            {submittedBooking.driver && (
              <div className="flex justify-between text-zinc-600">
                <span className="font-semibold text-zinc-800">Assigned Driver:</span>
                <span className="font-medium text-zinc-900">
                  {submittedBooking.driver.user?.name || submittedBooking.driver.name}
                  {submittedBooking.driver.user?.phone && ` (${submittedBooking.driver.user.phone})`}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
            {isAssigned && submittedBooking.vehicle?.id && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/user/tracking?vehicleId=${submittedBooking.vehicle.id}`);
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Track Vehicle on Live Map →
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/user/bookings');
              }}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
            >
              View My Bookings
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded text-xs font-medium cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // If showing No Driver Available with alternatives
  if (noDriverState) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="No Driver Available"
        description="Auto-dispatch could not find an available online driver"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            <p className="font-semibold">All eligible drivers are currently busy or offline.</p>
            <p className="mt-1 text-amber-800">
              Your request was registered as reference #{noDriverState.booking?.bookingNumber}.
              You can choose an alternative available vehicle below, or wait for admin manual dispatch.
            </p>
          </div>

          {noDriverState.alternatives.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Alternative Vehicles at this Location ({noDriverState.alternatives.length})
              </h4>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {noDriverState.alternatives.map((alt) => (
                  <div
                    key={alt.id}
                    className="p-3 bg-white border border-zinc-200 hover:border-zinc-300 rounded-lg flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-zinc-900">{alt.plateNumber}</span>
                      <p className="text-zinc-600">
                        {alt.brand} {alt.model}
                        {alt.seatingCapacity && ` • ${alt.seatingCapacity} seats`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleBookAlternative(alt)}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded text-xs font-semibold cursor-pointer shrink-0"
                    >
                      {isSubmitting ? <Spinner size="sm" /> : 'Book Alternative'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-zinc-50 border border-dashed border-zinc-300 rounded-lg text-center text-xs text-zinc-500">
              No immediate alternative vehicles found at this location.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => {
                setNoDriverState(null);
              }}
              className="px-3.5 py-1.5 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded text-xs font-medium cursor-pointer"
            >
              Back to Form
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/user/bookings');
              }}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
            >
              Go to My Bookings
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reserve a Vehicle"
      description="Select operational location and trip details for auto-dispatch"
      maxWidth="lg"
    >
      <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}

        {/* Operational Location (Required) */}
        <FormField label="Operational Location" name="operationalLocation" required>
          {loadingLocations ? (
            <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
              <Spinner size="sm" /> Loading operational locations...
            </div>
          ) : (
            <select
              id="operationalLocation"
              value={operationalLocationId}
              onChange={(e) => {
                setOperationalLocationId(e.target.value);
                // Clear preferred vehicle if it doesn't belong to newly selected location
                if (
                  preferredVehicle &&
                  preferredVehicle.currentLocationId &&
                  preferredVehicle.currentLocationId !== e.target.value &&
                  preferredVehicle.homeLocationId !== e.target.value
                ) {
                  setPreferredVehicle(null);
                }
              }}
              required
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="" disabled>
                Select operational hub / base...
              </option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          )}
        </FormField>

        {/* Pickup & Destination */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Pickup Location" name="pickupLocation" required>
            <input
              id="pickupLocation"
              type="text"
              required
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
              placeholder="e.g. Halim Station Gate 2"
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <FormField label="Destination" name="destination" required>
            <input
              id="destination"
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Tegalluar Depot Office"
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>
        </div>

        {/* Departure & Return */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Departure Time" name="departureAt" required>
            <input
              id="departureAt"
              type="datetime-local"
              required
              value={departureAt}
              onChange={(e) => setDepartureAt(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <FormField label="Expected Return" name="expectedReturnAt" required>
            <input
              id="expectedReturnAt"
              type="datetime-local"
              required
              value={expectedReturnAt}
              onChange={(e) => setExpectedReturnAt(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>
        </div>

        {/* Passenger count & Purpose */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Passengers" name="passengerCount" required>
            <input
              id="passengerCount"
              type="number"
              min={1}
              max={preferredVehicle ? preferredVehicle.seatingCapacity : 50}
              required
              value={passengerCount}
              onChange={(e) => setPassengerCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <div className="sm:col-span-2">
            <FormField label="Purpose of Trip" name="purpose" required>
              <input
                id="purpose"
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Track maintenance inspection"
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>
        </div>

        {/* Specific Vehicle Preference (Option B - Optional) */}
        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
              Specific Vehicle Preference (Optional)
            </span>
            {preferredVehicle && (
              <button
                type="button"
                onClick={() => setPreferredVehicle(null)}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
              >
                Clear Preference
              </button>
            )}
          </div>

          {preferredVehicle ? (
            <div className="p-2.5 bg-white border border-zinc-300 rounded flex items-center justify-between text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-zinc-900">
                    {preferredVehicle.plateNumber}
                  </span>
                  {preferredVehicle.status && <StatusBadge status={preferredVehicle.status} />}
                </div>
                <div className="text-zinc-600 mt-0.5">
                  {preferredVehicle.brand} {preferredVehicle.model} • {preferredVehicle.seatingCapacity} seats
                  {preferredVehicle.vehicleType && ` • ${preferredVehicle.vehicleType}`}
                </div>
              </div>
              <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-semibold rounded uppercase">
                Selected
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text"
                placeholder="Search by license plate to request specific vehicle..."
                value={vehicleSearchQuery}
                onChange={(e) => setVehicleSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
              {isSearchingVehicles && (
                <div className="text-xs text-zinc-400 flex items-center gap-1.5 py-1">
                  <Spinner size="sm" /> Searching vehicles...
                </div>
              )}
              {vehicleSearchResults.length > 0 && (
                <div className="bg-white border border-zinc-200 rounded divide-y divide-zinc-100 max-h-40 overflow-y-auto">
                  {vehicleSearchResults.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setPreferredVehicle(v);
                        setVehicleSearchQuery('');
                        setVehicleSearchResults([]);
                      }}
                      className="w-full p-2 text-left hover:bg-zinc-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <span className="font-mono font-semibold text-zinc-900">{v.plateNumber}</span>
                        <span className="text-zinc-500 ml-2">
                          {v.brand} {v.model} ({v.seatingCapacity} seats)
                        </span>
                      </div>
                      <StatusBadge status={v.status || 'AVAILABLE'} />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-zinc-500">
                Leaving this empty allows auto-dispatch to assign the fastest eligible driver & vehicle.
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        <FormField label="Notes (Optional)" name="notes">
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Special equipment, contact details, or operational instructions"
            className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
          />
        </FormField>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded text-xs font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>Submit Reservation</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
