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
import { formatBookingDateTime } from '@/lib/booking-time';

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

interface RelocationItem {
  id: string;
  relocationCode: string;
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED' | string;
  scheduledAt: string;
  departedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  vehicle: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    status: string;
  };
  driver?: {
    id: string;
    licenseNumber: string;
    user: {
      id: string;
      name: string;
      phone?: string | null;
    };
  } | null;
  fromLocation: OperationalLocation;
  toLocation: OperationalLocation;
}

function getCurrentJakartaDateTimeInput(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

function AdminVehiclesContent() {
  const { locale, t, format } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<'fleet' | 'relocations'>(
    searchParams.get('tab') === 'relocations' ? 'relocations' : 'fleet'
  );
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
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Relocations tab state
  const [relocations, setRelocations] = useState<RelocationItem[]>([]);
  const [relocationPage, setRelocationPage] = useState(1);
  const [relocationTotalPages, setRelocationTotalPages] = useState(1);
  const [relocationTotalRecords, setRelocationTotalRecords] = useState(0);
  const [relocationStatusFilter, setRelocationStatusFilter] = useState('');
  const [relocationLocationFilter, setRelocationLocationFilter] = useState('');
  const [isRelocationsLoading, setIsRelocationsLoading] = useState(false);

  // Create Relocation modal state
  const [isRelocateModalOpen, setIsRelocateModalOpen] = useState(false);
  const [relocatePoolVehicles, setRelocatePoolVehicles] = useState<VehicleItem[]>([]);
  const [relocateVehicleId, setRelocateVehicleId] = useState('');
  const [relocateToLocationId, setRelocateToLocationId] = useState('');
  const [relocateDriverId, setRelocateDriverId] = useState('');
  const [relocateScheduledAt, setRelocateScheduledAt] = useState('');
  const [relocateNotes, setRelocateNotes] = useState('');
  const [relocateStartImmediately, setRelocateStartImmediately] = useState(false);
  const [isCreatingRelocation, setIsCreatingRelocation] = useState(false);
  const [relocateError, setRelocateError] = useState<string | null>(null);

  // Start Relocation modal state
  const [startingRelocation, setStartingRelocation] = useState<RelocationItem | null>(null);
  const [startRelocationDriverId, setStartRelocationDriverId] = useState('');
  const [isStartingRelocation, setIsStartingRelocation] = useState(false);
  const [startRelocationError, setStartRelocationError] = useState<string | null>(null);

  // Complete & Cancel Confirm dialogs
  const [completingRelocation, setCompletingRelocation] = useState<RelocationItem | null>(null);
  const [isCompletingRelocation, setIsCompletingRelocation] = useState(false);
  const [cancellingRelocation, setCancellingRelocation] = useState<RelocationItem | null>(null);
  const [isCancellingRelocation, setIsCancellingRelocation] = useState(false);

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
      tab: activeTab === 'relocations' ? 'relocations' : '',
    });
  }, [statusFilter, locationFilter]);

  const fetchRelocations = async (targetPage = 1, isSilent = false) => {
    if (!isSilent) setIsRelocationsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (relocationStatusFilter) params.set('status', relocationStatusFilter);
      if (relocationLocationFilter) params.set('locationId', relocationLocationFilter);

      const res = await fetch(`/api/admin/relocations?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setRelocations(json.data || []);
        setRelocationTotalRecords(json.pagination?.total ?? (json.data?.length || 0));
        setRelocationTotalPages(json.pagination?.totalPages ?? 1);
        setRelocationPage(targetPage);
      } else if (!isSilent) {
        const err = await res.json();
        setApiError(err.error?.message || t.adminPages.vehicles.failedLoad);
      }
    } catch {
      if (!isSilent) setApiError(t.adminPages.vehicles.networkLoadError);
    } finally {
      if (!isSilent) setIsRelocationsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRelocations(1);
  }, [relocationStatusFilter, relocationLocationFilter]);

  // Keep vehicle pool & relocations live without manual refresh
  useEffect(() => {
    const isInteracting =
      isModalOpen ||
      deactivatingVehicle ||
      assigningVehicle ||
      isRelocateModalOpen ||
      startingRelocation ||
      completingRelocation ||
      cancellingRelocation;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isInteracting) {
        if (activeTab === 'relocations') {
          void fetchRelocations(relocationPage, true);
        } else {
          void fetchVehicles(page, true);
        }
      }
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [
    page,
    relocationPage,
    activeTab,
    isModalOpen,
    deactivatingVehicle,
    assigningVehicle,
    isRelocateModalOpen,
    startingRelocation,
    completingRelocation,
    cancellingRelocation,
    search,
    statusFilter,
    locationFilter,
    relocationStatusFilter,
    relocationLocationFilter,
  ]);

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

  const handleTabChange = (nextTab: 'fleet' | 'relocations') => {
    setActiveTab(nextTab);
    syncUrlParams({
      search,
      status: statusFilter,
      locationId: locationFilter,
      tab: nextTab === 'relocations' ? 'relocations' : '',
    });
    if (nextTab === 'relocations') {
      void fetchRelocations(1);
    } else {
      void fetchVehicles(page);
    }
  };

  const loadDriversForPicker = async () => {
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

  const handleOpenRelocate = async (presetVehicle?: VehicleItem) => {
    setRelocateError(null);
    setActionNotice(null);
    setRelocateVehicleId(presetVehicle?.id || '');
    setRelocateToLocationId('');
    setRelocateDriverId(presetVehicle?.currentDriver?.id || '');
    setRelocateScheduledAt(getCurrentJakartaDateTimeInput());
    setRelocateNotes('');
    setRelocateStartImmediately(Boolean(presetVehicle?.currentDriver?.id));
    setIsRelocateModalOpen(true);

    try {
      const [poolRes] = await Promise.all([
        fetch('/api/vehicles?status=AVAILABLE&limit=100'),
        loadDriversForPicker(),
      ]);
      if (poolRes.ok) {
        const poolJson = await poolRes.json();
        const poolList: VehicleItem[] = poolJson.data || [];
        if (presetVehicle && !poolList.some((item) => item.id === presetVehicle.id)) {
          poolList.unshift(presetVehicle);
        }
        setRelocatePoolVehicles(poolList);
      }
    } catch {
      if (presetVehicle) {
        setRelocatePoolVehicles([presetVehicle]);
      }
    }
  };

  const selectedRelocateVehicle =
    relocatePoolVehicles.find((v) => v.id === relocateVehicleId) ||
    vehicles.find((v) => v.id === relocateVehicleId) ||
    null;

  const selectedOriginHubId =
    selectedRelocateVehicle?.currentOperationalLocation?.id ||
    selectedRelocateVehicle?.homeLocation?.id ||
    '';

  const handleCreateRelocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relocateVehicleId || !relocateToLocationId) return;
    setIsCreatingRelocation(true);
    setRelocateError(null);
    try {
      const scheduledIso = relocateScheduledAt
        ? new Date(`${relocateScheduledAt}:00+07:00`).toISOString()
        : new Date().toISOString();

      const res = await fetch('/api/admin/relocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: relocateVehicleId,
          driverId: relocateDriverId || undefined,
          fromLocationId: selectedOriginHubId || undefined,
          toLocationId: relocateToLocationId,
          scheduledAt: scheduledIso,
          notes: relocateNotes.trim() || undefined,
          startImmediately: relocateStartImmediately,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setIsRelocateModalOpen(false);
        const createdCode = json.data?.relocationCode || '';
        setActionNotice(
          format(t.adminPages.vehicles.relocationCreatedToast, { code: createdCode })
        );
        handleTabChange('relocations');
        void fetchVehicles(page, true);
      } else {
        setRelocateError(json.error?.message || t.common.genericError);
      }
    } catch {
      setRelocateError(t.common.networkError);
    } finally {
      setIsCreatingRelocation(false);
    }
  };

  const handleOpenStartRelocation = async (rel: RelocationItem) => {
    setStartingRelocation(rel);
    setStartRelocationDriverId(rel.driver?.id || '');
    setStartRelocationError(null);
    if (availableDrivers.length === 0) {
      await loadDriversForPicker();
    }
  };

  const handleStartRelocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startingRelocation || !startRelocationDriverId) return;
    setIsStartingRelocation(true);
    setStartRelocationError(null);
    try {
      const res = await fetch(`/api/admin/relocations/${startingRelocation.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: startRelocationDriverId }),
      });
      const json = await res.json();
      if (res.ok) {
        const startedCode = startingRelocation.relocationCode;
        setStartingRelocation(null);
        setActionNotice(
          format(t.adminPages.vehicles.relocationStartedToast, { code: startedCode })
        );
        void fetchRelocations(relocationPage);
        void fetchVehicles(page, true);
      } else {
        setStartRelocationError(json.error?.message || t.common.genericError);
      }
    } catch {
      setStartRelocationError(t.common.networkError);
    } finally {
      setIsStartingRelocation(false);
    }
  };

  const handleCompleteRelocationConfirm = async () => {
    if (!completingRelocation) return;
    setIsCompletingRelocation(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/admin/relocations/${completingRelocation.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        const completedCode = completingRelocation.relocationCode;
        setCompletingRelocation(null);
        setActionNotice(
          format(t.adminPages.vehicles.relocationCompletedToast, { code: completedCode })
        );
        void fetchRelocations(relocationPage);
        void fetchVehicles(page, true);
      } else {
        setApiError(json.error?.message || t.common.genericError);
      }
    } catch {
      setApiError(t.common.networkError);
    } finally {
      setIsCompletingRelocation(false);
    }
  };

  const handleCancelRelocationConfirm = async () => {
    if (!cancellingRelocation) return;
    setIsCancellingRelocation(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/admin/relocations/${cancellingRelocation.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        const cancelledCode = cancellingRelocation.relocationCode;
        setCancellingRelocation(null);
        setActionNotice(
          format(t.adminPages.vehicles.relocationCancelledToast, { code: cancelledCode })
        );
        void fetchRelocations(relocationPage);
        void fetchVehicles(page, true);
      } else {
        setApiError(json.error?.message || t.common.genericError);
      }
    } catch {
      setApiError(t.common.networkError);
    } finally {
      setIsCancellingRelocation(false);
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
          {v.status === 'AVAILABLE' && (
            <button
              type="button"
              onClick={() => handleOpenRelocate(v)}
              className="cursor-pointer rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
            >
              {t.adminPages.vehicles.relocateActionBtn}
            </button>
          )}
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

  const relocationColumns: Column<RelocationItem>[] = [
    {
      header: t.adminPages.vehicles.relocationColCode,
      cell: (r) => (
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800 tabular-nums">
          {r.relocationCode}
        </span>
      ),
    },
    {
      header: t.adminPages.vehicles.relocationColVehicle,
      cell: (r) => (
        <div>
          <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
            {r.vehicle.plateNumber}
          </div>
          <div className="text-[11px] text-slate-500">
            {r.vehicle.brand} {r.vehicle.model}
          </div>
        </div>
      ),
    },
    {
      header: t.adminPages.vehicles.relocationColRoute,
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-800">
          <LocationBadge type="home" name={r.fromLocation.name} code={r.fromLocation.code} />
          <Icon name="arrow" className="size-3.5 text-slate-400" />
          <LocationBadge type="current" name={r.toLocation.name} code={r.toLocation.code} />
        </div>
      ),
    },
    {
      header: t.adminPages.vehicles.relocationColDriver,
      cell: (r) =>
        r.driver ? (
          <div>
            <div className="text-xs font-medium text-slate-900">{r.driver.user.name}</div>
            <div className="font-mono text-[11px] text-slate-500">{r.driver.licenseNumber}</div>
          </div>
        ) : (
          <span className="text-xs text-slate-400">{t.adminPages.vehicles.relocationNoDriver}</span>
        ),
    },
    {
      header: t.adminPages.vehicles.relocationColSchedule,
      cell: (r) => (
        <div className="space-y-0.5 text-[11px] text-slate-600 tabular-nums">
          <div>
            <span className="text-slate-400">{t.adminPages.vehicles.relocationScheduledAtPrefix}</span>{' '}
            {formatBookingDateTime(r.scheduledAt, locale)}
          </div>
          {r.departedAt && (
            <div>
              <span className="text-slate-400">{t.adminPages.vehicles.relocationDepartedAtPrefix}</span>{' '}
              {formatBookingDateTime(r.departedAt, locale)}
            </div>
          )}
          {r.completedAt && (
            <div>
              <span className="text-slate-400">{t.adminPages.vehicles.relocationCompletedAtPrefix}</span>{' '}
              {formatBookingDateTime(r.completedAt, locale)}
            </div>
          )}
        </div>
      ),
    },
    {
      header: t.adminPages.vehicles.relocationColStatus,
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      header: t.adminPages.vehicles.relocationColActions,
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {r.status === 'SCHEDULED' && (
            <button
              type="button"
              onClick={() => handleOpenStartRelocation(r)}
              className="cursor-pointer rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
            >
              {t.adminPages.vehicles.relocationStartBtn}
            </button>
          )}
          {r.status === 'IN_TRANSIT' && (
            <button
              type="button"
              onClick={() => setCompletingRelocation(r)}
              className="cursor-pointer rounded-lg border border-success-200 bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 transition-colors hover:bg-success-100"
            >
              {t.adminPages.vehicles.relocationCompleteBtn}
            </button>
          )}
          {(r.status === 'SCHEDULED' || r.status === 'IN_TRANSIT') && (
            <button
              type="button"
              onClick={() => setCancellingRelocation(r)}
              className="cursor-pointer rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
            >
              {t.adminPages.vehicles.relocationCancelBtn}
            </button>
          )}
        </div>
      ),
    },
  ];

  const availableCount = vehicles.filter((v) => v.status === 'AVAILABLE').length;
  const inUseCount = vehicles.filter((v) => v.status === 'RESERVED' || v.status === 'IN_USE').length;
  const maintenanceCount = vehicles.filter((v) => v.status === 'MAINTENANCE').length;

  const relocationInTransitCount = relocations.filter((r) => r.status === 'IN_TRANSIT').length;
  const relocationScheduledCount = relocations.filter((r) => r.status === 'SCHEDULED').length;
  const relocationCompletedCount = relocations.filter((r) => r.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t.adminPages.vehicles.heading}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.adminPages.vehicles.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleOpenRelocate()}
            className="button-secondary inline-flex cursor-pointer items-center gap-1.5"
          >
            <Icon name="route" className="size-4 text-brand-600" />
            <span>{t.adminPages.vehicles.createRelocationBtn}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="button-primary inline-flex cursor-pointer items-center gap-1.5"
          >
            <Icon name="plus" className="size-4" />
            <span>{t.adminPages.vehicles.addVehicleBtn}</span>
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange('fleet')}
          className={`cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'fleet'
              ? 'bg-slate-900 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          {t.adminPages.vehicles.tabFleet}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('relocations')}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'relocations'
              ? 'bg-brand-600 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <span>{t.adminPages.vehicles.tabRelocations}</span>
          {relocationInTransitCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                activeTab === 'relocations' ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700'
              }`}
            >
              {relocationInTransitCount}
            </span>
          )}
        </button>
      </div>

      {actionNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-xs font-medium text-success-800">
          <div className="flex items-center gap-2">
            <Icon name="check" className="size-4 shrink-0 text-success-600" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-success-700 hover:bg-success-100"
          >
            {t.common.close}
          </button>
        </div>
      )}

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {activeTab === 'fleet' ? (
        <>
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
        </>
      ) : (
        <>
          {/* Relocations summary strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.relocationMetricTotal}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{relocationTotalRecords}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.relocationMetricInTransit}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{relocationInTransitCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.relocationMetricScheduled}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-warning-600">{relocationScheduledCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.relocationMetricCompleted}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-success-600">{relocationCompletedCount}</p>
            </div>
          </div>

          {/* Relocation filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.relocationFilterHubLabel}</span>
                <select
                  value={relocationLocationFilter}
                  onChange={(e) => setRelocationLocationFilter(e.target.value)}
                  className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
                >
                  <option value="">{t.adminPages.vehicles.relocationAllHubs}</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.vehicles.relocationFilterStatusLabel}</span>
                <select
                  value={relocationStatusFilter}
                  onChange={(e) => setRelocationStatusFilter(e.target.value)}
                  className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
                >
                  <option value="">{t.adminPages.vehicles.relocationAllStatuses}</option>
                  <option value="SCHEDULED">{translateStatus(locale, 'SCHEDULED')}</option>
                  <option value="IN_TRANSIT">{translateStatus(locale, 'IN_TRANSIT')}</option>
                  <option value="COMPLETED">{translateStatus(locale, 'COMPLETED')}</option>
                  <option value="CANCELLED">{translateStatus(locale, 'CANCELLED')}</option>
                </select>
              </div>
            </div>
          </div>

          {relocations.length === 0 && !isRelocationsLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                <Icon name="route" className="size-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">{t.adminPages.vehicles.relocationEmptyTitle}</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{t.adminPages.vehicles.relocationEmptyDesc}</p>
            </div>
          ) : (
            <DataTable
              columns={relocationColumns}
              data={relocations}
              isLoading={isRelocationsLoading}
              emptyMessage={t.adminPages.vehicles.relocationEmptyTitle}
            />
          )}

          <Pagination
            page={relocationPage}
            totalPages={relocationTotalPages}
            totalRecords={relocationTotalRecords}
            onPageChange={(p) => fetchRelocations(p)}
          />
        </>
      )}

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

      {/* Create Vehicle Relocation Modal */}
      <Modal
        isOpen={isRelocateModalOpen}
        onClose={() => setIsRelocateModalOpen(false)}
        title={t.adminPages.vehicles.relocateModalTitle}
        description={t.adminPages.vehicles.relocateModalDesc}
        maxWidth="lg"
      >
        {relocateError && (
          <ErrorBanner message={relocateError} className="mb-4" onDismiss={() => setRelocateError(null)} />
        )}

        <form onSubmit={handleCreateRelocationSubmit} className="space-y-4">
          <FormField label={t.adminPages.vehicles.relocateVehicleLabel} required>
            <select
              required
              value={relocateVehicleId}
              onChange={(e) => {
                const vid = e.target.value;
                setRelocateVehicleId(vid);
                const found = relocatePoolVehicles.find((item) => item.id === vid);
                if (found?.currentDriver?.id) {
                  setRelocateDriverId(found.currentDriver.id);
                }
              }}
            >
              <option value="">{t.adminPages.vehicles.relocateSelectVehicleOption}</option>
              {relocatePoolVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} — {v.brand} {v.model} ({v.currentOperationalLocation?.name || v.homeLocation?.name || '—'})
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.vehicles.relocateFromHubLabel}>
              <input
                type="text"
                readOnly
                value={
                  selectedRelocateVehicle
                    ? `${selectedRelocateVehicle.currentOperationalLocation?.name || selectedRelocateVehicle.homeLocation?.name || '—'} (${selectedRelocateVehicle.currentOperationalLocation?.code || selectedRelocateVehicle.homeLocation?.code || '—'})`
                    : '—'
                }
                className="bg-slate-50 text-slate-600"
              />
            </FormField>

            <FormField label={t.adminPages.vehicles.relocateToHubLabel} required>
              <select
                required
                value={relocateToLocationId}
                onChange={(e) => setRelocateToLocationId(e.target.value)}
              >
                <option value="">{t.adminPages.vehicles.relocateSelectToHubOption}</option>
                {locations
                  .filter((loc) => loc.id !== selectedOriginHubId)
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.vehicles.relocateDriverLabel} required={relocateStartImmediately}>
              <select
                required={relocateStartImmediately}
                value={relocateDriverId}
                onChange={(e) => setRelocateDriverId(e.target.value)}
              >
                <option value="">{t.adminPages.vehicles.relocateDriverOptionalOption}</option>
                {availableDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.user.name} ({d.licenseNumber})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label={t.adminPages.vehicles.relocateScheduledAtLabel} required>
              <input
                type="datetime-local"
                required
                value={relocateScheduledAt}
                onChange={(e) => setRelocateScheduledAt(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label={t.adminPages.vehicles.relocateNotesLabel}>
            <textarea
              rows={2}
              placeholder={t.adminPages.vehicles.relocateNotesPlaceholder}
              value={relocateNotes}
              onChange={(e) => setRelocateNotes(e.target.value)}
            />
          </FormField>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={relocateStartImmediately}
              onChange={(e) => setRelocateStartImmediately(e.target.checked)}
              className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>{t.adminPages.vehicles.relocateStartImmediatelyLabel}</span>
          </label>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isCreatingRelocation}
              onClick={() => setIsRelocateModalOpen(false)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isCreatingRelocation || !relocateVehicleId || !relocateToLocationId}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isCreatingRelocation && <Spinner size="sm" className="text-white" />}
              {t.adminPages.vehicles.relocateSubmitBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Start Relocation Modal */}
      <Modal
        isOpen={Boolean(startingRelocation)}
        onClose={() => setStartingRelocation(null)}
        title={format(t.adminPages.vehicles.startModalTitle, { code: startingRelocation?.relocationCode || '' })}
        description={
          startingRelocation
            ? format(t.adminPages.vehicles.startModalDesc, {
                plate: startingRelocation.vehicle.plateNumber,
                route: `${startingRelocation.fromLocation.name} → ${startingRelocation.toLocation.name}`,
              })
            : ''
        }
        maxWidth="sm"
      >
        {startRelocationError && (
          <ErrorBanner message={startRelocationError} className="mb-4" onDismiss={() => setStartRelocationError(null)} />
        )}

        <form onSubmit={handleStartRelocationSubmit} className="space-y-4">
          <FormField label={t.adminPages.vehicles.selectDriverLabel} required>
            <select
              required
              value={startRelocationDriverId}
              onChange={(e) => setStartRelocationDriverId(e.target.value)}
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
              disabled={isStartingRelocation}
              onClick={() => setStartingRelocation(null)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isStartingRelocation || !startRelocationDriverId}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isStartingRelocation && <Spinner size="sm" className="text-white" />}
              {t.adminPages.vehicles.startConfirmBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Complete Relocation Confirm */}
      <ConfirmDialog
        isOpen={Boolean(completingRelocation)}
        onClose={() => setCompletingRelocation(null)}
        onConfirm={handleCompleteRelocationConfirm}
        title={t.adminPages.vehicles.completeModalTitle}
        message={
          completingRelocation
            ? format(t.adminPages.vehicles.completeModalMessage, {
                code: completingRelocation.relocationCode,
                plate: completingRelocation.vehicle.plateNumber,
                toHub: `${completingRelocation.toLocation.name} (${completingRelocation.toLocation.code})`,
              })
            : ''
        }
        confirmLabel={t.adminPages.vehicles.completeConfirmBtn}
        isLoading={isCompletingRelocation}
      />

      {/* Cancel Relocation Confirm */}
      <ConfirmDialog
        isOpen={Boolean(cancellingRelocation)}
        onClose={() => setCancellingRelocation(null)}
        onConfirm={handleCancelRelocationConfirm}
        title={format(t.adminPages.vehicles.cancelModalTitle, { code: cancellingRelocation?.relocationCode || '' })}
        message={format(t.adminPages.vehicles.cancelModalMessage, {
          plate: cancellingRelocation?.vehicle.plateNumber || '',
        })}
        confirmLabel={t.adminPages.vehicles.cancelConfirmBtn}
        isDestructive={true}
        isLoading={isCancellingRelocation}
      />
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
