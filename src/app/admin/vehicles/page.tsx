'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

interface OperationalLocation {
  id: string;
  name: string;
  code: string;
}

interface VehicleItem {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType: string;
  seatingCapacity: number;
  transmission?: string | null;
  imageUrl?: string | null;
  status: string;
  homeLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
  currentOperationalLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
  currentDriver?: {
    id: string;
    licenseNumber: string;
    user: {
      id: string;
      name: string;
      phone: string;
    };
  } | null;
}

interface DriverOption {
  id: string;
  licenseNumber: string;
  user: {
    name: string;
  };
}

function AdminVehiclesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [locations, setLocations] = useState<OperationalLocation[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleItem | null>(null);
  const [formPlate, setFormPlate] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formType, setFormType] = useState('SEDAN');
  const [formSeats, setFormSeats] = useState(5);
  const [formTransmission, setFormTransmission] = useState('AUTOMATIC');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formStatus, setFormStatus] = useState('AVAILABLE');
  const [formLocationId, setFormLocationId] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate Confirm
  const [deactivatingVehicle, setDeactivatingVehicle] = useState<VehicleItem | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Assign Driver Modal
  const [assigningVehicle, setAssigningVehicle] = useState<VehicleItem | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Load operational locations
  useEffect(() => {
    async function loadLocations() {
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
    loadLocations();
  }, []);

  const syncUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.replace(`/admin/vehicles?${params.toString()}`);
  };

  const fetchVehicles = async (targetPage = 1, isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('locationId', locationFilter);

      const res = await fetch(`/api/vehicles?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (!json.warning) {
          const list = json.data || json.vehicles || [];
          setVehicles(list);
          setTotalRecords(json.pagination?.total ?? list.length);
          setTotalPages(json.pagination?.totalPages ?? 1);
          setPage(targetPage);
        }
      } else if (!isSilent) {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load vehicles');
      }
    } catch {
      if (!isSilent) setApiError('Network error loading vehicles');
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles(1);
    syncUrlParams({
      search,
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [statusFilter, locationFilter]);

  // Keep vehicle pool live without manual refresh
  useEffect(() => {
    const isInteracting = isModalOpen || deactivatingVehicle || assigningVehicle;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isInteracting) {
        void fetchVehicles(page, true);
      }
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [page, isModalOpen, deactivatingVehicle, assigningVehicle, search, statusFilter, locationFilter]);

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setFormPlate('');
    setFormBrand('');
    setFormModel('');
    setFormType('SEDAN');
    setFormSeats(5);
    setFormTransmission('AUTOMATIC');
    setFormImageUrl('');
    setFormStatus('AVAILABLE');
    setFormLocationId(locationFilter || '');
    setUploadError(null);
    setIsUploadingImage(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: VehicleItem) => {
    setEditingVehicle(v);
    setFormPlate(v.plateNumber);
    setFormBrand(v.brand);
    setFormModel(v.model);
    setFormType(v.vehicleType);
    setFormSeats(v.seatingCapacity);
    setFormTransmission(v.transmission || 'AUTOMATIC');
    setFormImageUrl(v.imageUrl || '');
    setFormStatus(v.status);
    setFormLocationId(v.homeLocation?.id || v.currentOperationalLocation?.id || '');
    setUploadError(null);
    setIsUploadingImage(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected if user cleared
    e.target.value = '';

    // Validate size client-side (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi batas maksimal 5MB.');
      return;
    }

    // Validate type client-side
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setUploadError('Format gambar harus JPG, PNG, atau WebP.');
      return;
    }

    setUploadError(null);
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Gagal mengupload gambar.');
      }

      const json = await res.json();
      if (json.data?.url) {
        setFormImageUrl(json.data.url);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Gagal mengupload gambar.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    const payload: any = {
      plateNumber: formPlate.trim().toUpperCase(),
      brand: formBrand.trim(),
      model: formModel.trim(),
      vehicleType: formType,
      seatingCapacity: Number(formSeats),
      transmission: formTransmission || null,
      imageUrl: formImageUrl.trim() || null,
      status: formStatus,
      homeLocationId: formLocationId || null,
      currentLocationId: formLocationId || null,
    };

    try {
      const url = editingVehicle ? `/api/vehicles/${editingVehicle.id}` : '/api/vehicles';
      const method = editingVehicle ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchVehicles(page);
      } else {
        const err = await res.json();
        setFormError(err.error?.message || 'Failed to save vehicle');
      }
    } catch {
      setFormError('Network error saving vehicle');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivatingVehicle) return;
    setIsDeactivating(true);
    try {
      const res = await fetch(`/api/vehicles/${deactivatingVehicle.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeactivatingVehicle(null);
        fetchVehicles(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to deactivate vehicle');
      }
    } catch {
      setApiError('Network error deactivating vehicle');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleOpenAssign = async (v: VehicleItem) => {
    setAssigningVehicle(v);
    setSelectedDriverId('');
    setAssignError(null);
    try {
      const res = await fetch('/api/drivers?limit=50');
      if (res.ok) {
        const json = await res.json();
        setAvailableDrivers(json.data || []);
      }
    } catch {
      // ignore
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningVehicle || !selectedDriverId) return;
    setIsAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/admin/drivers/${selectedDriverId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: assigningVehicle.id }),
      });
      if (res.ok) {
        setAssigningVehicle(null);
        fetchVehicles(page);
      } else {
        const err = await res.json();
        setAssignError(err.error?.message || 'Failed to assign driver');
      }
    } catch {
      setAssignError('Network error assigning driver');
    } finally {
      setIsAssigning(false);
    }
  };

  const columns: Column<VehicleItem>[] = [
    {
      header: 'Plate Number',
      accessorKey: 'plateNumber',
      cell: (v) => <span className="font-mono font-bold text-zinc-900">{v.plateNumber}</span>,
    },
    {
      header: 'Vehicle',
      cell: (v) => (
        <div className="flex items-center gap-2.5">
          {v.imageUrl && (
            <img
              src={v.imageUrl}
              alt={`${v.brand} ${v.model}`}
              className="w-10 h-8 object-cover rounded border border-zinc-200 shrink-0 bg-zinc-100"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <div>
            <span className="font-semibold text-zinc-800">{v.brand} {v.model}</span>
            <span className="text-zinc-500 block text-xs">{v.vehicleType} • {v.seatingCapacity} seats</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Operational Hub',
      cell: (v) => (
        <div className="flex flex-wrap items-center gap-1">
          {v.homeLocation && (
            <LocationBadge
              type="home"
              name={v.homeLocation.name}
              code={v.homeLocation.code}
            />
          )}
          {v.currentOperationalLocation && (
            <LocationBadge
              type="current"
              name={v.currentOperationalLocation.name}
              code={v.currentOperationalLocation.code}
            />
          )}
          {!v.homeLocation && !v.currentOperationalLocation && (
            <span className="text-zinc-400 italic text-xs">—</span>
          )}
        </div>
      ),
    },
    {
      header: 'Assigned Driver',
      cell: (v) =>
        v.currentDriver ? (
          <div>
            <span className="font-medium text-zinc-800">{v.currentDriver.user.name}</span>
            <span className="text-[11px] text-zinc-500 block font-mono">{v.currentDriver.licenseNumber}</span>
          </div>
        ) : (
          <span className="text-zinc-400 italic text-xs">Unassigned</span>
        ),
    },
    {
      header: 'Status',
      cell: (v) => <StatusBadge status={v.status} />,
    },
    {
      header: 'Actions',
      cell: (v) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenAssign(v)}
            className="px-2.5 py-1 text-xs font-black border-2 border-black text-zinc-900 bg-white rounded-lg hover:bg-zinc-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
          >
            Assign
          </button>
          <button
            type="button"
            onClick={() => handleOpenEdit(v)}
            className="px-2.5 py-1 text-xs font-black border-2 border-black text-zinc-900 bg-white rounded-lg hover:bg-zinc-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
          >
            Edit
          </button>
          {v.status !== 'INACTIVE' && (
            <button
              type="button"
              onClick={() => setDeactivatingVehicle(v)}
              className="px-2.5 py-1 text-xs font-black text-rose-700 bg-rose-50 border-2 border-black rounded-lg hover:bg-rose-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
            >
              Deactivate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b-2 border-black/10">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950">Vehicle Inventory</h1>
          <p className="text-xs font-medium text-zinc-600 mt-0.5">Manage fleet vehicles, specifications, and driver assignments</p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="button-primary cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>+ Add Vehicle</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search */}
      <div className="surface p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <form onSubmit={(e) => { e.preventDefault(); fetchVehicles(1); }} className="w-full sm:w-80 flex gap-2">
          <input
            type="text"
            placeholder="Search plate, brand, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-medium border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
          />
          <button type="submit" className="button-primary px-3 py-1.5 text-xs font-black">
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-600">Hub:</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
            >
              <option value="">All Hubs</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-600">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="IN_USE">In Use</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={vehicles}
        isLoading={isLoading}
        emptyMessage="No vehicles found"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchVehicles(p)}
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingVehicle ? `Edit Vehicle: ${editingVehicle.plateNumber}` : 'Add New Vehicle'}
        maxWidth="lg"
      >
        {formError && <ErrorBanner message={formError} className="mb-4" onDismiss={() => setFormError(null)} />}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Plate Number" required>
              <input
                type="text"
                required
                placeholder="B 1234 ABC"
                value={formPlate}
                onChange={(e) => setFormPlate(e.target.value.toUpperCase())}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Vehicle Type" required>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
              >
                <option value="SEDAN">SEDAN</option>
                <option value="SUV">SUV</option>
                <option value="MPV">MPV</option>
                <option value="VAN">VAN</option>
                <option value="TRUCK">TRUCK</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Brand" required>
              <input
                type="text"
                required
                placeholder="Toyota"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Model" required>
              <input
                type="text"
                required
                placeholder="Innova Zenix"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Operational Hub" required>
              <select
                value={formLocationId}
                onChange={(e) => setFormLocationId(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800 font-medium"
              >
                <option value="">-- Pilih Hub Operasional KCIC --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Status" required>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
              >
                <option value="AVAILABLE">AVAILABLE (Aktif di Pool)</option>
                <option value="RESERVED">RESERVED</option>
                <option value="IN_USE">IN_USE</option>
                <option value="MAINTENANCE">MAINTENANCE (Perawatan)</option>
                <option value="INACTIVE">INACTIVE (Nonaktif)</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Seats" required>
              <input
                type="number"
                min="1"
                max="50"
                required
                value={formSeats}
                onChange={(e) => setFormSeats(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Transmission">
              <select
                value={formTransmission}
                onChange={(e) => setFormTransmission(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
              >
                <option value="AUTOMATIC">AUTOMATIC</option>
                <option value="MANUAL">MANUAL</option>
              </select>
            </FormField>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">Vehicle Photo</label>
              <span className="text-[11px] text-zinc-400">Max 5MB (JPG, PNG, WebP)</span>
            </div>

            {uploadError && (
              <div className="p-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded flex items-center justify-between">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-rose-500 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />

            {formImageUrl ? (
              <div className="flex items-center gap-3 p-2.5 bg-zinc-50 border border-zinc-200 rounded">
                <div className="w-16 h-12 bg-zinc-200 rounded overflow-hidden flex-shrink-0 border border-zinc-300">
                  <img
                    src={formImageUrl}
                    alt="Vehicle preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" fill="%23d4d4d8" viewBox="0 0 24 24"><path fill="%2371717a" d="M5 7 7 3h10l2 4 2 3v8h-3v-2H6v2H3v-8l2-3Z"/></svg>';
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-zinc-600 truncate">{formImageUrl}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2 py-0.5 text-[11px] font-medium border border-zinc-300 bg-white hover:bg-zinc-100 rounded text-zinc-700 cursor-pointer"
                    >
                      {isUploadingImage ? 'Uploading...' : 'Change Photo'}
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => setFormImageUrl('')}
                      className="px-2 py-0.5 text-[11px] font-medium border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded text-rose-700 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isUploadingImage || formSubmitting}
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-3 py-3 border-2 border-dashed border-zinc-300 hover:border-zinc-500 rounded bg-zinc-50 hover:bg-zinc-100/80 text-xs text-zinc-700 flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {isUploadingImage ? (
                  <>
                    <Spinner size="sm" />
                    <span>Uploading photo...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="font-medium">Upload Vehicle Photo (Max 5MB)</span>
                  </>
                )}
              </button>
            )}

            <div className="pt-1">
              <input
                type="text"
                placeholder="Or paste image URL (https://... or /uploads/...)"
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={formSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {formSubmitting && <Spinner size="sm" className="text-white" />}
              {editingVehicle ? 'Update Vehicle' : 'Create Vehicle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingVehicle)}
        onClose={() => setDeactivatingVehicle(null)}
        onConfirm={handleDeactivateConfirm}
        title="Deactivate Vehicle"
        message={`Are you sure you want to deactivate vehicle ${deactivatingVehicle?.plateNumber}? It will no longer be available for trip reservations.`}
        confirmLabel="Deactivate"
        isDestructive={true}
        isLoading={isDeactivating}
      />

      {/* Assign Driver Modal */}
      <Modal
        isOpen={Boolean(assigningVehicle)}
        onClose={() => setAssigningVehicle(null)}
        title="Assign Driver"
        description={assigningVehicle ? `Assign driver to ${assigningVehicle.plateNumber}` : ''}
        maxWidth="sm"
      >
        {assignError && <ErrorBanner message={assignError} className="mb-4" onDismiss={() => setAssignError(null)} />}

        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <FormField label="Select Driver" required>
            <select
              required
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="">-- Choose Driver --</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} ({d.licenseNumber})
                </option>
              ))}
            </select>
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningVehicle(null)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedDriverId}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isAssigning && <Spinner size="sm" className="text-white" />}
              Assign Driver
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function AdminVehiclesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-zinc-500 text-xs">
          <Spinner size="md" className="mb-2" />
          <p>Loading vehicle inventory...</p>
        </div>
      }
    >
      <AdminVehiclesContent />
    </Suspense>
  );
}
