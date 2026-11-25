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
import { MotionBentoCard } from '@/components/ui/MotionBentoCard';
import { useTranslation } from '@/components/providers/LanguageProvider';

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
  const { locale, t, format } = useTranslation();
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
  const filteredTrips = activeTripsList.filter((trip) => {
    if (!selectedLocationId) return true;
    return (
      trip.booking?.operationalLocationId === selectedLocationId ||
      trip.vehicle?.currentLocationId === selectedLocationId ||
      trip.vehicle?.homeLocationId === selectedLocationId
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
      <GreetingClock userName={session?.user?.name} roleLabel={t.nav.roleDescAdmin} />

      <header className="page-intro">
        <div>
          <p className="eyebrow">{t.adminPages.dashboard.eyebrow}</p>
          <h1 className="page-heading mt-2">{t.adminPages.dashboard.heading}</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
            {t.adminPages.dashboard.subheading}
          </p>
        </div>
        <div className="flex flex-col gap-2 min-[380px]:flex-row sm:flex-wrap sm:justify-end">
          <Link href={`/admin/fleet${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`} className="button-primary">
            <Icon name="pin" />{t.adminPages.dashboard.liveMapBtn}
          </Link>
          <Link href={`/admin/bookings${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`} className="button-secondary">
            <Icon name="calendar" />{t.adminPages.dashboard.manageBookingsBtn}
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
              {locale === 'id' ? 'Menampilkan data terfilter untuk Hub:' : 'Showing filtered data for Hub:'}{' '}
              <strong className="font-semibold text-brand-700">{selectedLoc.name} ({selectedLoc.code})</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedLocationId('')}
            className="shrink-0 cursor-pointer self-start rounded-md border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:self-auto"
          >
            {t.adminPages.dashboard.showAllHubsBtn}
          </button>
        </div>
      )}

      {/* Bento body */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-12">
        {/* Top strip: KPI tiles */}
        <section aria-label={t.adminPages.dashboard.metricsAria} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
          {[
            {
              label: selectedLoc ? t.adminPages.dashboard.kpiMaxCapLabel : t.adminPages.dashboard.kpiTotalFleetLabel,
              value: maxCapacityCount,
              caption: selectedLoc
                ? format(t.adminPages.dashboard.kpiMaxCapCaption, { hub: selectedLoc.name })
                : t.adminPages.dashboard.kpiTotalFleetCaption,
              icon: 'car' as const,
              iconTone: 'bg-brand-50 text-brand-600',
              live: false,
            },
            {
              label: selectedLoc
                ? format(t.adminPages.dashboard.kpiAvailHubLabel, { code: selectedLoc.code })
                : t.adminPages.dashboard.kpiAvailLabel,
              value: availableCount,
              caption: selectedLoc
                ? format(t.adminPages.dashboard.kpiAvailHubCaption, { hub: selectedLoc.name })
                : t.adminPages.dashboard.kpiAvailCaption,
              icon: 'car' as const,
              iconTone: 'bg-success-50 text-success-700',
              live: true,
            },
            {
              label: selectedLoc
                ? format(t.adminPages.dashboard.kpiInUseHubLabel, { code: selectedLoc.code })
                : t.adminPages.dashboard.kpiInUseLabel,
              value: inUseCount,
              caption: selectedLoc
                ? format(t.adminPages.dashboard.kpiInUseHubCaption, { hub: selectedLoc.name })
                : t.adminPages.dashboard.kpiInUseCaption,
              icon: 'route' as const,
              iconTone: 'bg-warning-50 text-warning-700',
              live: false,
            },
            {
              label: selectedLoc
                ? format(t.adminPages.dashboard.kpiTripsHubLabel, { code: selectedLoc.code })
                : t.adminPages.dashboard.kpiActiveTripsLabel,
              value: activeTripsCount,
              caption: selectedLoc
                ? format(t.adminPages.dashboard.kpiTripsHubCaption, { hub: selectedLoc.name })
                : t.adminPages.dashboard.kpiActiveTripsCaption,
              icon: 'route' as const,
              iconTone: 'bg-info-100 text-info-600',
              live: true,
            },
          ].map((metric, index) => (
            <MotionBentoCard key={metric.label} index={index} className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{metric.label}</h2>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${metric.iconTone}`}>
                  <Icon name={metric.icon} className="size-4" />
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                {metric.live && <span className="relative inline-flex size-1.5 shrink-0 rounded-full bg-success-600 status-ping" aria-hidden="true" />}
                <div className="metric-value text-3xl font-semibold tabular-nums text-slate-900">
                  {isLoading ? <Spinner size="md" /> : (metric.value ?? t.common.noDataDash)}
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{metric.caption}</p>
            </MotionBentoCard>
          ))}
        </section>

        {/* Main bento row: chart + intervention queue */}
        <MotionBentoCard index={4} className="min-w-0 lg:col-span-7">
          <LocationCapacityChart
            locations={stats?.byLocation || []}
            selectedLocationId={selectedLocationId}
            onSelectLocation={setSelectedLocationId}
          />
        </MotionBentoCard>

        <MotionBentoCard index={5} className="min-w-0 lg:col-span-5">
          <InterventionQueue onAssigned={loadStats} />
        </MotionBentoCard>

        <section aria-labelledby="fleet-health-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white px-5 py-6 sm:px-7 lg:col-span-12">
          <MotionBentoCard index={6} className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">{t.adminPages.dashboard.healthEyebrow}</p>
                <h2 id="fleet-health-heading" className="section-title mt-2">{t.adminPages.dashboard.healthTitle}</h2>
              </div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon name="clock" className="size-3.5" />{t.adminPages.dashboard.refreshesEvery20s}</p>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-5 sm:grid-cols-3 xl:grid-cols-5 xl:gap-x-8">
              {[
                { label: t.adminPages.dashboard.healthTotalFleet, value: stats?.vehicles.total, caption: t.adminPages.dashboard.healthTotalFleetCap, attention: false },
                { label: t.adminPages.dashboard.healthReserved, value: stats?.vehicles.reserved, caption: t.adminPages.dashboard.healthReservedCap, attention: false },
                { label: t.adminPages.dashboard.healthInUse, value: stats?.vehicles.inUse, caption: t.adminPages.dashboard.healthInUseCap, attention: false },
                { label: t.adminPages.dashboard.healthMaintenance, value: stats?.vehicles.maintenance, caption: t.adminPages.dashboard.healthMaintenanceCap, attention: false },
                { label: t.adminPages.dashboard.healthInactive, value: stats?.vehicles.inactive, caption: t.adminPages.dashboard.healthInactiveCap, attention: false },
                { label: t.adminPages.dashboard.healthBusyDrivers, value: stats?.drivers.busy, caption: t.adminPages.dashboard.healthBusyDriversCap, attention: false },
                { label: t.adminPages.dashboard.healthOfflineDrivers, value: stats?.drivers.offline, caption: t.adminPages.dashboard.healthOfflineDriversCap, attention: false },
                { label: t.adminPages.dashboard.healthSearching, value: stats?.bookings.searching, caption: t.adminPages.dashboard.healthSearchingCap, attention: false },
                { label: t.adminPages.dashboard.healthUnassigned, value: stats?.bookings.unassigned, caption: t.adminPages.dashboard.healthUnassignedCap, attention: false },
                { label: t.adminPages.dashboard.healthIntervention, value: stats?.bookings.adminIntervention, caption: t.adminPages.dashboard.healthInterventionCap, attention: true },
              ].map((metric) => (
                <div key={metric.label} className="min-w-0 border-t border-slate-200 py-4">
                  <dt className={`min-h-10 text-[11px] font-semibold uppercase leading-relaxed tracking-wider ${metric.attention ? 'text-warning-700' : 'text-slate-400'}`}>{metric.label}</dt>
                  <dd className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${metric.attention ? 'text-warning-700' : 'text-slate-900'}`}>
                    {isLoading ? <Spinner size="sm" /> : (metric.value ?? t.common.noDataDash)}
                  </dd>
                  <dd className="mt-1 text-xs text-slate-500">{metric.caption}</dd>
                </div>
              ))}
            </dl>
          </MotionBentoCard>
        </section>

        <section aria-labelledby="active-trips-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white px-5 py-6 sm:px-7 lg:col-span-7">
          <MotionBentoCard index={7} className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">{t.adminPages.dashboard.onRoadEyebrow}</p>
                <h2 id="active-trips-heading" className="section-title mt-2 flex items-center gap-2">
                  {t.adminPages.dashboard.activeTripsTitle}
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium normal-case tracking-normal tabular-nums text-slate-500">
                    {filteredTrips.length} {locale === 'id' ? 'ditampilkan' : 'shown'}
                  </span>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {selectedLoc
                    ? format(t.adminPages.dashboard.activeTripsDescHub, { hub: `${selectedLoc.name} (${selectedLoc.code})` })
                    : t.adminPages.dashboard.activeTripsDescAll}
                </p>
              </div>
              <Link href={`/admin/fleet${selectedLocationId ? `?locationId=${selectedLocationId}` : ''}`} className="button-secondary">
                {t.adminPages.dashboard.liveMapBtn}<Icon name="arrow" className="size-4" />
              </Link>
            </div>
  
            {filteredTrips.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                {isLoading ? (
                  <div role="status" className="flex items-center gap-3 text-sm font-medium text-slate-500"><Spinner size="md" />{t.adminPages.dashboard.loadingActiveTrips}</div>
                ) : (
                  <>
                    <span className="mb-1 flex size-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400"><Icon name="route" /></span>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedLoc
                        ? format(t.adminPages.dashboard.noActiveTripsHub, { hub: selectedLoc.name })
                        : t.adminPages.dashboard.noActiveTripsAll}
                    </p>
                    <p className="max-w-sm text-xs leading-relaxed text-slate-500">{t.adminPages.dashboard.noActiveTripsHint}</p>
                  </>
                )}
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-slate-100">
                {filteredTrips.map((trip) => (
                  <li key={trip.id} className="flex min-w-0 flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700"><Icon name="car" className="size-4" /></span>
                      <div className="min-w-0">
                        <p className="wrap-anywhere font-mono text-sm font-semibold tracking-wide tabular-nums text-slate-900">{trip.vehicle?.plateNumber}</p>
                        <p className="mt-1 wrap-anywhere text-sm leading-relaxed text-slate-600">{trip.booking ? `${trip.booking.pickupLocation} → ${trip.booking.destination}` : t.adminPages.dashboard.adHocLabel}</p>
                      </div>
                    </div>
                    <div className="min-w-0 pl-12 sm:max-w-[45%] sm:pl-0 sm:text-right">
                      <p className="wrap-anywhere text-sm font-medium text-slate-700">
                        {format(t.adminPages.dashboard.driverPrefix, {
                          name: trip.driver?.user?.name || t.adminPages.dashboard.defaultAssignedDriver,
                        })}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.adminPages.dashboard.startedPrefix}<RelativeTime date={trip.startedAt} /></p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </MotionBentoCard>
        </section>

        <section aria-labelledby="locations-heading" className="min-w-0 space-y-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-7 lg:col-span-5">
          <MotionBentoCard index={8} className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">{t.adminPages.dashboard.networkEyebrow}</p>
                <h2 id="locations-heading" className="section-title mt-2">{t.adminPages.dashboard.locationsTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{t.adminPages.dashboard.locationsDesc}</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-slate-500">
                {stats?.byLocation.length || 0} {locale === 'id' ? 'hub operasional' : 'operational hubs'}
              </span>
            </div>
  
            {isLoading ? (
              <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm font-medium text-slate-500"><Spinner size="md" />{t.adminPages.dashboard.loadingLocations}</div>
            ) : !stats || stats.byLocation.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
                <Icon name="pin" className="mx-auto mb-3 size-5 text-slate-400" />
                <p className="text-sm font-semibold text-slate-900">{t.adminPages.dashboard.noLocationsTitle}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{t.adminPages.dashboard.noLocationsDesc}</p>
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
                          <dt className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t.adminPages.dashboard.shortMax}</dt>
                          <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">{loc.vehicles}</dd>
                        </div>
                        <div className="rounded-md border border-success-200 bg-white p-2 text-center">
                          <dt className="text-[9px] font-semibold uppercase tracking-wider text-success-700">{t.adminPages.dashboard.shortAvail}</dt>
                          <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-success-700">{avail}</dd>
                        </div>
                        <div className="rounded-md border border-warning-200 bg-white p-2 text-center">
                          <dt className="text-[9px] font-semibold uppercase tracking-wider text-warning-700">{t.adminPages.dashboard.shortInUse}</dt>
                          <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-warning-700">{inUse}</dd>
                        </div>
                      </dl>
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-200/80 pt-2.5">
                        <Link href={`/admin/vehicles?locationId=${loc.locationId}`} className="inline-flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">{t.adminPages.dashboard.vehiclesLink}<Icon name="arrow" className="size-3" /></Link>
                        <Link href={`/admin/bookings?locationId=${loc.locationId}`} className="inline-flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">{t.adminPages.dashboard.bookingsLink}<Icon name="arrow" className="size-3" /></Link>
                        <Link href={`/admin/fleet?locationId=${loc.locationId}`} className="inline-flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">{t.adminPages.dashboard.mapLink}<Icon name="arrow" className="size-3" /></Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </MotionBentoCard>
        </section>
      </div>
    </div>
  );
}
