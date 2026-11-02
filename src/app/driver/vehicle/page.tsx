'use client';

import React, { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

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
}

export default function DriverVehiclePage() {
  const [currentVehicle, setCurrentVehicle] = useState<VehicleDetails | null>(null);
  const [driverStatus, setDriverStatus] = useState<string>('OFFLINE');
  const [licenseNumber, setLicenseNumber] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search for available vehicles
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<VehicleDetails[]>([]);

  useEffect(() => {
    async function loadDriverVehicle() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/tracking/config');
        if (res.ok) {
          const json = await res.json();
          if (json.sessionState?.activeTrip?.vehicle) {
            setCurrentVehicle(json.sessionState.activeTrip.vehicle);
          }
        }

        // Also fetch driver profile if available via drivers list or me
        const meRes = await fetch('/api/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          // Find driver record
          const dRes = await fetch(`/api/drivers?search=${encodeURIComponent(meData.user?.email || '')}`);
          if (dRes.ok) {
            const dJson = await dRes.json();
            const dList = dJson.data || [];
            if (dList.length > 0) {
              const d = dList[0];
              setDriverStatus(d.status);
              setLicenseNumber(d.licenseNumber);
              if (d.currentVehicle) {
                setCurrentVehicle(d.currentVehicle);
              }
            }
          }
        }
      } catch {
        setError('Failed to load vehicle assignment');
      } finally {
        setIsLoading(false);
      }
    }

    loadDriverVehicle();
  }, []);

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (!term.trim() || term.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/vehicles?search=${encodeURIComponent(term.trim())}&limit=5`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data || json.vehicles || []);
      }
    } catch {
      // ignore
    }
  };

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
          <p className="text-xs text-zinc-500 mt-0.5">Verify vehicle license plate and specifications</p>
        </div>

        <div className="max-w-md">
          <input
            type="text"
            placeholder="Search license plate (e.g. B 1234 ABC)..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-zinc-800"
          />
        </div>

        {searchResults.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchResults.map((v) => (
              <div key={v.id} className="p-3 bg-zinc-50 border border-zinc-200 rounded text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-zinc-900">{v.plateNumber}</span>
                  <StatusBadge status={v.status} />
                </div>
                <div className="text-zinc-600">{v.brand} {v.model}</div>
                <div className="text-zinc-400 text-[11px]">{v.seatingCapacity} seats • {v.vehicleType}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
