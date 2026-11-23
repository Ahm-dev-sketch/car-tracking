'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

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
          <span className="font-semibold text-zinc-900">{u.name}</span>
          <span className="text-zinc-500 block text-xs">{u.email}</span>
        </div>
      ),
    },
    {
      header: 'Phone',
      accessorKey: 'phone',
      cell: (u) => <span className="font-mono text-xs">{u.phone}</span>,
    },
    {
      header: 'Role',
      cell: (u) => {
        const color =
          u.role.code === 'ADMIN'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : u.role.code === 'DRIVER'
            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
            : 'bg-zinc-100 text-zinc-800 border-zinc-200';
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${color}`}>
            {u.role.code}
          </span>
        );
      },
    },
    {
      header: 'Status',
      cell: (u) => (
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
            u.isActive
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-zinc-100 text-zinc-500 border-zinc-200'
          }`}
        >
          {u.isActive ? 'ACTIVE' : 'INACTIVE'}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (u) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setResettingUser(u);
              setNewPassword('');
              setResetError(null);
            }}
            className="px-2.5 py-1 text-xs font-black border-2 border-black text-zinc-900 bg-white rounded-lg hover:bg-zinc-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
          >
            Reset Password
          </button>

          <button
            type="button"
            onClick={() => setTogglingUser(u)}
            className={`px-2.5 py-1 text-xs font-black rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer ${
              u.isActive
                ? 'text-rose-700 bg-rose-50 hover:bg-rose-100'
                : 'text-emerald-950 bg-emerald-200 hover:bg-emerald-300'
            }`}
          >
            {u.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b-2 border-black/10">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950">User Management</h1>
          <p className="text-xs font-medium text-zinc-600 mt-0.5">Control employee and system user accounts, roles, and credentials</p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="button-primary cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>+ Create User</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Search */}
      <div className="surface p-4 flex items-center justify-between gap-3">
        <form onSubmit={(e) => { e.preventDefault(); fetchUsers(1); }} className="w-full sm:w-80 flex gap-2">
          <input
            type="text"
            placeholder="Search user name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-medium border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
          />
          <button type="submit" className="button-primary px-3 py-1.5 text-xs font-black">
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
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Email Address" required>
              <input
                type="email"
                required
                placeholder="user@company.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Phone Number" required>
              <input
                type="tel"
                required
                placeholder="081234567890"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Assign Role" required>
              <select
                required
                value={formRoleId}
                onChange={(e) => setFormRoleId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
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
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmittingCreate}
              onClick={() => setIsCreateOpen(false)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCreate}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
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
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmittingReset}
              onClick={() => setResettingUser(null)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReset || newPassword.length < 8}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
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
