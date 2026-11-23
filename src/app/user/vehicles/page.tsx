'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { BookingModal, LocationOption } from '@/components/booking/BookingModal';
import { Icon } from '@/components/ui/Icon';

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

  // Filters synced with URL
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [seatsFilter, setSeatsFilter] = useState(searchParams.get('seats') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Selected vehicle for details drawer
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Booking modal state
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);
  const [sharedDestinationUrl, setSharedDestinationUrl] = useState<string | null>(null);

  // Consume shared destination on mount
  useEffect(() => {
    const raw = sessionStorage.getItem('kcic_share_destination');
    if (raw) {
      sessionStorage.removeItem('kcic_share_destination');
      setSharedDestinationUrl(raw);
      setIsBookingOpen(true);
    }
  }, []);

  // Fetch operational locations for filter
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
        setApiError(err.error?.message || 'Failed to load vehicles');
      }
    } catch {
      setApiError('Network error loading vehicles');
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

  // Memoize to avoid creating a new object reference on every render,
  // which would re-trigger BookingModal's initialization useEffect.
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
    <div className="space-y-5">
      {/* Header */}
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">A ride for your workday</p>
          <h1 className="page-heading mt-2">Find your next ride.</h1>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-500">
            Choose a vehicle. Make room for your next journey.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenBooking()}
          className="button-primary self-start"
        >
          <Icon name="plus" className="size-4" /><span>Reservasi baru</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search Bar */}
      <div className="surface flex flex-col items-stretch justify-between gap-3 p-3.5 xl:flex-row xl:items-center sm:p-4">
        <form onSubmit={handleSearchSubmit} className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search vehicles..."
              aria-label="Search by plate number, brand or model"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
          <button type="submit" className="button-secondary">
            Cari
          </button>
        </form>

        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:flex xl:flex-wrap">
          {/* Operational Location Filter */}
          <select
            aria-label="Filter by operational location"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          {/* Seats Filter */}
          <select
            aria-label="Filter by seating capacity"
            value={seatsFilter}
            onChange={(e) => setSeatsFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
          >
            <option value="">All Capacities</option>
            <option value="4">4+ Seats</option>
            <option value="5">5+ Seats</option>
            <option value="7">7+ Seats</option>
            <option value="10">10+ Seats</option>
          </select>

          {/* Status Filter */}
          <select
            aria-label="Filter by availability"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="RESERVED">Reserved</option>
            <option value="IN_USE">In Use</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Grid of Vehicles */}
      {isLoading ? (
        <div className="py-20 text-center text-sm font-medium text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <div>Loading fleet catalog...</div>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="surface px-6 py-14 text-center text-sm font-medium text-slate-500">
          No vehicles match the selected criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => {
            const currentLoc = v.currentLocation || v.currentOperationalLocation;
            return (
              <article
                key={v.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300"
              >
                {/* Thumbnail */}
                <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-slate-100 bg-slate-50">
                  {v.imageUrl ? (
                    <img
                      src={v.imageUrl}
                      alt={`${v.brand} ${v.model}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-300">
                      <Icon name="car" className="size-10" />
                      <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        {v.vehicleType}
                      </span>
                    </div>
                  )}
                  <div className="absolute right-3 top-3">
                    <StatusBadge status={v.status} />
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h3 className="text-lg font-semibold leading-tight tracking-tight text-slate-900">
                      {v.brand} {v.model}
                    </h3>
                    <div className="mt-1 inline-block rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-slate-600 tabular-nums">
                      {v.plateNumber}
                    </div>
                  </div>

                  {/* Operational Locations Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
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

                  <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Capacity
                      </span>
                      <span className="font-medium text-slate-700 tabular-nums">
                        {v.seatingCapacity} seats
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Gearbox
                      </span>
                      <span className="font-medium text-slate-700">
                        {v.transmission || 'Automatic'}
                      </span>
                    </div>
                  </div>

                  {v.currentDriver?.user && (
                    <div className="truncate border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-500">
                      Driver:{' '}
                      <span className="font-semibold text-slate-700">{v.currentDriver.user.name}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedVehicle(v)}
                    className="button-secondary flex-1"
                  >
                    Detail
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBooking(v)}
                    className="button-primary flex-1"
                  >
                    Pesan
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchVehicles(p)}
      />

      {/* Vehicle Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedVehicle)}
        onClose={() => setSelectedVehicle(null)}
        title={selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : 'Vehicle'}
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
              className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Pesan kendaraan ini
            </button>
          ) : null
        }
      >
        {selectedVehicle && (
          <div className="space-y-4 text-sm">
            {selectedVehicle.imageUrl && (
              <img
                src={selectedVehicle.imageUrl}
                alt={selectedVehicle.brand}
                className="h-48 w-full rounded-xl border border-slate-200 object-cover"
              />
            )}

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Status</span>
              <StatusBadge status={selectedVehicle.status} />
            </div>

            {/* Locations in Drawer */}
            <div className="space-y-2 border-b border-slate-100 pb-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-500">Home Base:</span>
                {selectedVehicle.homeLocation ? (
                  <LocationBadge
                    type="home"
                    name={selectedVehicle.homeLocation.name}
                    code={selectedVehicle.homeLocation.code}
                  />
                ) : (
                  <span className="text-slate-400">Not assigned</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-500">Current Location:</span>
                {(selectedVehicle.currentLocation || selectedVehicle.currentOperationalLocation) ? (
                  <LocationBadge
                    type="current"
                    name={(selectedVehicle.currentLocation || selectedVehicle.currentOperationalLocation)?.name}
                    code={(selectedVehicle.currentLocation || selectedVehicle.currentOperationalLocation)?.code}
                  />
                ) : (
                  <span className="text-slate-400">Not assigned</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Type</span>
                <span className="font-medium text-slate-800">{selectedVehicle.vehicleType}</span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Capacity</span>
                <span className="font-medium text-slate-800 tabular-nums">
                  {selectedVehicle.seatingCapacity} Passengers
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Transmission</span>
                <span className="font-medium text-slate-800">
                  {selectedVehicle.transmission || 'Automatic'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Plate</span>
                <span className="font-mono font-medium tabular-nums text-slate-800">
                  {selectedVehicle.plateNumber}
                </span>
              </div>
            </div>

            {selectedVehicle.currentDriver?.user && (
              <div className="pt-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Assigned Driver
                </span>
                <div className="mt-1">
                  <div className="font-medium text-slate-800">{selectedVehicle.currentDriver.user.name}</div>
                  <div className="text-xs tabular-nums text-slate-500">{selectedVehicle.currentDriver.user.phone}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Unified Reworked Booking Modal */}
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
        <div className="py-20 text-center text-sm font-medium text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <p>Loading fleet...</p>
        </div>
      }
    >
      <UserVehiclesContent />
    </Suspense>
  );
}
