'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { DispatchProgress, formatEta } from '@/components/booking/DispatchProgress';
import { Icon } from '@/components/ui/Icon';
import { ExportReportModal } from '@/components/admin/ExportReportModal';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { translateServiceType, translateStatus } from '@/lib/i18n';
import {
  formatBookingDateTime,
  formatJakartaDate,
  formatJakartaTime,
  isLastMinuteBooking,
} from '@/lib/booking-time';
import {
  saveSnapshot,
  getSnapshot,
  enqueueOfflineAction,
  processOfflineQueue,
} from '@/lib/offline-sync';

interface AdminBooking {
  id: string;
  bookingNumber: string;
  pickupLocation: string;
  destination: string;
  departureAt: string;
  expectedReturnAt: string;
  passengerCount: number;
  purpose: string;
  notes?: string | null;
  status: string;
  serviceType?: 'DROP_OFF' | 'STANDBY';
  notaDinasUrl?: string | null;
  notaDinasFilename?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  etaSeconds?: number | null;
  etaEstimated?: boolean;
  operationalLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    status: string;
    homeLocation?: { id: string; name: string; code: string } | null;
    currentLocation?: { id: string; name: string; code: string } | null;
    currentOperationalLocation?: { id: string; name: string; code: string } | null;
  } | null;
  driver?: {
    id: string;
    licenseNumber: string;
    user: {
      name: string;
      phone: string;
    };
  } | null;
}

interface CandidateDriver {
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
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
}

function AdminBookingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { locale, t, format } = useTranslation();

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // Filters synced with URL
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Detail Drawer
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);

  // Intervention / Candidates Modal
  const [interventionBooking, setInterventionBooking] = useState<AdminBooking | null>(null);
  const [candidates, setCandidates] = useState<CandidateDriver[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigningCandidateId, setAssigningCandidateId] = useState<string | null>(null);
  const [interventionError, setInterventionError] = useState<string | null>(null);

  // Cancel Confirm
  const [cancellingBooking, setCancellingBooking] = useState<AdminBooking | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Approval state
  const [approvingBookingId, setApprovingBookingId] = useState<string | null>(null);

  // Reject Nota Dinas state for Admin
  const [rejectingBooking, setRejectingBooking] = useState<AdminBooking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Fleet Drivers & Available Vehicles for Assignment
  const [fleetDrivers, setFleetDrivers] = useState<any[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);

  // Instant render (stale-while-revalidate): seed from last-known snapshots on mount
  // so the table fills immediately; background fetches below revalidate.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const cachedBookings = getSnapshot<AdminBooking[]>('admin_bookings');
    if (cachedBookings && cachedBookings.length > 0) setBookings(cachedBookings);
    const cachedLocations = getSnapshot<LocationOption[]>('locations_list');
    if (cachedLocations && cachedLocations.length > 0) setLocations(cachedLocations);
    const cachedDrivers = getSnapshot<any[]>('driver_list');
    if (cachedDrivers && cachedDrivers.length > 0) setFleetDrivers(cachedDrivers);
    const cachedVehicles = getSnapshot<any[]>('vehicle_list');
    if (cachedVehicles && cachedVehicles.length > 0) setAvailableVehicles(cachedVehicles);
  }, [status]);
  const [vehicleLocationFilter, setVehicleLocationFilter] = useState('');
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [selectedVehicleMap, setSelectedVehicleMap] = useState<Record<string, string>>({});

  // Reject Pending Booking state
  const [rejectingPendingBooking, setRejectingPendingBooking] = useState<AdminBooking | null>(null);
  const [rejectPendingReason, setRejectPendingReason] = useState('');
  const [isRejectingPending, setIsRejectingPending] = useState(false);
  const [rejectPendingError, setRejectPendingError] = useState<string | null>(null);

  // Export Report Excel Modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Fetch locations
  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          const raw: LocationOption[] = json.data || [];
          const uniqueLocations = Array.from(
            new Map(raw.map((loc) => [loc.code || loc.name, loc])).values()
          );
          setLocations(uniqueLocations);
          await saveSnapshot('locations_list', uniqueLocations);
          return;
        }
      } catch {
        // network failure / offline → fall back to snapshot below
      }
      const cached = await getSnapshot<LocationOption[]>('locations_list');
      if (cached?.length) {
        setLocations(cached);
      }
    }
    loadLocations();
  }, []);

  const syncUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.replace(`/admin/bookings?${params.toString()}`);
  };

  const fetchBookings = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('locationId', locationFilter);

      const res = await fetch(`/api/bookings?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list: AdminBooking[] = json.data || [];
        setBookings(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
        await saveSnapshot('admin_bookings', list);
        window.dispatchEvent(new Event('bookings:changed'));
      } else {
        const err = await res.json();
        setApiError(err.error?.message || t.adminPages.bookings.failedLoad);
      }
    } catch {
      const cached = await getSnapshot<AdminBooking[]>('admin_bookings');
      if (cached?.length) {
        setBookings(cached);
        setTotalRecords(cached.length);
        setTotalPages(1);
        setPage(1);
        setApiError(t.common.offlineFallback);
      } else {
        setApiError(t.adminPages.bookings.networkLoadError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(1);
    syncUrlParams({
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [statusFilter, locationFilter]);

  // Re-sync offline queue when connection returns or another tab signals completion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncAndRefetch = () => {
      processOfflineQueue().then(() => fetchBookings(page));
    };
    window.addEventListener('offline-sync:complete', syncAndRefetch);
    window.addEventListener('online', syncAndRefetch);
    return () => {
      window.removeEventListener('offline-sync:complete', syncAndRefetch);
      window.removeEventListener('online', syncAndRefetch);
    };
  }, [page]);

  const fetchAvailableVehicles = async (locId?: string) => {
    setIsLoadingVehicles(true);
    try {
      const url = `/api/vehicles?status=AVAILABLE&limit=50${locId ? `&locationId=${encodeURIComponent(locId)}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        setAvailableVehicles(data);
        await saveSnapshot('vehicle_list', data);
      }
    } catch {
      const cached = await getSnapshot<any[]>('vehicle_list');
      if (cached?.length) {
        setAvailableVehicles(cached);
      }
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  // Open manual assign / candidates modal
  const handleOpenIntervention = async (b: AdminBooking) => {
    setInterventionBooking(b);
    setCandidates([]);
    setFleetDrivers([]);
    setAvailableVehicles([]);
    setSelectedVehicleMap({});
    setInterventionError(null);
    setLoadingCandidates(true);

    const initialLocation = b.operationalLocation?.id || locationFilter || '';
    setVehicleLocationFilter(initialLocation);

    let candidatesLoaded = false;
    let driversLoaded = false;
    let vehiclesLoaded = false;

    try {
      const vehicleUrl = `/api/vehicles?status=AVAILABLE&limit=50${initialLocation ? `&locationId=${encodeURIComponent(initialLocation)}` : ''}`;
      const [candRes, driverRes, vehicleRes] = await Promise.allSettled([
        fetch(`/api/admin/dispatch/${b.id}/candidates`),
        fetch(`/api/drivers?status=AVAILABLE&limit=50`),
        fetch(vehicleUrl),
      ]);

      if (candRes.status === 'fulfilled' && candRes.value.ok) {
        const json = await candRes.value.json();
        const data = json.data || [];
        setCandidates(data);
        await saveSnapshot('admin_candidates', data);
        candidatesLoaded = true;
      }

      if (driverRes.status === 'fulfilled' && driverRes.value.ok) {
        const json = await driverRes.value.json();
        const data = json.data || [];
        setFleetDrivers(data);
        await saveSnapshot('driver_list', data);
        driversLoaded = true;
      }

      if (vehicleRes.status === 'fulfilled' && vehicleRes.value.ok) {
        const json = await vehicleRes.value.json();
        const data = json.data || [];
        setAvailableVehicles(data);
        await saveSnapshot('vehicle_list', data);
        vehiclesLoaded = true;
      }
    } catch {
      // network failure / offline → fall back to snapshots below
    }

    // Show last-known availability when offline
    if (!candidatesLoaded) {
      const cached = await getSnapshot<CandidateDriver[]>('admin_candidates');
      if (cached?.length) setCandidates(cached);
    }
    if (!driversLoaded) {
      const cached = await getSnapshot<any[]>('driver_list');
      if (cached?.length) setFleetDrivers(cached);
    }
    if (!vehiclesLoaded) {
      const cached = await getSnapshot<any[]>('vehicle_list');
      if (cached?.length) setAvailableVehicles(cached);
    }

    if (!candidatesLoaded && !driversLoaded && !vehiclesLoaded) {
      setInterventionError(t.common.offlineFallback);
    }

    setLoadingCandidates(false);
  };

  const handleManualAssign = async (driverId: string, vehicleId?: string) => {
    if (!interventionBooking) return;
    setAssigningCandidateId(driverId);
    setInterventionError(null);

    const chosenVehicle = vehicleId || selectedVehicleMap[driverId];
    const bookingId = interventionBooking.id;

    const applyOptimisticAssign = () => {
      const candidate = candidates.find((c) => c.driverId === driverId);
      const fleetDriver = fleetDrivers.find((d) => d.id === driverId);
      const driverName = candidate?.driverName || candidate?.name || fleetDriver?.user?.name;

      setBookings((prev) =>
        prev.map((bk) =>
          bk.id === bookingId
            ? {
                ...bk,
                status: 'DRIVER_ASSIGNED',
                driver: driverName
                  ? {
                      id: driverId,
                      licenseNumber: candidate?.licenseNumber || fleetDriver?.licenseNumber || '',
                      user: {
                        name: driverName,
                        phone: candidate?.phone || fleetDriver?.user?.phone || '',
                      },
                    }
                  : bk.driver,
              }
            : bk
        )
      );
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineAction('ADMIN_ASSIGN_BOOKING', {
        endpoint: `/api/admin/bookings/${bookingId}/manual-assign`,
        method: 'POST',
        payload: { driverId, vehicleId: chosenVehicle },
        bookingId,
      });
      applyOptimisticAssign();
      setSuccessMessage(t.adminPages.bookings.offlineSavedQueue);
      setInterventionBooking(null);
      setAssigningCandidateId(null);
      return;
    }

    try {
      const payload: { driverId: string; vehicleId?: string } = { driverId };
      if (chosenVehicle) {
        payload.vehicleId = chosenVehicle;
      }

      const res = await fetch(`/api/admin/bookings/${bookingId}/manual-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setInterventionBooking(null);
        fetchBookings(page);
      } else {
        const err = await res.json();
        setInterventionError(err.error?.message || t.adminPages.bookings.failedAssign);
      }
    } catch {
      await enqueueOfflineAction('ADMIN_ASSIGN_BOOKING', {
        endpoint: `/api/admin/bookings/${bookingId}/manual-assign`,
        method: 'POST',
        payload: { driverId, vehicleId: chosenVehicle },
        bookingId,
      });
      applyOptimisticAssign();
      setSuccessMessage(t.adminPages.bookings.offlineSavedQueue);
      setInterventionBooking(null);
    } finally {
      setAssigningCandidateId(null);
    }
  };

  const handleRejectPendingBooking = async () => {
    if (!rejectingPendingBooking) return;
    if (!rejectPendingReason.trim()) {
      setRejectPendingError(t.adminPages.bookings.rejectPendingRequired);
      return;
    }

    setIsRejectingPending(true);
    setRejectPendingError(null);

    try {
      const res = await fetch(`/api/bookings/${rejectingPendingBooking.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectPendingReason.trim() }),
      });

      if (res.ok) {
        setRejectingPendingBooking(null);
        setRejectPendingReason('');
        fetchBookings(page);
      } else {
        const err = await res.json();
        setRejectPendingError(err.error?.message || t.adminPages.bookings.failedRejectOrder);
      }
    } catch {
      setRejectPendingError(t.adminPages.bookings.networkRejectOrder);
    } finally {
      setIsRejectingPending(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancellingBooking) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/bookings/${cancellingBooking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin cancelled' }),
      });
      if (res.ok) {
        setCancellingBooking(null);
        fetchBookings(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || t.adminPages.bookings.failedCancel);
      }
    } catch {
      setApiError(t.adminPages.bookings.networkCancel);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleApproveCompletion = async (bookingId: string) => {
    setApprovingBookingId(bookingId);
    setApiError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/approve-completion`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setApiError(json.error?.message || t.adminPages.bookings.failedApproveCompletion);
        return;
      }
      const updated = json.data;
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
      );
      if (selectedBooking && selectedBooking.id === updated.id) {
        setSelectedBooking((prev) => (prev ? { ...prev, ...updated } : null));
      }
      setSuccessMessage(
        format(t.adminPages.bookings.approveCompletionSuccess, {
          number: updated.bookingNumber || bookingId,
        })
      );
    } catch {
      setApiError(t.adminPages.bookings.networkApproveCompletion);
    } finally {
      setApprovingBookingId(null);
    }
  };

  const handleRejectCompletion = async () => {
    if (!rejectingBooking) return;
    if (!rejectReason.trim()) {
      setRejectError(t.adminPages.bookings.rejectNotaRequired);
      return;
    }
    setIsRejecting(true);
    setRejectError(null);
    try {
      const res = await fetch(`/api/bookings/${rejectingBooking.id}/reject-completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRejectError(json.error?.message || t.adminPages.bookings.failedRejectNota);
        return;
      }
      const updated = json.data;
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
      );
      if (selectedBooking && selectedBooking.id === updated.id) {
        setSelectedBooking((prev) => (prev ? { ...prev, ...updated } : null));
      }
      setSuccessMessage(
        format(t.adminPages.bookings.rejectNotaSuccess, {
          number: rejectingBooking.bookingNumber,
        })
      );
      setRejectingBooking(null);
      setRejectReason('');
    } catch {
      setRejectError(t.adminPages.bookings.networkRejectNota);
    } finally {
      setIsRejecting(false);
    }
  };

  const columns: Column<AdminBooking>[] = [
    {
      header: t.adminPages.bookings.colBookingNumber,
      accessorKey: 'bookingNumber',
      cell: (b) => (
        <div>
          <span className="text-sm font-semibold tabular-nums text-slate-900">{b.bookingNumber}</span>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                b.serviceType === 'STANDBY'
                  ? 'border-warning-200 bg-warning-50 text-warning-700'
                  : 'border-brand-200 bg-brand-50 text-brand-700'
              }`}
            >
              {translateServiceType(locale, b.serviceType, true)}
            </span>
            {b.operationalLocation && (
              <LocationBadge
                type="home"
                name={b.operationalLocation.name}
                code={b.operationalLocation.code}
              />
            )}
          </div>
        </div>
      ),
    },
    {
      header: t.adminPages.bookings.colRoute,
      cell: (b) => (
        <div className="max-w-[200px]">
          <div className="truncate font-medium text-slate-900">{b.pickupLocation}</div>
          <div className="flex items-center gap-1 truncate text-xs text-slate-500">
            <Icon name="arrow" className="size-3 shrink-0 text-slate-400" />
            <span className="truncate">{b.destination}</span>
          </div>
        </div>
      ),
    },
    {
      header: t.adminPages.bookings.colBookedAt,
      cell: (b) => (
        <div className="text-xs tabular-nums">
          <div className="font-medium text-slate-900">
            {formatJakartaDate(b.createdAt, locale, { includeYear: true })}
          </div>
          <div className="text-slate-500">
            {formatJakartaTime(b.createdAt, locale)}
          </div>
          {isLastMinuteBooking(b.createdAt, b.departureAt) && (
            <span
              title={t.adminPages.bookings.lastMinuteTooltip}
              className="mt-1 inline-flex items-center rounded border border-warning-200 bg-warning-50 px-1.5 py-0.5 text-[10px] font-semibold text-warning-700"
            >
              {t.adminPages.bookings.lastMinuteBadge}
            </span>
          )}
        </div>
      ),
    },
    {
      header: t.adminPages.bookings.colDeparture,
      cell: (b) => (
        <div className="text-xs tabular-nums">
          <div className="font-medium text-slate-900">
            {formatJakartaDate(b.departureAt, locale)}
          </div>
          <div className="text-slate-500">
            {formatJakartaTime(b.departureAt, locale)}
          </div>
        </div>
      ),
    },
    {
      header: t.adminPages.bookings.colEmployee,
      cell: (b) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900">{b.user?.name}</div>
          <div className="text-[11px] tabular-nums text-slate-500">{b.user?.phone}</div>
        </div>
      ),
    },
    {
      header: t.adminPages.bookings.colVehicleDriver,
      cell: (b) => (
        <div className="space-y-1 text-xs">
          {b.vehicle ? (
            <div>
              <div className="flex items-center gap-1 font-mono font-semibold tabular-nums text-slate-800">
                <span>{b.vehicle.plateNumber}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {b.vehicle.homeLocation && (
                  <LocationBadge
                    type="home"
                    name={b.vehicle.homeLocation.name}
                    code={b.vehicle.homeLocation.code}
                  />
                )}
                {(b.vehicle.currentOperationalLocation || b.vehicle.currentLocation) && (
                  <LocationBadge
                    type="current"
                    name={(b.vehicle.currentOperationalLocation || b.vehicle.currentLocation)?.name}
                    code={(b.vehicle.currentOperationalLocation || b.vehicle.currentLocation)?.code}
                  />
                )}
              </div>
            </div>
          ) : (
            <span className="italic text-slate-400">{t.adminPages.bookings.noVehicle}</span>
          )}
          {b.driver ? (
            <div className="max-w-[120px] truncate text-[11px] text-slate-600">
              {format(t.adminPages.bookings.driverPrefix, { name: b.driver.user.name })}
            </div>
          ) : (
            <div className="text-[11px] italic text-slate-400">{t.adminPages.bookings.noDriver}</div>
          )}
        </div>
      ),
    },
    {
      header: t.adminPages.bookings.colStatus,
      cell: (b) => (
        <div className="space-y-1">
          <StatusBadge status={b.status} hasNotaDinas={Boolean(b.notaDinasUrl)} />
          {b.status === 'PENDING_COMPLETION' && b.rejectedReason && (
            <div className="inline-flex items-center gap-1 rounded border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-danger-700">
              {t.adminPages.bookings.notaRejectedTag}
            </div>
          )}
          {b.etaSeconds !== undefined && b.etaSeconds !== null && (
            <div className="text-[10px] tabular-nums text-slate-500">
              {t.adminPages.bookings.etaPrefix} {formatEta(b.etaSeconds, b.etaEstimated)}
            </div>
          )}
        </div>
      ),
    },
    {
      header: t.adminPages.bookings.colActions,
      cell: (b) => {
        const isIntervention = b.status === 'ADMIN_INTERVENTION' || b.status === 'PENDING';
        const canCancel = [
          'PENDING',
          'APPROVED',
          'SEARCHING_DRIVER',
          'DRIVER_NOTIFIED',
          'DRIVER_ASSIGNED',
          'NO_DRIVER_AVAILABLE',
          'ADMIN_INTERVENTION',
        ].includes(b.status);

        return (
          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isIntervention && (
              <button
                type="button"
                onClick={() => handleOpenIntervention(b)}
                className="cursor-pointer rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
              >
                {t.adminPages.bookings.assignDriverBtn}
              </button>
            )}
            {b.status === 'PENDING' && (
              <button
                type="button"
                onClick={() => {
                  setRejectingPendingBooking(b);
                  setRejectPendingReason('');
                  setRejectPendingError(null);
                }}
                className="cursor-pointer rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
              >
                {t.adminPages.bookings.rejectBtn}
              </button>
            )}
            {b.status === 'PENDING_COMPLETION' && (
              b.rejectedReason ? (
                <div className="flex items-center gap-1.5">
                  <span className="rounded-lg border border-danger-200 bg-danger-50 px-2 py-1 text-[11px] font-medium text-danger-700">
                    {t.adminPages.bookings.awaitingUserRevision}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingBooking(b);
                      setRejectReason(b.rejectedReason || '');
                      setRejectError(null);
                    }}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {t.adminPages.bookings.editReasonBtn}
                  </button>
                </div>
              ) : b.notaDinasUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleApproveCompletion(b.id)}
                    disabled={approvingBookingId === b.id}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                  >
                    {approvingBookingId === b.id && <Spinner size="sm" className="text-white" />}
                    <span>{t.adminPages.bookings.approveDoneBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingBooking(b);
                      setRejectReason('');
                      setRejectError(null);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                  >
                    <Icon name="close" className="size-3.5" />
                    <span>{t.adminPages.bookings.rejectNotaBtn}</span>
                  </button>
                </>
              ) : (
                <span className="rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-1 text-[11px] font-medium text-warning-700" title={t.adminPages.bookings.waitingNotaTitle}>
                  {t.adminPages.bookings.waitingNotaTag}
                </span>
              )
            )}
            <button
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t.adminPages.bookings.detailsBtn}
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingBooking(b)}
                className="cursor-pointer rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
              >
                {t.adminPages.bookings.cancelBtn}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const pendingCount = bookings.filter((b) => b.status === 'PENDING' || b.status === 'ADMIN_INTERVENTION').length;
  const awaitingAdminApprovalCount = bookings.filter((b) => b.status === 'PENDING').length;
  const activeCount = bookings.filter((b) =>
    ['SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status)
  ).length;
  // Verification-ready mirrors the nav action-required query (PENDING_COMPLETION
  // + notaDinasUrl + no rejection). The sub-count is not-yet-uploaded only, so
  // neither number can inflate the admin's actionable queue.
  const completionReadyCount = bookings.filter(
    (b) => b.status === 'PENDING_COMPLETION' && Boolean(b.notaDinasUrl) && !b.rejectedReason
  ).length;
  const completionAwaitingUploadCount = bookings.filter(
    (b) => b.status === 'PENDING_COMPLETION' && !b.notaDinasUrl
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t.adminPages.bookings.heading}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {t.adminPages.bookings.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:self-auto"
        >
          <Icon name="download" className="size-4" />
          <span>{t.adminPages.bookings.exportExcelBtn}</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.statTotal}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.statNeedAction}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-warning-600">{pendingCount}</p>
          {awaitingAdminApprovalCount > 0 && (
            <p className="mt-1 text-[10px] font-medium tabular-nums leading-relaxed text-slate-400">
              {format(t.adminPages.bookings.awaitingAdminSub, { count: awaitingAdminApprovalCount })}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.statActiveFleet}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.statReadyVerify}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{completionReadyCount}</p>
          {completionAwaitingUploadCount > 0 && (
            <p className="mt-1 text-[10px] font-medium tabular-nums leading-relaxed text-slate-400">
              {format(t.adminPages.bookings.statWaitingUpload, {
                count: completionAwaitingUploadCount,
              })}
            </p>
          )}
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {successMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success-200 bg-success-50 p-3.5 text-xs text-success-700 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-success-600 text-white">
              <Icon name="check" className="size-3" />
            </span>
            <span className="font-medium leading-relaxed">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="cursor-pointer rounded p-1 text-success-700 transition-colors hover:bg-success-100"
            aria-label={t.adminPages.bookings.dismissToastAria}
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
      )}

      {/* Filter and quick selection bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Quick filter pills */}
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === ''
                ? 'border-brand-200 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.adminPages.bookings.pillAll}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'PENDING'
                ? 'border-warning-200 bg-warning-600 text-white'
                : 'border-slate-200 bg-white text-warning-700 hover:bg-warning-50'
            }`}
          >
            {translateStatus(locale, 'PENDING')}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ADMIN_INTERVENTION')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'ADMIN_INTERVENTION'
                ? 'border-warning-200 bg-warning-600 text-white'
                : 'border-slate-200 bg-white text-warning-700 hover:bg-warning-50'
            }`}
          >
            <Icon name="alert" className="size-3.5 shrink-0" />
            <span>{t.adminPages.bookings.pillIntervention}</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SEARCHING_DRIVER')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'SEARCHING_DRIVER'
                ? 'border-warning-200 bg-warning-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.adminPages.bookings.pillSearching}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'IN_PROGRESS'
                ? 'border-success-200 bg-success-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.adminPages.bookings.pillInProgress}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING_COMPLETION')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'PENDING_COMPLETION'
                ? 'border-warning-200 bg-warning-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.adminPages.bookings.pillPendingNota}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Operational Hub filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.hubFilterLabel}</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">{t.adminPages.bookings.allHubsOption}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.statusFilterLabel}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">{t.adminPages.bookings.allStatusesOption}</option>
              <option value="PENDING">{translateStatus(locale, 'PENDING')}</option>
              <option value="SEARCHING_DRIVER">{translateStatus(locale, 'SEARCHING_DRIVER')}</option>
              <option value="DRIVER_NOTIFIED">{translateStatus(locale, 'DRIVER_NOTIFIED')}</option>
              <option value="DRIVER_ASSIGNED">{translateStatus(locale, 'DRIVER_ASSIGNED')}</option>
              <option value="DRIVER_EN_ROUTE">{translateStatus(locale, 'DRIVER_EN_ROUTE')}</option>
              <option value="ARRIVED">{translateStatus(locale, 'ARRIVED')}</option>
              <option value="IN_PROGRESS">{translateStatus(locale, 'IN_PROGRESS')}</option>
              <option value="PENDING_COMPLETION">{translateStatus(locale, 'PENDING_COMPLETION')}</option>
              <option value="COMPLETED">{translateStatus(locale, 'COMPLETED')}</option>
              <option value="NO_DRIVER_AVAILABLE">{translateStatus(locale, 'NO_DRIVER_AVAILABLE')}</option>
              <option value="ADMIN_INTERVENTION">{translateStatus(locale, 'ADMIN_INTERVENTION')}</option>
              <option value="CANCELLED">{translateStatus(locale, 'CANCELLED')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={bookings}
        isLoading={isLoading}
        onRowClick={(b) => setSelectedBooking(b)}
        emptyMessage={t.adminPages.bookings.emptyMessage}
      />

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchBookings(p)}
      />

      {/* Booking Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title={selectedBooking ? format(t.adminPages.bookings.drawerTitle, { number: selectedBooking.bookingNumber }) : t.adminPages.bookings.drawerFallbackTitle}
        description={
          selectedBooking
            ? format(t.adminPages.bookings.drawerRequestedBy, {
                user: selectedBooking.user?.name,
                email: selectedBooking.user?.email,
              })
            : ''
        }
        footer={
          selectedBooking && (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {selectedBooking.status === 'PENDING_COMPLETION' && (
                  selectedBooking.rejectedReason ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-1.5 text-xs font-medium text-danger-700">
                        {t.adminPages.bookings.notaRejectedRevisionTag}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingBooking(selectedBooking);
                          setRejectReason(selectedBooking.rejectedReason || '');
                          setRejectError(null);
                        }}
                        className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        {t.adminPages.bookings.editReasonBtn}
                      </button>
                    </div>
                  ) : selectedBooking.notaDinasUrl ? (
                    <>
                      <button
                        type="button"
                        disabled={approvingBookingId === selectedBooking.id}
                        onClick={() => handleApproveCompletion(selectedBooking.id)}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                      >
                        {approvingBookingId === selectedBooking.id ? (
                          <Spinner size="sm" className="text-white" />
                        ) : (
                          <Icon name="check" className="size-3.5" />
                        )}
                        <span>{t.adminPages.bookings.approveCompleteBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingBooking(selectedBooking);
                          setRejectReason('');
                          setRejectError(null);
                        }}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-danger-700"
                      >
                        <Icon name="close" className="size-3.5" />
                        <span>{t.adminPages.bookings.rejectNotaBtn}</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-1.5 text-xs font-medium text-warning-700">
                        {t.adminPages.bookings.notaNotUploadedTag}
                      </span>
                    </div>
                  )
                )}
                {(selectedBooking.status === 'ADMIN_INTERVENTION' ||
                  selectedBooking.status === 'PENDING') && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const b = selectedBooking;
                        setSelectedBooking(null);
                        handleOpenIntervention(b);
                      }}
                      className="min-h-9 cursor-pointer rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      {t.adminPages.bookings.assignDriverBtn}
                    </button>
                    {selectedBooking.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => {
                          const b = selectedBooking;
                          setSelectedBooking(null);
                          setRejectingPendingBooking(b);
                          setRejectPendingReason('');
                          setRejectPendingError(null);
                        }}
                        className="min-h-9 cursor-pointer rounded-lg border border-danger-200 bg-white px-3.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                      >
                        {t.adminPages.bookings.rejectOrderBtn}
                      </button>
                    )}
                  </>
                )}
              </div>
              {[
                'PENDING',
                'APPROVED',
                'SEARCHING_DRIVER',
                'DRIVER_NOTIFIED',
                'DRIVER_ASSIGNED',
                'NO_DRIVER_AVAILABLE',
                'ADMIN_INTERVENTION',
              ].includes(selectedBooking.status) && (
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedBooking;
                    setSelectedBooking(null);
                    setCancellingBooking(b);
                  }}
                  className="min-h-9 cursor-pointer rounded-lg border border-transparent px-3.5 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
                >
                  {t.adminPages.bookings.cancelBookingBtn}
                </button>
              )}
            </div>
          )
        }
      >
        {selectedBooking && (
          <div className="space-y-4 text-sm">
            <DispatchProgress
              status={selectedBooking.status}
              etaSeconds={selectedBooking.etaSeconds}
              etaEstimated={selectedBooking.etaEstimated}
              hasNotaDinas={Boolean(selectedBooking.notaDinasUrl)}
            />

            {/* Service Type & Operational Hub */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.serviceTypeLabel}</span>
                <span
                  className={`mt-1 inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${
                    selectedBooking.serviceType === 'STANDBY'
                      ? 'border-warning-200 bg-warning-50 text-warning-700'
                      : 'border-brand-200 bg-brand-50 text-brand-700'
                  }`}
                >
                  {selectedBooking.serviceType === 'STANDBY'
                    ? t.adminPages.bookings.standbyFullLabel
                    : t.adminPages.bookings.dropOffFullLabel}
                </span>
              </div>
              {selectedBooking.operationalLocation && (
                <div className="text-right">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.hubOperationalLabel}</span>
                  <LocationBadge
                    type="home"
                    name={selectedBooking.operationalLocation.name}
                    code={selectedBooking.operationalLocation.code}
                  />
                </div>
              )}
            </div>

            {/* Nota Dinas Verification Section */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
                  <Icon name="bookings" className="size-4 text-brand-600" />
                  <span>{t.adminPages.bookings.verifyNotaTitle}</span>
                </span>
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                    selectedBooking.rejectedReason
                      ? 'border-danger-200 bg-danger-50 text-danger-700'
                      : selectedBooking.notaDinasUrl
                      ? selectedBooking.status === 'PENDING_COMPLETION'
                        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400'
                        : 'border-success-200 bg-success-50 text-success-700'
                      : 'border-warning-200 bg-warning-50 text-warning-700'
                  }`}
                >
                  {selectedBooking.rejectedReason
                    ? t.adminPages.bookings.notaStatusRejected
                    : selectedBooking.notaDinasUrl
                    ? selectedBooking.status === 'PENDING_COMPLETION'
                      ? t.adminPages.bookings.notaStatusPendingVerify
                      : t.adminPages.bookings.notaStatusAttached
                    : t.adminPages.bookings.notaStatusMissing}
                </span>
              </div>

              {selectedBooking.rejectedReason && (
                <div className="space-y-1 rounded-lg border border-danger-200 bg-danger-50 p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-danger-700">
                    <Icon name="close" className="size-3.5 text-danger-600" />
                    <span>{t.adminPages.bookings.notaRejectedAdminHeading}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-danger-700">
                    <span className="font-semibold">{t.adminPages.bookings.reasonPrefix}</span> {selectedBooking.rejectedReason}
                  </p>
                  <p className="text-[10px] italic text-slate-500">
                    {t.adminPages.bookings.waitingRevisionNote}
                  </p>
                </div>
              )}

              {selectedBooking.notaDinasUrl ? (
                <div className="space-y-1.5 pt-1 text-xs">
                  <p className="truncate text-[11px] text-slate-600">
                    {t.adminPages.bookings.filePrefix} <span className="font-medium text-slate-900">{selectedBooking.notaDinasFilename || 'nota-dinas.pdf'}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={`/api/bookings/${selectedBooking.id}/nota-dinas/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Icon name="download" className="size-3.5" />
                      <span>{t.adminPages.bookings.viewDownloadDocBtn}</span>
                    </a>
                    {selectedBooking.status === 'PENDING_COMPLETION' && (
                      selectedBooking.rejectedReason ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-danger-200 bg-danger-50 px-2.5 py-1 text-xs font-medium text-danger-700">
                            {t.adminPages.bookings.notaRejectedInline}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingBooking(selectedBooking);
                              setRejectReason(selectedBooking.rejectedReason || '');
                              setRejectError(null);
                            }}
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            {t.adminPages.bookings.editReasonBtn}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={approvingBookingId === selectedBooking.id}
                            onClick={() => handleApproveCompletion(selectedBooking.id)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                          >
                            {approvingBookingId === selectedBooking.id ? (
                              <Spinner size="sm" className="text-white" />
                            ) : (
                              <Icon name="check" className="size-3.5" />
                            )}
                            <span>{t.adminPages.bookings.approveDoneBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingBooking(selectedBooking);
                              setRejectReason('');
                              setRejectError(null);
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-danger-200 bg-white px-3 py-1 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                          >
                            <Icon name="close" className="size-3.5" />
                            <span>{t.adminPages.bookings.rejectNotaShortBtn}</span>
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-1 text-xs">
                  <p className="text-[11px] leading-relaxed text-slate-600">
                    {selectedBooking.status === 'PENDING_COMPLETION'
                      ? t.adminPages.bookings.waitingNotaUploadDesc
                      : t.adminPages.bookings.noNotaAttachedDesc}
                  </p>
                </div>
              )}
            </div>

            {/* Route */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.pickupLabel}</span>
                <span className="font-medium text-slate-900">{selectedBooking.pickupLocation}</span>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.destinationLabel}</span>
                <span className="font-medium text-slate-900">{selectedBooking.destination}</span>
              </div>
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-3 border-b border-slate-200 pb-3 text-xs">
              <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.bookedAtLabel}</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatBookingDateTime(selectedBooking.createdAt, locale)}
                  </span>
                </div>
                {isLastMinuteBooking(selectedBooking.createdAt, selectedBooking.departureAt) && (
                  <span
                    title={t.adminPages.bookings.lastMinuteTooltip}
                    className="inline-flex items-center rounded border border-warning-200 bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-700"
                  >
                    {t.adminPages.bookings.lastMinuteBadge}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.departureLabel}</span>
                <span className="font-medium tabular-nums text-slate-900">
                  {formatBookingDateTime(selectedBooking.departureAt, locale)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.returnLabel}</span>
                <span className="font-medium tabular-nums text-slate-900">
                  {formatBookingDateTime(selectedBooking.expectedReturnAt, locale)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.passengersLabel}</span>
                <span className="font-medium tabular-nums text-slate-900">{format(t.common.personCount, { count: selectedBooking.passengerCount })}</span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.purposeLabel}</span>
                <span className="font-medium text-slate-900">{selectedBooking.purpose}</span>
              </div>
            </div>

            {/* Vehicle & Driver */}
            {selectedBooking.vehicle && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.assignedAssetLabel}</span>
                <div className="font-mono font-semibold tabular-nums text-slate-900">{selectedBooking.vehicle.plateNumber}</div>
                <div className="text-slate-600">
                  {selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}
                </div>
              </div>
            )}

            {selectedBooking.driver && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.assignedDriverLabel}</span>
                <div className="font-semibold text-slate-900">{selectedBooking.driver.user.name}</div>
                <div className="tabular-nums text-slate-500">{t.adminPages.bookings.phonePrefix} {selectedBooking.driver.user.phone}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Intervention / Candidates Manual Assign Modal */}
      {interventionBooking && (
        <Modal
          isOpen={Boolean(interventionBooking)}
          onClose={() => setInterventionBooking(null)}
          title={t.adminPages.bookings.assignModalTitle}
          description={format(t.adminPages.bookings.assignModalDesc, {
            number: interventionBooking.bookingNumber,
            pickup: interventionBooking.pickupLocation,
            dest: interventionBooking.destination,
          })}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.bookedAtLabel}</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatBookingDateTime(interventionBooking.createdAt, locale)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.bookings.departureLabel}</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatBookingDateTime(interventionBooking.departureAt, locale)}
                  </span>
                </div>
              </div>
              {isLastMinuteBooking(interventionBooking.createdAt, interventionBooking.departureAt) && (
                <span
                  title={t.adminPages.bookings.lastMinuteTooltip}
                  className="inline-flex items-center rounded border border-warning-200 bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-700"
                >
                  {t.adminPages.bookings.lastMinuteBadge}
                </span>
              )}
            </div>
            {interventionError && (
              <ErrorBanner message={interventionError} onDismiss={() => setInterventionError(null)} />
            )}

            {loadingCandidates ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <Spinner size="md" className="mb-2" />
                <p>{t.adminPages.bookings.loadingDriversGps}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Candidate drivers ranked by GPS proximity (if online) */}
                {candidates.length > 0 && (
                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success-700">
                      <span aria-hidden="true" className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-600 opacity-75 motion-reduce:animate-none" />
                        <span className="relative inline-flex size-2 rounded-full bg-success-600" />
                      </span>
                      <span>{format(t.adminPages.bookings.onlineCandidatesHeader, { count: candidates.length })}</span>
                    </span>

                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {candidates.map((c) => {
                        const driverName = c.driverName || c.name || t.adminPages.bookings.driverFallback;
                        const plate = c.plateNumber || c.vehiclePlateNumber || '—';
                        const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
                        const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
                        const isAssigning = assigningCandidateId === c.driverId;
                        const etaText = formatEta(c.etaSeconds, c.etaEstimated);

                        return (
                          <div
                            key={c.driverId}
                            className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">{driverName}</span>
                                {c.phone && <span className="tabular-nums text-slate-500">({c.phone})</span>}
                                {etaText && (
                                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
                                    {t.adminPages.bookings.etaPrefix} {etaText}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-slate-600">
                                <span className="font-mono font-semibold tabular-nums text-slate-800">{plate}</span>
                                {(c.vehicleBrand || c.vehicleModel) && (
                                  <span>
                                    • {c.vehicleBrand} {c.vehicleModel}
                                  </span>
                                )}
                                {c.seatingCapacity && <span>• <span className="tabular-nums">{c.seatingCapacity}</span> {t.common.seats}</span>}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                  <span>{t.common.whatsapp}</span>
                                </a>
                              )}

                              <button
                                type="button"
                                disabled={Boolean(assigningCandidateId)}
                                onClick={() => handleManualAssign(c.driverId)}
                                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                              >
                                {isAssigning ? <Spinner size="sm" className="text-white" /> : t.adminPages.bookings.assignDriverBtn}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Other Online Standby Fleet Drivers */}
                {(() => {
                  const onlineStandbyDrivers = fleetDrivers.filter(
                    (d) =>
                      d.status === 'AVAILABLE' &&
                      d.user?.isActive !== false &&
                      !candidates.some((c) => c.driverId === d.id)
                  );

                  if (candidates.length === 0 && onlineStandbyDrivers.length === 0) {
                    return (
                      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs">
                        <div className="mb-1 flex justify-center">
                          <span className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                            <Icon name="signal" className="size-5" />
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{t.adminPages.bookings.noOnlineDriversTitle}</p>
                        <p className="mx-auto max-w-md leading-relaxed text-slate-600">
                          {t.adminPages.bookings.noOnlineDriversHint}
                        </p>
                      </div>
                    );
                  }

                  if (onlineStandbyDrivers.length === 0) {
                    return null;
                  }

                  return (
                    <div className="space-y-2">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success-700">
                          <span aria-hidden="true" className="size-2 rounded-full bg-success-600" />
                          <span>{format(t.adminPages.bookings.onlineStandbyHeader, { count: onlineStandbyDrivers.length })}</span>
                        </span>

                        {/* Location filter for pool vehicles */}
                        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                          <Icon name="pin" className="size-3 text-slate-500" />
                          <span className="text-[11px] font-medium text-slate-600">{t.adminPages.bookings.vehiclePoolLabel}</span>
                          <select
                            value={vehicleLocationFilter}
                            onChange={(e) => {
                              const newLoc = e.target.value;
                              setVehicleLocationFilter(newLoc);
                              fetchAvailableVehicles(newLoc);
                            }}
                            className="cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
                          >
                            <option value="">{format(t.adminPages.bookings.allLocationsCount, { count: availableVehicles.length })}</option>
                            {Array.from(
                              new Map(locations.map((loc) => [loc.code || loc.name, loc])).values()
                            ).map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name} ({loc.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                        {onlineStandbyDrivers.map((d) => {
                          const isAssigning = assigningCandidateId === d.id;
                          const hasVehicle = Boolean(d.currentVehicle);
                          const chosenVehicle = selectedVehicleMap[d.id] || (d.currentVehicle?.id ?? '');
                          const chosenVehicleObj = availableVehicles.find((v) => v.id === chosenVehicle);

                          const isSameLocation = (
                            locA?: { id?: string | null; code?: string | null; name?: string | null } | null,
                            locB?: { id?: string | null; code?: string | null; name?: string | null } | null
                          ) => {
                            if (!locA || !locB) return false;
                            if (locA.id && locB.id && locA.id === locB.id) return true;
                            if (locA.code && locB.code && locA.code.trim().toLowerCase() === locB.code.trim().toLowerCase()) return true;
                            if (locA.name && locB.name && locA.name.trim().toLowerCase() === locB.name.trim().toLowerCase()) return true;
                            return false;
                          };

                          const isDriverLocationMismatch = Boolean(
                            interventionBooking?.operationalLocation &&
                            hasVehicle &&
                            d.currentVehicle &&
                            !isSameLocation(d.currentVehicle.currentOperationalLocation, interventionBooking.operationalLocation) &&
                            !isSameLocation(d.currentVehicle.homeLocation, interventionBooking.operationalLocation)
                          );

                          const isChosenVehicleMismatch = Boolean(
                            interventionBooking?.operationalLocation &&
                            !hasVehicle &&
                            chosenVehicleObj &&
                            !isSameLocation(chosenVehicleObj.currentOperationalLocation, interventionBooking.operationalLocation) &&
                            !isSameLocation(chosenVehicleObj.homeLocation, interventionBooking.operationalLocation)
                          );

                          const isBlocked = isDriverLocationMismatch || isChosenVehicleMismatch || (!hasVehicle && !chosenVehicle);

                          const driverHubName = d.currentVehicle?.currentOperationalLocation?.name || d.currentVehicle?.homeLocation?.name;
                          const chosenHubName = chosenVehicleObj?.currentOperationalLocation?.name || chosenVehicleObj?.homeLocation?.name;

                          return (
                            <div
                              key={d.id}
                              className={`flex flex-col gap-3 rounded-lg border p-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
                                isDriverLocationMismatch ? 'border-danger-200 bg-danger-50 opacity-80' : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900">{d.user?.name || t.adminPages.bookings.driverFallback}</span>
                                  {d.licenseNumber && (
                                    <span className="text-[10px] font-mono tabular-nums text-slate-500">{t.adminPages.bookings.licensePrefix} {d.licenseNumber}</span>
                                  )}
                                  <span className="rounded border border-success-200 bg-success-50 px-1.5 py-0.5 text-[10px] font-semibold text-success-700">
                                    {t.adminPages.bookings.onlineTag}
                                  </span>
                                  {isDriverLocationMismatch && (
                                    <span className="rounded border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-[10px] font-medium text-danger-700">
                                      {format(t.adminPages.bookings.driverMismatchTag, { hub: driverHubName })}
                                    </span>
                                  )}
                                  {isChosenVehicleMismatch && (
                                    <span className="rounded border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-[10px] font-medium text-danger-700">
                                      {format(t.adminPages.bookings.vehicleMismatchTag, { hub: chosenHubName })}
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[11px] tabular-nums text-slate-600">
                                  {d.user?.phone || t.adminPages.bookings.noPhone}
                                </div>

                                {hasVehicle ? (
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <span className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-slate-900">
                                      {d.currentVehicle.plateNumber}
                                    </span>
                                    <span className="text-[11px] text-slate-600">
                                      {d.currentVehicle.brand} {d.currentVehicle.model}
                                      {driverHubName ? ` (${driverHubName})` : ''}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1 pt-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[11px] font-medium text-slate-500">{t.adminPages.bookings.chooseVehicleLabel}</span>
                                      {isLoadingVehicles ? (
                                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                          <Spinner size="sm" className="text-slate-600" /> {t.adminPages.bookings.loadingVehicles}
                                        </span>
                                      ) : (
                                        <select
                                          value={chosenVehicle}
                                          onChange={(e) =>
                                            setSelectedVehicleMap((prev) => ({
                                              ...prev,
                                              [d.id]: e.target.value,
                                            }))
                                          }
                                          className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-brand-500 focus:outline-none"
                                        >
                                          <option value="">{format(t.adminPages.bookings.chooseVehicleOption, { count: availableVehicles.length })}</option>
                                          {availableVehicles.map((v) => {
                                            const hub = v.currentOperationalLocation?.name || v.homeLocation?.name;
                                            return (
                                              <option key={v.id} value={v.id}>
                                                {v.plateNumber} ({v.brand} {v.model}){hub ? ` — ${hub}` : ''}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      )}
                                    </div>
                                    {availableVehicles.length === 0 && !isLoadingVehicles && (
                                      <span className="text-[10px] font-medium text-warning-700">
                                        {vehicleLocationFilter
                                          ? t.adminPages.bookings.noAvailableVehiclesInHub
                                          : t.adminPages.bookings.noAvailableVehiclesAny}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {isDriverLocationMismatch && (
                                  <p className="pt-0.5 text-[10px] font-medium text-danger-700">
                                    {format(t.adminPages.bookings.driverMismatchNote, {
                                      driverHub: driverHubName,
                                      order: interventionBooking?.operationalLocation?.name,
                                    })}
                                  </p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  disabled={Boolean(assigningCandidateId) || isBlocked}
                                  onClick={() => handleManualAssign(d.id, chosenVehicle || undefined)}
                                  title={
                                    isDriverLocationMismatch || isChosenVehicleMismatch
                                      ? format(t.adminPages.bookings.mismatchTitle, {
                                          loc:
                                            interventionBooking?.operationalLocation?.name ||
                                            t.adminPages.bookings.orderLocationFallback,
                                        })
                                      : !hasVehicle && !chosenVehicle
                                      ? t.adminPages.bookings.pickVehicleFirstTitle
                                      : undefined
                                  }
                                  className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {isAssigning ? <Spinner size="sm" className="text-white" /> : t.adminPages.bookings.assignDriverBtn}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex items-center justify-end border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setInterventionBooking(null)}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Pending Booking Modal */}
      {rejectingPendingBooking && (
        <Modal
          isOpen={Boolean(rejectingPendingBooking)}
          onClose={() => {
            if (!isRejectingPending) {
              setRejectingPendingBooking(null);
              setRejectPendingReason('');
              setRejectPendingError(null);
            }
          }}
          title={t.adminPages.bookings.rejectOrderModalTitle}
          description={format(t.adminPages.bookings.rejectOrderModalDesc, {
            number: rejectingPendingBooking.bookingNumber,
            user: rejectingPendingBooking.user?.name || t.adminPages.bookings.defaultUser,
          })}
          maxWidth="md"
        >
          <div className="space-y-4">
            {rejectPendingError && (
              <ErrorBanner message={rejectPendingError} onDismiss={() => setRejectPendingError(null)} />
            )}

            <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs font-medium leading-relaxed text-warning-700">
              {t.adminPages.bookings.rejectOrderInstructions}
            </div>

            <div>
              <label htmlFor="rejectPendingReason" className="mb-1.5 block text-xs font-semibold text-slate-700">
                {t.adminPages.bookings.rejectReasonLabel} <span className="text-brand-500">*</span>
              </label>
              <textarea
                id="rejectPendingReason"
                rows={3}
                value={rejectPendingReason}
                onChange={(e) => setRejectPendingReason(e.target.value)}
                placeholder={t.adminPages.bookings.rejectOrderPlaceholder}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingPendingBooking(null);
                  setRejectPendingReason('');
                  setRejectPendingError(null);
                }}
                disabled={isRejectingPending}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleRejectPendingBooking}
                disabled={!rejectPendingReason.trim() || isRejectingPending}
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
              >
                {isRejectingPending ? <Spinner size="sm" /> : <Icon name="close" className="size-3.5" />}
                <span>{isRejectingPending ? t.adminPages.bookings.processingBtn : t.adminPages.bookings.rejectOrderBtn}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Nota Dinas Modal */}
      {rejectingBooking && (
        <Modal
          isOpen={Boolean(rejectingBooking)}
          onClose={() => {
            if (!isRejecting) {
              setRejectingBooking(null);
              setRejectReason('');
              setRejectError(null);
            }
          }}
          title={t.adminPages.bookings.rejectNotaModalTitle}
          description={format(t.adminPages.bookings.rejectNotaModalDesc, {
            number: rejectingBooking.bookingNumber,
            pickup: rejectingBooking.pickupLocation,
            dest: rejectingBooking.destination,
          })}
          maxWidth="md"
        >
          <div className="space-y-4">
            {rejectError && <ErrorBanner message={rejectError} onDismiss={() => setRejectError(null)} />}

            <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs font-medium leading-relaxed text-danger-700">
              {t.adminPages.bookings.rejectNotaInstructions}
            </div>

            <div>
              <label htmlFor="rejectReason" className="mb-1.5 block text-xs font-semibold text-slate-700">
                {t.adminPages.bookings.rejectReasonLabel} <span className="text-brand-500">*</span>
              </label>
              <textarea
                id="rejectReason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t.adminPages.bookings.rejectNotaPlaceholder}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingBooking(null);
                  setRejectReason('');
                  setRejectError(null);
                }}
                disabled={isRejecting}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleRejectCompletion}
                disabled={!rejectReason.trim() || isRejecting}
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
              >
                {isRejecting ? <Spinner size="sm" /> : <Icon name="close" className="size-3.5" />}
                <span>{isRejecting ? t.adminPages.bookings.processingBtn : t.adminPages.bookings.rejectNotaBtn}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancellingBooking)}
        onClose={() => setCancellingBooking(null)}
        onConfirm={handleCancelConfirm}
        title={t.adminPages.bookings.cancelModalTitle}
        message={format(t.adminPages.bookings.cancelModalMessage, {
          number: cancellingBooking?.bookingNumber,
        })}
        confirmLabel={t.adminPages.bookings.cancelModalConfirmBtn}
        isDestructive={true}
        isLoading={isCancelling}
      />

      {/* Export Report Excel Modal */}
      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        locations={locations}
      />
    </div>
  );
}

export default function AdminBookingsPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <p>{t.adminPages.bookings.loadingSuspense}</p>
        </div>
      }
    >
      <AdminBookingsContent />
    </Suspense>
  );
}
