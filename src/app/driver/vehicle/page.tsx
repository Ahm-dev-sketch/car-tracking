'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Icon } from '@/components/ui/Icon';
import { fetchJson } from '@/lib/fetch-json';
import { MotionBentoCard } from '@/components/ui/MotionBentoCard';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { translateStatus, translateTransmission, translateVehicleType } from '@/lib/i18n';

interface VehicleLocation {
  id: string;
  name: string;
  code: string;
}

interface VehicleDetails {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType: string;
  seatingCapacity: number;
  transmission?: string | null;
  imageUrl?: string | null;
  status: string;
  homeLocation?: VehicleLocation | null;
  currentLocation?: VehicleLocation | null;
  currentOperationalLocation?: VehicleLocation | null;
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
}

function DriverVehicleContent() {
  const { locale, t, format } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const formatRef = useRef(format);
  formatRef.current = format;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentVehicle, setCurrentVehicle] = useState<VehicleDetails | null>(null);
  const [driverStatus, setDriverStatus] = useState<string>('OFFLINE');
  const [licenseNumber, setLicenseNumber] = useState<string>('');
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state synced with URL
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [seatsFilter] = useState(searchParams.get('seats') || '');
  const searchVersion = useRef(0);
  const [searchResults, setSearchResults] = useState<VehicleDetails[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const syncUrlParams = useCallback((newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (params.toString() !== searchParams.toString()) router.replace(`/driver/vehicle?${params.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    async function loadDriverVehicle() {
      setIsLoading(true);
      setError(null);
      try {
        const [configRes, locsRes, meRes] = await Promise.allSettled([
          fetchJson<{ sessionState: { activeTrip?: { vehicle: { id: string } }; activeSession?: { vehicle?: { id: string } } } }>('/api/tracking/config'),
          fetchJson<{ data: LocationOption[] }>('/api/locations'),
          fetchJson<{ user?: { role?: string }; driver: { status: string; licenseNumber: string; currentVehicle: VehicleDetails | null } | null }>('/api/me'),
        ]);

        if (locsRes.status === 'fulfilled' && locsRes.value?.data) {
          setLocations(locsRes.value.data);
        } else if (locsRes.status === 'rejected') {
          console.error('[Driver Data Fetch Error] /driver/vehicle locations:', locsRes.reason);
        }

        if (meRes.status !== 'fulfilled' || !meRes.value) {
          throw new Error(tRef.current.driverPages.vehicle.verifyError);
        }

        const me = meRes.value;
        const meDriver = me.driver;
        const userRole = me.user?.role;

        if (!meDriver) {
          if (userRole && userRole !== 'DRIVER') {
            throw new Error(formatRef.current(tRef.current.driverPages.vehicle.wrongRoleError, { role: userRole }));
          }
          setDriverStatus('OFFLINE');
          setLicenseNumber('SIM-0001');
          setCurrentVehicle(null);
        } else {
          setDriverStatus(meDriver.status);
          setLicenseNumber(meDriver.licenseNumber);
          const config = configRes.status === 'fulfilled' ? configRes.value : null;
          const vehicleId = config?.sessionState.activeTrip?.vehicle.id || config?.sessionState.activeSession?.vehicle?.id || meDriver.currentVehicle?.id;
          if (vehicleId) {
            const result = await fetchJson<{ data: VehicleDetails }>(`/api/vehicles/${vehicleId}`);
            setCurrentVehicle(result.data);
          } else {
            setCurrentVehicle(null);
          }
        }
      } catch (cause) {
        console.error('[Driver Data Fetch Error] /driver/vehicle loadDriverVehicle:', cause);
        setError(cause instanceof Error ? cause.message : tRef.current.driverPages.vehicle.failedLoad);
      } finally {
        setIsLoading(false);
      }
    }

    loadDriverVehicle();
  }, []);

  const handleSearch = useCallback(async () => {
    const version = ++searchVersion.current;
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ limit: '12' });
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (locationFilter) params.set('locationId', locationFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (seatsFilter) params.set('seats', seatsFilter);

      const json = await fetchJson<{ data: VehicleDetails[] }>(`/api/vehicles?${params.toString()}`);
      if (version === searchVersion.current) setSearchResults(json.data || []);
    } catch (cause) {
      if (version === searchVersion.current) setError(cause instanceof Error ? cause.message : tRef.current.driverPages.vehicle.failedSearch);
    } finally {
      if (version === searchVersion.current) setIsSearching(false);
    }
  }, [searchTerm, locationFilter, statusFilter, seatsFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void handleSearch();
      syncUrlParams({ search: searchTerm.trim(), locationId: locationFilter, status: statusFilter, seats: seatsFilter });
    }, 300);
    return () => { clearTimeout(timer); searchVersion.current += 1; };
  }, [handleSearch, syncUrlParams, searchTerm, locationFilter, statusFilter, seatsFilter]);

  const assignedCurrentLoc =
    currentVehicle?.currentLocation || currentVehicle?.currentOperationalLocation;

  return (
    <div className="space-y-5">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t.driverPages.vehicle.eyebrow}</p>
          <h1 className="page-heading mt-2">{t.driverPages.vehicle.heading}</h1>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-500">
            {t.driverPages.vehicle.description}
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {isLoading ? (
        <div className="py-20 text-center text-sm font-medium text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <p>{t.driverPages.vehicle.loadingInfo}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3 lg:gap-4">
          {/* Main Vehicle Profile */}
          <MotionBentoCard index={0} className="overflow-hidden rounded-xl border border-slate-200 bg-white md:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t.driverPages.vehicle.assignmentHeading}
              </span>
              {currentVehicle ? (
                <StatusBadge status={currentVehicle.status} />
              ) : (
                <span className="text-xs font-medium text-slate-400">{t.driverPages.vehicle.notAssigned}</span>
              )}
            </div>

            {currentVehicle ? (
              <div className="space-y-4 p-4 sm:p-5">
                {currentVehicle.imageUrl && (
                  <img
                    src={currentVehicle.imageUrl}
                    alt={currentVehicle.brand}
                    className="h-44 w-full rounded-lg border border-slate-200 object-cover"
                  />
                )}

                <div>
                  <h2 className="text-lg font-semibold leading-tight tracking-tight text-slate-900">
                    {currentVehicle.brand} {currentVehicle.model}
                  </h2>
                  <div className="mt-1 inline-block rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-slate-700 tabular-nums">
                    {currentVehicle.plateNumber}
                  </div>
                </div>

                {/* Location Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentVehicle.homeLocation && (
                    <LocationBadge
                      type="home"
                      name={currentVehicle.homeLocation.name}
                      code={currentVehicle.homeLocation.code}
                    />
                  )}
                  {assignedCurrentLoc && (
                    <LocationBadge
                      type="current"
                      name={assignedCurrentLoc.name}
                      code={assignedCurrentLoc.code}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {t.driverPages.vehicle.vehicleTypeLabel}
                    </span>
                    <span className="font-medium text-slate-700">{translateVehicleType(locale, currentVehicle.vehicleType)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {t.driverPages.vehicle.capacityLabel}
                    </span>
                    <span className="font-medium text-slate-700 tabular-nums">
                      {format(t.driverPages.vehicle.seatsCount, { count: currentVehicle.seatingCapacity })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {t.driverPages.vehicle.transmissionLabel}
                    </span>
                    <span className="font-medium text-slate-700">
                      {translateTransmission(locale, currentVehicle.transmission || 'AUTOMATIC')}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 py-12 text-center text-xs font-medium text-slate-600">
                {t.driverPages.vehicle.noPermanentHint}
              </div>
            )}
          </MotionBentoCard>

          {/* Driver Badge & Info */}
          <MotionBentoCard index={1} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t.driverPages.vehicle.credentialsHeading}
            </span>

            <div className="space-y-3">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {t.driverPages.vehicle.dutyStatusLabel}
                </span>
                <div className="mt-1">
                  <StatusBadge status={driverStatus} />
                </div>
              </div>

              {licenseNumber && (
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {t.driverPages.vehicle.licenseLabel}
                  </span>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-700 tabular-nums">
                    {licenseNumber}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-500">
              <Icon name="info" className="mt-px size-3.5 shrink-0 text-slate-400" />
              <p>
                {t.driverPages.vehicle.policyNote}
              </p>
            </div>
          </MotionBentoCard>
        </div>
      )}

      {/* Fleet Search / Inspection */}
      <MotionBentoCard index={2} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t.driverPages.vehicle.inspectFleetEyebrow}
          </p>
          <h2 className="mt-1.5 text-base font-semibold tracking-tight text-slate-900">
            {t.driverPages.vehicle.availableByHubHeading}
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {t.driverPages.vehicle.availableByHubDesc}
          </p>
        </div>

        {/* Quick Location Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setLocationFilter('')}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              !locationFilter
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {t.driverPages.vehicle.allHubs}
          </button>
          {locations.map((loc) => {
            const isSelected = locationFilter === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => setLocationFilter(isSelected ? '' : loc.id)}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  isSelected
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span>{loc.name}</span>
                <span
                  className={`ml-1.5 rounded border px-1 font-mono text-[10px] tabular-nums ${
                    isSelected
                      ? 'border-brand-200 bg-white text-brand-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  {loc.code}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder={t.driverPages.vehicle.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            />
          </div>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
          >
            <option value="">{t.driverPages.vehicle.allLocationsOption}</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
          >
            <option value="">{t.driverPages.vehicle.allStatusesOption}</option>
            <option value="AVAILABLE">{translateStatus(locale, 'AVAILABLE')}</option>
            <option value="RESERVED">{translateStatus(locale, 'RESERVED')}</option>
            <option value="IN_USE">{translateStatus(locale, 'IN_USE')}</option>
          </select>

          <button
            type="button"
            onClick={handleSearch}
            className="button-primary shrink-0"
          >
            {isSearching ? <Spinner size="sm" /> : t.driverPages.vehicle.filterBtn}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {searchResults.map((v) => {
              const currentLoc = v.currentLocation || v.currentOperationalLocation;
              return (
                <div
                  key={v.id}
                  className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono font-semibold text-slate-800 tabular-nums">
                      {v.plateNumber}
                    </span>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="font-medium text-slate-600">
                    {v.brand} {v.model}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {v.homeLocation && (
                      <LocationBadge
                        type="home"
                        name={v.homeLocation.name}
                        code={v.homeLocation.code}
                      />
                    )}
                    {currentLoc && (
                      <LocationBadge
                        type="current"
                        name={currentLoc.name}
                        code={currentLoc.code}
                      />
                    )}
                  </div>
                  <div className="border-t border-slate-200 pt-1.5 text-[11px] tabular-nums text-slate-400">
                    {format(t.driverPages.vehicle.seatsCount, { count: v.seatingCapacity })} &middot; {translateVehicleType(locale, v.vehicleType)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </MotionBentoCard>
    </div>
  );
}

export default function DriverVehiclePage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm font-medium text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <p>{t.driverPages.vehicle.loadingSuspense}</p>
        </div>
      }
    >
      <DriverVehicleContent />
    </Suspense>
  );
}
