'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Drawer } from '@/components/ui/Drawer';
import { useTranslation } from '@/components/providers/LanguageProvider';

interface TripItem {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  startLat: number;
  startLng: number;
  endLat?: number | null;
  endLng?: number | null;
  distanceMeters?: number | null;
  vehicle: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  };
  booking?: {
    id: string;
    bookingNumber: string;
    purpose: string;
  } | null;
}

export default function DriverTripHistoryPage() {
  const { locale, t, format } = useTranslation();
  const dateLocale = locale === 'id' ? 'id-ID' : 'en-US';
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTrip, setSelectedTrip] = useState<TripItem | null>(null);

  const fetchTrips = async (targetPage = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips?page=${targetPage}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        const list: TripItem[] = json.data || [];
        setTrips(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setError(err.error?.message || t.driverPages.history.failedLoad);
      }
    } catch {
      setError(t.driverPages.history.networkError);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips(1);
  }, []);

  const columns: Column<TripItem>[] = [
    {
      header: t.driverPages.history.colDateTime,
      cell: (trip) => (
        <div className="text-xs">
          <div className="font-semibold text-slate-900 tabular-nums">
            {new Date(trip.startedAt).toLocaleDateString(dateLocale, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <div className="text-slate-500 tabular-nums">
            {new Date(trip.startedAt).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: t.driverPages.history.colVehicle,
      cell: (trip) => (
        <div className="text-xs">
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {trip.vehicle.plateNumber}
          </span>
          <span className="block text-slate-500">{trip.vehicle.brand} {trip.vehicle.model}</span>
        </div>
      ),
    },
    {
      header: t.driverPages.history.colBooking,
      cell: (trip) =>
        trip.booking ? (
          <div className="text-xs">
            <span className="font-semibold text-slate-800 tabular-nums">{trip.booking.bookingNumber}</span>
            <span className="block max-w-[150px] truncate text-slate-500">{trip.booking.purpose}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">{t.driverPages.history.adHocTrip}</span>
        ),
    },
    {
      header: t.driverPages.history.colDuration,
      cell: (trip) => {
        if (!trip.endedAt)
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
              <span className="relative inline-flex size-1.5 shrink-0 rounded-full" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-brand-600" />
                <span className="absolute inset-0 rounded-full bg-brand-600 status-ping" />
              </span>
              {t.driverPages.history.activeLabel}
            </span>
          );
        const diffMs = new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime();
        const mins = Math.round(diffMs / 60000);
        return <span className="text-xs text-slate-700 tabular-nums">{mins} {locale === 'id' ? 'menit' : 'mins'}</span>;
      },
    },
    {
      header: t.driverPages.history.colDistance,
      cell: (trip) => (
        <span className="font-mono text-xs text-slate-700 tabular-nums">
          {trip.distanceMeters !== null && trip.distanceMeters !== undefined
            ? `${(trip.distanceMeters / 1000).toFixed(1)} km`
            : t.common.noDataDash}
        </span>
      ),
    },
    {
      header: t.driverPages.history.colStatus,
      cell: (trip) => <StatusBadge status={trip.status} />,
    },
    {
      header: t.driverPages.history.colActions,
      cell: (trip) => (
        <button
          type="button"
          onClick={() => setSelectedTrip(trip)}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {t.driverPages.history.viewBtn}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t.driverPages.history.eyebrow}</p>
          <h1 className="page-heading mt-2">{t.driverPages.history.heading}</h1>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-500">
            {t.driverPages.history.description}
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <DataTable
        columns={columns}
        data={trips}
        isLoading={isLoading}
        emptyMessage={t.driverPages.history.emptyMessage}
        onRowClick={(trip) => setSelectedTrip(trip)}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchTrips(p)}
      />

      {/* Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedTrip)}
        onClose={() => setSelectedTrip(null)}
        title={t.driverPages.history.drawerTitle}
        description={selectedTrip ? format(t.driverPages.history.drawerDesc, { plate: selectedTrip.vehicle.plateNumber }) : ''}
      >
        {selectedTrip && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {t.driverPages.history.statusLabel}
              </span>
              <StatusBadge status={selectedTrip.status} />
            </div>

            <div className="space-y-2 border-b border-slate-100 pb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {t.driverPages.history.timestampsLabel}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] text-slate-400">{t.driverPages.history.startedLabel}</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {new Date(selectedTrip.startedAt).toLocaleString(dateLocale)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">{t.driverPages.history.endedLabel}</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {selectedTrip.endedAt ? new Date(selectedTrip.endedAt).toLocaleString(dateLocale) : t.driverPages.history.inProgressLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-b border-slate-100 pb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {t.driverPages.history.coordinatesLabel}
              </span>
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-600 tabular-nums">
                <div>{t.driverPages.history.startCoordPrefix} {selectedTrip.startLat.toFixed(5)}, {selectedTrip.startLng.toFixed(5)}</div>
                {selectedTrip.endLat !== null && selectedTrip.endLat !== undefined && (
                  <div>{t.driverPages.history.endCoordPrefix} {selectedTrip.endLat.toFixed(5)}, {selectedTrip.endLng?.toFixed(5)}</div>
                )}
              </div>
            </div>

            {selectedTrip.booking && (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {t.driverPages.history.linkedBookingLabel}
                </span>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {selectedTrip.booking.bookingNumber}
                </div>
                <div className="text-slate-600">{selectedTrip.booking.purpose}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
