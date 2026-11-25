'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Icon } from '@/components/ui/Icon';
import { ExportReportModal } from '@/components/admin/ExportReportModal';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { translateStatus } from '@/lib/i18n';

interface AdminTrip {
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
  driver: {
    id: string;
    licenseNumber: string;
    user: {
      id: string;
      name: string;
      phone: string;
    };
  };
  booking?: {
    id: string;
    bookingNumber: string;
    purpose: string;
    userId: string;
  } | null;
}

export default function AdminTripsPage() {
  const { locale, t, format } = useTranslation();
  const dateLocale = locale === 'id' ? 'id-ID' : 'en-US';
  const [trips, setTrips] = useState<AdminTrip[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTrip, setSelectedTrip] = useState<AdminTrip | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; code: string }>>([]);

  useEffect(() => {
    fetch('/api/locations')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => setLocations(json.data || []))
      .catch(() => {});
  }, []);

  const fetchTrips = async (targetPage = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/trips?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list: AdminTrip[] = json.data || [];
        setTrips(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setError(err.error?.message || t.adminPages.trips.failedLoad);
      }
    } catch {
      setError(t.adminPages.trips.networkLoadError);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips(1);
  }, [statusFilter]);

  const columns: Column<AdminTrip>[] = [
    {
      header: t.adminPages.trips.colDate,
      cell: (trip) => (
        <div className="text-xs tabular-nums">
          <div className="font-medium text-slate-900">
            {new Date(trip.startedAt).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="text-slate-500">
            {new Date(trip.startedAt).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: t.adminPages.trips.colVehicle,
      cell: (trip) => (
        <div className="text-xs">
          <span className="font-mono font-semibold tabular-nums text-slate-900">{trip.vehicle.plateNumber}</span>
          <span className="block text-slate-500">{trip.vehicle.brand} {trip.vehicle.model}</span>
        </div>
      ),
    },
    {
      header: t.adminPages.trips.colDriver,
      cell: (trip) => (
        <div className="text-xs">
          <span className="font-medium text-slate-900">{trip.driver.user.name}</span>
          <span className="block font-mono text-[11px] tabular-nums text-slate-500">{trip.driver.user.phone}</span>
        </div>
      ),
    },
    {
      header: t.adminPages.trips.colBookingRef,
      cell: (trip) =>
        trip.booking ? (
          <div className="text-xs">
            <span className="font-medium tabular-nums text-slate-900">{trip.booking.bookingNumber}</span>
            <span className="block max-w-[150px] truncate text-slate-500">{trip.booking.purpose}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">{t.adminPages.trips.adHocDispatch}</span>
        ),
    },
    {
      header: t.adminPages.trips.colDurationDist,
      cell: (trip) => {
        let durationText = translateStatus(locale, 'ACTIVE');
        if (trip.endedAt) {
          const diffMs = new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime();
          const mins = Math.round(diffMs / 60000);
          durationText = `${mins} ${locale === 'id' ? 'menit' : 'mins'}`;
        }
        const distText =
          trip.distanceMeters !== null && trip.distanceMeters !== undefined
            ? `${(trip.distanceMeters / 1000).toFixed(1)} km`
            : t.common.noDataDash;

        return (
          <div className="text-xs">
            <span className="font-medium tabular-nums text-slate-900">{durationText}</span>
            <span className="block font-mono text-[11px] tabular-nums text-slate-500">{distText}</span>
          </div>
        );
      },
    },
    {
      header: t.adminPages.trips.colStatus,
      cell: (trip) => <StatusBadge status={trip.status} />,
    },
    {
      header: t.adminPages.trips.colActions,
      cell: (trip) => (
        <button
          type="button"
          onClick={() => setSelectedTrip(trip)}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t.adminPages.trips.detailsBtn}
        </button>
      ),
    },
  ];

  const activeCount = trips.filter((trip) => trip.status === 'ACTIVE').length;
  const completedCount = trips.filter((trip) => trip.status === 'COMPLETED').length;
  const totalDistanceKm = trips.reduce((sum, trip) => sum + (trip.distanceMeters ?? 0), 0) / 1000;

  return (
    <div className="space-y-6">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t.adminPages.trips.heading}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.adminPages.trips.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:self-auto"
        >
          <Icon name="download" className="size-4" />
          <span>{t.adminPages.trips.downloadExcelBtn}</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.statTotal}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.statActive}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.statCompleted}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-success-600">{completedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.statPageDistance}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
            {totalDistanceKm.toFixed(1)} <span className="text-xs font-medium text-slate-500">km</span>
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.statusLabel}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
          >
            <option value="">{t.adminPages.trips.allStatusesOption}</option>
            <option value="ACTIVE">{translateStatus(locale, 'ACTIVE')}</option>
            <option value="COMPLETED">{translateStatus(locale, 'COMPLETED')}</option>
            <option value="ABORTED">{translateStatus(locale, 'ABORTED')}</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={trips}
        isLoading={isLoading}
        emptyMessage={t.adminPages.trips.emptyMessage}
        onRowClick={(trip) => setSelectedTrip(trip)}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchTrips(p)}
      />

      {/* Trip Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedTrip)}
        onClose={() => setSelectedTrip(null)}
        title={t.adminPages.trips.drawerTitle}
        description={selectedTrip ? format(t.adminPages.trips.drawerDesc, { plate: selectedTrip.vehicle.plateNumber }) : ''}
      >
        {selectedTrip && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.statusLabel}</span>
              <StatusBadge status={selectedTrip.status} />
            </div>

            <div className="space-y-2 border-b border-slate-200 pb-3">
              <span className="font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.operatorVehicleLabel}</span>
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">{selectedTrip.driver.user.name}</div>
                <div className="font-mono tabular-nums text-slate-600">{t.adminPages.trips.licensePrefix} {selectedTrip.driver.licenseNumber}</div>
                <div className="font-mono tabular-nums text-slate-600">{t.adminPages.trips.phonePrefix} {selectedTrip.driver.user.phone}</div>
              </div>
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-mono font-semibold tabular-nums text-slate-900">{selectedTrip.vehicle.plateNumber}</div>
                <div className="text-slate-600">{selectedTrip.vehicle.brand} {selectedTrip.vehicle.model}</div>
              </div>
            </div>

            <div className="space-y-2 border-b border-slate-200 pb-3">
              <span className="font-medium uppercase tracking-wider text-slate-500">{t.adminPages.trips.telemetryRangeLabel}</span>
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-[11px] tabular-nums text-slate-700">
                <div>{t.adminPages.trips.startPointPrefix} {selectedTrip.startLat.toFixed(5)}, {selectedTrip.startLng.toFixed(5)}</div>
                {selectedTrip.endLat !== null && selectedTrip.endLat !== undefined && (
                  <div>{t.adminPages.trips.endPointPrefix} {selectedTrip.endLat.toFixed(5)}, {selectedTrip.endLng?.toFixed(5)}</div>
                )}
                {selectedTrip.distanceMeters !== null && selectedTrip.distanceMeters !== undefined && (
                  <div>{t.adminPages.trips.distancePrefix} {(selectedTrip.distanceMeters / 1000).toFixed(2)} km</div>
                )}
              </div>
            </div>

            {selectedTrip.booking && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {t.adminPages.trips.associatedBookingLabel}
                </span>
                <div className="font-semibold tabular-nums text-slate-900">{selectedTrip.booking.bookingNumber}</div>
                <div className="text-slate-600">{selectedTrip.booking.purpose}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Export Report Excel Modal */}
      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        locations={locations}
      />
    </div>
  );
}
