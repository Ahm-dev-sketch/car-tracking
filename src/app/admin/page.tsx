'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { InterventionQueue } from '@/components/admin/InterventionQueue';
import { LocationCapacityChart, LocationStatItem } from '@/components/admin/LocationCapacityChart';
import { Icon } from '@/components/ui/Icon';
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
          // Only update stats if we got real data (not a DB-busy fallback without data)
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
      // ignore network errors silently without wiping out existing state
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

  // Filtered active trips
  const filteredTrips = activeTripsList.filter((t) => {
    if (!selectedLocationId) return true;
    return (
      t.booking?.operationalLocationId === selectedLocationId ||
      t.vehicle?.currentLocationId === selectedLocationId ||
      t.vehicle?.homeLocationId === selectedLocationId
    );
  });

  // Calculate dynamic top metrics (either scoped to selected hub or across all network)
  const availableCount = selectedLoc
    ? selectedLoc.availableVehicles ?? Math.max(0, selectedLoc.vehicles - (selectedLoc.inUseVehicles ?? 0))
    : stats?.vehicles.available;

  const activeTripsCount = selectedLoc
    ? selectedLoc.bookings
    : stats?.bookings.active;

  const onlineDriversCount = selectedLoc
    ? selectedLoc.drivers
    : stats?.drivers.online;

  const maxCapacityCount = selectedLoc
    ? selectedLoc.maxCapacity ?? selectedLoc.vehicles
    : stats?.vehicles.total;

  const inUseCount = selectedLoc
    ? selectedLoc.inUseVehicles ?? 0
    : stats?.vehicles.inUse;

  return (
    <div className="min-w-0 space-y-6 text-slate-900 sm:space-y-8">
      <GreetingClock userName={session?.user?.name} roleLabel="Operations Admin" />

      <header className="page-intro">
        <div>
          <p className="eyebrow">KCIC Fleet / Operations overview</p>
          <h1 className="page-heading mt-2">Fleet at a glance</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
            A clear view of your vehicles, people, and journeys. Ready for the decisions ahead.
          </p>
        </div>
        <div className="flex flex-col gap-2 min-[380px]:flex-row sm:flex-wrap sm:justify-end">
          <Link href={`/admin/fleet${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`} className="button-primary">
            <Icon name="pin" />Live fleet map
          </Link>
          <Link href={`/admin/bookings${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`} className="button-secondary">
            <Icon name="calendar" />Manage bookings
          </Link>
        </div>
      </header>

      {/* Filter location status indicator */}
      {selectedLoc && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white text-brand-600">
              <Icon name="pin" className="size-3" />
            </span>
            <span className="text-xs font-medium text-slate-600">
              Menampilkan data terfilter untuk Hub: <strong className="font-semibold text-brand-700">{selectedLoc.name} ({selectedLoc.code})</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedLocationId('')}
            className="shrink-0 cursor-pointer self-start rounded-md border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:self-auto"
          >
            Tampilkan Semua Hub
          </button>
        </div>
      )}

      {/* Bento body */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-12">
        {/* Top strip: KPI tiles */}
        <section aria-label="Fleet overview metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
          {[
            {
              label: selectedLoc ? `Kapasitas Maks Hub` : 'Total Armada',
              value: maxCapacityCount,
              caption: selectedLoc ? `Maksimal order simultan di ${selectedLoc.name}` : 'Aset kendaraan terdaftar',
              icon: 'car' as const,
              iconTone: 'bg-brand-50 text-brand-600',
              live: false,
            },
            {
              label: selectedLoc ? `Armada Available (${selectedLoc.code})` : 'Available fleet',
              value: availableCount,
              caption: selectedLoc ? `Siap terima booking di ${selectedLoc.name}` : 'Ready for dispatch seluruh hub',
              icon: 'car' as const,
              iconTone: 'bg-success-50 text-success-700',
              live: true,
            },
            {
              label: selectedLoc ? `Sedang Digunakan (${selectedLoc.code})` : 'In use fleet',
              value: inUseCount,
              caption: selectedLoc ? `Sedang melayani trip di ${selectedLoc.name}` : 'Unit dalam perjalanan aktif',
              icon: 'route' as const,
              iconTone: 'bg-warning-50 text-warning-700',
              live: false,
            },
            {
              label: selectedLoc ? `Trips / Booking (${selectedLoc.code})` : 'Active trips',
              value: activeTripsCount,
              caption: selectedLoc ? `Order aktif di ${selectedLoc.name}` : 'Assigned / en route seluruh hub',
              icon: 'route' as const,
              iconTone: 'bg-info-100 text-info-600',
              live: true,
            },
          ].map((metric) => (
            <div key={metric.label} className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{metric.label}</h2>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${metric.iconTone}`}>
                  <Icon name={metric.icon} className="size-4" />
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                {metric.live && <span className="relative inline-flex size-1.5 shrink-0 rounded-full bg-success-600 status-ping" aria-hidden="true" />}
                <div className="metric-value text-3xl font-semibold text-slate-900">
                  {isLoading ? <Spinner size="md" /> : (metric.value ?? '—')}
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{metric.caption}</p>
            </div>
          ))}
        </section>

        {/* Main bento row: chart + intervention queue */}
        <div className="min-w-0 lg:col-span-7">
          <LocationCapacityChart
            locations={stats?.byLocation || []}
            selectedLocationId={selectedLocationId}
            onSelectLocation={setSelectedLocationId}
          />
        </div>

        <div className="min-w-0 lg:col-span-5">
          <InterventionQueue onAssigned={loadStats} />
        </div>

        <section aria-labelledby="fleet-health-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white px-5 py-6 sm:px-7 lg:col-span-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">The operational picture</p>
              <h2 id="fleet-health-heading" className="section-title mt-2">Fleet health & dispatch</h2>
            </div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400"><Icon name="clock" className="size-3.5" />Refreshes every 20 seconds</p>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-5 sm:grid-cols-3 xl:grid-cols-5 xl:gap-x-8">
            {[
              { label: 'Total fleet', value: stats?.vehicles.total, caption: 'Registered assets', attention: false },
              { label: 'Reserved', value: stats?.vehicles.reserved, caption: 'Assigned to a booking', attention: false },
              { label: 'In use', value: stats?.vehicles.inUse, caption: 'On an active trip', attention: false },
              { label: 'Maintenance', value: stats?.vehicles.maintenance, caption: 'Service workshop', attention: false },
              { label: 'Inactive', value: stats?.vehicles.inactive, caption: 'Decommissioned', attention: false },
              { label: 'Busy drivers', value: stats?.drivers.busy, caption: 'On a trip', attention: false },
              { label: 'Offline drivers', value: stats?.drivers.offline, caption: 'On standby', attention: false },
              { label: 'Searching for a driver', value: stats?.bookings.searching, caption: 'Auto-dispatch', attention: false },
              { label: 'Unassigned bookings', value: stats?.bookings.unassigned, caption: 'No driver available', attention: false },
              { label: 'Intervention', value: stats?.bookings.adminIntervention, caption: 'Needs assignment', attention: true },
            ].map((metric) => (
              <div key={metric.label} className="min-w-0 border-t border-slate-200 py-4">
                <dt className={`min-h-10 text-[11px] font-semibold uppercase leading-relaxed tracking-wider ${metric.attention ? 'text-warning-700' : 'text-slate-400'}`}>{metric.label}</dt>
                <dd className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${metric.attention ? 'text-warning-700' : 'text-slate-900'}`}>
                  {isLoading ? <Spinner size="sm" /> : (metric.value ?? '—')}
                </dd>
                <dd className="mt-1 text-xs text-slate-500">{metric.caption}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="active-trips-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white px-5 py-6 sm:px-7 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">On the road</p>
              <h2 id="active-trips-heading" className="section-title mt-2 flex items-center gap-2">
                Active trips
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium normal-case tracking-normal tabular-nums text-slate-500">
                  {filteredTrips.length} shown
                </span>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {selectedLoc
                  ? `Perjalanan aktif di hub ${selectedLoc.name} (${selectedLoc.code}).`
                  : 'Vehicles currently underway on live routes across all hubs.'}
              </p>
            </div>
            <Link href={`/admin/fleet${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`} className="button-secondary">
              Live tracking map<Icon name="arrow" className="size-4" />
            </Link>
          </div>

          {filteredTrips.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              {isLoading ? (
                <div role="status" className="flex items-center gap-3 text-sm font-medium text-slate-500"><Spinner size="md" />Loading active trips...</div>
              ) : (
                <>
                  <span className="mb-1 flex size-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400"><Icon name="route" /></span>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedLoc ? `No trips underway at ${selectedLoc.name} right now.` : 'No trips underway right now.'}
                  </p>
                  <p className="max-w-sm text-xs leading-relaxed text-slate-500">Active journeys will appear here as drivers start their trips.</p>
                </>
              )}
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {filteredTrips.map((t) => (
                <li key={t.id} className="flex min-w-0 flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700"><Icon name="car" className="size-4" /></span>
                    <div className="min-w-0">
                      <p className="wrap-anywhere font-mono text-sm font-semibold tracking-wide tabular-nums text-slate-900">{t.vehicle?.plateNumber}</p>
                      <p className="mt-1 wrap-anywhere text-sm leading-relaxed text-slate-600">{t.booking ? `${t.booking.pickupLocation} → ${t.booking.destination}` : 'Ad-hoc trip'}</p>
                    </div>
                  </div>
                  <div className="min-w-0 pl-12 sm:max-w-[45%] sm:pl-0 sm:text-right">
                    <p className="wrap-anywhere text-sm font-medium text-slate-700">Driver: {t.driver?.user?.name || 'Assigned driver'}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">Started <RelativeTime date={t.startedAt} /></p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="locations-heading" className="min-w-0 space-y-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-7 lg:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Across your network</p>
              <h2 id="locations-heading" className="section-title mt-2">Operational locations</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Fleet distribution and active workload at each base.</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-slate-500">{stats?.byLocation.length || 0} operational hubs</span>
          </div>

          {isLoading ? (
            <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm font-medium text-slate-500"><Spinner size="md" />Loading operational locations...</div>
          ) : !stats || stats.byLocation.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
              <Icon name="pin" className="mx-auto mb-3 size-5 text-slate-400" />
              <p className="text-sm font-semibold text-slate-900">No operational locations configured.</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">Your base-by-base fleet overview will appear here when locations are available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {stats.byLocation.map((loc) => {
                const isSelected = selectedLocationId === loc.locationId;
                const avail = loc.availableVehicles ?? Math.max(0, loc.vehicles - (loc.inUseVehicles ?? 0));
                const inUse = loc.inUseVehicles ?? 0;
                return (
                  <article
                    key={loc.locationId}
                    className={`min-w-0 rounded-lg border p-4 transition-colors ${
                      isSelected ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="wrap-anywhere min-w-0 text-sm font-semibold tracking-tight text-slate-900">{loc.name}</h3>
                      <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-slate-500">{loc.code}</span>
                    </div>
                    <dl className="my-3 grid grid-cols-3 gap-1.5">
                      <div className="rounded-md border border-slate-200 bg-white p-2 text-center">
                        <dt className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Maks</dt>
                        <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">{loc.vehicles}</dd>
                      </div>
                      <div className="rounded-md border border-success-200 bg-white p-2 text-center">
                        <dt className="text-[9px] font-semibold uppercase tracking-wider text-success-700">Avail</dt>
                        <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-success-700">{avail}</dd>
                      </div>
                      <div className="rounded-md border border-warning-200 bg-white p-2 text-center">
                        <dt className="text-[9px] font-semibold uppercase tracking-wider text-warning-700">In use</dt>
                        <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-warning-700">{inUse}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-200/80 pt-2.5">
                      <Link href={`/admin/vehicles?locationId=${loc.locationId}`} className="inline-flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">Vehicles<Icon name="arrow" className="size-3" /></Link>
                      <Link href={`/admin/bookings?locationId=${loc.locationId}`} className="inline-flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">Bookings<Icon name="arrow" className="size-3" /></Link>
                      <Link href={`/admin/fleet?locationId=${loc.locationId}`} className="inline-flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">Map<Icon name="arrow" className="size-3" /></Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

