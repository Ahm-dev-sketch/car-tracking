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
import { Icon } from '@/components/ui/Icon';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { translateStatus, translateTransmission, translateVehicleType } from '@/lib/i18n';

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
  const { locale, t, format } = useTranslation();
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
        setApiError(err.error?.message || t.adminPages.vehicles.failedLoad);
      }
    } catch {
      if (!isSilent) setApiError(t.adminPages.vehicles.networkLoadError);
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
      setUploadError(t.adminPages.vehicles.fileTooLargeError);
      return;
    }

    // Validate type client-side
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setUploadError(t.adminPages.vehicles.invalidFormatError);
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
        throw new Error(errJson.error?.message || t.adminPages.vehicles.uploadFailedError);
      }

      const json = await res.json();
      if (json.data?.url) {
        setFormImageUrl(json.data.url);
      }
    } catch (err: any) {
      setUploadError(err.message || t.adminPages.vehicles.uploadFailedError);
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
        setFormError(err.error?.message || t.common.genericError);
      }
    } catch {
      setFormError(t.common.networkError);
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
        setApiError(err.error?.message || t.adminPages.vehicles.failedDeactivate);
      }
    } catch {
      setApiError(t.adminPages.vehicles.networkDeactivateError);
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
        setAssignError(err.error?.message || t.common.genericError);
      }
    } catch {
      setAssignError(t.common.networkError);
    } finally {
      setIsAssigning(false);
    }
  };

  const columns: Column<VehicleItem>[] = [
    {
      header: t.adminPages.vehicles.colPlate,
      accessorKey: 'plateNumber',
      cell: (v) => <span className="font-mono font-semibold tabular-nums text-slate-900">{v.plateNumber}</span>,
    },
    {
      header: t.adminPages.vehicles.colVehicle,
      cell: (v) => (
        <div className="flex items-center gap-2.5">
          {v.imageUrl && (
            <img
              src={v.imageUrl}
              alt={`${v.brand} ${v.model}`}
              className="h-8 w-10 shrink-0 rounded border border-slate-200 bg-slate-100 object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <div>
            <span className="font-medium text-slate-900">{v.brand} {v.model}</span>
            <span className="block text-xs text-slate-500">
              {translateVehicleType(locale, v.vehicleType)} • <span className="tabular-nums">{format(t.adminPages.vehicles.seatsCount, { count: v.seatingCapacity })}</span>
            </span>
          </div>
        </div>
      ),
    },
    {
      header: t.adminPages.vehicles.colHub,
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
            <span className="text-xs italic text-slate-400">{t.common.noDataDash}</span>
          )}
        </div>
      ),
    },
    {
      header: t.adminPages.vehicles.colAssignedDriver,
      cell: (v) =>
        v.currentDriver ? (
          <div>
            <span className="font-medium text-slate-900">{v.currentDriver.user.name}</span>
            <span className="block font-mono text-[11px] tabular-nums text-slate-500">{v.currentDriver.licenseNumber}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">{t.adminPages.vehicles.unassignedLabel}</span>
        ),
    },
    {
      header: t.adminPages.vehicles.colStatus,
      cell: (v) => <StatusBadge status={v.status} />,
    },
    {
      header: t.adminPages.vehicles.colActions,
      cell: (v) => (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenAssign(v)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t.adminPages.vehicles.assignBtn}
          </button>
          <button
            type="button"
            onClick={() => handleOpenEdit(v)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t.adminPages.vehicles.editBtn}
          </button>
          {v.status !== 'INACTIVE' && (
            <button
              type="button"
              onClick={() => setDeactivatingVehicle(v)}
              className="cursor-pointer rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
            >
              {t.adminPages.vehicles.deactivateBtn}
            </button>
          )}
        </div>
      ),
    },
  ];

  const availableCount = vehicles.filter((v) => v.status === 'AVAILABLE').length;
  const inUseCount = vehicles.filter((v) => v.status === 'RESERVED' || v.status === 'IN_USE').length;
  const maintenanceCount = vehicles.filter((v) => v.status === 'MAINTENANCE').length;

  return (
    <div className="space-y-6">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t.adminPages.vehicles.heading}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.adminPages.vehicles.description}</p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="button-primary inline-flex cursor-pointer items-center gap-1.5 self-start sm:self-auto"
        >
          <Icon name="plus" className="size-4" />
          <span>{t.adminPages.vehicles.addVehicleBtn}</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.statTotal}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.statAvailable}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-success-600">{availableCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.statInUse}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{inUseCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.statMaintenance}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-warning-600">{maintenanceCount}</p>
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search */}
      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row">
        <form onSubmit={(e) => { e.preventDefault(); fetchVehicles(1); }} className="flex w-full gap-2 sm:w-96">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Icon name="search" className="size-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder={t.adminPages.vehicles.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
          <button type="submit" className="button-primary shrink-0 px-3 text-xs">
            {t.adminPages.vehicles.searchBtn}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.hubLabel}</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">{t.adminPages.vehicles.allHubsOption}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.statusLabel}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">{t.adminPages.vehicles.allStatusesOption}</option>
              <option value="AVAILABLE">{translateStatus(locale, 'AVAILABLE')}</option>
              <option value="RESERVED">{translateStatus(locale, 'RESERVED')}</option>
              <option value="IN_USE">{translateStatus(locale, 'IN_USE')}</option>
              <option value="MAINTENANCE">{translateStatus(locale, 'MAINTENANCE')}</option>
              <option value="INACTIVE">{translateStatus(locale, 'INACTIVE')}</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={vehicles}
        isLoading={isLoading}
        emptyMessage={t.adminPages.vehicles.emptyMessage}
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
        title={editingVehicle ? format(t.adminPages.vehicles.editModalTitle, { plate: editingVehicle.plateNumber }) : t.adminPages.vehicles.addModalTitle}
        maxWidth="lg"
      >
        {formError && <ErrorBanner message={formError} className="mb-4" onDismiss={() => setFormError(null)} />}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.vehicles.plateLabel} required>
              <input
                type="text"
                required
                placeholder={t.adminPages.vehicles.platePlaceholder}
                value={formPlate}
                onChange={(e) => setFormPlate(e.target.value.toUpperCase())}
                className="font-mono uppercase tabular-nums"
              />
            </FormField>

            <FormField label={t.adminPages.vehicles.vehicleTypeLabel} required>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="SEDAN">{translateVehicleType(locale, 'SEDAN')}</option>
                <option value="SUV">{translateVehicleType(locale, 'SUV')}</option>
                <option value="MPV">{translateVehicleType(locale, 'MPV')}</option>
                <option value="VAN">{translateVehicleType(locale, 'VAN')}</option>
                <option value="TRUCK">{translateVehicleType(locale, 'TRUCK')}</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.vehicles.brandLabel} required>
              <input
                type="text"
                required
                placeholder={t.adminPages.vehicles.brandPlaceholder}
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />
            </FormField>

            <FormField label={t.adminPages.vehicles.modelLabel} required>
              <input
                type="text"
                required
                placeholder={t.adminPages.vehicles.modelPlaceholder}
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.vehicles.hubFieldLabel} required>
              <select
                value={formLocationId}
                onChange={(e) => setFormLocationId(e.target.value)}
                required
              >
                <option value="">{t.adminPages.vehicles.selectHubOption}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label={t.adminPages.vehicles.statusLabel} required>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
              >
                <option value="AVAILABLE">{t.adminPages.vehicles.availablePoolOption}</option>
                <option value="RESERVED">{translateStatus(locale, 'RESERVED')}</option>
                <option value="IN_USE">{translateStatus(locale, 'IN_USE')}</option>
                <option value="MAINTENANCE">{t.adminPages.vehicles.maintenanceOption}</option>
                <option value="INACTIVE">{t.adminPages.vehicles.inactiveOption}</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.vehicles.seatsLabel} required>
              <input
                type="number"
                min="1"
                max="50"
                required
                value={formSeats}
                onChange={(e) => setFormSeats(parseInt(e.target.value) || 1)}
                className="tabular-nums"
              />
            </FormField>

            <FormField label={t.adminPages.vehicles.transmissionLabel}>
              <select
                value={formTransmission}
                onChange={(e) => setFormTransmission(e.target.value)}
              >
                <option value="AUTOMATIC">{translateTransmission(locale, 'AUTOMATIC')}</option>
                <option value="MANUAL">{translateTransmission(locale, 'MANUAL')}</option>
              </select>
            </FormField>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700">{t.adminPages.vehicles.photoLabel}</label>
              <span className="text-[11px] text-slate-400">{t.adminPages.vehicles.photoHint}</span>
            </div>

            {uploadError && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-danger-200 bg-danger-50 p-2 text-xs text-danger-700">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="cursor-pointer rounded p-0.5 text-danger-600 transition-colors hover:bg-danger-100"
                  aria-label={t.adminPages.vehicles.dismissErrorAria}
                >
                  <Icon name="close" className="size-3.5" />
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
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100">
                  <img
                    src={formImageUrl}
                    alt={t.adminPages.vehicles.photoLabel}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" fill="%23d4d4d8" viewBox="0 0 24 24"><path fill="%2371717a" d="M5 7 7 3h10l2 4 2 3v8h-3v-2H6v2H3v-8l2-3Z"/></svg>';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-slate-600">{formImageUrl}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isUploadingImage ? t.adminPages.vehicles.uploadingBtn : t.adminPages.vehicles.changePhotoBtn}
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => setFormImageUrl('')}
                      className="cursor-pointer rounded border border-danger-200 bg-white px-2 py-0.5 text-[11px] font-medium text-danger-700 transition-colors hover:bg-danger-50 disabled:opacity-50"
                    >
                      {t.adminPages.vehicles.removePhotoBtn}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isUploadingImage || formSubmitting}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-50"
              >
                {isUploadingImage ? (
                  <>
                    <Spinner size="sm" />
                    <span>{t.adminPages.vehicles.uploadingPhotoHint}</span>
                  </>
                ) : (
                  <>
                    <Icon name="download" className="size-4 text-slate-500" />
                    <span className="font-medium">{t.adminPages.vehicles.uploadPhotoCta}</span>
                  </>
                )}
              </button>
            )}

            <div className="pt-1">
              <input
                type="text"
                placeholder={t.adminPages.vehicles.pasteUrlPlaceholder}
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={formSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {formSubmitting && <Spinner size="sm" className="text-white" />}
              {editingVehicle ? t.adminPages.vehicles.updateVehicleBtn : t.adminPages.vehicles.createVehicleBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingVehicle)}
        onClose={() => setDeactivatingVehicle(null)}
        onConfirm={handleDeactivateConfirm}
        title={t.adminPages.vehicles.deactivateModalTitle}
        message={format(t.adminPages.vehicles.deactivateModalMessage, { plate: deactivatingVehicle?.plateNumber || '' })}
        confirmLabel={t.adminPages.vehicles.deactivateConfirmBtn}
        isDestructive={true}
        isLoading={isDeactivating}
      />

      {/* Assign Driver Modal */}
      <Modal
        isOpen={Boolean(assigningVehicle)}
        onClose={() => setAssigningVehicle(null)}
        title={t.adminPages.vehicles.assignModalTitle}
        description={assigningVehicle ? format(t.adminPages.vehicles.assignModalDesc, { plate: assigningVehicle.plateNumber }) : ''}
        maxWidth="sm"
      >
        {assignError && <ErrorBanner message={assignError} className="mb-4" onDismiss={() => setAssignError(null)} />}

        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <FormField label={t.adminPages.vehicles.selectDriverLabel} required>
            <select
              required
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">{t.adminPages.vehicles.chooseDriverOption}</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} ({d.licenseNumber})
                </option>
              ))}
            </select>
          </FormField>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningVehicle(null)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedDriverId}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isAssigning && <Spinner size="sm" className="text-white" />}
              {t.adminPages.vehicles.assignDriverBtn}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function AdminVehiclesPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-xs text-slate-500">
          <Spinner size="md" className="mb-2" />
          <p>{t.adminPages.vehicles.loadingSuspense}</p>
        </div>
      }
    >
      <AdminVehiclesContent />
    </Suspense>
  );
}
