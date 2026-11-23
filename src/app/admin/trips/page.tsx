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
        setError(err.error?.message || 'Failed to load trips');
      }
    } catch {
      setError('Network error loading trips');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips(1);
  }, [statusFilter]);

  const columns: Column<AdminTrip>[] = [
    {
      header: 'Trip Date',
      cell: (t) => (
        <div className="text-xs tabular-nums">
          <div className="font-medium text-slate-900">
            {new Date(t.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="text-slate-500">
            {new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Vehicle',
      cell: (t) => (
        <div className="text-xs">
          <span className="font-mono font-semibold tabular-nums text-slate-900">{t.vehicle.plateNumber}</span>
          <span className="block text-slate-500">{t.vehicle.brand} {t.vehicle.model}</span>
        </div>
      ),
    },
    {
      header: 'Driver',
      cell: (t) => (
        <div className="text-xs">
          <span className="font-medium text-slate-900">{t.driver.user.name}</span>
          <span className="block font-mono text-[11px] tabular-nums text-slate-500">{t.driver.user.phone}</span>
        </div>
      ),
    },
    {
      header: 'Booking Ref',
      cell: (t) =>
        t.booking ? (
          <div className="text-xs">
            <span className="font-medium tabular-nums text-slate-900">{t.booking.bookingNumber}</span>
            <span className="block max-w-[150px] truncate text-slate-500">{t.booking.purpose}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Ad-hoc dispatch</span>
        ),
    },
    {
      header: 'Duration & Dist',
      cell: (t) => {
        let durationText = 'Active';
        if (t.endedAt) {
          const diffMs = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
          const mins = Math.round(diffMs / 60000);
          durationText = `${mins} mins`;
        }
        const distText =
          t.distanceMeters !== null && t.distanceMeters !== undefined
            ? `${(t.distanceMeters / 1000).toFixed(1)} km`
            : '—';

        return (
          <div className="text-xs">
            <span className="font-medium tabular-nums text-slate-900">{durationText}</span>
            <span className="block font-mono text-[11px] tabular-nums text-slate-500">{distText}</span>
          </div>
        );
      },
    },
    {
      header: 'Status',
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      header: 'Actions',
      cell: (t) => (
        <button
          type="button"
          onClick={() => setSelectedTrip(t)}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Details
        </button>
      ),
    },
  ];

  const activeCount = trips.filter((t) => t.status === 'ACTIVE').length;
  const completedCount = trips.filter((t) => t.status === 'COMPLETED').length;
  const totalDistanceKm = trips.reduce((sum, t) => sum + (t.distanceMeters ?? 0), 0) / 1000;

  return (
    <div className="space-y-6">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Trip Audit &amp; Records</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Comprehensive history of all vehicle tracking sessions and routes</p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:self-auto"
        >
          <Icon name="download" className="size-4" />
          <span>Download Laporan Excel</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total Perjalanan</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Berlangsung</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Selesai</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-success-600">{completedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Jarak Halaman Ini</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
            {totalDistanceKm.toFixed(1)} <span className="text-xs font-medium text-slate-500">km</span>
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="ABORTED">ABORTED</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={trips}
        isLoading={isLoading}
        emptyMessage="No trip records found"
        onRowClick={(t) => setSelectedTrip(t)}
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
        title="Trip Record Details"
        description={selectedTrip ? `Vehicle: ${selectedTrip.vehicle.plateNumber}` : ''}
      >
        {selectedTrip && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="font-medium uppercase tracking-wider text-slate-500">Status</span>
              <StatusBadge status={selectedTrip.status} />
            </div>

            <div className="space-y-2 border-b border-slate-200 pb-3">
              <span className="font-medium uppercase tracking-wider text-slate-500">Operator &amp; Vehicle</span>
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">{selectedTrip.driver.user.name}</div>
                <div className="font-mono tabular-nums text-slate-600">License: {selectedTrip.driver.licenseNumber}</div>
                <div className="font-mono tabular-nums text-slate-600">Phone: {selectedTrip.driver.user.phone}</div>
              </div>
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-mono font-semibold tabular-nums text-slate-900">{selectedTrip.vehicle.plateNumber}</div>
                <div className="text-slate-600">{selectedTrip.vehicle.brand} {selectedTrip.vehicle.model}</div>
              </div>
            </div>

            <div className="space-y-2 border-b border-slate-200 pb-3">
              <span className="font-medium uppercase tracking-wider text-slate-500">GPS Telemetry Range</span>
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-[11px] tabular-nums text-slate-700">
                <div>Start Point: {selectedTrip.startLat.toFixed(5)}, {selectedTrip.startLng.toFixed(5)}</div>
                {selectedTrip.endLat !== null && selectedTrip.endLat !== undefined && (
                  <div>End Point: {selectedTrip.endLat.toFixed(5)}, {selectedTrip.endLng?.toFixed(5)}</div>
                )}
                {selectedTrip.distanceMeters !== null && selectedTrip.distanceMeters !== undefined && (
                  <div>Distance: {(selectedTrip.distanceMeters / 1000).toFixed(2)} km</div>
                )}
              </div>
            </div>

            {selectedTrip.booking && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Associated Reservation
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
