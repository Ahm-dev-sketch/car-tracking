'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { fetchJson } from '@/lib/fetch-json';
import { Car, Funnel, Search } from 'lucide-react';

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
        }

        if (meRes.status !== 'fulfilled' || !meRes.value) {
          throw new Error('Gagal memverifikasi akun pengemudi. Silakan segarkan halaman.');
        }

        const me = meRes.value;
        const meDriver = me.driver;
        const userRole = me.user?.role;

        if (!meDriver) {
          if (userRole && userRole !== 'DRIVER') {
            throw new Error(`Akun aktif saat ini (${userRole}) bukan akun Driver. Masuk dengan akun Driver untuk mengelola penugasan armada.`);
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
        setError(cause instanceof Error ? cause.message : 'Gagal memuat penugasan armada');
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
      if (version === searchVersion.current) setError(cause instanceof Error ? cause.message : 'Gagal mencari armada.');
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
    <div className="w-full min-w-0 space-y-5">
      <header className="min-w-0">
        <span className="eyebrow eyebrow-accent">Penugasan armada</span>
        <h1 className="page-heading mt-2">Armada ditugaskan</h1>
        <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
          Informasi aset kendaraan yang terhubung ke profil pengemudi dan pencarian unit pool.
        </p>
      </header>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-white py-20 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat profil armada&hellip;</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Assigned vehicle */}
          <section className="card p-4 md:col-span-2">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <span className="eyebrow">Aset operasional aktif</span>
              {currentVehicle ? (
                <StatusBadge status={currentVehicle.status} />
              ) : (
                <span className="pill">
                  <span className="pill-dot" aria-hidden="true" />
                  <span>Belum ditugaskan</span>
                </span>
              )}
            </div>

            {currentVehicle ? (
              <div className="mt-3.5 space-y-3.5">
                {currentVehicle.imageUrl ? (
                  <div className="h-48 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)]">
                    <img
                      src={currentVehicle.imageUrl}
                      alt={`${currentVehicle.brand} ${currentVehicle.model}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-36 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)]">
                    <Car
                      className="size-9 text-[var(--border-strong)]"
                      strokeWidth={1.4}
                      aria-hidden="true"
                    />
                  </div>
                )}

                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold tracking-[-0.02em] text-slate-900">
                    {currentVehicle.brand} {currentVehicle.model}
                  </h2>
                  <p className="mono-plate mt-0.5 text-xs font-semibold text-slate-600">
                    {currentVehicle.plateNumber}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1">
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

                <dl className="grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-3.5">
                  {[
                    { label: 'Tipe', value: currentVehicle.vehicleType },
                    { label: 'Kapasitas', value: `${currentVehicle.seatingCapacity} kursi` },
                    { label: 'Transmisi', value: currentVehicle.transmission || 'Otomatis' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--canvas)] p-2.5"
                    >
                      <dt className="metric-label">{item.label}</dt>
                      <dd className="mt-0.5 truncate text-xs font-semibold text-slate-900">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="mt-3.5 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-4 py-10 text-center text-xs leading-relaxed text-slate-500">
                Belum ada penugasan unit tetap. Cari di pool bawah untuk memeriksa ketersediaan
                kendaraan.
              </div>
            )}
          </section>

          {/* Driver credentials */}
          <section className="card h-fit space-y-3 p-4">
            <span className="eyebrow">Kredensial pengemudi</span>

            <div className="space-y-2">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--canvas)] p-3">
                <span className="metric-label">Status tugas</span>
                <div className="mt-1.5">
                  <StatusBadge status={driverStatus} />
                </div>
              </div>

              {licenseNumber && (
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--canvas)] p-3">
                  <span className="metric-label">Nomor SIM</span>
                  <p className="mono-plate mt-1 text-xs font-semibold text-slate-900">
                    {licenseNumber}
                  </p>
                </div>
              )}
            </div>

            <p className="border-t border-[var(--border-subtle)] pt-3 text-xs leading-relaxed text-slate-500">
              Penugasan unit diatur oleh dispatcher operasional KCIC. Hubungi admin stasiun jika
              terdapat perubahan data unit.
            </p>
          </section>
        </div>
      )}

      {/* Pool inspection */}
      <section className="card space-y-4 p-4">
        <div className="min-w-0">
          <h2 className="section-title">Daftar armada di seluruh hub</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Filter ketersediaan armada berdasarkan stasiun operasional KCIC.
          </p>
        </div>

        <div className="no-scrollbar -mx-0.5 flex items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => setLocationFilter('')}
            aria-pressed={!locationFilter}
            className="chip shrink-0"
          >
            Semua hub
          </button>
          {locations.map((loc) => {
            const isSelected = locationFilter === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => setLocationFilter(isSelected ? '' : loc.id)}
                aria-pressed={isSelected}
                className="chip shrink-0"
              >
                <span>{loc.name}</span>
                <span className="mono-plate text-[0.625rem] opacity-70">{loc.code}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="pool-search">
              Cari armada pool
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              id="pool-search"
              type="text"
              placeholder="Cari plat, merek, model&hellip;"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="min-w-0">
            <label className="sr-only" htmlFor="pool-status-filter">
              Filter status armada
            </label>
            <select
              id="pool-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold sm:w-auto"
            >
              <option value="">Semua status</option>
              <option value="AVAILABLE">Tersedia</option>
              <option value="RESERVED">Dipesan</option>
              <option value="IN_USE">Sedang digunakan</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleSearch}
            className="button-secondary shrink-0 px-4 py-2 text-[0.6875rem]"
          >
            {isSearching ? <Spinner size="xs" /> : <Funnel className="size-3.5" strokeWidth={2} aria-hidden="true" />}
            <span>Filter</span>
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="grid grid-cols-1 gap-2.5 border-t border-[var(--border-subtle)] pt-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {searchResults.map((v) => {
              const currentLoc = v.currentLocation || v.currentOperationalLocation;
              return (
                <article
                  key={v.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono-plate rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-slate-800">
                      {v.plateNumber}
                    </span>
                    <StatusBadge status={v.status} />
                  </div>
                  <h3 className="mt-2 truncate text-xs font-semibold text-slate-900">
                    {v.brand} {v.model}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
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
                  <p className="tabular-nums mt-2 border-t border-[var(--border-subtle)] pt-2 text-[0.6875rem] text-slate-500">
                    {v.seatingCapacity} kursi{' '}
                    <span aria-hidden="true" className="text-slate-300">
                      &middot;
                    </span>{' '}
                    {v.vehicleType}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function DriverVehiclePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat profil armada&hellip;</p>
        </div>
      }
    >
      <DriverVehicleContent />
    </Suspense>
  );
}
