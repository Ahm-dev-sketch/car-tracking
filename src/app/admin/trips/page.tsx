'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, Download, Route, UserRound } from 'lucide-react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
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
        setError(err.error?.message || 'Gagal memuat riwayat perjalanan');
      }
    } catch {
      setError('Kendala jaringan saat memuat riwayat perjalanan');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips(1);
  }, [statusFilter]);

  const columns: Column<AdminTrip>[] = [
    {
      header: 'Tanggal',
      cell: (t) => (
        <div className="text-xs">
          <div className="font-semibold tabular-nums text-slate-900">
            {new Date(t.startedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <div className="tabular-nums text-slate-500">
            {new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Armada',
      cell: (t) => (
        <div className="text-xs">
          <span className="mono-plate block font-semibold text-slate-900">{t.vehicle.plateNumber}</span>
          <span className="block truncate text-slate-500">
            {t.vehicle.brand} {t.vehicle.model}
          </span>
        </div>
      ),
    },
    {
      header: 'Pengemudi',
      cell: (t) => (
        <div className="text-xs">
          <span className="block font-medium text-slate-800">{t.driver.user.name}</span>
          <span className="mono-plate block text-[0.6875rem] text-slate-500">{t.driver.user.phone}</span>
        </div>
      ),
    },
    {
      header: 'Referensi booking',
      cell: (t) =>
        t.booking ? (
          <div className="text-xs">
            <span className="mono-plate block font-medium text-slate-800">{t.booking.bookingNumber}</span>
            <span className="block max-w-[150px] truncate text-slate-500">{t.booking.purpose}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Ad-hoc dispatch</span>
        ),
    },
    {
      header: 'Durasi & jarak',
      cell: (t) => {
        let durationText = 'Berjalan';
        if (t.endedAt) {
          const diffMs = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
          const mins = Math.round(diffMs / 60000);
          durationText = `${mins} mnt`;
        }
        const distText =
          t.distanceMeters !== null && t.distanceMeters !== undefined
            ? `${(t.distanceMeters / 1000).toFixed(1)} km`
            : '—';

        return (
          <div className="text-xs">
            <span className="block font-medium tabular-nums text-slate-800">{durationText}</span>
            <span className="mono-plate block text-[0.6875rem] tabular-nums text-slate-500">{distText}</span>
          </div>
        );
      },
    },
    {
      header: 'Status',
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      header: '',
      cell: (t) => (
        <button
          type="button"
          onClick={() => setSelectedTrip(t)}
          aria-label={`Detail perjalanan ${t.vehicle.plateNumber}`}
          className="grid size-8 cursor-pointer place-items-center rounded-full border border-[var(--border)] bg-white text-slate-400 transition-colors hover:border-[var(--border-strong)] hover:text-slate-700"
        >
          <ChevronRight className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">Audit &amp; log telemetri</span>
          <h1 className="page-heading mt-2">Riwayat perjalanan armada</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Rekam jejak seluruh sesi dinas, rute telemetri GPS, dan audit jarak tempuh.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="button-primary self-start sm:self-auto"
        >
          <Download className="size-4" strokeWidth={1.9} aria-hidden="true" />
          <span>Unduh laporan Excel</span>
        </button>
      </header>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="trip-status-filter"
            className="metric-label"
          >
            Status perjalanan
          </label>
          <select
            id="trip-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto min-w-0 rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
          >
            <option value="">Semua status</option>
            <option value="ACTIVE">Aktif (sedang berjalan)</option>
            <option value="COMPLETED">Selesai</option>
            <option value="ABORTED">Dibatalkan</option>
          </select>
        </div>
        <span className="text-[0.6875rem] tabular-nums text-slate-400">
          {totalRecords} perjalanan tercatat
        </span>
      </div>

      <DataTable
        columns={columns}
        data={trips}
        isLoading={isLoading}
        emptyMessage="Tidak ada riwayat perjalanan ditemukan"
        onRowClick={(t) => setSelectedTrip(t)}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchTrips(p)}
      />

      <Drawer
        isOpen={Boolean(selectedTrip)}
        onClose={() => setSelectedTrip(null)}
        title="Detail audit perjalanan"
        description={selectedTrip ? `Kendaraan ${selectedTrip.vehicle.plateNumber}` : ''}
      >
        {selectedTrip && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <span className="metric-label">Status</span>
              <StatusBadge status={selectedTrip.status} />
            </div>

            <div className="space-y-2 border-b border-[var(--border-subtle)] pb-3">
              <span className="metric-label">Pengemudi &amp; armada</span>
              <div className="space-y-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3.5">
                <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <UserRound className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  {selectedTrip.driver.user.name}
                </p>
                <p className="mono-plate text-[0.6875rem] text-slate-500">
                  SIM {selectedTrip.driver.licenseNumber}
                </p>
                <p className="mono-plate text-[0.6875rem] text-slate-500">
                  Telp {selectedTrip.driver.user.phone}
                </p>
              </div>
              <div className="space-y-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3.5">
                <p className="mono-plate font-semibold text-slate-900">
                  {selectedTrip.vehicle.plateNumber}
                </p>
                <p className="text-slate-600">
                  {selectedTrip.vehicle.brand} {selectedTrip.vehicle.model}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-b border-[var(--border-subtle)] pb-3">
              <span className="metric-label">Telemetri koordinat GPS</span>
              <div className="mono-plate space-y-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3 text-[0.6875rem] tabular-nums">
                <p>
                  Titik mulai {selectedTrip.startLat.toFixed(5)}, {selectedTrip.startLng.toFixed(5)}
                </p>
                {selectedTrip.endLat !== null && selectedTrip.endLat !== undefined && (
                  <p>
                    Titik akhir {selectedTrip.endLat.toFixed(5)}, {selectedTrip.endLng?.toFixed(5)}
                  </p>
                )}
                {selectedTrip.distanceMeters !== null && selectedTrip.distanceMeters !== undefined && (
                  <p>Total jarak {(selectedTrip.distanceMeters / 1000).toFixed(2)} km</p>
                )}
              </div>
            </div>

            {selectedTrip.booking && (
              <div className="space-y-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3.5">
                <span className="metric-label">Reservasi dinas terkait</span>
                <p className="mono-plate flex items-center gap-1.5 font-semibold text-slate-900">
                  <Route className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  {selectedTrip.booking.bookingNumber}
                </p>
                <p className="text-slate-600">{selectedTrip.booking.purpose}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        locations={locations}
      />
    </div>
  );
}
