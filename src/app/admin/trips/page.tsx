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
        <div className="text-xs">
          <div className="font-semibold text-zinc-900">
            {new Date(t.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="text-zinc-500">
            {new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Vehicle',
      cell: (t) => (
        <div className="text-xs">
          <span className="font-mono font-bold text-zinc-900">{t.vehicle.plateNumber}</span>
          <span className="text-zinc-500 block">{t.vehicle.brand} {t.vehicle.model}</span>
        </div>
      ),
    },
    {
      header: 'Driver',
      cell: (t) => (
        <div className="text-xs">
          <span className="font-semibold text-zinc-800">{t.driver.user.name}</span>
          <span className="text-zinc-500 block font-mono text-[11px]">{t.driver.user.phone}</span>
        </div>
      ),
    },
    {
      header: 'Booking Ref',
      cell: (t) =>
        t.booking ? (
          <div className="text-xs">
            <span className="font-medium text-zinc-800">{t.booking.bookingNumber}</span>
            <span className="text-zinc-500 block truncate max-w-[150px]">{t.booking.purpose}</span>
          </div>
        ) : (
          <span className="text-xs text-zinc-400 italic">Ad-hoc dispatch</span>
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
            <span className="font-medium text-zinc-800">{durationText}</span>
            <span className="text-zinc-500 block font-mono text-[11px]">{distText}</span>
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
          className="px-2.5 py-1 text-xs font-black border-2 border-black text-zinc-900 bg-white rounded-lg hover:bg-zinc-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
        >
          Details
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b-2 border-black/10">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950">Trip Audit & Records</h1>
          <p className="text-xs font-medium text-zinc-600 mt-0.5">Comprehensive history of all vehicle tracking sessions and routes</p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg border-2 border-black text-xs font-black shadow-[2px_2px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto transition-transform active:translate-y-0.5"
        >
          <Icon name="download" className="size-4" />
          <span>Download Laporan Excel</span>
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Filter */}
      <div className="surface p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-zinc-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
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
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <span className="text-zinc-400 uppercase font-semibold">Status</span>
              <StatusBadge status={selectedTrip.status} />
            </div>

            <div className="space-y-2 pb-3 border-b border-zinc-100">
              <span className="text-zinc-400 uppercase font-semibold">Operator & Vehicle</span>
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1">
                <div className="font-bold text-zinc-900">{selectedTrip.driver.user.name}</div>
                <div className="text-zinc-600 font-mono">License: {selectedTrip.driver.licenseNumber}</div>
                <div className="text-zinc-600 font-mono">Phone: {selectedTrip.driver.user.phone}</div>
              </div>
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1">
                <div className="font-mono font-bold text-zinc-900">{selectedTrip.vehicle.plateNumber}</div>
                <div className="text-zinc-600">{selectedTrip.vehicle.brand} {selectedTrip.vehicle.model}</div>
              </div>
            </div>

            <div className="space-y-2 pb-3 border-b border-zinc-100">
              <span className="text-zinc-400 uppercase font-semibold">GPS Telemetry Range</span>
              <div className="p-2.5 bg-zinc-50 rounded border border-zinc-200 font-mono text-[11px] space-y-1">
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
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1">
                <span className="text-zinc-400 uppercase font-semibold block text-[10px]">
                  Associated Reservation
                </span>
                <div className="font-bold text-zinc-900">{selectedTrip.booking.bookingNumber}</div>
                <div className="text-zinc-600">{selectedTrip.booking.purpose}</div>
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
