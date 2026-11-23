'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Drawer } from '@/components/ui/Drawer';

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
        setError(err.error?.message || 'Gagal memuat riwayat perjalanan');
      }
    } catch {
      setError('Kendala jaringan saat memuat data perjalanan');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips(1);
  }, []);

  const columns: Column<TripItem>[] = [
    {
      header: 'Waktu',
      cell: (t) => (
        <div className="whitespace-nowrap text-xs">
          <div className="tabular-nums font-medium text-slate-800">
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
        <div className="min-w-0 max-w-[11rem]">
          <span className="mono-plate block text-[0.6875rem] font-semibold text-slate-900">
            {t.vehicle.plateNumber}
          </span>
          <span className="block truncate text-[0.6875rem] text-slate-500">
            {t.vehicle.brand} {t.vehicle.model}
          </span>
        </div>
      ),
    },
    {
      header: 'Reservasi',
      cell: (t) =>
        t.booking ? (
          <div className="min-w-0 max-w-[12rem]">
            <span className="mono-plate block text-[0.6875rem] font-semibold text-slate-800">
              {t.booking.bookingNumber}
            </span>
            <span className="block truncate text-[0.6875rem] text-slate-500">
              {t.booking.purpose}
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Trip ad-hoc</span>
        ),
    },
    {
      header: 'Durasi',
      cell: (t) => {
        if (!t.endedAt)
          return (
            <span className="pill pill-active">
              <span className="pill-dot animate-pulse" aria-hidden="true" />
              <span>Berlangsung</span>
            </span>
          );
        const diffMs = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
        const mins = Math.round(diffMs / 60000);
        return (
          <span className="tabular-nums whitespace-nowrap text-xs text-slate-700">
            {mins} menit
          </span>
        );
      },
    },
    {
      header: 'Jarak GPS',
      cell: (t) => (
        <span className="tabular-nums whitespace-nowrap text-xs font-medium text-slate-700">
          {t.distanceMeters !== null && t.distanceMeters !== undefined
            ? `${(t.distanceMeters / 1000).toFixed(1)} km`
            : '\u2014'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      header: 'Aksi',
      cell: (t) => (
        <button
          type="button"
          onClick={() => setSelectedTrip(t)}
          className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
        >
          Detail
        </button>
      ),
    },
  ];

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="min-w-0">
        <span className="eyebrow eyebrow-accent">Log pengemudi</span>
        <h1 className="page-heading mt-2">Riwayat perjalanan</h1>
        <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
          Rekapitulasi log tugas, jarak tempuh GPS, dan status operasional armada.
        </p>
      </header>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <DataTable
        columns={columns}
        data={trips}
        isLoading={isLoading}
        emptyMessage="Belum ada riwayat perjalanan yang tercatat"
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
        title="Rincian perjalanan"
        description={selectedTrip ? `Armada ${selectedTrip.vehicle.plateNumber}` : ''}
      >
        {selectedTrip && (
          <div className="space-y-3">
            <section className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow">Status</span>
                <StatusBadge status={selectedTrip.status} />
              </div>

              <dl className="mt-3.5 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3.5">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--canvas)] p-2.5">
                  <dt className="metric-label">Mulai</dt>
                  <dd className="tabular-nums mt-0.5 text-xs font-medium text-slate-800">
                    {new Date(selectedTrip.startedAt).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--canvas)] p-2.5">
                  <dt className="metric-label">Selesai</dt>
                  <dd className="tabular-nums mt-0.5 text-xs font-medium text-slate-800">
                    {selectedTrip.endedAt
                      ? new Date(selectedTrip.endedAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Berlangsung'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card p-4">
              <span className="eyebrow">Jarak tempuh</span>
              <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                <span className="text-xs text-slate-500">Total jarak</span>
                <span className="metric-value text-base">
                  {selectedTrip.distanceMeters !== null &&
                  selectedTrip.distanceMeters !== undefined
                    ? `${(selectedTrip.distanceMeters / 1000).toFixed(2)} km`
                    : 'Belum terdata'}
                </span>
              </div>
              <p className="mono-plate mt-2 border-t border-[var(--border-subtle)] pt-2 text-[0.6875rem] text-slate-500">
                {selectedTrip.startLat.toFixed(4)}, {selectedTrip.startLng.toFixed(4)}
              </p>
            </section>

            {selectedTrip.booking && (
              <section className="card p-4">
                <span className="eyebrow">Reservasi terhubung</span>
                <p className="mono-plate mt-1.5 text-sm font-semibold text-slate-900">
                  {selectedTrip.booking.bookingNumber}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 wrap-anywhere">
                  {selectedTrip.booking.purpose}
                </p>
              </section>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
