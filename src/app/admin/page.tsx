'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, CalendarDays, Car, ChevronRight, Clock, MapPin, Route, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { InterventionQueue } from '@/components/admin/InterventionQueue';
import { LocationCapacityChart, LocationStatItem } from '@/components/admin/LocationCapacityChart';
import { GreetingClock } from '@/components/ui/GreetingClock';

interface AdminStats {
  vehicles: {
    total: number;
    available: number;
    reserved: number;
    inUse: number;
    maintenance: number;
    inactive: number;
  };
  drivers: {
    online: number;
    busy: number;
    offline: number;
  };
  bookings: {
    active: number;
    searching: number;
    unassigned: number;
    adminIntervention: number;
  };
  byLocation: LocationStatItem[];
}

interface ActiveTripPreview {
  id: string;
  startedAt: string;
  vehicle?: {
    plateNumber: string;
    homeLocationId?: string | null;
    currentLocationId?: string | null;
  } | null;
  booking?: {
    pickupLocation: string;
    destination: string;
    operationalLocationId?: string | null;
  } | null;
  driver?: { user?: { name: string } | null } | null;
}

export default function AdminOverviewPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTripsList, setActiveTripsList] = useState<ActiveTripPreview[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const [statsRes, tripsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/trips?status=ACTIVE&limit=15'),
      ]);

      if (statsRes.ok) {
        const json = await statsRes.json();
        if (json.data) {
          setStats(json.data);
        }
      }

      if (tripsRes.ok) {
        const atJson = await tripsRes.json();
        if (Array.isArray(atJson.data)) {
          setActiveTripsList(atJson.data);
        }
      }
    } catch {
      // ignore
    } finally {
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    loadStats(true);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadStats(false);
      }
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [status]);

  const selectedLoc = stats?.byLocation.find((l) => l.locationId === selectedLocationId);

  const filteredTrips = activeTripsList.filter((t) => {
    if (!selectedLocationId) return true;
    return (
      t.booking?.operationalLocationId === selectedLocationId ||
      t.vehicle?.currentLocationId === selectedLocationId ||
      t.vehicle?.homeLocationId === selectedLocationId
    );
  });

  const availableCount = selectedLoc
    ? selectedLoc.availableVehicles ?? Math.max(0, selectedLoc.vehicles - (selectedLoc.inUseVehicles ?? 0))
    : stats?.vehicles.available;

  const activeTripsCount = selectedLoc
    ? selectedLoc.bookings
    : stats?.bookings.active;

  const maxCapacityCount = selectedLoc
    ? selectedLoc.maxCapacity ?? selectedLoc.vehicles
    : stats?.vehicles.total;

  const inUseCount = selectedLoc
    ? selectedLoc.inUseVehicles ?? 0
    : stats?.vehicles.inUse;

  const metrics = [
    {
      label: selectedLoc ? 'Kapasitas hub' : 'Total armada',
      value: maxCapacityCount,
      caption: selectedLoc
        ? `Maksimal order simultan di ${selectedLoc.name}`
        : 'Aset kendaraan terdaftar',
      icon: Car,
    },
    {
      label: selectedLoc ? `Siap pakai` : 'Armada siap pakai',
      value: availableCount,
      caption: selectedLoc ? `Siap terima booking di ${selectedLoc.name}` : 'Standby di seluruh hub',
      icon: Car,
    },
    {
      label: selectedLoc ? 'Sedang digunakan' : 'Sedang bertugas',
      value: inUseCount,
      caption: selectedLoc ? `Melayani trip di ${selectedLoc.name}` : 'Unit dalam perjalanan aktif',
      icon: Route,
    },
    {
      label: selectedLoc ? 'Order aktif' : 'Perjalanan aktif',
      value: activeTripsCount,
      caption: selectedLoc ? `Order aktif di ${selectedLoc.name}` : 'Order berjalan di seluruh hub',
      icon: Route,
    },
  ];

  const statusGrid = [
    { label: 'Total armada', value: stats?.vehicles.total, caption: 'Unit terdaftar' },
    { label: 'Dipesan', value: stats?.vehicles.reserved, caption: 'Terjadwal' },
    { label: 'Sedang digunakan', value: stats?.vehicles.inUse, caption: 'Sedang di jalan' },
    { label: 'Maintenance', value: stats?.vehicles.maintenance, caption: 'Bengkel servis' },
    { label: 'Tidak aktif', value: stats?.vehicles.inactive, caption: 'Non-aktif' },
    { label: 'Driver bertugas', value: stats?.drivers.busy, caption: 'On-trip' },
    { label: 'Driver standby', value: stats?.drivers.offline, caption: 'Siap dinas' },
    { label: 'Mencari driver', value: stats?.bookings.searching, caption: 'Auto-dispatch' },
    { label: 'Belum ditugaskan', value: stats?.bookings.unassigned, caption: 'Menunggu slot' },
    {
      label: 'Perlu intervensi',
      value: stats?.bookings.adminIntervention,
      caption: 'Timeout dispatch',
      attention: true,
    },
  ];

  return (
    <div className="w-full min-w-0 space-y-6">
      <GreetingClock userName={session?.user?.name} roleLabel="Operations Admin" />

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">
            <span className="size-1.5 rounded-full bg-[var(--kcic-red)]" aria-hidden="true" />
            KCIC Operations Control
          </span>
          <h1 className="page-heading mt-2">Ringkasan Operasional Armada</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Kesiapan aset kendaraan, penugasan pengemudi, dan pemantauan perjalanan aktif di seluruh
            stasiun KCIC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/fleet${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`}
            className="button-primary"
          >
            <MapPin className="size-4" strokeWidth={1.9} aria-hidden="true" />
            <span>Peta armada live</span>
          </Link>
          <Link
            href={`/admin/bookings${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`}
            className="button-secondary"
          >
            <CalendarDays className="size-4" strokeWidth={1.9} aria-hidden="true" />
            <span>Kelola booking</span>
          </Link>
        </div>
      </header>

      {/* Active hub filter */}
      {selectedLoc && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--kcic-red)]/25 bg-[var(--kcic-red-soft)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--kcic-red)] text-white">
              <MapPin className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0 text-xs text-slate-600">
              Menampilkan filter operasional stasiun:{' '}
              <strong className="font-semibold text-[var(--kcic-red)]">
                {selectedLoc.name} ({selectedLoc.code})
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedLocationId('')}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[0.6875rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)]"
          >
            <X className="size-3" strokeWidth={2.4} aria-hidden="true" />
            Reset filter
          </button>
        </div>
      )}

      {/* Metrics */}
      <section aria-label="Metrik ringkasan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="card flex flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="metric-label leading-snug">{metric.label}</span>
              <span className="icon-tile size-8 shrink-0">
                <metric.icon className="size-[0.9375rem]" strokeWidth={1.85} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-3 flex h-8 items-center">
              {isLoading ? (
                <Spinner size="sm" className="text-[var(--kcic-red)]" />
              ) : (
                <span className="metric-value">{metric.value ?? '—'}</span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[0.6875rem] leading-relaxed text-slate-400">
              {metric.caption}
            </p>
          </div>
        ))}
      </section>

      <LocationCapacityChart
        locations={stats?.byLocation || []}
        selectedLocationId={selectedLocationId}
        onSelectLocation={setSelectedLocationId}
      />

      <InterventionQueue onAssigned={loadStats} />

      {/* Status distribution */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <span className="eyebrow">Distribusi status</span>
            <h2 className="section-title mt-1">Status armada &amp; dispatch</h2>
          </div>
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-400">
            <Clock className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
            <span>Diperbarui tiap 20 detik</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[var(--border-subtle)] sm:grid-cols-3 xl:grid-cols-5">
          {statusGrid.map((m) => (
            <div key={m.label} className="bg-white px-4 py-3.5">
              <span
                className={`block text-[0.6875rem] font-semibold leading-snug ${
                  m.attention ? 'text-[var(--status-warning-fg)]' : 'text-slate-500'
                }`}
              >
                {m.label}
              </span>
              <span
                className={`mt-1.5 block text-xl font-bold leading-none tabular-nums tracking-tight ${
                  m.attention ? 'text-[var(--status-warning-fg)]' : 'text-slate-900'
                }`}
              >
                {isLoading ? <Spinner size="xs" /> : (m.value ?? '—')}
              </span>
              <span className="mt-1 block text-[0.625rem] text-slate-400">{m.caption}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Live trips */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <span className="eyebrow">Sedang di jalan</span>
            <h2 className="section-title mt-1">
              Perjalanan berlangsung{' '}
              <span className="font-normal text-slate-400 tabular-nums">({filteredTrips.length})</span>
            </h2>
          </div>
          <Link
            href={`/admin/fleet${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`}
            className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-[var(--kcic-red)] hover:underline"
          >
            <span>Buka peta live</span>
            <ChevronRight className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </div>

        {filteredTrips.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            {isLoading ? (
              <div role="status" className="flex items-center gap-2 text-xs text-slate-500">
                <Spinner size="sm" className="text-[var(--kcic-red)]" />
                <span>Memuat perjalanan aktif…</span>
              </div>
            ) : (
              <>
                <span className="mb-3 grid size-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] text-slate-400">
                  <Route className="size-4" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <p className="text-xs font-semibold text-slate-900">Tidak ada perjalanan aktif</p>
                <p className="mt-1 max-w-xs text-[0.6875rem] leading-relaxed text-slate-500">
                  {selectedLoc
                    ? `Belum ada perjalanan aktif di ${selectedLoc.name}.`
                    : 'Belum ada perjalanan aktif saat ini.'}
                </p>
              </>
            )}
          </div>
        ) : (
          <ul>
            {filteredTrips.map((t) => (
              <li key={t.id} className="list-row items-start sm:items-center">
                <span className="icon-tile">
                  <Car className="size-4" strokeWidth={1.85} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <span className="mono-plate inline-block rounded-[var(--radius-xs)] bg-[var(--canvas)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-slate-700">
                    {t.vehicle?.plateNumber || '—'}
                  </span>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-slate-700">
                    <span className="truncate">
                      {t.booking ? t.booking.pickupLocation : 'Perjalanan ad-hoc'}
                    </span>
                    {t.booking && (
                      <ChevronRight
                        className="size-3 shrink-0 text-slate-300"
                        strokeWidth={2.6}
                        aria-hidden="true"
                      />
                    )}
                    {t.booking && <span className="truncate">{t.booking.destination}</span>}
                  </p>
                </div>

                <div className="shrink-0 pl-11 text-left sm:pl-0 sm:text-right">
                  <p className="text-[0.6875rem] font-semibold text-slate-900">
                    {t.driver?.user?.name || 'Pengemudi ditugaskan'}
                  </p>
                  <p className="mt-0.5 text-[0.625rem] text-slate-400">
                    Mulai <RelativeTime date={t.startedAt} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Hubs */}
      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
          <span className="eyebrow">Jaringan stasiun</span>
          <h2 className="section-title mt-1">
            Stasiun &amp; hub operasional{' '}
            <span className="font-normal text-slate-400 tabular-nums">
              ({stats?.byLocation.length || 0})
            </span>
          </h2>
        </div>

        {stats && stats.byLocation.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
            {stats.byLocation.map((loc) => {
              const isSelected = selectedLocationId === loc.locationId;
              const avail = loc.availableVehicles ?? Math.max(0, loc.vehicles - (loc.inUseVehicles ?? 0));
              const inUse = loc.inUseVehicles ?? 0;
              return (
                <div
                  key={loc.locationId}
                  className={`rounded-[var(--radius-lg)] border p-3.5 transition-colors ${
                    isSelected
                      ? 'border-[var(--kcic-red)]/40 bg-[var(--kcic-red-soft)]'
                      : 'border-[var(--border)] bg-white hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-[0.8125rem] font-semibold text-slate-900">{loc.name}</h3>
                    <span className="mono-plate shrink-0 rounded-[var(--radius-xs)] bg-[var(--canvas)] px-1.5 py-0.5 text-[0.625rem] font-semibold text-slate-500">
                      {loc.code}
                    </span>
                  </div>

                  <div className="mt-3.5 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-[var(--radius-sm)] bg-[var(--canvas)] py-1.5">
                      <span className="metric-label block">Total</span>
                      <span className="mt-0.5 block text-sm font-bold tabular-nums text-slate-900">
                        {loc.vehicles}
                      </span>
                    </div>
                    <div className="rounded-[var(--radius-sm)] bg-[var(--status-active-bg)] py-1.5">
                      <span className="metric-label block text-[var(--status-active-fg)]">Ready</span>
                      <span className="mt-0.5 block text-sm font-bold tabular-nums text-[var(--status-active-fg)]">
                        {avail}
                      </span>
                    </div>
                    <div className="rounded-[var(--radius-sm)] bg-[var(--status-warning-bg)] py-1.5">
                      <span className="metric-label block text-[var(--status-warning-fg)]">In use</span>
                      <span className="mt-0.5 block text-sm font-bold tabular-nums text-[var(--status-warning-fg)]">
                        {inUse}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                    {[
                      { href: `/admin/vehicles?locationId=${loc.locationId}`, label: 'Armada' },
                      { href: `/admin/bookings?locationId=${loc.locationId}`, label: 'Booking' },
                      { href: `/admin/fleet?locationId=${loc.locationId}`, label: 'Peta' },
                    ].map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        className="inline-flex items-center gap-0.5 text-[0.6875rem] font-semibold text-slate-600 transition-colors hover:text-[var(--kcic-red)]"
                      >
                        {link.label}
                        <ArrowRight className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-xs text-slate-400">
            {isLoading ? 'Memuat jaringan stasiun…' : 'Belum ada data hub operasional.'}
          </div>
        )}
      </section>
    </div>
  );
}
