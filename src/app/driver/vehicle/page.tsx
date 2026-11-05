'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { fetchJson } from '@/lib/fetch-json';

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
        const [config, locs, me] = await Promise.all([
          fetchJson<{ sessionState: { activeTrip?: { vehicle: { id: string } }; activeSession?: { vehicle?: { id: string } } } }>('/api/tracking/config'),
          fetchJson<{ data: LocationOption[] }>('/api/locations'),
          fetchJson<{ driver: { status: string; licenseNumber: string; currentVehicle: VehicleDetails | null } | null }>('/api/me'),
        ]);
        setLocations(locs.data || []);
        if (!me.driver) throw new Error('Driver profile not found. Please contact an administrator.');
        setDriverStatus(me.driver.status);
        setLicenseNumber(me.driver.licenseNumber);
        const vehicleId = config.sessionState.activeTrip?.vehicle.id || config.sessionState.activeSession?.vehicle?.id || me.driver.currentVehicle?.id;
        if (vehicleId) {
          const result = await fetchJson<{ data: VehicleDetails }>(`/api/vehicles/${vehicleId}`);
          setCurrentVehicle(result.data);
        } else {
          setCurrentVehicle(null);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load vehicle assignment');
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
      if (version === searchVersion.current) setError(cause instanceof Error ? cause.message : 'Unable to search vehicles.');
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
    <div className="space-y-6">
      <div className="pb-4 border-b border-zinc-200">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">My Assigned Vehicle</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Fleet asset currently linked to your driver profile</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {isLoading ? (
        <div className="py-20 text-center text-zinc-500 text-sm">
          <Spinner size="lg" className="mb-2" />
          <p>Loading vehicle information...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Vehicle Profile */}
          <div className="md:col-span-2 bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Vehicle Assignment
              </span>
              {currentVehicle ? (
                <StatusBadge status={currentVehicle.status} />
              ) : (
                <span className="text-xs text-zinc-500 font-medium">Not Assigned</span>
              )}
            </div>

            {currentVehicle ? (
              <div className="space-y-4 text-xs">
                {currentVehicle.imageUrl && (
                  <img
                    src={currentVehicle.imageUrl}
                    alt={currentVehicle.brand}
                    className="w-full h-44 object-cover rounded border border-zinc-200"
                  />
                )}

                <div>
                  <h2 className="text-lg font-bold text-zinc-900">
                    {currentVehicle.brand} {currentVehicle.model}
                  </h2>
                  <div className="font-mono text-sm font-semibold text-zinc-700 mt-0.5">
                    {currentVehicle.plateNumber}
                  </div>
                </div>

                {/* Location Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-100">
                  <div>
                    <span className="text-zinc-400 block uppercase font-semibold text-[10px]">
                      Vehicle Type
                    </span>
                    <span className="font-medium text-zinc-800">{currentVehicle.vehicleType}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block uppercase font-semibold text-[10px]">
                      Capacity
                    </span>
                    <span className="font-medium text-zinc-800">{currentVehicle.seatingCapacity} seats</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block uppercase font-semibold text-[10px]">
                      Transmission
                    </span>
                    <span className="font-medium text-zinc-800">{currentVehicle.transmission || 'Automatic'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-200 rounded">
                No permanent vehicle assignment. Search below to inspect available vehicles.
              </div>
            )}
          </div>

          {/* Driver Badge & Info */}
          <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
              Driver Credentials
            </span>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-zinc-400 text-[10px] uppercase font-semibold">Duty Status</span>
                <div className="mt-0.5">
                  <StatusBadge status={driverStatus} />
                </div>
              </div>

              {licenseNumber && (
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-semibold">Driver License</span>
                  <p className="font-mono font-semibold text-zinc-800 mt-0.5">{licenseNumber}</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-100 text-xs text-zinc-500">
              <p>
                Vehicle assignments are authorized by company fleet dispatchers. Contact dispatch if your assignment requires updates.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fleet Search / Inspection */}
      <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
            Inspect Fleet Vehicles
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Filter by operational hub and check vehicle availability
          </p>
        </div>

        {/* Quick Location Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setLocationFilter('')}
            className={`rounded-lg border-2 border-black px-2.5 py-1 text-xs font-black transition-all cursor-pointer ${
              !locationFilter
                ? 'bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-zinc-800 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100'
            }`}
          >
            Semua Hub
          </button>
          {locations.map((loc) => {
            const isSelected = locationFilter === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => setLocationFilter(isSelected ? '' : loc.id)}
                className={`rounded-lg border-2 border-black px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000]'
                    : 'bg-white text-zinc-800 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100'
                }`}
              >
                <span>{loc.name}</span>
                <span className={`ml-1 text-[10px] font-mono px-1 py-0.2 rounded border ${
                  isSelected ? 'border-white/40 bg-white/20 text-white' : 'border-zinc-300 bg-zinc-100 text-zinc-600'
                }`}>
                  {loc.code}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            placeholder="Search license plate, brand, model..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
          />

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="RESERVED">Reserved</option>
            <option value="IN_USE">In Use</option>
          </select>

          <button
            type="button"
            onClick={handleSearch}
            className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer shrink-0"
          >
            {isSearching ? <Spinner size="sm" /> : 'Filter'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchResults.map((v) => {
              const currentLoc = v.currentLocation || v.currentOperationalLocation;
              return (
                <div key={v.id} className="p-3 bg-zinc-50 border border-zinc-200 rounded text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-zinc-900">{v.plateNumber}</span>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="text-zinc-600 font-medium">
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
                  <div className="text-zinc-400 text-[11px] pt-1">
                    {v.seatingCapacity} seats • {v.vehicleType}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DriverVehiclePage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-zinc-500 text-sm">
          <Spinner size="lg" className="mb-2" />
          <p>Loading vehicle profile...</p>
        </div>
      }
    >
      <DriverVehicleContent />
    </Suspense>
  );
}
