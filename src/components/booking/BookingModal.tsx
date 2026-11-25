'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Icon } from '@/components/ui/Icon';
import { DispatchProgress, formatEta } from './DispatchProgress';
import { findNearestHub } from '@/lib/operational-locations';
import { reverseGeocodeWithCache } from '@/lib/client-geocode-cache';
import { enqueueOfflineAction } from '@/lib/offline-sync';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { looksLikeGoogleMapsUrl, isShortLink, parseGoogleMapsUrl } from '@/lib/google-maps-url';

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
  initialDestinationUrl?: string | null;
}

export function BookingModal({
  isOpen,
  onClose,
  onSuccess,
  initialVehiclePreference,
  initialLocationId,
  initialDestinationUrl = null,
}: BookingModalProps) {
  const router = useRouter();
  const { locale, t, format } = useTranslation();

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

  // 2 Options: Drop Off vs Standby
  const [serviceType, setServiceType] = useState<'DROP_OFF' | 'STANDBY'>('DROP_OFF');
  const [dropOffDate, setDropOffDate] = useState('');
  const [dropOffTime, setDropOffTime] = useState('');

  // Specific vehicle preference (Option B)
  const [preferredVehicle, setPreferredVehicle] = useState<PreferredVehicle | null>(null);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [vehicleSearchResults, setVehicleSearchResults] = useState<PreferredVehicle[]>([]);
  const [isSearchingVehicles, setIsSearchingVehicles] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  // User GPS Location (Wajib)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [nearestHubName, setNearestHubName] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  // Destination link resolution (Google Maps share links)
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [destinationLinkError, setDestinationLinkError] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationsLoadedRef = useRef(false);
  const userManuallySelectedRef = useRef(false);
  const initialDestinationHandledRef = useRef(false);

  const requestUserLocation = useCallback((locationList?: LocationOption[]) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unsupported');
      return;
    }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        setUserCoords({ lat, lng, accuracyM: acc });
        setGeoStatus('granted');

        // Reverse geocode with IndexedDB/LocalStorage client cache
        setIsResolvingAddress(true);
        reverseGeocodeWithCache(lat, lng, nearestHubName || null)
          .then((addr) => {
            setResolvedAddress(addr);
          })
          .catch(() => {
            setResolvedAddress(nearestHubName || null);
          })
          .finally(() => {
            setIsResolvingAddress(false);
          });

        // Auto-match nearest Operational Location if not manually overridden by user or props
        if (locationList && locationList.length > 0 && !initialVehiclePreference && !initialLocationId && !userManuallySelectedRef.current) {
          const nearest = findNearestHub(lat, lng, locationList);
          if (nearest) {
            setOperationalLocationId(nearest.location.id);
            setNearestHubName(`${nearest.location.name} (${nearest.location.code})`);
          }
        }
      },
      () => {
        setGeoStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [initialVehiclePreference, initialLocationId]);

  // Dispatch progress / Result states
  const [submittedBooking, setSubmittedBooking] = useState<any | null>(null);
  const [noDriverState, setNoDriverState] = useState<{
    booking: any;
    alternatives: Array<{ id: string; plateNumber: string; brand: string; model: string; seatingCapacity?: number }>;
  } | null>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      locationsLoadedRef.current = false;
      userManuallySelectedRef.current = false;
      initialDestinationHandledRef.current = false;
      setSubmittedBooking(null);
      setNoDriverState(null);
      setFormError(null);
      setOfflineNotice(null);
      setDestinationCoords(null);
      setDestinationLinkError(null);
      setDestination('');
      return;
    }

    // Default dates: now + 1hr, return now + 4hr
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const returnTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    setDepartureAt(toLocalISO(now));
    setExpectedReturnAt(toLocalISO(returnTime));
    setDropOffDate(todayStr);
    setDropOffTime(timeStr);
    setServiceType('DROP_OFF');
    setPassengerCount(1);
    setPurpose('');
    setNotes('');
    setFormError(null);
    setOfflineNotice(null);
    setSubmittedBooking(null);
    setNoDriverState(null);
    setNearestHubName(null);
    setResolvedAddress(null);

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

    // Proactively acquire user GPS location
    requestUserLocation();

    // Resolve an initial destination URL from a share-target flow (once per open).
    if (initialDestinationUrl && !initialDestinationHandledRef.current) {
      initialDestinationHandledRef.current = true;
      void handleDestinationChange(initialDestinationUrl);
    }

    // Fetch operational locations
    async function loadLocations() {
      if (locations.length === 0) setLoadingLocations(true);
      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          const list: LocationOption[] = json.data || [];
          setLocations(list);
          if (list.length > 0 && !operationalLocationId && !initialLocationId && !initialVehiclePreference && !userManuallySelectedRef.current) {
            setOperationalLocationId(list[0].id);
          }
          // Re-evaluate nearest hub once location list is loaded
          requestUserLocation(list);
        }
      } catch {
        // ignore
      } finally {
        setLoadingLocations(false);
      }
    }

    // Fetch operational locations (only once per open)
    if (!locationsLoadedRef.current) {
      locationsLoadedRef.current = true;
      loadLocations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- requestUserLocation is stable enough; including it causes an infinite fetch loop
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
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
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

    pollIntervalRef.current = setInterval(poll, 5000); // 5s interval with visibility protection
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [submittedBooking?.id]);

  const handleDestinationChange = async (value: string) => {
    setDestination(value);

    if (!looksLikeGoogleMapsUrl(value)) {
      setDestinationCoords(null);
      setDestinationLinkError(null);
      return;
    }

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    // Fast path: full (non-short) Google Maps URLs with coords resolve locally, no server round-trip.
    if (!isShortLink(value)) {
      const parsed = parseGoogleMapsUrl(value);
      if (parsed) {
        setDestination(parsed.label);
        setDestinationCoords({ lat: parsed.lat, lng: parsed.lng });
        setDestinationLinkError(null);
        return; // no network
      }
      // Full URL but no coords (text-only place/search) — fall through to server for Nominatim.
    }

    if (isOffline) {
      if (isShortLink(value)) {
        setDestinationLinkError(
          t.bookingModal.offlineShortLinkError
        );
        return;
      }

      // Text-only full URL while offline: no coords to extract and no server available.
      setDestinationLinkError(t.bookingModal.offlineTextLinkError);
      return;
    }

    setIsResolvingLink(true);
    try {
      const res = await fetch('/api/maps/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      });

      if (res.ok) {
        const json = await res.json();
        setDestination(json.data.label);
        setDestinationCoords({ lat: json.data.lat, lng: json.data.lng });
        setDestinationLinkError(null);
      } else {
        const json = await res.json().catch(() => null);
        setDestinationLinkError(json?.error?.message || t.bookingModal.offlineTextLinkError);
      }
    } catch {
      setDestinationLinkError(t.bookingModal.serverLinkError);
    } finally {
      setIsResolvingLink(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, overrideVehiclePreferenceId?: string) => {
    if (e) e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    if (!operationalLocationId) {
      setFormError(t.bookingModal.validationLocationRequired);
      setIsSubmitting(false);
      return;
    }

    if (!userCoords && geoStatus === 'denied') {
      setFormError(t.bookingModal.gpsRequiredSubmit);
      setIsSubmitting(false);
      return;
    }

    if (!pickupLocation.trim()) {
      setFormError(t.bookingModal.validationPickupRequired);
      setIsSubmitting(false);
      return;
    }

    if (!destination.trim()) {
      setFormError(t.bookingModal.validationDestRequired);
      setIsSubmitting(false);
      return;
    }

    const isDropOff = serviceType === 'DROP_OFF';
    let depDate: Date;
    let retDate: Date;

    if (isDropOff) {
      if (!dropOffDate) {
        setFormError(t.bookingModal.validationDropOffDate);
        setIsSubmitting(false);
        return;
      }
      if (!dropOffTime) {
        setFormError(t.bookingModal.validationDropOffTime);
        setIsSubmitting(false);
        return;
      }
      depDate = new Date(`${dropOffDate}T${dropOffTime}:00`);
      if (isNaN(depDate.getTime())) {
        setFormError(t.bookingModal.validationInvalidDateTime);
        setIsSubmitting(false);
        return;
      }
      // Waktu kembali otomatis 3 jam setelah jam jemput
      retDate = new Date(depDate.getTime() + 3 * 60 * 60 * 1000);
    } else {
      if (!departureAt || !expectedReturnAt) {
        setFormError(t.bookingModal.validationStandbyTimes);
        setIsSubmitting(false);
        return;
      }
      depDate = new Date(departureAt);
      retDate = new Date(expectedReturnAt);

      if (isNaN(depDate.getTime()) || isNaN(retDate.getTime())) {
        setFormError(t.bookingModal.validationInvalidStandbyFormat);
        setIsSubmitting(false);
        return;
      }

      if (retDate <= depDate) {
        setFormError(t.bookingModal.validationReturnAfterDep);
        setIsSubmitting(false);
        return;
      }

      if (!purpose.trim()) {
        setFormError(t.bookingModal.validationPurposeStandby);
        setIsSubmitting(false);
        return;
      }
    }

    const vehiclePrefId =
      overrideVehiclePreferenceId !== undefined
        ? overrideVehiclePreferenceId
        : preferredVehicle?.id || undefined;

    const effectivePurpose = purpose.trim() || (isDropOff ? t.bookingModal.dropOffDefaultPurpose : '');
    const autoNote = isDropOff
      ? [notes.trim(), format(t.bookingModal.dropOffAutoNoteTag, { date: dropOffDate, time: dropOffTime })].filter(Boolean).join(' ')
      : notes.trim() || undefined;

    const payload = {
      operationalLocationId,
      pickupLocation: pickupLocation.trim(),
      destination: destination.trim(),
      departureAt: depDate.toISOString(),
      expectedReturnAt: retDate.toISOString(),
      passengerCount: Number(passengerCount),
      purpose: effectivePurpose,
      notes: autoNote || undefined,
      serviceType,
      vehiclePreferenceId: vehiclePrefId || undefined,
      pickupLat: userCoords?.lat ?? null,
      pickupLng: userCoords?.lng ?? null,
      destinationLat: destinationCoords?.lat ?? null,
      destinationLng: destinationCoords?.lng ?? null,
    };

    const enqueueAsOffline = () => {
      enqueueOfflineAction('USER_CREATE_BOOKING', {
        endpoint: '/api/bookings',
        method: 'POST',
        payload,
      });

      const optimisticBooking = {
        ...payload,
        bookingNumber: `OFFLINE-${Date.now().toString(36).toUpperCase()}`,
        status: 'OFFLINE_PENDING',
      };

      setOfflineNotice(
        t.bookingModal.offlineQueuedMessage
      );
      onSuccess?.(optimisticBooking);
      setIsSubmitting(false);
      setDestinationCoords(null);
      setDestinationLinkError(null);
      onClose();
    };

    // Offline before even attempting the fetch
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueAsOffline();
      return;
    }

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setFormError(json.error?.message || t.bookingModal.failedSubmit);
        return;
      }

      const bookingData = json.data || json;
      onSuccess?.(bookingData);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('bookings:changed'));
      }
      setDestinationCoords(null);
      setDestinationLinkError(null);

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
      // Network failure => save on-device and enqueue for later (no red error)
      enqueueAsOffline();
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
    const isPending = submittedBooking.status === 'PENDING';
    const isAssigned = [
      'DRIVER_ASSIGNED',
      'DRIVER_EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
    ].includes(submittedBooking.status);

    const isSearching = [
      'SEARCHING_DRIVER',
      'DRIVER_NOTIFIED',
    ].includes(submittedBooking.status);

    const driverName = submittedBooking.driver?.user?.name || submittedBooking.driver?.name || t.nav.roles.DRIVER;
    const driverPhone = submittedBooking.driver?.user?.phone;
    const rawDriverPhone = driverPhone && driverPhone !== 'REDACTED' ? driverPhone.replace(/\D/g, '') : null;
    const etaText = formatEta(submittedBooking.etaSeconds, submittedBooking.etaEstimated, locale);

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          isAssigned
            ? t.bookingModal.driverFoundModalTitle
            : isPending
            ? t.bookingModal.submittedModalTitle
            : t.bookingModal.searchingModalTitle
        }
        description={format(t.bookingModal.bookingRefDesc, { number: submittedBooking.bookingNumber || '' })}
        maxWidth="lg"
      >
        <div className="space-y-5">
          {/* PENDING ADMIN REVIEW & DRIVER ASSIGNMENT VIEW */}
          {isPending && (
            <div className="space-y-4 py-1">
              <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-warning-200 bg-warning-100 text-warning-700">
                    <Icon name="calendar" className="size-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">{t.bookingModal.pendingTitle}</h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {t.bookingModal.pendingBody}
                    </p>
                  </div>
                </div>
              </div>

              {/* Route Summary Preview */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-left text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-medium text-slate-500">{t.bookingModal.serviceTypeLabel}</span>
                  <span className="rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                    {submittedBooking.serviceType === 'STANDBY' ? t.bookingModal.standbyModeLabel : t.bookingModal.dropOffModeLabel}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-success-50 text-[10px] leading-none text-success-600">
                    &#9679;
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.bookingModal.pickupLabelShort}</span>
                    <p className="truncate font-semibold text-slate-900">{submittedBooking.pickupLocation}</p>
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-200" aria-hidden="true" />
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-brand-50 text-[10px] leading-none text-brand-600">
                    &#9632;
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.bookingModal.destinationLabelShort}</span>
                    <p className="truncate font-semibold text-slate-900">{submittedBooking.destination}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                <p>
                  {t.bookingModal.pendingNote}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  {t.common.close}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push('/user/bookings');
                  }}
                  className="min-h-11 cursor-pointer rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  {t.bookingModal.viewMyBookingsBtn}
                </button>
              </div>
            </div>
          )}

          {/* GOJEK-STYLE RADAR SEARCHING VIEW */}
          {isSearching && (
            <div className="space-y-5 py-4 text-center">
              <div className="relative mx-auto flex size-36 items-center justify-center">
                <span aria-hidden="true" className="absolute size-full rounded-full border border-dashed border-brand-300 bg-brand-50 animate-ping duration-1000 motion-reduce:animate-none" />
                <span aria-hidden="true" className="absolute size-28 rounded-full border border-brand-200 bg-brand-100/60 animate-pulse motion-reduce:animate-none" />
                <span aria-hidden="true" className="absolute size-20 rounded-full border border-brand-200 bg-brand-50" />
                <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl border border-brand-200 bg-brand-600">
                  <Icon name="car" className="size-8 animate-bounce text-white motion-reduce:animate-none" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  {t.bookingModal.searchingHeading}
                </h3>
                <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-600">
                  {t.bookingModal.searchingBody}
                </p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3.5 py-1.5 text-xs font-medium text-warning-700">
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning-600 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-warning-600" />
                </span>
                <span>
                  {submittedBooking.status === 'DRIVER_NOTIFIED'
                    ? t.bookingModal.driverNotifiedHint2
                    : t.bookingModal.searchingConnectingHint}
                </span>
              </div>

              {/* Route Summary Preview */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 text-left text-xs">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-success-50 text-[10px] leading-none text-success-600">
                    &#9679;
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.bookingModal.pickupLabelShort}</span>
                    <p className="truncate font-semibold text-slate-900">{submittedBooking.pickupLocation}</p>
                  </div>
                </div>
                <div className="border-t border-dashed border-slate-200" aria-hidden="true" />
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-brand-50 text-[10px] leading-none text-brand-600">
                    &#9632;
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.bookingModal.destinationLabelShort}</span>
                    <p className="truncate font-semibold text-slate-900">{submittedBooking.destination}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GOJEK-STYLE DRIVER ACCEPTED / ASSIGNED VIEW */}
          {isAssigned && (
            <div className="space-y-4">
              {/* Banner */}
              <div className="rounded-xl border border-success-200 bg-success-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-success-200 bg-white text-success-600">
                      <Icon name="check" className="size-5" />
                    </span>
                    <div>
                      <h4 className="text-base font-semibold tracking-tight text-slate-900">{t.bookingModal.driverFoundHeading}</h4>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        {submittedBooking.status === 'ARRIVED'
                          ? t.bookingModal.driverArrivedMsg
                          : submittedBooking.status === 'IN_PROGRESS'
                          ? t.bookingModal.driverInProgressMsg
                          : t.bookingModal.driverEnRouteMsg}
                      </p>
                    </div>
                  </div>
                  {etaText && (
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium tabular-nums text-slate-700">
                      ETA {etaText}
                    </span>
                  )}
                </div>
              </div>

              {/* Driver & Vehicle Profile Card */}
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-xl font-semibold text-slate-700">
                      {driverName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-900">{driverName}</h4>
                        <span className="rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                          {t.nav.roles.DRIVER}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-500">
                        {submittedBooking.driver?.licenseNumber
                          ? `${t.bookingModal.licensePrefix} ${submittedBooking.driver.licenseNumber}`
                          : t.bookingModal.officialDriverBadge}
                      </p>
                    </div>
                  </div>

                  {/* Indonesian Vehicle License Plate Badge */}
                  {submittedBooking.vehicle && (
                    <div className="text-right">
                      <div className="inline-block rounded-lg border border-slate-300 bg-slate-900 px-3 py-1 font-mono text-sm font-semibold tracking-wider text-white tabular-nums">
                        {submittedBooking.vehicle.plateNumber}
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-slate-600">
                        {submittedBooking.vehicle.brand} {submittedBooking.vehicle.model}
                      </p>
                    </div>
                  )}
                </div>

                {/* Direct Contact Buttons (WhatsApp & Call) */}
                {rawDriverPhone && (
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                    <a
                      href={`https://wa.me/${rawDriverPhone}?text=${encodeURIComponent(
                        format(t.bookingModal.whatsappTemplate, {
                          driver: driverName,
                          bookingNumber: submittedBooking.bookingNumber || '',
                          pickup: submittedBooking.pickupLocation || '',
                        })
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    >
                      <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.074-2.001-.466-1.503-.623-2.529-2.115-2.607-2.219-.074-.103-.615-.818-.615-1.56 0-.743.391-1.107.531-1.258.14-.15.307-.188.409-.188.103 0 .205.004.296.009.096.005.225-.036.352.27.13.313.444 1.082.483 1.161.039.08.065.173.013.277-.052.103-.079.168-.156.259-.078.09-.163.201-.233.27-.08.077-.163.161-.07.32.093.16.413.682.886 1.103.609.543 1.123.711 1.282.79.16.08.254.07.348-.039.095-.109.406-.473.514-.635.109-.162.217-.135.367-.08.151.054.958.452 1.123.535.165.083.276.124.316.193.04.07.04.405-.104.81z"/>
                      </svg>
                      <span>{t.bookingModal.chatWhatsAppBtn}</span>
                    </a>

                    <a
                      href={`tel:${driverPhone}`}
                      className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      <Icon name="phone" className="size-4" />
                      <span>{t.bookingModal.callDriverBtn}</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Route Summary */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-500">{t.bookingModal.pickupStatusLabel}</span>
                  <StatusBadge status={submittedBooking.status} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="shrink-0 font-medium text-slate-500">{t.bookingModal.pickupLabelShort}</span>
                  <span className="max-w-[220px] truncate text-right font-semibold text-slate-900">
                    {submittedBooking.pickupLocation}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="shrink-0 font-medium text-slate-500">{t.bookingModal.destinationLabelShort}</span>
                  <span className="max-w-[220px] truncate text-right font-semibold text-slate-900">
                    {submittedBooking.destination}
                  </span>
                </div>
              </div>

              {/* Big Tracking CTA Button */}
              {submittedBooking.vehicle?.id && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(`/user/tracking?vehicleId=${submittedBooking.vehicle.id}`);
                    }}
                    className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                  >
                    <Icon name="tracking" className="size-5" />
                    <span>{t.bookingModal.trackDriverMapBtn}</span>
                    <Icon name="arrow" className="size-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex flex-col items-stretch justify-end gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/user/bookings');
              }}
              className="min-h-11 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {t.bookingModal.viewMyBookingsListBtn}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {t.common.close}
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
        title={t.bookingModal.noDriverModalTitle}
        description={t.bookingModal.noDriverModalDesc}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-xs leading-relaxed text-warning-700">
            <p className="font-semibold text-warning-700">{t.bookingModal.noDriverHeadline}</p>
            <p className="mt-1">
              {t.bookingModal.noDriverRefPrefix} <span className="font-mono font-semibold tabular-nums">#{noDriverState.booking?.bookingNumber}</span>.{' '}
              {t.bookingModal.noDriverAltHint}
            </p>
          </div>

          {noDriverState.alternatives.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {t.bookingModal.altVehiclesTitle} (<span className="tabular-nums">{noDriverState.alternatives.length}</span>)
              </h4>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {noDriverState.alternatives.map((alt) => (
                  <div
                    key={alt.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs transition-colors hover:border-slate-300"
                  >
                    <div>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">{alt.plateNumber}</span>
                      <p className="text-slate-600">
                        {alt.brand} {alt.model}
                        {alt.seatingCapacity && ` • ${alt.seatingCapacity} ${t.common.seats}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleBookAlternative(alt)}
                      className="inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isSubmitting ? <Spinner size="sm" /> : t.bookingModal.selectAlternativeBtn}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
              {t.bookingModal.noAltVehicles}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => {
                setNoDriverState(null);
              }}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t.bookingModal.backToFormBtn}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/user/bookings');
              }}
              className="min-h-9 cursor-pointer rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {t.bookingModal.goToMyBookingsBtn}
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
      title={t.bookingModal.formModalTitle}
      description={t.bookingModal.formModalDesc}
      maxWidth="2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            form="booking-form"
            disabled={isSubmitting}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:opacity-50"
          >
            {isSubmitting && <Spinner size="sm" className="text-white" />}
            <span>{t.bookingModal.submitReservationBtn}</span>
          </button>
        </>
      }
    >
      <form id="booking-form" onSubmit={(e) => handleSubmit(e)} className="space-y-4">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        {offlineNotice && (
          <div className="rounded-xl border border-success-200 bg-success-50 p-3 text-xs leading-relaxed text-success-700">
            {offlineNotice}
          </div>
        )}

        {/* Section: Rute & Lokasi */}
        <section className="space-y-3.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <header className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Icon name="route" className="size-4 shrink-0 text-brand-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.bookingModal.sectionRoute}</h3>
          </header>

          {/* GPS Location Banner (Wajib Bagi User) */}
          <div className={`rounded-lg border p-3.5 text-xs transition-colors duration-200 ${
            geoStatus === 'granted' && userCoords
              ? 'border-success-200 bg-success-50'
              : geoStatus === 'denied'
                ? 'border-danger-200 bg-danger-50'
                : 'border-warning-200 bg-warning-50'
          }`}>
            {geoStatus === 'locating' ? (
              <div className="flex items-center gap-2.5 font-medium text-warning-700">
                <Spinner size="sm" />
                <span>{t.bookingModal.gpsChecking}</span>
              </div>
            ) : geoStatus === 'granted' && userCoords ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-success-700">
                    <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-success-600 motion-reduce:animate-none" />
                    {t.bookingModal.gpsDetected}
                  </span>
                  <span className="rounded-md border border-success-200 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                    {format(t.bookingModal.gpsAccuracyTag, { accuracy: userCoords.accuracyM })}
                  </span>
                </div>
                <p className="min-w-0 break-words text-[11px] leading-relaxed text-slate-600">
                  {t.bookingModal.coordPrefix} <span className="tabular-nums">{userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}</span>
                  {nearestHubName ? ` ${format(t.bookingModal.nearestHubSuffix, { hub: nearestHubName })}` : ''}
                </p>
              </div>
            ) : geoStatus === 'denied' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-danger-700">
                    <Icon name="alert" className="size-4 text-danger-600" />
                    <span>{t.bookingModal.gpsDeniedTitle}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => requestUserLocation()}
                    className="min-h-9 cursor-pointer rounded-lg bg-brand-600 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    {t.bookingModal.gpsEnableBtn}
                  </button>
                </div>
                <p className="text-[11px] font-medium leading-relaxed text-danger-700">
                  {t.bookingModal.gpsDeniedDesc}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-warning-700">
                  <Icon name="pin" className="size-4 text-warning-600" />
                  <span>{t.bookingModal.gpsRequiredTitle}</span>
                </span>
                <button
                  type="button"
                  onClick={() => requestUserLocation()}
                  className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {t.bookingModal.gpsDetectBtn}
                </button>
              </div>
            )}
          </div>

          {/* Operational Location (Required) */}
          <FormField label={t.bookingModal.hubLabel} name="operationalLocation" required>
            {loadingLocations ? (
              <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                <Spinner size="sm" /> {t.bookingModal.loadingLocations}
              </div>
            ) : (
              <select
                id="operationalLocation"
                value={operationalLocationId}
                onChange={(e) => {
                  userManuallySelectedRef.current = true;
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
              >
                <option value="" disabled>
                  {t.bookingModal.hubPlaceholder}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t.bookingModal.pickupLabel} name="pickupLocation" required>
              <div className="min-w-0 space-y-1">
                <input
                  id="pickupLocation"
                  type="text"
                  required
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  placeholder={t.bookingModal.pickupPlaceholder}
                />
                {userCoords && (
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 pt-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const locationText =
                          resolvedAddress ||
                          nearestHubName ||
                          format(t.bookingModal.gpsPinCoordLabel, {
                            lat: userCoords.lat.toFixed(5),
                            lng: userCoords.lng.toFixed(5),
                          });
                        setPickupLocation(locationText);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
                    >
                      <Icon name="pin" className="size-3 shrink-0 text-brand-600" />
                      <span>{t.bookingModal.useMyAddressBtn}</span>
                    </button>
                    {isResolvingAddress ? (
                      <span className="text-[10px] italic text-slate-400">{t.bookingModal.resolvingAddress}</span>
                    ) : resolvedAddress ? (
                      <span className="min-w-0 max-w-[280px] truncate text-[10px] font-medium text-slate-600" title={resolvedAddress}>
                        {resolvedAddress}
                      </span>
                    ) : (
                      <span className="min-w-0 font-mono text-[10px] tabular-nums text-slate-400">
                        {userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </FormField>

            <FormField label={t.bookingModal.destinationLabel} name="destination" required>
              <div className="relative min-w-0">
                <input
                  id="destination"
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  placeholder={t.bookingModal.destinationPlaceholder}
                  aria-invalid={destinationLinkError ? true : undefined}
                  className="pr-10"
                />
                {isResolvingLink && (
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <Spinner size="sm" />
                  </span>
                )}
              </div>
              {destinationCoords && (
                <p className="flex min-w-0 items-center gap-1 text-[11px] tabular-nums text-slate-600">
                  <Icon name="pin" className="size-3 shrink-0 text-brand-600" />
                  <span className="min-w-0 break-words">{destinationCoords.lat.toFixed(5)}, {destinationCoords.lng.toFixed(5)}</span>
                </p>
              )}
              {destinationLinkError && (
                <p role="alert" className="break-words text-xs font-medium text-danger-700">
                  {destinationLinkError}
                </p>
              )}
            </FormField>
          </div>
        </section>

        {/* Section: Layanan */}
        <section className="space-y-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <header className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Icon name="car" className="size-4 shrink-0 text-brand-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.bookingModal.sectionService}</h3>
          </header>

          {/* Pilihan Layanan: Drop Off vs Standby */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600">
              {t.bookingModal.serviceSelectionLabel}
            </label>
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
              <button
                type="button"
                onClick={() => setServiceType('DROP_OFF')}
                aria-pressed={serviceType === 'DROP_OFF'}
                className={`flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  serviceType === 'DROP_OFF'
                    ? 'border-brand-200 bg-brand-600 text-white'
                    : 'border-transparent bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon name="car" className="size-4 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight">{t.bookingModal.dropOffShortTitle}</div>
                  <div className={`text-[10px] leading-tight ${serviceType === 'DROP_OFF' ? 'text-white/80' : 'text-slate-500'}`}>{t.bookingModal.dropOffSubtitle}</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setServiceType('STANDBY')}
                aria-pressed={serviceType === 'STANDBY'}
                className={`flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  serviceType === 'STANDBY'
                    ? 'border-brand-200 bg-brand-600 text-white'
                    : 'border-transparent bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon name="clock" className="size-4 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold leading-tight">{t.bookingModal.standbyShortTitle}</div>
                  <div className={`text-[10px] leading-tight ${serviceType === 'STANDBY' ? 'text-white/80' : 'text-slate-500'}`}>{t.bookingModal.standbySubtitle}</div>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* Section: Jadwal & Penumpang */}
        <section className="space-y-3.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <header className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Icon name="calendar" className="size-4 shrink-0 text-brand-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.bookingModal.sectionSchedule}</h3>
          </header>

          {/* Departure & Return */}
          {serviceType === 'DROP_OFF' ? (
            <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
              <div className="flex items-center justify-between border-b border-brand-200 pb-1.5 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-brand-700">
                  <Icon name="clock" className="size-3.5 text-brand-600" />
                  <span>{t.bookingModal.dropOffScheduleTitle}</span>
                </span>
                <span className="rounded border border-brand-200 bg-white px-2 py-0.5 text-[10px] font-medium text-brand-700">
                  {t.bookingModal.oneWayBadge}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="dropOffDate" className="mb-1 block text-[11px] font-medium text-slate-700">
                    {t.bookingModal.dropOffDateLabel} <span className="text-brand-500">*</span>
                  </label>
                  <input
                    id="dropOffDate"
                    type="date"
                    required
                    value={dropOffDate}
                    onChange={(e) => setDropOffDate(e.target.value)}
                    className="min-h-12 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 text-xs tabular-nums text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="dropOffTime" className="mb-1 block text-[11px] font-medium text-slate-700">
                    {t.bookingModal.dropOffTimeLabel} <span className="text-brand-500">*</span>
                  </label>
                  <input
                    id="dropOffTime"
                    type="time"
                    required
                    value={dropOffTime}
                    onChange={(e) => setDropOffTime(e.target.value)}
                    className="min-h-12 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 text-xs tabular-nums text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
                  />
                </div>
              </div>
              <p className="pt-0.5 text-[10px] italic text-slate-500">
                {t.bookingModal.dropOffNote}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t.bookingModal.standbyStartLabel} name="departureAt" required>
                <input
                  id="departureAt"
                  type="datetime-local"
                  required
                  value={departureAt}
                  onChange={(e) => setDepartureAt(e.target.value)}
                  className="tabular-nums"
                />
              </FormField>

              <FormField label={t.bookingModal.standbyEndLabel} name="expectedReturnAt" required>
                <input
                  id="expectedReturnAt"
                  type="datetime-local"
                  required
                  value={expectedReturnAt}
                  onChange={(e) => setExpectedReturnAt(e.target.value)}
                  className="tabular-nums"
                />
              </FormField>
            </div>
          )}

          {/* Passenger count & Purpose */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label={t.bookingModal.passengersLabel} name="passengerCount" required>
              <input
                id="passengerCount"
                type="number"
                min={1}
                max={preferredVehicle ? preferredVehicle.seatingCapacity : 50}
                required
                value={passengerCount}
                onChange={(e) => setPassengerCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="tabular-nums"
              />
            </FormField>

            <div className="min-w-0 sm:col-span-2">
              <FormField
                label={serviceType === 'STANDBY' ? t.bookingModal.purposeRequiredLabel : t.bookingModal.purposeOptionalLabel}
                name="purpose"
                required={serviceType === 'STANDBY'}
              >
                <input
                  id="purpose"
                  type="text"
                  required={serviceType === 'STANDBY'}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={
                    serviceType === 'STANDBY'
                      ? t.bookingModal.purposeStandbyPlaceholder
                      : t.bookingModal.purposeOptionalPlaceholder
                  }
                />
              </FormField>
            </div>
          </div>
        </section>

        {/* Section: Kebutuhan Nota Dinas / Layanan */}
        <section className="space-y-3.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <header className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Icon name="bookings" className="size-4 shrink-0 text-brand-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.bookingModal.sectionVehicleNotes}</h3>
          </header>

          {/* Specific Vehicle Preference (Option B - Optional) */}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-xs font-medium uppercase tracking-wider text-slate-500">
                {t.bookingModal.preferredVehicleLabel}
              </span>
              {preferredVehicle && (
                <button
                  type="button"
                  onClick={() => setPreferredVehicle(null)}
                  className="shrink-0 cursor-pointer text-xs font-semibold text-danger-700 underline-offset-2 hover:underline"
                >
                  {t.bookingModal.clearVehicle}
                </button>
              )}
            </div>

            {preferredVehicle ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {preferredVehicle.plateNumber}
                    </span>
                    {preferredVehicle.status && <StatusBadge status={preferredVehicle.status} />}
                  </div>
                  <div className="mt-0.5 font-medium text-slate-600">
                    {preferredVehicle.brand} {preferredVehicle.model} • <span className="tabular-nums">{preferredVehicle.seatingCapacity}</span> {t.common.seats}
                    {preferredVehicle.vehicleType && ` • ${preferredVehicle.vehicleType}`}
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                  {t.bookingModal.selectedPill}
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  placeholder={t.bookingModal.searchPlatePlaceholder}
                  value={vehicleSearchQuery}
                  onChange={(e) => setVehicleSearchQuery(e.target.value)}
                  className="min-h-12 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
                />
                {isSearchingVehicles && (
                  <div className="flex items-center gap-1.5 py-1 text-xs font-medium text-slate-600">
                    <Spinner size="sm" /> {t.bookingModal.searchingVehicles}
                  </div>
                )}
                {vehicleSearchResults.length > 0 && (
                  <div className="max-h-40 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {vehicleSearchResults.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setPreferredVehicle(v);
                          setVehicleSearchQuery('');
                          setVehicleSearchResults([]);
                        }}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 p-2.5 text-left text-xs font-medium transition-colors hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold tabular-nums text-slate-900">{v.plateNumber}</span>
                          <span className="ml-2 text-slate-600">
                            {v.brand} {v.model} (<span className="tabular-nums">{v.seatingCapacity}</span> {t.common.seats})
                          </span>
                        </div>
                        <StatusBadge status={v.status || 'AVAILABLE'} />
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {t.bookingModal.autoDispatchHint}
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <FormField label={t.bookingModal.notesLabel} name="notes">
            <textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.bookingModal.notesPlaceholder2}
            />
          </FormField>
        </section>
      </form>
    </Modal>
  );
}
