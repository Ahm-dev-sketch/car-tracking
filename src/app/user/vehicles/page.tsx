'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Car, Plus, Search } from 'lucide-react';
import { BookingModal, LocationOption } from '@/components/booking/BookingModal';

interface VehicleLocation {
  id: string;
  name: string;
  code: string;
}

interface Vehicle {
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
  currentDriver?: {
    id: string;
    licenseNumber: string;
    status: string;
    user: {
      id: string;
      name: string;
      phone: string;
    };
  } | null;
}

function UserVehiclesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [seatsFilter, setSeatsFilter] = useState(searchParams.get('seats') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);
  const [sharedDestinationUrl, setSharedDestinationUrl] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('kcic_share_destination');
    if (raw) {
      sessionStorage.removeItem('kcic_share_destination');
      setSharedDestinationUrl(raw);
      setIsBookingOpen(true);
    }
  }, []);

  useEffect(() => {
    async function fetchLocations() {
      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          setLocations(json.data || []);
        }
      } catch {
        // ignore
      }
    }
    fetchLocations();
  }, []);

  const syncUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.replace(`/user/vehicles?${params.toString()}`);
  };

  const fetchVehicles = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '12',
      });
      if (search.trim()) params.set('search', search.trim());
      if (seatsFilter) params.set('seats', seatsFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('locationId', locationFilter);

      const res = await fetch(`/api/vehicles?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list = json.data || json.vehicles || [];
        setVehicles(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Gagal memuat katalog kendaraan');
      }
    } catch {
      setApiError('Terjadi kesalahan jaringan saat memuat data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles(1);
    syncUrlParams({
      search: search.trim(),
      seats: seatsFilter,
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [seatsFilter, statusFilter, locationFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVehicles(1);
    syncUrlParams({
      search: search.trim(),
      seats: seatsFilter,
      status: statusFilter,
      locationId: locationFilter,
    });
  };

  const handleOpenBooking = (v?: Vehicle) => {
    setBookingVehicle(v || null);
    setIsBookingOpen(true);
  };

  const memoizedVehiclePref = useMemo(() => {
    if (!bookingVehicle) return null;
    return {
      id: bookingVehicle.id,
      plateNumber: bookingVehicle.plateNumber,
      brand: bookingVehicle.brand,
      model: bookingVehicle.model,
      vehicleType: bookingVehicle.vehicleType,
      seatingCapacity: bookingVehicle.seatingCapacity,
      status: bookingVehicle.status,
      homeLocationId: bookingVehicle.homeLocation?.id,
      currentLocationId: (bookingVehicle.currentLocation || bookingVehicle.currentOperationalLocation)?.id,
    };
  }, [bookingVehicle]);

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">Armada Whoosh</span>
          <h1 className="page-heading mt-2">Katalog kendaraan dinas</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Pilih unit kendaraan yang tersedia untuk mendukung mobilitas dinas Anda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenBooking()}
          className="button-primary self-start sm:self-auto"
        >
          <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
          <span>Buat pengajuan</span>
        </button>
      </header>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Search & filters */}
      <div className="card flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="fleet-search">
              Cari armada
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              id="fleet-search"
              type="text"
              placeholder="Cari plat, tipe, atau merek&hellip;"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <button type="submit" className="button-secondary px-3.5 py-2 text-[0.6875rem]">
            Cari
          </button>
        </form>

        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
          <div className="min-w-0">
            <label htmlFor="fleet-hub-filter" className="sr-only">
              Filter hub operasional
            </label>
            <select
              id="fleet-hub-filter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua hub</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="fleet-seats-filter" className="sr-only">
              Filter kapasitas kursi
            </label>
            <select
              id="fleet-seats-filter"
              value={seatsFilter}
              onChange={(e) => setSeatsFilter(e.target.value)}
              className="tabular-nums w-full rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua kapasitas</option>
              <option value="4">4+ penumpang</option>
              <option value="5">5+ penumpang</option>
              <option value="7">7+ penumpang</option>
              <option value="10">10+ penumpang</option>
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="fleet-status-filter" className="sr-only">
              Filter status armada
            </label>
            <select
              id="fleet-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua status</option>
              <option value="AVAILABLE">Tersedia</option>
              <option value="RESERVED">Dipesan</option>
              <option value="IN_USE">Sedang berjalan</option>
              <option value="MAINTENANCE">Perawatan</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-flush">
              <div className="skeleton h-44 w-full" />
              <div className="space-y-2.5 p-4">
                <div className="skeleton-text h-3 w-2/5" />
                <div className="skeleton-text h-3 w-1/4" />
                <div className="skeleton-text h-3 w-3/5" />
              </div>
            </div>
          ))}
          <span className="sr-only">Memuat katalog armada</span>
        </div>
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={<Car className="size-5" strokeWidth={1.75} aria-hidden="true" />}
          title="Tidak ada kendaraan yang cocok"
          description="Ubah kata kunci atau filter hub, kapasitas, dan status untuk melihat unit lain."
        />
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => {
            const currentLoc = v.currentLocation || v.currentOperationalLocation;
            return (
              <article
                key={v.id}
                className="card-flush flex flex-col justify-between transition-shadow hover:shadow-[var(--shadow-sm)]"
              >
                <div>
                  <div className="relative h-44 overflow-hidden bg-[var(--canvas)] sm:h-40">
                    {v.imageUrl ? (
                      <img
                        src={v.imageUrl}
                        alt={`${v.brand} ${v.model}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-400">
                        <Car
                          className="size-9 text-[var(--border-strong)]"
                          strokeWidth={1.4}
                          aria-hidden="true"
                        />
                        <span className="metric-label">{v.vehicleType}</span>
                      </div>
                    )}
                    <div className="absolute right-3 top-3">
                      <StatusBadge status={v.status} />
                    </div>
                  </div>

                  <div className="space-y-2.5 p-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-[0.9375rem] font-semibold leading-snug tracking-[-0.015em] text-slate-900">
                        {v.brand} {v.model}
                      </h2>
                      <p className="mono-plate mt-0.5 text-xs font-semibold text-slate-500">
                        {v.plateNumber}
                      </p>
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

                    <dl className="grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-2.5 text-xs">
                      <div>
                        <dt className="metric-label">Kapasitas</dt>
                        <dd className="tabular-nums mt-0.5 font-medium text-slate-800">
                          {v.seatingCapacity} kursi
                        </dd>
                      </div>
                      <div>
                        <dt className="metric-label">Transmisi</dt>
                        <dd className="mt-0.5 font-medium text-slate-800">
                          {v.transmission || 'Otomatis'}
                        </dd>
                      </div>
                    </dl>

                    {v.currentDriver?.user && (
                      <p className="truncate border-t border-[var(--border-subtle)] pt-2.5 text-[0.6875rem] text-slate-500">
                        Driver{' '}
                        <span className="font-medium text-slate-800">{v.currentDriver.user.name}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => setSelectedVehicle(v)}
                    className="button-secondary flex-1"
                  >
                    Rincian
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBooking(v)}
                    className="button-primary flex-1"
                  >
                    Pesan mobil
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchVehicles(p)}
      />

      {/* Vehicle detail */}
      <Drawer
        isOpen={Boolean(selectedVehicle)}
        onClose={() => setSelectedVehicle(null)}
        title={selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : 'Kendaraan'}
        description={selectedVehicle?.plateNumber}
        footer={
          selectedVehicle ? (
            <button
              type="button"
              onClick={() => {
                const target = selectedVehicle;
                setSelectedVehicle(null);
                handleOpenBooking(target);
              }}
              className="button-primary w-full"
            >
              Pesan kendaraan ini
            </button>
          ) : null
        }
      >
        {selectedVehicle && (
          <div className="space-y-3">
            {selectedVehicle.imageUrl && (
              <img
                src={selectedVehicle.imageUrl}
                alt={`${selectedVehicle.brand} ${selectedVehicle.model}`}
                className="h-44 w-full rounded-[var(--radius-lg)] border border-[var(--border)] object-cover"
              />
            )}

            <section className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow">Status kesiapan</span>
                <StatusBadge status={selectedVehicle.status} />
              </div>

              <dl className="mt-3.5 space-y-2.5 border-t border-[var(--border-subtle)] pt-3.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Home base</dt>
                  <dd>
                    {selectedVehicle.homeLocation ? (
                      <LocationBadge
                        type="home"
                        name={selectedVehicle.homeLocation.name}
                        code={selectedVehicle.homeLocation.code}
                      />
                    ) : (
                      <span className="text-slate-400">Belum diatur</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Posisi saat ini</dt>
                  <dd>
                    {selectedVehicle.currentLocation || selectedVehicle.currentOperationalLocation ? (
                      <LocationBadge
                        type="current"
                        name={
                          (selectedVehicle.currentLocation ||
                            selectedVehicle.currentOperationalLocation)?.name
                        }
                        code={
                          (selectedVehicle.currentLocation ||
                            selectedVehicle.currentOperationalLocation)?.code
                        }
                      />
                    ) : (
                      <span className="text-slate-400">Belum diatur</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card p-4">
              <span className="eyebrow">Spesifikasi</span>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
                <div>
                  <dt className="metric-label">Tipe</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{selectedVehicle.vehicleType}</dd>
                </div>
                <div>
                  <dt className="metric-label">Kapasitas</dt>
                  <dd className="tabular-nums mt-0.5 font-medium text-slate-800">
                    {selectedVehicle.seatingCapacity} penumpang
                  </dd>
                </div>
                <div>
                  <dt className="metric-label">Transmisi</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {selectedVehicle.transmission || 'Otomatis'}
                  </dd>
                </div>
                <div>
                  <dt className="metric-label">Nomor polisi</dt>
                  <dd className="mono-plate mt-0.5 font-semibold text-slate-800">
                    {selectedVehicle.plateNumber}
                  </dd>
                </div>
              </dl>
            </section>

            {selectedVehicle.currentDriver?.user && (
              <section className="card p-4">
                <span className="eyebrow">Driver tertaut</span>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-800">
                    {selectedVehicle.currentDriver.user.name}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {selectedVehicle.currentDriver.user.phone}
                  </span>
                </div>
              </section>
            )}
          </div>
        )}
      </Drawer>

      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => {
          setIsBookingOpen(false);
          setBookingVehicle(null);
          setSharedDestinationUrl(null);
        }}
        onSuccess={() => {
          fetchVehicles(page);
        }}
        initialVehiclePreference={memoizedVehiclePref}
        initialLocationId={locationFilter || undefined}
        initialDestinationUrl={sharedDestinationUrl}
      />
    </div>
  );
}

export default function UserVehiclesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat katalog armada...</p>
        </div>
      }
    >
      <UserVehiclesContent />
    </Suspense>
  );
}