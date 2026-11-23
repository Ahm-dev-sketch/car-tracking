'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { formatEta } from './DispatchProgress';
import { findNearestHub } from '@/lib/operational-locations';
import { reverseGeocodeWithCache } from '@/lib/client-geocode-cache';
import { enqueueOfflineAction } from '@/lib/offline-sync';
import { looksLikeGoogleMapsUrl, isShortLink, parseGoogleMapsUrl } from '@/lib/google-maps-url';
import {
  ArrowRight,
  CalendarDays,
  Car,
  Check,
  CircleAlert,
  Clock,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Search,
} from 'lucide-react';

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

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  const [operationalLocationId, setOperationalLocationId] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [departureAt, setDepartureAt] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [passengerCount, setPassengerCount] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

  const [serviceType, setServiceType] = useState<'DROP_OFF' | 'STANDBY'>('DROP_OFF');
  const [dropOffDate, setDropOffDate] = useState('');
  const [dropOffTime, setDropOffTime] = useState('');

  const [preferredVehicle, setPreferredVehicle] = useState<PreferredVehicle | null>(null);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [vehicleSearchResults, setVehicleSearchResults] = useState<PreferredVehicle[]>([]);
  const [isSearchingVehicles, setIsSearchingVehicles] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [nearestHubName, setNearestHubName] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [destinationLinkError, setDestinationLinkError] = useState<string | null>(null);

  const [submittedBooking, setSubmittedBooking] = useState<any | null>(null);
  const [noDriverState, setNoDriverState] = useState<{
    booking: any;
    alternatives: PreferredVehicle[];
  } | null>(null);

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

        setIsResolvingAddress(true);
        reverseGeocodeWithCache(lat, lng, nearestHubName || null)
          .then((addr) => {
            setResolvedAddress(addr);
            if (!pickupLocation) {
              setPickupLocation(addr);
            }
          })
          .catch(() => {})
          .finally(() => setIsResolvingAddress(false));

        const locs = locationList || locations;
        if (locs.length > 0 && !userManuallySelectedRef.current) {
          const nearest = findNearestHub(lat, lng, locs);
          if (nearest) {
            setNearestHubName(nearest.location.name);
            const matched = locs.find((l) => l.code === nearest.location.code || l.id === nearest.location.id);
            if (matched && !operationalLocationId) {
              setOperationalLocationId(matched.id);
            }
          }
        }
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setGeoStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [locations, operationalLocationId, pickupLocation, nearestHubName]);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchLocations() {
      setLoadingLocations(true);
      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          const activeLocs = (json.data || []).filter((l: LocationOption) => l.isActive);
          setLocations(activeLocs);
          locationsLoadedRef.current = true;

          if (initialLocationId) {
            setOperationalLocationId(initialLocationId);
            userManuallySelectedRef.current = true;
          } else {
            requestUserLocation(activeLocs);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingLocations(false);
      }
    }

    fetchLocations();

    if (initialVehiclePreference) {
      setPreferredVehicle(initialVehiclePreference);
      if (initialVehiclePreference.currentLocationId || initialVehiclePreference.homeLocationId) {
        setOperationalLocationId(
          initialVehiclePreference.currentLocationId || initialVehiclePreference.homeLocationId || ''
        );
        userManuallySelectedRef.current = true;
      }
    }

    if (initialDestinationUrl && !initialDestinationHandledRef.current) {
      initialDestinationHandledRef.current = true;
      void handleDestinationChange(initialDestinationUrl);
    }

    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:00`;
    setDropOffDate(dateStr);
    setDropOffTime(timeStr);

    const pad = (n: number) => String(n).padStart(2, '0');
    const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setDepartureAt(localIso);

    const ret = new Date(now);
    ret.setHours(ret.getHours() + 3);
    const localRetIso = `${ret.getFullYear()}-${pad(ret.getMonth() + 1)}-${pad(ret.getDate())}T${pad(ret.getHours())}:${pad(ret.getMinutes())}`;
    setExpectedReturnAt(localRetIso);
  }, [isOpen, initialVehiclePreference, initialLocationId, initialDestinationUrl, requestUserLocation]);

  useEffect(() => {
    if (!vehicleSearchQuery.trim()) {
      setVehicleSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingVehicles(true);
      try {
        const params = new URLSearchParams({
          search: vehicleSearchQuery.trim(),
          status: 'AVAILABLE',
          limit: '5',
        });
        if (operationalLocationId) {
          params.set('locationId', operationalLocationId);
        }
        const res = await fetch(`/api/vehicles?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setVehicleSearchResults(json.data || json.vehicles || []);
        }
      } catch {
        // ignore
      } finally {
        setIsSearchingVehicles(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [vehicleSearchQuery, operationalLocationId]);

  useEffect(() => {
    if (!submittedBooking || !submittedBooking.id) return;

    const bookingId = submittedBooking.id;
    const terminalStatuses = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_DRIVER_AVAILABLE'];

    const poll = async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        if (res.ok) {
          const json = await res.json();
          const updated = json.data || json;
          setSubmittedBooking(updated);

          if (terminalStatuses.includes(updated.status)) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
        }
      } catch {
        // ignore
      }
    };

    pollIntervalRef.current = setInterval(poll, 3000);

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

    setIsResolvingLink(true);
    setDestinationLinkError(null);

    try {
      if (isShortLink(value)) {
        const res = await fetch(`/api/maps/resolve?url=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.resolvedCoords) {
            setDestinationCoords(data.resolvedCoords);
            if (data.placeName) {
              setDestination(data.placeName);
            }
          } else {
            setDestinationLinkError('Tautan Google Maps tidak memuat koordinat tujuan yang valid.');
          }
        } else {
          setDestinationLinkError('Gagal mengurai tautan Google Maps.');
        }
      } else {
        const parsed = parseGoogleMapsUrl(value);
        if (parsed) {
          setDestinationCoords({ lat: parsed.lat, lng: parsed.lng });
          if (parsed.label) {
            setDestination(parsed.label);
          }
        } else {
          setDestinationLinkError('Tidak dapat mengekstrak koordinat dari tautan tersebut.');
        }
      }
    } catch {
      setDestinationLinkError('Kesalahan jaringan saat memverifikasi tautan tujuan.');
    } finally {
      setIsResolvingLink(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setOfflineNotice(null);

    if (!operationalLocationId) {
      setFormError('Harap pilih hub lokasi operasional keberangkatan.');
      return;
    }
    if (!pickupLocation.trim()) {
      setFormError('Titik penjemputan wajib diisi.');
      return;
    }
    if (!destination.trim()) {
      setFormError('Destinasi tujuan wajib diisi.');
      return;
    }

    let finalDeparture: string;
    let finalReturn: string;

    if (serviceType === 'DROP_OFF') {
      if (!dropOffDate || !dropOffTime) {
        setFormError('Tanggal dan jam penjemputan wajib diisi untuk layanan Drop Off.');
        return;
      }
      finalDeparture = new Date(`${dropOffDate}T${dropOffTime}`).toISOString();
      const returnTime = new Date(`${dropOffDate}T${dropOffTime}`);
      returnTime.setHours(returnTime.getHours() + 2);
      finalReturn = returnTime.toISOString();
    } else {
      if (!departureAt || !expectedReturnAt) {
        setFormError('Waktu mulai dan selesai wajib diisi untuk layanan Standby.');
        return;
      }
      finalDeparture = new Date(departureAt).toISOString();
      finalReturn = new Date(expectedReturnAt).toISOString();
      if (new Date(finalReturn) <= new Date(finalDeparture)) {
        setFormError('Waktu selesai harus lebih lambat dari waktu mulai keberangkatan.');
        return;
      }
      if (!purpose.trim()) {
        setFormError('Keterangan / keperluan wajib diisi untuk pesanan Standby.');
        return;
      }
    }

    setIsSubmitting(true);

    const payload: any = {
      operationalLocationId,
      pickupLocation: pickupLocation.trim(),
      destination: destination.trim(),
      departureAt: finalDeparture,
      expectedReturnAt: finalReturn,
      passengerCount,
      purpose: purpose.trim() || (serviceType === 'DROP_OFF' ? 'Perjalanan Dinas Drop Off' : 'Standby Operasional'),
      notes: notes.trim() || null,
      serviceType,
    };

    if (preferredVehicle?.id) {
      payload.vehicleId = preferredVehicle.id;
    }

    if (userCoords) {
      payload.userLatitude = userCoords.lat;
      payload.userLongitude = userCoords.lng;
      payload.userAccuracyM = userCoords.accuracyM;
    }

    if (destinationCoords) {
      payload.destinationLatitude = destinationCoords.lat;
      payload.destinationLongitude = destinationCoords.lng;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const queuedAction = enqueueOfflineAction('USER_CREATE_BOOKING', {
          endpoint: '/api/bookings',
          method: 'POST',
          payload,
        });
        setIsSubmitting(false);
        setOfflineNotice(
          `Mode Offline: Permintaan booking tersimpan secara lokal dan akan disinkronkan saat koneksi internet kembali (ID antrean: ${queuedAction.id.slice(0, 8)}).`
        );
        onSuccess?.({
          id: queuedAction.id,
          bookingNumber: `OFFLINE-${queuedAction.id.slice(0, 6).toUpperCase()}`,
          status: 'OFFLINE_PENDING',
          pickupLocation: payload.pickupLocation,
          destination: payload.destination,
          departureAt: payload.departureAt,
          expectedReturnAt: payload.expectedReturnAt,
          passengerCount: payload.passengerCount,
          purpose: payload.purpose,
          notes: payload.notes,
          serviceType: payload.serviceType,
          createdAt: new Date().toISOString(),
        });
        return;
      } catch {
        setFormError('Gagal menyimpan pesanan secara offline.');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409 && json.code === 'NO_DRIVER_AVAILABLE') {
          setNoDriverState({
            booking: json.booking,
            alternatives: json.alternatives || [],
          });
          setIsSubmitting(false);
          return;
        }
        setFormError(json.error?.message || json.message || 'Gagal membuat reservasi');
        setIsSubmitting(false);
        return;
      }

      const created = json.data || json;
      setSubmittedBooking(created);
      onSuccess?.(created);
    } catch {
      setFormError('Terjadi kesalahan jaringan saat mengirimkan pesanan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookAlternative = async (altVehicle: PreferredVehicle) => {
    if (!noDriverState?.booking?.id) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${noDriverState.booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: altVehicle.id }),
      });
      if (res.ok) {
        const json = await res.json();
        setNoDriverState(null);
        setSubmittedBooking(json.data || json);
        onSuccess?.(json.data || json);
      } else {
        const err = await res.json();
        setFormError(err.error?.message || 'Gagal menugaskan kendaraan alternatif.');
      }
    } catch {
      setFormError('Kesalahan jaringan saat memilih kendaraan alternatif.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // If booking was submitted, show live dispatch progress or confirmation
  if (submittedBooking) {
    const isAssigned = ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(
      submittedBooking.status
    );
    const isPending = ['PENDING', 'APPROVED'].includes(submittedBooking.status);
    const isSearching = ['SEARCHING_DRIVER', 'DRIVER_NOTIFIED'].includes(submittedBooking.status);

    const driverName = submittedBooking.driver?.user?.name || 'Driver Operasional';
    const driverPhone = submittedBooking.driver?.user?.phone || '';
    const rawDriverPhone = driverPhone.replace(/\D/g, '').replace(/^0/, '62');
    const etaText = formatEta(submittedBooking.etaSeconds, submittedBooking.etaEstimated);

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          isAssigned
            ? 'Driver dikonfirmasi'
            : isPending
              ? 'Pengajuan terkirim'
              : 'Mencari armada'
        }
        description={`Nomor referensi ${submittedBooking.bookingNumber || '\u2014'}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {/* Menunggu validasi admin */}
          {isPending && (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-lg)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4">
                <div className="flex items-start gap-3">
                  <span className="icon-tile bg-[var(--status-warning-border)]/40 text-[var(--status-warning-fg)]">
                    <CalendarDays className="size-4.5" strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--status-warning-fg)]">
                      Menunggu penugasan driver
                    </h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--status-warning-fg)]/85">
                      Pengajuan masuk ke portal Biro Umum / Admin Operasional KCIC. Admin akan
                      memvalidasi jadwal lalu menugaskan driver dan armada.
                    </p>
                  </div>
                </div>
              </div>

              <section className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="eyebrow">Rute diajukan</span>
                  <span
                    className={`pill ${submittedBooking.serviceType === 'STANDBY' ? 'pill-warning' : ''}`}
                  >
                    <span className="pill-dot" aria-hidden="true" />
                    <span>
                      {submittedBooking.serviceType === 'STANDBY'
                        ? 'Standby operasional'
                        : 'Drop off sekali jalan'}
                    </span>
                  </span>
                </div>

                <div className="route-stepper mt-3">
                  <div className="route-point" data-kind="pickup">
                    <span className="route-label">Penjemputan</span>
                    <p className="route-value">{submittedBooking.pickupLocation}</p>
                  </div>
                  <div className="route-point" data-kind="destination">
                    <span className="route-label">Tujuan</span>
                    <p className="route-value">{submittedBooking.destination}</p>
                  </div>
                </div>
              </section>

              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                Status persetujuan dapat dipantau di menu{' '}
                <span className="font-semibold text-slate-900">Pemesanan saya</span>. Notifikasi
                dikirim saat driver telah ditugaskan.
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
                <button type="button" onClick={onClose} className="button-secondary">
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push('/user/bookings');
                  }}
                  className="button-primary"
                >
                  <span>Lihat pemesanan saya</span>
                </button>
              </div>
            </div>
          )}

          {/* Mencari armada */}
          {isSearching && (
            <div className="space-y-5 py-4 text-center">
              <div className="relative mx-auto grid size-24 place-items-center">
                <span
                  className="live-ping absolute inset-0 rounded-full bg-[var(--kcic-red-soft)]"
                  aria-hidden="true"
                />
                <span
                  className="absolute size-16 rounded-full border border-[var(--kcic-red)]/25 bg-[var(--kcic-red-soft)]"
                  aria-hidden="true"
                />
                <span className="relative z-10 grid size-12 place-items-center rounded-full bg-[var(--kcic-red)] text-white shadow-[var(--shadow-md)]">
                  <Car className="size-6" strokeWidth={1.8} aria-hidden="true" />
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold tracking-[-0.02em] text-slate-900">
                  Mencari pengemudi terdekat
                </h3>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
                  Sistem auto-dispatch memindai armada standby di hub operasional Anda.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--status-standby-border)] bg-[var(--status-standby-bg)] px-3.5 py-1 text-xs font-medium text-[var(--status-standby-fg)]">
                <span className="relative flex size-1.5" aria-hidden="true">
                  <span className="live-ping absolute inset-0 rounded-full bg-current" />
                  <span className="relative size-1.5 rounded-full bg-current" />
                </span>
                <span>
                  {submittedBooking.status === 'DRIVER_NOTIFIED'
                    ? 'Penawaran terkirim ke driver, menunggu konfirmasi\u2026'
                    : 'Menghubungkan ke armada terbaik\u2026'}
                </span>
              </div>

              <section className="card p-4 text-left">
                <div className="route-stepper">
                  <div className="route-point" data-kind="pickup">
                    <span className="route-label">Penjemputan</span>
                    <p className="route-value">{submittedBooking.pickupLocation}</p>
                  </div>
                  <div className="route-point" data-kind="destination">
                    <span className="route-label">Tujuan</span>
                    <p className="route-value">{submittedBooking.destination}</p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* Driver ditugaskan */}
          {isAssigned && (
            <div className="space-y-3.5">
              <div className="rounded-[var(--radius-lg)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="icon-tile bg-[var(--status-active-fg)] text-white">
                      <Check className="size-4.5" strokeWidth={2.6} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--status-active-fg)]">
                        Driver ditemukan
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--status-active-fg)]/85">
                        {submittedBooking.status === 'ARRIVED'
                          ? 'Driver sudah tiba di titik penjemputan.'
                          : submittedBooking.status === 'IN_PROGRESS'
                            ? 'Perjalanan dinas sedang berlangsung.'
                            : 'Driver sedang menuju titik penjemputan Anda.'}
                      </p>
                    </div>
                  </div>
                  {etaText && (
                    <span className="pill pill-active bg-white">
                      <span className="tabular-nums">ETA {etaText}</span>
                    </span>
                  )}
                </div>
              </div>

              <section className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-[var(--canvas-sunken)] text-sm font-semibold text-slate-700">
                      {driverName.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="truncate text-sm font-semibold text-slate-900">
                          {driverName}
                        </h4>
                        <span className="pill">
                          <span>Driver KCIC</span>
                        </span>
                      </div>
                      <p className="mono-plate mt-0.5 text-[0.6875rem] text-slate-500">
                        {submittedBooking.driver?.licenseNumber
                          ? `SIM ${submittedBooking.driver.licenseNumber}`
                          : 'Pengemudi resmi'}
                      </p>
                    </div>
                  </div>

                  {submittedBooking.vehicle && (
                    <div className="text-right">
                      <span className="mono-plate inline-flex rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[0.6875rem] font-semibold text-slate-800">
                        {submittedBooking.vehicle.plateNumber}
                      </span>
                      <p className="mt-1 max-w-[11rem] truncate text-[0.6875rem] text-slate-500">
                        {submittedBooking.vehicle.brand} {submittedBooking.vehicle.model}
                      </p>
                    </div>
                  )}
                </div>

                {rawDriverPhone && (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3">
                    <a
                      href={`https://wa.me/${rawDriverPhone}?text=${encodeURIComponent(
                        `Halo Pak/Bu ${driverName}, saya penumpang untuk pemesanan #${submittedBooking.bookingNumber}. Saya menunggu di ${submittedBooking.pickupLocation}.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--status-active-fg)] transition-opacity hover:opacity-80"
                    >
                      <MessageSquare className="size-3.5" strokeWidth={2} aria-hidden="true" />
                      <span>WhatsApp</span>
                    </a>

                    <a
                      href={`tel:${driverPhone}`}
                      className="button-secondary min-h-10 py-2"
                    >
                      <Phone className="size-3.5" strokeWidth={2} aria-hidden="true" />
                      <span>Telepon driver</span>
                    </a>
                  </div>
                )}
              </section>

              {submittedBooking.vehicle?.id && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/user/tracking?vehicleId=${submittedBooking.vehicle.id}`);
                  }}
                  className="button-primary w-full"
                >
                  <Navigation className="size-4" strokeWidth={2} aria-hidden="true" />
                  <span>Lacak posisi driver</span>
                  <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col items-stretch gap-2 border-t border-[var(--border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/user/bookings');
              }}
              className="button-primary"
            >
              <span>Lihat daftar pemesanan</span>
            </button>
            <button type="button" onClick={onClose} className="button-secondary">
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Driver belum tersedia
  if (noDriverState) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Driver belum tersedia"
        description="Sistem auto-dispatch belum menemukan driver yang sedang standby"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2.5 text-xs">
            <p className="font-semibold text-[var(--status-warning-fg)]">
              Semua driver di hub ini sedang bertugas atau offline.
            </p>
            <p className="mt-1 leading-relaxed text-[var(--status-warning-fg)]/85">
              Permintaan tersimpan dengan referensi {noDriverState.booking?.bookingNumber}. Pilih
              armada alternatif di bawah atau tunggu penugasan admin.
            </p>
          </div>

          {noDriverState.alternatives.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="eyebrow">Armada alternatif</span>
                <span className="tabular-nums text-[0.6875rem] font-medium text-slate-400">
                  {noDriverState.alternatives.length}
                </span>
              </div>
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {noDriverState.alternatives.map((alt) => (
                  <li
                    key={alt.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="mono-plate text-[0.6875rem] font-semibold text-slate-900">
                        {alt.plateNumber}
                      </span>
                      <p className="truncate text-slate-500">
                        {alt.brand} {alt.model}
                        {alt.seatingCapacity
                          ? ` \u00b7 ${alt.seatingCapacity} kursi`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleBookAlternative(alt)}
                      className="button-primary shrink-0 px-3.5 py-1.5 text-[0.6875rem]"
                    >
                      {isSubmitting && <Spinner size="xs" />}
                      <span>Pilih unit</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-4 py-8 text-center text-xs text-slate-500">
              Tidak ada armada alternatif di hub ini.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
            <button type="button" onClick={() => setNoDriverState(null)} className="button-secondary">
              Kembali ke form
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push('/user/bookings');
              }}
              className="button-primary"
            >
              <span>Ke pemesanan saya</span>
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
      title="Pesan kendaraan dinas"
      description="Pilih hub operasional dan rincian perjalanan dinas Whoosh"
      maxWidth="lg"
    >
      <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        {offlineNotice && (
          <div
            role="status"
            className="rounded-[var(--radius-md)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--status-active-fg)]"
          >
            {offlineNotice}
          </div>
        )}

        {/* GPS */}
        <div
          className={`rounded-[var(--radius-md)] border px-3 py-2.5 text-xs transition-colors ${
            geoStatus === 'granted' && userCoords
              ? 'border-[var(--status-active-border)] bg-[var(--status-active-bg)] text-[var(--status-active-fg)]'
              : geoStatus === 'denied'
                ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-slate-700'
          }`}
        >
          {geoStatus === 'locating' ? (
            <div className="flex items-center gap-2 font-medium">
              <Spinner size="xs" />
              <span>Mendeteksi koordinat GPS perangkat&hellip;</span>
            </div>
          ) : geoStatus === 'granted' && userCoords ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="pill-dot" aria-hidden="true" />
                  <span>GPS terdeteksi</span>
                </span>
                <span className="tabular-nums rounded-[var(--radius-full)] border border-[var(--status-active-border)] bg-white px-2 py-0.5 text-[0.625rem] font-medium">
                  &plusmn;{userCoords.accuracyM} m akurasi
                </span>
              </div>
              <p className="tabular-nums text-[0.6875rem] opacity-85">
                {userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}
                {nearestHubName ? ` \u00b7 Terdekat: ${nearestHubName}` : ''}
              </p>
            </div>
          ) : geoStatus === 'denied' ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CircleAlert className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <span>Izin akses GPS diperlukan</span>
                </span>
                <button
                  type="button"
                  onClick={() => requestUserLocation()}
                  className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--status-error-border)] bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--status-error-fg)]"
                >
                  Izinkan lokasi
                </button>
              </div>
              <p className="text-[0.6875rem] leading-relaxed opacity-85">
                Akses lokasi dipakai untuk menentukan titik penjemputan dan armada terdekat.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                <MapPin className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                <span>Deteksi otomatis titik penjemputan</span>
              </span>
              <button
                type="button"
                onClick={() => requestUserLocation()}
                className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-700"
              >
                Aktifkan GPS
              </button>
            </div>
          )}
        </div>

        <FormField label="Hub operasional keberangkatan" name="operationalLocation" required>
          {loadingLocations ? (
            <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
              <Spinner size="xs" /> Memuat daftar hub&hellip;
            </div>
          ) : (
            <select
              id="operationalLocation"
              value={operationalLocationId}
              onChange={(e) => {
                userManuallySelectedRef.current = true;
                setOperationalLocationId(e.target.value);
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
                Pilih hub operasional stasiun / depo&hellip;
              </option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          )}
        </FormField>

        {/* Jenis layanan */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600">Jenis layanan</span>
          <div className="segmented grid w-full grid-cols-2">
            <button
              type="button"
              onClick={() => setServiceType('DROP_OFF')}
              aria-pressed={serviceType === 'DROP_OFF'}
              className="justify-start py-2"
            >
              <Car className="size-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="font-semibold">Drop off</span>
                <span className="text-[0.625rem] font-normal text-slate-400">Sekali jalan</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setServiceType('STANDBY')}
              aria-pressed={serviceType === 'STANDBY'}
              className="justify-start py-2"
            >
              <Clock className="size-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="font-semibold">Standby</span>
                <span className="text-[0.625rem] font-normal text-slate-400">Seharian</span>
              </span>
            </button>
          </div>
        </div>

        {/* Rute */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Titik penjemputan" name="pickupLocation" required>
            <div className="space-y-1">
              <input
                id="pickupLocation"
                type="text"
                required
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="Contoh: Lobi Stasiun Halim Pintu 2"
              />
              {userCoords && (
                <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const locationText =
                        resolvedAddress ||
                        nearestHubName ||
                        `Titik GPS (${userCoords.lat.toFixed(5)}, ${userCoords.lng.toFixed(5)})`;
                      setPickupLocation(locationText);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 text-[0.6875rem] font-medium text-[var(--kcic-red)] hover:underline"
                  >
                    <MapPin className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span>Gunakan posisi saya</span>
                  </button>
                  {isResolvingAddress ? (
                    <span className="text-[0.625rem] text-slate-400">Mencari alamat&hellip;</span>
                  ) : resolvedAddress ? (
                    <span
                      className="max-w-[14rem] truncate text-[0.625rem] text-slate-500"
                      title={resolvedAddress}
                    >
                      {resolvedAddress}
                    </span>
                  ) : (
                    <span className="tabular-nums text-[0.625rem] text-slate-400">
                      {userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </FormField>

          <FormField label="Destinasi tujuan" name="destination" required>
            <div className="relative">
              <input
                id="destination"
                type="text"
                required
                value={destination}
                onChange={(e) => handleDestinationChange(e.target.value)}
                placeholder="Contoh: Depo Tegalluar / tautan Maps"
                aria-invalid={destinationLinkError ? true : undefined}
                className="pr-9"
              />
              {isResolvingLink && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <Spinner size="xs" />
                </span>
              )}
            </div>
            {destinationCoords && (
              <p className="tabular-nums flex items-center gap-1 pt-0.5 text-[0.6875rem] text-slate-500">
                <MapPin className="size-3 shrink-0 text-[var(--kcic-red)]" strokeWidth={2} aria-hidden="true" />
                <span>
                  {destinationCoords.lat.toFixed(5)}, {destinationCoords.lng.toFixed(5)}
                </span>
              </p>
            )}
            {destinationLinkError && (
              <p role="alert" className="pt-0.5 text-[0.6875rem] font-medium text-[var(--status-error-fg)]">
                {destinationLinkError}
              </p>
            )}
          </FormField>
        </div>

        {/* Jadwal */}
        {serviceType === 'DROP_OFF' ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <Clock className="size-3.5 text-[var(--kcic-red)]" strokeWidth={2} aria-hidden="true" />
                <span>Jadwal penjemputan</span>
              </span>
              <span className="pill">
                <span>Sekali jalan</span>
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="dropOffDate"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Tanggal jemput <span className="text-[var(--kcic-red)]">*</span>
                </label>
                <input
                  id="dropOffDate"
                  type="date"
                  required
                  value={dropOffDate}
                  onChange={(e) => setDropOffDate(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="dropOffTime"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Jam jemput <span className="text-[var(--kcic-red)]">*</span>
                </label>
                <input
                  id="dropOffTime"
                  type="time"
                  required
                  value={dropOffTime}
                  onChange={(e) => setDropOffTime(e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Waktu mulai standby" name="departureAt" required>
              <input
                id="departureAt"
                type="datetime-local"
                required
                value={departureAt}
                onChange={(e) => setDepartureAt(e.target.value)}
                className="tabular-nums"
              />
            </FormField>

            <FormField label="Waktu selesai standby" name="expectedReturnAt" required>
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

        {/* Penumpang & keperluan */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Jumlah penumpang" name="passengerCount" required>
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

          <div className="sm:col-span-2">
            <FormField
              label={serviceType === 'STANDBY' ? 'Keperluan (wajib)' : 'Keperluan (opsional)'}
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
                    ? 'Wajib, misal: standby pimpinan / inspeksi rel'
                    : 'Opsional, misal: antar staf ke Stasiun Halim'
                }
              />
            </FormField>
          </div>
        </div>

        {/* Armada khusus */}
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">Pilihan armada khusus</span>
            {preferredVehicle && (
              <button
                type="button"
                onClick={() => setPreferredVehicle(null)}
                className="cursor-pointer text-[0.6875rem] font-medium text-[var(--kcic-red)] hover:underline"
              >
                Hapus pilihan
              </button>
            )}
          </div>

          {preferredVehicle ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-3 text-xs">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mono-plate font-semibold text-slate-900">
                    {preferredVehicle.plateNumber}
                  </span>
                  {preferredVehicle.status && <StatusBadge status={preferredVehicle.status} />}
                </div>
                <div className="mt-0.5 truncate text-slate-500">
                  {preferredVehicle.brand} {preferredVehicle.model}
                  <span className="tabular-nums"> &middot; {preferredVehicle.seatingCapacity} kursi</span>
                  {preferredVehicle.vehicleType && ` \u00b7 ${preferredVehicle.vehicleType}`}
                </div>
              </div>
              <span className="pill pill-standby shrink-0">
                <span>Terpilih</span>
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="relative">
                <label className="sr-only" htmlFor="vehicle-search">
                  Cari armada
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <input
                  id="vehicle-search"
                  type="text"
                  placeholder="Ketik plat nomor atau tipe mobil&hellip;"
                  value={vehicleSearchQuery}
                  onChange={(e) => setVehicleSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {isSearchingVehicles && (
                <div className="flex items-center gap-1.5 py-1 text-xs text-slate-500">
                  <Spinner size="xs" /> Mencari armada&hellip;
                </div>
              )}
              {vehicleSearchResults.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-white">
                  {vehicleSearchResults.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPreferredVehicle(v);
                          setVehicleSearchQuery('');
                          setVehicleSearchResults([]);
                        }}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-2.5 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-[var(--canvas)]"
                      >
                        <span className="min-w-0">
                          <span className="mono-plate font-semibold text-slate-900">
                            {v.plateNumber}
                          </span>
                          <span className="ml-2 text-slate-500">
                            {v.brand} {v.model}
                            <span className="tabular-nums"> ({v.seatingCapacity} kursi)</span>
                          </span>
                        </span>
                        <StatusBadge status={v.status || 'AVAILABLE'} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[0.6875rem] leading-relaxed text-slate-500">
                Jika dikosongkan, auto-dispatch akan menugaskan armada dan driver terdekat.
              </p>
            </div>
          )}
        </div>

        <FormField label="Catatan tambahan" name="notes">
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Kebutuhan khusus, kontak PIC lapangan, atau rincian perjalanan dinas"
          />
        </FormField>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button type="button" onClick={onClose} className="button-secondary">
            Batal
          </button>
          <button type="submit" disabled={isSubmitting} className="button-primary">
            {isSubmitting && <Spinner size="xs" />}
            <span>Kirim pengajuan</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
