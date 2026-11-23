'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Bell, ChevronRight, Ellipsis, LogOut, Route, Settings2 } from 'lucide-react';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Drawer } from '@/components/ui/Drawer';
import { Icon } from '@/components/ui/Icon';
import { GreetingClock } from '@/components/ui/GreetingClock';
import { resetInstallDismissal } from '@/components/providers/InstallPrompt';
import { onExplicitLogout } from '@/lib/auth-lifecycle';
import { getNavigation, isNavigationActive } from './navigation';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function NavBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const links = getNavigation(role);
  const dockLinks = role === 'ADMIN' ? links.slice(0, 3) : links;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pendingActionCount, setPendingActionCount] = useState(0);
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const name = session?.user?.name || session?.user?.email || 'Your account';
  const initials = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const moreActive = role === 'ADMIN' && links.slice(3).some((link) => isNavigationActive(pathname, link.href));
  const hasMoreButton = role === 'ADMIN' || role === 'DRIVER';
  const roleLabel = role === 'ADMIN' ? 'Admin' : role === 'DRIVER' ? 'Driver' : 'User';
  const roleLong = role === 'ADMIN' ? 'Fleet Administrator' : role === 'DRIVER' ? 'Driver Operasional' : 'Staf / Penumpang';

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const loadNotifications = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/notifications?limit=8');
        if (response.ok) {
          const json = await response.json();
          if (!cancelled) setNotifications(json.data || []);
        }
      } catch {
        // Keep the last notifications visible during a connection interruption.
      }
    };
    const initialTimer = setTimeout(() => {
      void loadNotifications();
    }, 300);
    const interval = setInterval(() => {
      void loadNotifications();
    }, 15000);
    return () => { cancelled = true; clearTimeout(initialTimer); clearInterval(interval); };
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user || role !== 'ADMIN') {
      return;
    }
    let cancelled = false;
    const loadPendingCount = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/admin/bookings/action-required');
        if (response.ok) {
          const json = await response.json();
          if (!cancelled && typeof json.data?.count === 'number' && !json.warning) {
            setPendingActionCount(json.data.count);
          }
        }
      } catch {
        // Keep previous count on connection interruption.
      }
    };
    const initialTimer = setTimeout(() => {
      void loadPendingCount();
    }, 600);
    const interval = setInterval(() => {
      void loadPendingCount();
    }, 25000);
    const onBookingChanged = () => { void loadPendingCount(); };
    window.addEventListener('bookings:changed', onBookingChanged);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener('bookings:changed', onBookingChanged);
    };
  }, [session?.user, role]);

  const markNotificationRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      if (!response.ok) return;
      setNotifications((previous) => previous.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch {
      // Leave unread notifications available to retry.
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="header-island">
          <Link
            href={links[0].href}
            className="flex min-h-9 shrink-0 items-center gap-2.5 rounded-[var(--radius-md)]"
            aria-label="KCIC Fleet — beranda"
          >
            <span className="brand-mark">
              <Route className="size-4" strokeWidth={2.1} aria-hidden="true" />
            </span>
            <span className="brand-word hidden sm:block">
              KCIC <span>Fleet</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Navigasi utama">
            {links.map((link) => {
              const showBadge = role === 'ADMIN' && link.href === '/admin/bookings' && pendingActionCount > 0;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="desktop-link inline-flex items-center gap-1.5"
                  aria-current={isNavigationActive(pathname, link.href) ? 'page' : undefined}
                >
                  <span>{link.label}</span>
                  {showBadge && (
                    <span
                      aria-label={`${pendingActionCount} pesanan butuh aksi`}
                      className="count-badge"
                    >
                      {pendingActionCount > 99 ? '99+' : pendingActionCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <GreetingClock variant="navbar" />
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="header-icon-button relative"
              aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`}
              aria-haspopup="dialog"
            >
              <Bell className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[#C8102E] px-1 text-[0.625rem] font-bold leading-4 text-white tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--border)] bg-white pl-1 pr-1 text-slate-800 transition-colors hover:bg-[var(--canvas)] xl:pr-2.5"
              aria-label="Buka menu akun dan navigasi"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              <span className="grid size-7 place-items-center rounded-full bg-[var(--slate-navy)] text-[0.6875rem] font-semibold text-white">
                {initials}
              </span>
              <span className="hidden text-[0.75rem] font-medium text-slate-600 xl:inline">{roleLabel}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom dock */}
      <nav className="mobile-dock" aria-label="Navigasi seluler">
        {dockLinks.map((link) => {
          const isActive = isNavigationActive(pathname, link.href);
          const showBadge = role === 'ADMIN' && link.href === '/admin/bookings' && pendingActionCount > 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="dock-tab"
              aria-current={isActive ? 'page' : undefined}
              aria-label={link.label}
            >
              <span className="dock-tab-icon">
                <Icon name={link.icon} className="size-5" />
                {showBadge && (
                  <span
                    aria-label={`${pendingActionCount} pesanan butuh aksi`}
                    className="absolute -right-1 -top-1 grid min-w-3.5 place-items-center rounded-full bg-[#C8102E] px-0.5 text-[0.5rem] font-bold leading-3.5 text-white tabular-nums"
                  >
                    {pendingActionCount > 99 ? '99+' : pendingActionCount}
                  </span>
                )}
              </span>
              <span className="dock-tab-label" aria-hidden="true">{link.shortLabel}</span>
            </Link>
          );
        })}
        {hasMoreButton && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="dock-tab"
            aria-expanded={menuOpen}
            aria-current={moreActive ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-label="Buka menu navigasi lainnya"
          >
            <span className="dock-tab-icon">
              <Ellipsis className="size-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="dock-tab-label" aria-hidden="true">More</span>
          </button>
        )}
      </nav>

      {/* Account menu */}
      <Drawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu akun"
        description="Navigasi kerja dan pengaturan Anda."
      >
        <GreetingClock variant="compact" userName={session?.user?.name} className="w-full justify-between" />

        <div className="card flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--slate-navy)] text-[0.8125rem] font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-semibold text-slate-900">{name}</p>
            <p className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.06em] text-slate-400">{roleLong}</p>
          </div>
        </div>

        <nav aria-label="Navigasi ruang kerja" className="card overflow-hidden p-1.5">
          {links.map((link) => {
            const showBadge = role === 'ADMIN' && link.href === '/admin/bookings' && pendingActionCount > 0;
            const isActive = isNavigationActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-[0.8125rem] font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--canvas)] text-slate-900'
                    : 'text-slate-600 hover:bg-[var(--canvas)] hover:text-slate-900'
                }`}
              >
                <Icon
                  name={link.icon}
                  className={`size-[1.125rem] shrink-0 ${isActive ? 'text-[#C8102E]' : 'text-slate-400'}`}
                />
                <span className="flex-1">{link.label}</span>
                {showBadge && (
                  <span aria-label={`${pendingActionCount} pesanan butuh aksi`} className="count-badge">
                    {pendingActionCount > 99 ? '99+' : pendingActionCount}
                  </span>
                )}
                <ChevronRight className="size-3.5 shrink-0 text-slate-300" strokeWidth={2} aria-hidden="true" />
              </Link>
            );
          })}
        </nav>

        <div className="card overflow-hidden p-1.5">
          <button
            type="button"
            disabled
            className="flex w-full min-h-11 cursor-not-allowed items-center gap-3 rounded-[var(--radius-md)] px-3 text-left text-[0.8125rem] font-medium text-slate-400"
            aria-disabled="true"
          >
            <Settings2 className="size-[1.125rem] shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="flex-1">Pengaturan akun</span>
            <span className="pill text-[0.625rem]">Segera</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            resetInstallDismissal();
            onExplicitLogout();
            signOut({ callbackUrl: '/login' });
          }}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-4 py-2.5 text-[0.8125rem] font-semibold text-[#B91C1C] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2]"
        >
          <LogOut className="size-4" strokeWidth={1.9} aria-hidden="true" />
          <span>Keluar akun</span>
        </button>
      </Drawer>

      {/* Notifications */}
      <Drawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="Notifikasi"
        description={unreadCount ? `${unreadCount} pemberitahuan belum dibaca.` : 'Semua notifikasi telah dibaca.'}
      >
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--radius-xl)] border border-[var(--border)] bg-white px-5 py-12 text-center">
            <span className="mb-3 grid size-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] text-slate-400">
              <Bell className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p className="text-[0.8125rem] font-semibold text-slate-900">Belum ada notifikasi</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
              Pembaruan pesanan dan status armada akan muncul di sini.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => !item.readAt && void markNotificationRead(item.id)}
                  className={`flex w-full cursor-pointer gap-3 p-3.5 text-left transition-colors hover:bg-[var(--canvas)] ${
                    !item.readAt ? 'bg-[#FDF2F4]/60' : 'bg-white'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                      !item.readAt ? 'bg-[#FDF2F4] text-[#C8102E]' : 'bg-[var(--canvas)] text-slate-400'
                    }`}
                  >
                    <Bell className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[0.8125rem] font-semibold leading-snug text-slate-900">{item.title}</span>
                      {!item.readAt && (
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#C8102E]">
                          <span className="sr-only">Belum dibaca</span>
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.body}</span>
                    <RelativeTime date={item.createdAt} className="mt-1.5 block" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}
