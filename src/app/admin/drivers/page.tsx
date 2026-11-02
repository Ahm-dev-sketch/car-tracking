'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

interface DriverItem {
  id: string;
  licenseNumber: string;
  status: string;
  currentVehicleId?: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    phone: string;
    isActive: boolean;
  };
  currentVehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    status: string;
  } | null;
}

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Add Driver Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Driver Modal
  const [editingDriver, setEditingDriver] = useState<DriverItem | null>(null);
  const [editLicense, setEditLicense] = useState('');
  const [editStatus, setEditStatus] = useState('OFFLINE');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Assign Vehicle Modal
  const [assigningDriver, setAssigningDriver] = useState<DriverItem | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<Array<{ id: string; plateNumber: string; brand: string; model: string }>>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Unassign Confirm
  const [unassigningDriver, setUnassigningDriver] = useState<DriverItem | null>(null);
  const [isUnassigning, setIsUnassigning] = useState(false);

  // Deactivate Driver Confirm
  const [deactivatingDriver, setDeactivatingDriver] = useState<DriverItem | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const fetchDrivers = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/drivers?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list: DriverItem[] = json.data || [];
        setDrivers(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load drivers');
      }
    } catch {
      setApiError('Network error loading drivers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers(1);
  }, [statusFilter]);

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAdd(true);
    setAddError(null);

    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          licenseNumber: licenseNumber.trim().toUpperCase(),
          password,
        }),
      });

      if (res.ok) {
        setIsAddOpen(false);
        setName('');
        setEmail('');
        setPhone('');
        setLicenseNumber('');
        setPassword('');
        fetchDrivers(1);
      } else {
        const err = await res.json();
        setAddError(err.error?.message || 'Failed to create driver');
      }
    } catch {
      setAddError('Network error creating driver');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleEditDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    setIsSubmittingEdit(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/drivers/${editingDriver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseNumber: editLicense.trim().toUpperCase(),
          status: editStatus,
        }),
      });

      if (res.ok) {
        setEditingDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setEditError(err.error?.message || 'Failed to update driver');
      }
    } catch {
      setEditError('Network error updating driver');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleOpenAssign = async (d: DriverItem) => {
    setAssigningDriver(d);
    setSelectedVehicleId('');
    setAssignError(null);
    try {
      const res = await fetch('/api/vehicles?status=AVAILABLE&limit=50');
      if (res.ok) {
        const json = await res.json();
        setAvailableVehicles(json.data || json.vehicles || []);
      }
    } catch {
      // ignore
    }
  };

  const handleAssignVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningDriver || !selectedVehicleId) return;
    setIsAssigning(true);
    setAssignError(null);

    try {
      const res = await fetch(`/api/admin/drivers/${assigningDriver.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicleId }),
      });

      if (res.ok) {
        setAssigningDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setAssignError(err.error?.message || 'Failed to assign vehicle');
      }
    } catch {
      setAssignError('Network error assigning vehicle');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignVehicle = async () => {
    if (!unassigningDriver) return;
    setIsUnassigning(true);

    try {
      const res = await fetch(`/api/admin/drivers/${unassigningDriver.id}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin unassigned' }),
      });

      if (res.ok) {
        setUnassigningDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to unassign vehicle');
      }
    } catch {
      setApiError('Network error unassigning vehicle');
    } finally {
      setIsUnassigning(false);
    }
  };

  const handleDeactivateDriver = async () => {
    if (!deactivatingDriver) return;
    setIsDeactivating(true);

    try {
      const res = await fetch(`/api/drivers/${deactivatingDriver.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setDeactivatingDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to deactivate driver');
      }
    } catch {
      setApiError('Network error deactivating driver');
    } finally {
      setIsDeactivating(false);
    }
  };

  const columns: Column<DriverItem>[] = [
    {
      header: 'Driver Name',
      cell: (d) => (
        <div>
          <span className="font-semibold text-zinc-900">{d.user.name}</span>
          <span className="text-zinc-500 block text-xs">{d.user.email}</span>
        </div>
      ),
    },
    {
      header: 'Phone',
      cell: (d) => <span className="font-mono text-xs">{d.user.phone}</span>,
    },
    {
      header: 'License #',
      cell: (d) => <span className="font-mono text-xs font-semibold">{d.licenseNumber}</span>,
    },
    {
      header: 'Vehicle Assigned',
      cell: (d) =>
        d.currentVehicle ? (
          <div>
            <span className="font-mono text-xs font-semibold text-zinc-900">
              {d.currentVehicle.plateNumber}
            </span>
            <span className="text-zinc-500 block text-[11px]">
              {d.currentVehicle.brand} {d.currentVehicle.model}
            </span>
          </div>
        ) : (
          <span className="text-zinc-400 italic text-xs">Unassigned</span>
        ),
    },
    {
      header: 'Status',
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      header: 'Actions',
      cell: (d) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {d.currentVehicle ? (
            <button
              type="button"
              onClick={() => setUnassigningDriver(d)}
              className="px-2 py-1 text-xs font-medium border border-zinc-200 text-zinc-700 rounded hover:bg-zinc-50 cursor-pointer"
            >
              Unassign
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenAssign(d)}
              className="px-2 py-1 text-xs font-medium border border-zinc-200 text-zinc-700 rounded hover:bg-zinc-50 cursor-pointer"
            >
              Assign
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingDriver(d);
              setEditLicense(d.licenseNumber);
              setEditStatus(d.status);
              setEditError(null);
            }}
            className="px-2 py-1 text-xs font-medium border border-zinc-200 text-zinc-700 rounded hover:bg-zinc-50 cursor-pointer"
          >
            Edit
          </button>

          {d.user.isActive && (
            <button
              type="button"
              onClick={() => setDeactivatingDriver(d)}
              className="px-2 py-1 text-xs font-medium text-rose-700 border border-rose-200 rounded hover:bg-rose-50 cursor-pointer"
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Drivers Directory</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Manage drivers, licenses, and duty assignments</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAddOpen(true);
            setAddError(null);
          }}
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>+ Add Driver</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search */}
      <div className="bg-white p-3 rounded-lg border border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <form onSubmit={(e) => { e.preventDefault(); fetchDrivers(1); }} className="w-full sm:w-80 flex gap-2">
          <input
            type="text"
            placeholder="Search driver name, license, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
          />
          <button type="submit" className="px-3 py-1.5 bg-zinc-900 text-white rounded text-xs font-semibold">
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON_TRIP">On Trip</option>
            <option value="OFFLINE">Offline</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={drivers}
        isLoading={isLoading}
        emptyMessage="No drivers found"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchDrivers(p)}
      />

      {/* Add Driver Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Driver"
        maxWidth="md"
      >
        {addError && <ErrorBanner message={addError} className="mb-4" onDismiss={() => setAddError(null)} />}

        <form onSubmit={handleCreateDriver} className="space-y-4">
          <FormField label="Full Name" required>
            <input
              type="text"
              required
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Email Address" required>
              <input
                type="email"
                required
                placeholder="driver@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Phone Number" required>
              <input
                type="tel"
                required
                placeholder="081234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Driver License #" required>
              <input
                type="text"
                required
                placeholder="SIM-A-123456"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Initial Password" required hint="Min 8 characters">
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmittingAdd}
              onClick={() => setIsAddOpen(false)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingAdd}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmittingAdd && <Spinner size="sm" className="text-white" />}
              Create Driver
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Driver Modal */}
      <Modal
        isOpen={Boolean(editingDriver)}
        onClose={() => setEditingDriver(null)}
        title={editingDriver ? `Edit Driver: ${editingDriver.user.name}` : ''}
        maxWidth="sm"
      >
        {editError && <ErrorBanner message={editError} className="mb-4" onDismiss={() => setEditError(null)} />}

        <form onSubmit={handleEditDriver} className="space-y-4">
          <FormField label="Driver License #" required>
            <input
              type="text"
              required
              value={editLicense}
              onChange={(e) => setEditLicense(e.target.value.toUpperCase())}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <FormField label="Duty Status" required>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="OFFLINE">OFFLINE</option>
              <option value="AVAILABLE">AVAILABLE (Requires assigned vehicle)</option>
            </select>
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmittingEdit}
              onClick={() => setEditingDriver(null)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmittingEdit && <Spinner size="sm" className="text-white" />}
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Vehicle Modal */}
      <Modal
        isOpen={Boolean(assigningDriver)}
        onClose={() => setAssigningDriver(null)}
        title="Assign Vehicle to Driver"
        description={assigningDriver ? assigningDriver.user.name : ''}
        maxWidth="sm"
      >
        {assignError && <ErrorBanner message={assignError} className="mb-4" onDismiss={() => setAssignError(null)} />}

        <form onSubmit={handleAssignVehicle} className="space-y-4">
          <FormField label="Available Vehicles" required>
            <select
              required
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="">-- Choose Vehicle --</option>
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} ({v.brand} {v.model})
                </option>
              ))}
            </select>
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningDriver(null)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedVehicleId}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isAssigning && <Spinner size="sm" className="text-white" />}
              Assign Vehicle
            </button>
          </div>
        </form>
      </Modal>

      {/* Unassign Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(unassigningDriver)}
        onClose={() => setUnassigningDriver(null)}
        onConfirm={handleUnassignVehicle}
        title="Unassign Vehicle"
        message={`Are you sure you want to unassign vehicle ${unassigningDriver?.currentVehicle?.plateNumber} from ${unassigningDriver?.user.name}?`}
        confirmLabel="Unassign"
        isDestructive={false}
        isLoading={isUnassigning}
      />

      {/* Deactivate Driver Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingDriver)}
        onClose={() => setDeactivatingDriver(null)}
        onConfirm={handleDeactivateDriver}
        title="Deactivate Driver"
        message={`Are you sure you want to deactivate ${deactivatingDriver?.user.name}? They will no longer be able to log in or operate fleet vehicles.`}
        confirmLabel="Deactivate"
        isDestructive={true}
        isLoading={isDeactivating}
      />
    </div>
  );
}
