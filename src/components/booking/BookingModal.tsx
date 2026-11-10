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

  // User GPS Location (Wajib)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [nearestHubName, setNearestHubName] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationsLoadedRef = useRef(false);
  const userManuallySelectedRef = useRef(false);

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

  const handleSubmit = async (e?: React.FormEvent, overrideVehiclePreferenceId?: string) => {
    if (e) e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    if (!operationalLocationId) {
      setFormError('Operational location is required');
      setIsSubmitting(false);
      return;
    }

    if (!userCoords && geoStatus === 'denied') {
      setFormError('Akses lokasi (GPS) wajib diaktifkan agar sistem dapat mencocokkan titik jemput dan armada terdekat.');
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

    const isDropOff = serviceType === 'DROP_OFF';
    let depDate: Date;
    let retDate: Date;

    if (isDropOff) {
      if (!dropOffDate) {
        setFormError('Tanggal jemput wajib diisi untuk layanan Drop Off');
        setIsSubmitting(false);
        return;
      }
      if (!dropOffTime) {
        setFormError('Jam jemput wajib dipilih untuk layanan Drop Off');
        setIsSubmitting(false);
        return;
      }
      depDate = new Date(`${dropOffDate}T${dropOffTime}:00`);
      if (isNaN(depDate.getTime())) {
        setFormError('Format tanggal atau jam jemput tidak valid');
        setIsSubmitting(false);
        return;
      }
      // Waktu kembali otomatis 3 jam setelah jam jemput
      retDate = new Date(depDate.getTime() + 3 * 60 * 60 * 1000);
    } else {
      if (!departureAt || !expectedReturnAt) {
        setFormError('Waktu keberangkatan dan waktu kembali wajib diisi');
        setIsSubmitting(false);
        return;
      }
      depDate = new Date(departureAt);
      retDate = new Date(expectedReturnAt);

      if (isNaN(depDate.getTime()) || isNaN(retDate.getTime())) {
        setFormError('Format tanggal keberangkatan atau kembali tidak valid');
        setIsSubmitting(false);
        return;
      }

      if (retDate <= depDate) {
        setFormError('Waktu kembali harus setelah waktu keberangkatan');
        setIsSubmitting(false);
        return;
      }

      if (!purpose.trim()) {
        setFormError('Keterangan / keperluan wajib diisi untuk layanan Standby');
        setIsSubmitting(false);
        return;
      }
    }

    const vehiclePrefId =
      overrideVehiclePreferenceId !== undefined
        ? overrideVehiclePreferenceId
        : preferredVehicle?.id || undefined;

    const effectivePurpose = purpose.trim() || (isDropOff ? 'Layanan Drop Off' : '');
    const autoNote = isDropOff
      ? [notes.trim(), `[Layanan Drop Off - Tanggal: ${dropOffDate}, Jam Jemput: ${dropOffTime}]`].filter(Boolean).join(' ')
      : notes.trim() || undefined;

    try {
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

    const driverName = submittedBooking.driver?.user?.name || submittedBooking.driver?.name || 'Driver KCIC';
    const driverPhone = submittedBooking.driver?.user?.phone;
    const rawDriverPhone = driverPhone && driverPhone !== 'REDACTED' ? driverPhone.replace(/\D/g, '') : null;
    const etaText = formatEta(submittedBooking.etaSeconds, submittedBooking.etaEstimated);

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          isAssigned
            ? 'Pengemudi Dikonfirmasi'
            : isPending
            ? 'Permintaan Pemesanan Terkirim'
            : 'Mencari Armada'
        }
        description={`Booking Reference #${submittedBooking.bookingNumber || ''}`}
        maxWidth="lg"
      >
        <div className="space-y-5">
          {/* PENDING ADMIN REVIEW & DRIVER ASSIGNMENT VIEW */}
          {isPending && (
            <div className="py-2 space-y-4">
              <div className="rounded-xl border-[2.5px] border-black bg-amber-100 p-4 text-black shadow-[4px_4px_0px_0px_#000]">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-amber-400 text-black shadow-[2px_2px_0px_0px_#000]">
                    <Icon name="calendar" className="size-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-extrabold text-black">Menunggu Verifikasi & Penugasan Driver</h4>
                    <p className="text-xs text-zinc-700 mt-0.5">
                      Pemesanan Anda telah masuk ke portal Biro Umum / Admin Operasional KCIC. Admin akan memvalidasi jadwal serta menugaskan driver dan armada kendaraan.
                    </p>
                  </div>
                </div>
              </div>

              {/* Route Summary Preview */}
              <div className="rounded-xl border-[2.5px] border-black bg-white p-4 text-left text-xs space-y-3 shadow-[4px_4px_0px_0px_#000]">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                  <span className="font-bold text-zinc-600">Tipe Layanan:</span>
                  <span className="px-2 py-0.5 bg-rose-100 border border-rose-300 text-rose-900 rounded font-black text-[11px]">
                    {submittedBooking.serviceType === 'STANDBY' ? 'Standby Operasional' : 'Drop Off Sekali Jalan'}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-black bg-emerald-400 text-[10px] font-black text-black">
                    ●
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Titik Jemput</span>
                    <p className="font-bold text-black truncate">{submittedBooking.pickupLocation}</p>
                  </div>
                </div>
                <div className="border-t-2 border-dashed border-black/20" />
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-black bg-rose-400 text-[10px] font-black text-black">
                    ■
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Tujuan</span>
                    <p className="font-bold text-black truncate">{submittedBooking.destination}</p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-zinc-50 border-2 border-black rounded-xl text-xs text-zinc-600">
                <p>
                  Anda dapat memantau status persetujuan dan penugasan driver melalui menu <strong className="text-black">Pemesanan Saya</strong>. Notifikasi in-app akan dikirim saat driver telah ditugaskan.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border-2 border-black rounded-lg bg-white text-zinc-800 text-xs font-bold hover:bg-zinc-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push('/user/bookings');
                  }}
                  className="px-4 py-2 border-2 border-black rounded-lg bg-[#be123c] text-white text-xs font-black hover:bg-[#9f1239] shadow-[2px_2px_0px_0px_#000] cursor-pointer"
                >
                  Lihat Pemesanan Saya
                </button>
              </div>
            </div>
          )}

          {/* GOJEK-STYLE RADAR SEARCHING VIEW */}
          {isSearching && (
            <div className="py-4 text-center space-y-5">
              <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
                <span className="absolute h-full w-full rounded-full border-2 border-dashed border-black bg-emerald-400/20 animate-ping duration-1000" />
                <span className="absolute h-28 w-28 rounded-full border-2 border-black bg-emerald-300/30 animate-pulse" />
                <span className="absolute h-20 w-20 rounded-full border-2 border-black bg-emerald-200/50" />
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border-[3px] border-black bg-emerald-400 text-black shadow-[4px_4px_0px_0px_#000]">
                  <Icon name="car" className="size-8 animate-bounce text-black" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-extrabold tracking-tight text-black">
                  Mencari Pengemudi Terdekat...
                </h3>
                <p className="mt-1.5 text-xs font-semibold text-zinc-700 max-w-sm mx-auto">
                  Sistem auto-dispatch sedang memindai armada standby di hub operasional Anda.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-lg border-2 border-black bg-amber-300 px-3.5 py-1.5 text-xs font-extrabold text-black shadow-[2px_2px_0px_0px_#000]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-black" />
                </span>
                <span>
                  {submittedBooking.status === 'DRIVER_NOTIFIED'
                    ? 'Penawaran terkirim ke pengemudi terdekat, menunggu konfirmasi...'
                    : 'Menghubungkan ke armada terbaik...'}
                </span>
              </div>

              {/* Route Summary Preview */}
              <div className="rounded-xl border-[2.5px] border-black bg-white p-4 text-left text-xs space-y-2.5 shadow-[4px_4px_0px_0px_#000]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-black bg-emerald-400 text-[10px] font-black text-black">
                    ●
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Titik Jemput</span>
                    <p className="font-bold text-black truncate">{submittedBooking.pickupLocation}</p>
                  </div>
                </div>
                <div className="border-t-2 border-dashed border-black/20" />
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-black bg-rose-400 text-[10px] font-black text-black">
                    ■
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Tujuan</span>
                    <p className="font-bold text-black truncate">{submittedBooking.destination}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GOJEK-STYLE DRIVER ACCEPTED / ASSIGNED VIEW */}
          {isAssigned && (
            <div className="space-y-4">
              {/* Banner */}
              <div className="rounded-xl border-[2.5px] border-black bg-emerald-300 p-4 text-black shadow-[4px_4px_0px_0px_#000]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000]">
                      <Icon name="check" className="size-5" />
                    </span>
                    <div>
                      <h4 className="text-base font-extrabold text-black">Driver Ditemukan!</h4>
                      <p className="text-xs font-semibold text-emerald-950">
                        {submittedBooking.status === 'ARRIVED'
                          ? 'Driver sudah tiba di titik penjemputan Anda!'
                          : submittedBooking.status === 'IN_PROGRESS'
                          ? 'Perjalanan sedang berlangsung.'
                          : 'Driver sedang menuju titik penjemputan Anda.'}
                      </p>
                    </div>
                  </div>
                  {etaText && (
                    <span className="rounded-lg border-2 border-black bg-amber-300 px-3 py-1 font-mono text-xs font-black text-black shadow-[2px_2px_0px_0px_#000]">
                      ETA {etaText}
                    </span>
                  )}
                </div>
              </div>

              {/* Driver & Vehicle Profile Card */}
              <div className="rounded-xl border-[2.5px] border-black bg-white p-5 shadow-[4px_4px_0px_0px_#000] space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-amber-300 text-black font-black text-xl shadow-[2px_2px_0px_0px_#000]">
                      {driverName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-base text-black">{driverName}</h4>
                        <span className="rounded-md border-1.5 border-black bg-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase text-black">
                          Driver KCIC
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 font-mono font-bold mt-0.5">
                        {submittedBooking.driver?.licenseNumber ? `SIM: ${submittedBooking.driver.licenseNumber}` : 'Pengemudi Resmi'}
                      </p>
                    </div>
                  </div>

                  {/* Indonesian Vehicle License Plate Badge */}
                  {submittedBooking.vehicle && (
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 bg-black text-white font-mono font-black tracking-wider rounded-lg border-2 border-black text-sm shadow-[2px_2px_0px_0px_#000]">
                        {submittedBooking.vehicle.plateNumber}
                      </div>
                      <p className="text-[11px] font-bold text-zinc-700 mt-1">
                        {submittedBooking.vehicle.brand} {submittedBooking.vehicle.model}
                      </p>
                    </div>
                  )}
                </div>

                {/* Direct Contact Buttons (WhatsApp & Call) */}
                {rawDriverPhone && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black/15">
                    <a
                      href={`https://wa.me/${rawDriverPhone}?text=${encodeURIComponent(
                        `Halo Pak/Bu ${driverName}, saya penumpang untuk pemesanan #${submittedBooking.bookingNumber}. Saya menunggu di ${submittedBooking.pickupLocation}.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-emerald-400 px-3.5 py-2.5 text-xs font-extrabold text-black shadow-[2px_2px_0px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
                    >
                      <svg className="size-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.074-2.001-.466-1.503-.623-2.529-2.115-2.607-2.219-.074-.103-.615-.818-.615-1.56 0-.743.391-1.107.531-1.258.14-.15.307-.188.409-.188.103 0 .205.004.296.009.096.005.225-.036.352.27.13.313.444 1.082.483 1.161.039.08.065.173.013.277-.052.103-.079.168-.156.259-.078.09-.163.201-.233.27-.08.077-.163.161-.07.32.093.16.413.682.886 1.103.609.543 1.123.711 1.282.79.16.08.254.07.348-.039.095-.109.406-.473.514-.635.109-.162.217-.135.367-.08.151.054.958.452 1.123.535.165.083.276.124.316.193.04.07.04.405-.104.81z"/>
                      </svg>
                      <span>Chat WhatsApp</span>
                    </a>

                    <a
                      href={`tel:${driverPhone}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-3.5 py-2.5 text-xs font-extrabold text-black shadow-[2px_2px_0px_0px_#000] hover:bg-zinc-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
                    >
                      <Icon name="phone" className="size-4" />
                      <span>Telepon Driver</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Route Summary */}
              <div className="rounded-xl border-[2.5px] border-black bg-amber-50/70 p-4 text-xs space-y-2 shadow-[3px_3px_0px_0px_#000]">
                <div className="flex justify-between items-center text-black">
                  <span className="font-extrabold text-black">Status Penjemputan:</span>
                  <StatusBadge status={submittedBooking.status} />
                </div>
                <div className="flex justify-between text-black">
                  <span className="font-extrabold text-black">Titik Jemput:</span>
                  <span className="text-right text-black font-bold truncate max-w-[220px]">
                    {submittedBooking.pickupLocation}
                  </span>
                </div>
                <div className="flex justify-between text-black">
                  <span className="font-extrabold text-black">Tujuan:</span>
                  <span className="text-right text-black font-bold truncate max-w-[220px]">
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-[2.5px] border-black bg-emerald-400 px-4 py-3.5 text-sm font-black text-black shadow-[4px_4px_0px_0px_#000] hover:bg-emerald-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition cursor-pointer"
                  >
                    <Icon name="tracking" className="size-5" />
                    <span>Lacak Posisi Driver di Peta Langsung</span>
                    <Icon name="arrow" className="size-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t-2 border-black/15">
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/user/bookings');
              }}
              className="px-4 py-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl border-2 border-black text-xs font-bold shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
            >
              Lihat Daftar Pemesanan Saya
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border-2 border-black bg-white hover:bg-zinc-100 text-black rounded-xl text-xs font-bold shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
            >
              Tutup
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

        {/* GPS Location Banner (Wajib Bagi User) */}
        <div className={`rounded-xl border-[2.5px] border-black p-3.5 text-xs shadow-[3px_3px_0px_0px_#000] transition-colors duration-200 ${
          geoStatus === 'granted' && userCoords
            ? 'bg-emerald-200 text-black'
            : geoStatus === 'denied'
              ? 'bg-rose-200 text-black'
              : 'bg-amber-100 text-black'
        }`}>
          {geoStatus === 'locating' ? (
            <div className="flex items-center gap-2.5 text-black font-bold">
              <Spinner size="sm" />
              <span>Memeriksa dan mendeteksi titik GPS perangkat Anda...</span>
            </div>
          ) : geoStatus === 'granted' && userCoords ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-black flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-black bg-emerald-600 animate-pulse" />
                  Lokasi GPS Terdeteksi (Wajib Aktif)
                </span>
                <span className="text-[11px] font-mono font-black text-black bg-white px-2 py-0.5 rounded-md border-1.5 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
                  ±{userCoords.accuracyM}m akurasi
                </span>
              </div>
              <p className="text-[11px] font-semibold text-zinc-800">
                Koordinat: {userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}
                {nearestHubName ? ` · Hub terdekat: ${nearestHubName}` : ''}
              </p>
            </div>
          ) : geoStatus === 'denied' ? (
            <div className="space-y-2 text-black">
              <div className="flex items-center justify-between">
                <span className="font-extrabold flex items-center gap-1.5 text-black">
                  <Icon name="alert" className="size-4 text-rose-600" />
                  <span>Izin Lokasi (GPS) Wajib Diaktifkan</span>
                </span>
                <button
                  type="button"
                  onClick={() => requestUserLocation()}
                  className="px-3 py-1 text-[11px] font-extrabold bg-black hover:bg-zinc-800 text-white rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                >
                  Izinkan Lokasi
                </button>
              </div>
              <p className="text-[11px] font-bold leading-relaxed text-rose-950">
                Lokasi GPS Anda wajib diaktifkan agar sistem auto-dispatch dapat menentukan titik penjemputan dan armada driver terdekat. Silakan izinkan akses lokasi di browser Anda.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-black font-extrabold flex items-center gap-1.5">
                <Icon name="pin" className="size-4 text-emerald-700" />
                <span>Lokasi (GPS) Wajib untuk Penjemputan</span>
              </span>
              <button
                type="button"
                onClick={() => requestUserLocation()}
                className="px-3 py-1 text-[11px] font-extrabold bg-black hover:bg-zinc-800 text-white rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
              >
                Deteksi GPS
              </button>
            </div>
          )}
        </div>

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

        {/* Pilihan Layanan: Drop Off vs Standby */}
        <div className="space-y-1.5">
          <label className="block text-xs font-black uppercase tracking-wider text-black">
            Pilihan Layanan Pemesanan
          </label>
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-100 border-2 border-black rounded-xl">
            <button
              type="button"
              onClick={() => setServiceType('DROP_OFF')}
              className={`py-2 px-3 text-xs font-bold rounded-lg border-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                serviceType === 'DROP_OFF'
                  ? 'bg-[#be123c] border-black text-white shadow-[2px_2px_0px_0px_#000]'
                  : 'border-transparent text-zinc-700 hover:text-black hover:bg-zinc-200'
              }`}
            >
              <Icon name="car" className="size-4 shrink-0" />
              <div className="text-left">
                <div className="font-extrabold leading-tight">1. Drop Off</div>
                <div className="text-[10px] opacity-85 leading-tight">Sekali Jalan (Jam Jemput Saja)</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setServiceType('STANDBY')}
              className={`py-2 px-3 text-xs font-bold rounded-lg border-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                serviceType === 'STANDBY'
                  ? 'bg-[#be123c] border-black text-white shadow-[2px_2px_0px_0px_#000]'
                  : 'border-transparent text-zinc-700 hover:text-black hover:bg-zinc-200'
              }`}
            >
              <Icon name="clock" className="size-4 shrink-0" />
              <div className="text-left">
                <div className="font-extrabold leading-tight">2. Standby</div>
                <div className="text-[10px] opacity-85 leading-tight">Operasional Seharian</div>
              </div>
            </button>
          </div>
        </div>

        {/* Pickup & Destination */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Pickup Location" name="pickupLocation" required>
            <div className="space-y-1">
              <input
                id="pickupLocation"
                type="text"
                required
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="e.g. Halim Gate 2"
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
              {userCoords && (
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const locationText =
                        resolvedAddress ||
                        nearestHubName ||
                        `Titik GPS (${userCoords.lat.toFixed(5)}, ${userCoords.lng.toFixed(5)})`;
                      setPickupLocation(locationText);
                    }}
                    className="text-emerald-700 hover:text-emerald-900 font-medium underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Icon name="pin" className="size-3 text-emerald-700" />
                    <span>Gunakan alamat lokasi saya</span>
                  </button>
                  {isResolvingAddress ? (
                    <span className="text-zinc-400 italic text-[10px]">Mencari alamat...</span>
                  ) : resolvedAddress ? (
                    <span className="text-zinc-600 font-medium text-[10px] max-w-[280px] truncate" title={resolvedAddress}>
                      {resolvedAddress}
                    </span>
                  ) : (
                    <span className="text-zinc-400 font-mono text-[10px]">
                      {userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </FormField>

          <FormField label="Destination" name="destination" required>
            <input
              id="destination"
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Tegalluar Depo Office"
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>
        </div>

        {/* Departure & Return */}
        {serviceType === 'DROP_OFF' ? (
          <div className="p-3 bg-rose-50/70 border-2 border-black rounded-xl space-y-2 shadow-[2px_2px_0px_0px_#000]">
            <div className="flex items-center justify-between text-xs font-black text-zinc-900 border-b border-black/10 pb-1.5">
              <span className="flex items-center gap-1.5">
                <Icon name="clock" className="size-3.5 text-[#be123c]" />
                <span>Jadwal Penjemputan Drop Off</span>
              </span>
              <span className="text-[10px] bg-rose-100 text-[#be123c] px-2 py-0.5 rounded font-bold border border-rose-300">
                Sekali Jalan
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="dropOffDate" className="block text-[11px] font-bold text-zinc-900 mb-1">
                  Tanggal Jemput <span className="text-[#be123c]">*</span>
                </label>
                <input
                  id="dropOffDate"
                  type="date"
                  required
                  value={dropOffDate}
                  onChange={(e) => setDropOffDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <div>
                <label htmlFor="dropOffTime" className="block text-[11px] font-bold text-zinc-900 mb-1">
                  Jam Jemput <span className="text-[#be123c]">*</span>
                </label>
                <input
                  id="dropOffTime"
                  type="time"
                  required
                  value={dropOffTime}
                  onChange={(e) => setDropOffTime(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 italic pt-0.5">
              * Khusus Drop Off, tanggal & jam selesai tidak perlu diisi (hanya jadwal penjemputan).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Waktu Mulai Standby" name="departureAt" required>
              <input
                id="departureAt"
                type="datetime-local"
                required
                value={departureAt}
                onChange={(e) => setDepartureAt(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Waktu Selesai Standby" name="expectedReturnAt" required>
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
        )}

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
            <FormField
              label={serviceType === 'STANDBY' ? 'Keperluan / Keterangan (Wajib)' : 'Keperluan / Keterangan (Opsional)'}
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
                    ? 'Wajib diisi, misal: Standby pimpinan / inspeksi rel'
                    : 'Opsional, misal: Antar staf ke Stasiun Halim'
                }
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>
        </div>

        {/* Specific Vehicle Preference (Option B - Optional) */}
        <div className="p-3.5 bg-amber-50/70 border-[2.5px] border-black rounded-xl space-y-2 shadow-[3px_3px_0px_0px_#000]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-black">
              Specific Vehicle Preference (Optional)
            </span>
            {preferredVehicle && (
              <button
                type="button"
                onClick={() => setPreferredVehicle(null)}
                className="text-xs text-rose-700 hover:text-rose-900 font-extrabold cursor-pointer underline"
              >
                Clear Preference
              </button>
            )}
          </div>

          {preferredVehicle ? (
            <div className="p-3 bg-white border-2 border-black rounded-lg flex items-center justify-between text-xs shadow-[2px_2px_0px_0px_#000]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-black">
                    {preferredVehicle.plateNumber}
                  </span>
                  {preferredVehicle.status && <StatusBadge status={preferredVehicle.status} />}
                </div>
                <div className="text-zinc-700 font-semibold mt-0.5">
                  {preferredVehicle.brand} {preferredVehicle.model} • {preferredVehicle.seatingCapacity} seats
                  {preferredVehicle.vehicleType && ` • ${preferredVehicle.vehicleType}`}
                </div>
              </div>
              <span className="px-2 py-0.5 bg-amber-300 border-1.5 border-black text-black text-[10px] font-black rounded-md uppercase shadow-[1.5px_1.5px_0px_0px_#000]">
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
                className="w-full px-3 py-2 text-xs border-2 border-black rounded-lg bg-white text-black font-semibold shadow-[2px_2px_0px_0px_#000] focus:shadow-[3px_3px_0px_0px_#059669] focus:outline-none"
              />
              {isSearchingVehicles && (
                <div className="text-xs text-black font-bold flex items-center gap-1.5 py-1">
                  <Spinner size="sm" /> Searching vehicles...
                </div>
              )}
              {vehicleSearchResults.length > 0 && (
                <div className="bg-white border-2 border-black rounded-lg divide-y-2 divide-black/10 max-h-40 overflow-y-auto shadow-[3px_3px_0px_0px_#000]">
                  {vehicleSearchResults.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setPreferredVehicle(v);
                        setVehicleSearchQuery('');
                        setVehicleSearchResults([]);
                      }}
                      className="w-full p-2.5 text-left hover:bg-amber-100/60 flex items-center justify-between text-xs cursor-pointer font-bold transition-colors"
                    >
                      <div>
                        <span className="font-mono font-black text-black">{v.plateNumber}</span>
                        <span className="text-zinc-700 ml-2">
                          {v.brand} {v.model} ({v.seatingCapacity} seats)
                        </span>
                      </div>
                      <StatusBadge status={v.status || 'AVAILABLE'} />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] font-medium text-zinc-600">
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
            className="w-full px-3 py-2 text-xs border-2 border-black rounded-lg bg-white text-black font-medium shadow-[2px_2px_0px_0px_#000] focus:shadow-[3px_3px_0px_0px_#059669] focus:outline-none"
          />
        </FormField>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t-2 border-black/15">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border-2 border-black bg-white hover:bg-zinc-100 text-black rounded-xl text-xs font-bold shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-black border-2 border-black rounded-xl text-xs font-black shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer inline-flex items-center gap-1.5"
          >
            {isSubmitting && <Spinner size="sm" className="text-black" />}
            <span>Submit Reservation</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
