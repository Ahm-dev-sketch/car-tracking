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
  const { data: session } = useSession();
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
        setStats(json.data || null);
      }

      if (tripsRes.ok) {
        const atJson = await tripsRes.json();
        setActiveTripsList(atJson.data || []);
      }
    } catch {
      // ignore
    } finally {
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats(true);
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        void loadStats(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadStats(false);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, []);

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
    <div className="min-w-0 space-y-6 text-zinc-900 sm:space-y-8">
      <GreetingClock userName={session?.user?.name} roleLabel="Operations Admin" />

      <header className="page-intro">
        <div>
          <p className="eyebrow">KCIC Fleet / Operations overview</p>
          <h1 className="page-heading mt-2">Fleet at a glance</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-zinc-500">
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
        <div className="flex items-center justify-between rounded-xl border-2 border-black bg-rose-50 px-4 py-3 shadow-[2px_2px_0px_0px_#000]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-black bg-[#be123c] text-white">
              <Icon name="pin" className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold text-zinc-800">
              Menampilkan data terfilter untuk Hub: <strong className="font-black text-[#be123c]">{selectedLoc.name} ({selectedLoc.code})</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedLocationId('')}
            className="rounded-md border border-black bg-white px-2.5 py-1 text-xs font-black text-zinc-900 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100 cursor-pointer"
          >
            Tampilkan Semua Hub
          </button>
        </div>
      )}

      {/* Top Key Metrics */}
      <section aria-label="Fleet overview metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {[
          {
            label: selectedLoc ? `Kapasitas Maks Hub` : 'Total Armada',
            value: maxCapacityCount,
            caption: selectedLoc ? `Maksimal order simultan di ${selectedLoc.name}` : 'Aset kendaraan terdaftar',
            icon: 'car' as const,
            bgIcon: 'bg-rose-200',
            valColor: 'text-zinc-950',
          },
          {
            label: selectedLoc ? `Armada Available (${selectedLoc.code})` : 'Available fleet',
            value: availableCount,
            caption: selectedLoc ? `Siap terima booking di ${selectedLoc.name}` : 'Ready for dispatch seluruh hub',
            icon: 'car' as const,
            bgIcon: 'bg-emerald-300',
            valColor: 'text-emerald-700',
          },
          {
            label: selectedLoc ? `Sedang Digunakan (${selectedLoc.code})` : 'In use fleet',
            value: inUseCount,
            caption: selectedLoc ? `Sedang melayani trip di ${selectedLoc.name}` : 'Unit dalam perjalanan aktif',
            icon: 'route' as const,
            bgIcon: 'bg-amber-300',
            valColor: 'text-amber-800',
          },
          {
            label: selectedLoc ? `Trips / Booking (${selectedLoc.code})` : 'Active trips',
            value: activeTripsCount,
            caption: selectedLoc ? `Order aktif di ${selectedLoc.name}` : 'Assigned / en route seluruh hub',
            icon: 'route' as const,
            bgIcon: 'bg-sky-200',
            valColor: 'text-zinc-950',
          },
        ].map((metric) => (
          <div key={metric.label} className="surface flex flex-col justify-between p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-600">{metric.label}</h2>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-black ${metric.bgIcon} text-zinc-950 shadow-[2px_2px_0px_0px_#000]`}>
                <Icon name={metric.icon} />
              </span>
            </div>
            <div className={`metric-value mt-4 text-4xl font-black ${metric.valColor}`}>
              {isLoading || !stats ? <Spinner size="md" /> : metric.value}
            </div>
            <p className="mt-2 text-xs font-semibold text-zinc-600">{metric.caption}</p>
          </div>
        ))}
      </section>

      {/* NEW INTERACTIVE CAPACITY & LOAD CHART */}
      <LocationCapacityChart
        locations={stats?.byLocation || []}
        selectedLocationId={selectedLocationId}
        onSelectLocation={setSelectedLocationId}
      />

      <InterventionQueue onAssigned={loadStats} />

      <section aria-labelledby="fleet-health-heading" className="surface px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">The operational picture</p>
            <h2 id="fleet-health-heading" className="section-title mt-2">Fleet health & dispatch</h2>
          </div>
          <p className="flex items-center gap-2 text-xs font-semibold text-zinc-600"><Icon name="clock" className="h-4 w-4" />Refreshes every 20 seconds</p>
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
            <div key={metric.label} className="min-w-0 border-t-2 border-black/10 py-4">
              <dt className={`min-h-10 text-xs font-bold leading-relaxed ${metric.attention ? 'text-amber-800' : 'text-zinc-600'}`}>{metric.label}</dt>
              <dd className={`mt-1 text-2xl font-black tracking-tight tabular-nums ${metric.attention ? 'text-amber-800' : 'text-zinc-950'}`}>
                {isLoading || !stats ? <Spinner size="sm" /> : metric.value}
              </dd>
              <dd className={`mt-1 text-xs font-medium ${metric.attention ? 'text-amber-800' : 'text-zinc-500'}`}>{metric.caption}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="active-trips-heading" className="surface px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">On the road</p>
            <h2 id="active-trips-heading" className="section-title mt-2">
              Active trips{' '}
              <span className="ml-2 rounded-md border-2 border-black bg-zinc-100 px-2 py-0.5 text-xs font-black text-zinc-900 shadow-[1px_1px_0px_0px_#000]">
                {filteredTrips.length} shown
              </span>
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-600">
              {selectedLoc
                ? `Perjalanan aktif di hub ${selectedLoc.name} (${selectedLoc.code}).`
                : 'Vehicles currently underway on live routes across all hubs.'}
            </p>
          </div>
          <Link href={`/admin/fleet${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`} className="button-secondary">
            Live tracking map<Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>

        {filteredTrips.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            {isLoading ? (
              <div role="status" className="flex items-center gap-3 text-sm font-bold text-zinc-600"><Spinner size="md" />Loading active trips...</div>
            ) : (
              <>
                <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black bg-rose-200 text-zinc-950 shadow-[2px_2px_0px_0px_#000]"><Icon name="route" /></span>
                <p className="text-base font-black text-zinc-900">
                  {selectedLoc ? `No trips underway at ${selectedLoc.name} right now.` : 'No trips underway right now.'}
                </p>
                <p className="max-w-sm text-xs font-medium leading-relaxed text-zinc-600">Active journeys will appear here as drivers start their trips.</p>
              </>
            )}
          </div>
        ) : (
          <ul className="mt-5 divide-y-2 divide-black/10">
            {filteredTrips.map((t) => (
              <li key={t.id} className="flex min-w-0 flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-amber-200 text-zinc-950 shadow-[2px_2px_0px_0px_#000]"><Icon name="car" /></span>
                  <div className="min-w-0">
                    <p className="wrap-anywhere font-mono text-sm font-black text-zinc-950">{t.vehicle?.plateNumber}</p>
                    <p className="mt-1 wrap-anywhere text-sm font-medium leading-relaxed text-zinc-700">{t.booking ? `${t.booking.pickupLocation} → ${t.booking.destination}` : 'Ad-hoc trip'}</p>
                  </div>
                </div>
                <div className="min-w-0 pl-14 sm:max-w-[45%] sm:pl-0 sm:text-right">
                  <p className="wrap-anywhere text-sm font-bold text-zinc-800">Driver: {t.driver?.user?.name || 'Assigned driver'}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-500">Started <RelativeTime date={t.startedAt} /></p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="locations-heading" className="surface min-w-0 space-y-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Across your network</p>
            <h2 id="locations-heading" className="section-title mt-2">Operational locations</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-600">Fleet distribution and active workload at each base.</p>
          </div>
          <span className="rounded-md border-2 border-black bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-900 shadow-[1px_1px_0px_0px_#000]">{stats?.byLocation.length || 0} operational hubs</span>
        </div>

        {isLoading || !stats ? (
          <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm font-bold text-zinc-600"><Spinner size="md" />Loading operational locations...</div>
        ) : stats.byLocation.length === 0 ? (
          <div className="rounded-2xl border-2 border-black bg-zinc-50 px-5 py-10 text-center shadow-[3px_3px_0px_0px_#000]">
            <Icon name="pin" className="mx-auto mb-4 h-6 w-6 text-rose-800" />
            <p className="text-base font-black text-zinc-900">No operational locations configured.</p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-zinc-600">Your base-by-base fleet overview will appear here when locations are available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.byLocation.map((loc) => {
              const isSelected = selectedLocationId === loc.locationId;
              const avail = loc.availableVehicles ?? Math.max(0, loc.vehicles - (loc.inUseVehicles ?? 0));
              const inUse = loc.inUseVehicles ?? 0;
              return (
                <article
                  key={loc.locationId}
                  className={`min-w-0 rounded-2xl border-2 border-black p-5 shadow-[4px_4px_0px_0px_#000] transition-all ${
                    isSelected ? 'bg-rose-50 ring-2 ring-[#be123c]' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="wrap-anywhere text-base font-black tracking-tight text-zinc-950">{loc.name}</h3>
                    <span className="shrink-0 rounded-md border-2 border-black bg-rose-200 px-2.5 py-1 font-mono text-xs font-black text-zinc-950 shadow-[1px_1px_0px_0px_#000]">{loc.code}</span>
                  </div>
                  <dl className="my-5 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-black bg-zinc-50 p-2 text-center">
                      <dt className="text-[10px] font-black uppercase text-zinc-500">Maks Armada</dt>
                      <dd className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{loc.vehicles}</dd>
                    </div>
                    <div className="rounded-lg border border-black bg-emerald-50 p-2 text-center">
                      <dt className="text-[10px] font-black uppercase text-emerald-800">Available</dt>
                      <dd className="mt-1 text-2xl font-black tabular-nums text-emerald-800">{avail}</dd>
                    </div>
                    <div className="rounded-lg border border-black bg-amber-50 p-2 text-center">
                      <dt className="text-[10px] font-black uppercase text-amber-800">In Use</dt>
                      <dd className="mt-1 text-2xl font-black tabular-nums text-amber-800">{inUse}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-2 border-black/10 pt-3">
                    <Link href={`/admin/vehicles?locationId=${loc.locationId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black bg-zinc-100 px-2.5 text-xs font-bold text-zinc-900 hover:bg-zinc-200 shadow-[1px_1px_0px_0px_#000]">Vehicles<Icon name="arrow" className="h-3.5 w-3.5" /></Link>
                    <Link href={`/admin/bookings?locationId=${loc.locationId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black bg-zinc-100 px-2.5 text-xs font-bold text-zinc-900 hover:bg-zinc-200 shadow-[1px_1px_0px_0px_#000]">Bookings<Icon name="arrow" className="h-3.5 w-3.5" /></Link>
                    <Link href={`/admin/fleet?locationId=${loc.locationId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black bg-zinc-100 px-2.5 text-xs font-bold text-zinc-900 hover:bg-zinc-200 shadow-[1px_1px_0px_0px_#000]">Map<Icon name="arrow" className="h-3.5 w-3.5" /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

