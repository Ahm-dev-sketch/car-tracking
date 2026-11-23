'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Icon } from '@/components/ui/Icon';

interface UserItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  role: {
    id: string;
    code: string;
    name: string;
  };
  createdAt: string;
}

interface RoleItem {
  id: string;
  code: string;
  name: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset Password Modal
  const [resettingUser, setResettingUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Toggle Active State
  const [togglingUser, setTogglingUser] = useState<UserItem | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const fetchUsers = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list: UserItem[] = json.data || [];
        setUsers(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load users');
      }
    } catch {
      setApiError('Network error loading users');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/roles');
      if (res.ok) {
        const json = await res.json();
        setRoles(json.data || []);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchUsers(1);
    fetchRoles();
  }, []);

  const handleOpenCreate = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setFormRoleId(roles[0]?.id || '');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCreate(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim(),
          password: formPassword,
          roleId: formRoleId,
        }),
      });

      if (res.ok) {
        setIsCreateOpen(false);
        fetchUsers(1);
      } else {
        const err = await res.json();
        setCreateError(err.error?.message || 'Failed to create user');
      }
    } catch {
      setCreateError('Network error creating user');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || newPassword.length < 8) return;
    setIsSubmittingReset(true);
    setResetError(null);

    try {
      const res = await fetch(`/api/admin/users/${resettingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });

      if (res.ok) {
        setResettingUser(null);
        setNewPassword('');
      } else {
        const err = await res.json();
        setResetError(err.error?.message || 'Failed to reset password');
      }
    } catch {
      setResetError('Network error resetting password');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleToggleActiveConfirm = async () => {
    if (!togglingUser) return;
    setIsToggling(true);

    try {
      const res = await fetch(`/api/admin/users/${togglingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !togglingUser.isActive }),
      });

      if (res.ok) {
        setTogglingUser(null);
        fetchUsers(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to update user status');
      }
    } catch {
      setApiError('Network error updating user');
    } finally {
      setIsToggling(false);
    }
  };

  const columns: Column<UserItem>[] = [
    {
      header: 'User',
      cell: (u) => (
        <div>
          <span className="font-medium text-slate-900">{u.name}</span>
          <span className="block text-xs text-slate-500">{u.email}</span>
        </div>
      ),
    },
    {
      header: 'Phone',
      accessorKey: 'phone',
      cell: (u) => <span className="font-mono text-xs tabular-nums text-slate-700">{u.phone}</span>,
    },
    {
      header: 'Role',
      cell: (u) => {
        const color =
          u.role.code === 'ADMIN'
            ? 'border-brand-200 bg-brand-50 text-brand-700'
            : u.role.code === 'DRIVER'
            ? 'border-info-200 bg-info-100 text-info-700'
            : 'border-slate-200 bg-white text-slate-600';
        return (
          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${color}`}>
            {u.role.code}
          </span>
        );
      },
    },
    {
      header: 'Status',
      cell: (u) => (
        <span
          className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
            u.isActive
              ? 'border-success-200 bg-success-50 text-success-700'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          {u.isActive ? 'ACTIVE' : 'INACTIVE'}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (u) => (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setResettingUser(u);
              setNewPassword('');
              setResetError(null);
            }}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Reset Password
          </button>

          <button
            type="button"
            onClick={() => setTogglingUser(u)}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              u.isActive
                ? 'border-danger-200 bg-white text-danger-700 hover:bg-danger-50'
                : 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
            }`}
          >
            {u.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  const activeCount = users.filter((u) => u.isActive).length;
  const adminCount = users.filter((u) => u.role.code === 'ADMIN').length;
  const driverCount = users.filter((u) => u.role.code === 'DRIVER').length;

  return (
    <div className="space-y-6">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">User Management</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Control employee and system user accounts, roles, and credentials</p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="button-primary inline-flex cursor-pointer items-center gap-1.5 self-start sm:self-auto"
        >
          <Icon name="plus" className="size-4" />
          <span>Create User</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total User</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Aktif</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-success-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Admin</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{adminCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Driver</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{driverCount}</p>
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Search */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <form onSubmit={(e) => { e.preventDefault(); fetchUsers(1); }} className="flex w-full gap-2 sm:w-96">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Icon name="search" className="size-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Search user name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
          <button type="submit" className="button-primary shrink-0 px-3 text-xs">
            Search
          </button>
        </form>
      </div>

      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        emptyMessage="No users found"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchUsers(p)}
      />

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create System User"
        maxWidth="md"
      >
        {createError && <ErrorBanner message={createError} className="mb-4" onDismiss={() => setCreateError(null)} />}

        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <FormField label="Full Name" required>
            <input
              type="text"
              required
              placeholder="Jane Doe"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Email Address" required>
              <input
                type="email"
                required
                placeholder="user@company.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </FormField>

            <FormField label="Phone Number" required>
              <input
                type="tel"
                required
                placeholder="081234567890"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="tabular-nums"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Assign Role" required>
              <select
                required
                value={formRoleId}
                onChange={(e) => setFormRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} ({r.name})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Initial Password" required hint="Min 8 characters">
              <input
                type="password"
                required
                minLength={8}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isSubmittingCreate}
              onClick={() => setIsCreateOpen(false)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCreate}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isSubmittingCreate && <Spinner size="sm" className="text-white" />}
              Create User
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={Boolean(resettingUser)}
        onClose={() => setResettingUser(null)}
        title="Reset User Password"
        description={resettingUser ? `Reset password for ${resettingUser.name}` : ''}
        maxWidth="sm"
      >
        {resetError && <ErrorBanner message={resetError} className="mb-4" onDismiss={() => setResetError(null)} />}

        <form onSubmit={handleResetSubmit} className="space-y-4">
          <FormField label="New Password" required hint="Min 8 characters">
            <input
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isSubmittingReset}
              onClick={() => setResettingUser(null)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReset || newPassword.length < 8}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isSubmittingReset && <Spinner size="sm" className="text-white" />}
              Update Password
            </button>
          </div>
        </form>
      </Modal>

      {/* Toggle Active Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(togglingUser)}
        onClose={() => setTogglingUser(null)}
        onConfirm={handleToggleActiveConfirm}
        title={togglingUser?.isActive ? 'Deactivate User' : 'Activate User'}
        message={
          togglingUser?.isActive
            ? `Are you sure you want to deactivate ${togglingUser?.name}? They will no longer be able to log in.`
            : `Are you sure you want to activate ${togglingUser?.name}?`
        }
        confirmLabel={togglingUser?.isActive ? 'Deactivate' : 'Activate'}
        isDestructive={togglingUser?.isActive}
        isLoading={isToggling}
      />
    </div>
  );
}
