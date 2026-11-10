'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Drawer } from '@/components/ui/Drawer';
import { Icon } from '@/components/ui/Icon';
import { GreetingClock } from '@/components/ui/GreetingClock';
import { resetInstallDismissal } from '@/components/providers/InstallPrompt';
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

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const loadNotifications = async () => {
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
    void loadNotifications();
    const interval = setInterval(loadNotifications, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user || role !== 'ADMIN') {
      setPendingActionCount(0);
      return;
    }
    let cancelled = false;
    const loadPendingCount = async () => {
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
    void loadPendingCount();
    const interval = setInterval(loadPendingCount, 25000);
    const onBookingChanged = () => { void loadPendingCount(); };
    window.addEventListener('bookings:changed', onBookingChanged);

    return () => {
      cancelled = true;
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
          <Link href={links[0].href} className="flex min-h-11 shrink-0 items-center gap-2.5" aria-label="KCIC Fleet home">
            <span className="brand-mark"><Icon name="route" className="size-6 text-black" /></span>
            <span className="text-xl font-black tracking-tight text-black">KCIC <span className="text-emerald-700 underline decoration-black decoration-2">Fleet</span></span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {links.map((link) => {
              const showBadge = role === 'ADMIN' && link.href === '/admin/bookings' && pendingActionCount > 0;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="desktop-link relative inline-flex items-center gap-1.5"
                  aria-current={isNavigationActive(pathname, link.href) ? 'page' : undefined}
                >
                  <span>{link.label}</span>
                  {showBadge && (
                    <span
                      aria-label={`${pendingActionCount} pesanan butuh aksi`}
                      className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full border border-black bg-rose-500 text-white text-[10px] font-black leading-none shadow-[1px_1px_0px_0px_#000]"
                    >
                      {pendingActionCount > 99 ? '99+' : pendingActionCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <GreetingClock variant="navbar" />
            <button type="button" onClick={() => setNotificationsOpen(true)} className="icon-button relative rounded-xl border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000]" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-haspopup="dialog">
              <Icon name="bell" />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 size-3.5 rounded-full border-1.5 border-black bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">{unreadCount}</span>}
            </button>
            <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2.5 rounded-xl border-2 border-black bg-amber-300 p-1 text-black shadow-[2px_2px_0px_0px_#000] transition-all hover:bg-amber-400 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none" aria-label="Open account and navigation" aria-haspopup="dialog" aria-expanded={menuOpen}>
              <span className="grid size-8 place-items-center rounded-lg border-1.5 border-black bg-white text-xs font-black">{initials}</span>
              <span className="hidden pr-2 text-xs font-black uppercase tracking-wider xl:inline">{role === 'ADMIN' ? 'Admin' : role === 'DRIVER' ? 'Driver' : 'Workspace'}</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="mobile-dock" aria-label="Mobile navigation">
        {dockLinks.map((link) => {
          const showBadge = role === 'ADMIN' && link.href === '/admin/bookings' && pendingActionCount > 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="dock-link relative"
              aria-current={isNavigationActive(pathname, link.href) ? 'page' : undefined}
            >
              <div className="relative">
                <Icon name={link.icon} className="size-[21px]" />
                {showBadge && (
                  <span
                    aria-label={`${pendingActionCount} pesanan butuh aksi`}
                    className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full border border-black bg-rose-500 text-white text-[9px] font-black flex items-center justify-center leading-none shadow-[1px_1px_0px_0px_#000]"
                  >
                    {pendingActionCount > 99 ? '99+' : pendingActionCount}
                  </span>
                )}
              </div>
              <span>{link.shortLabel}</span>
            </Link>
          );
        })}
        {(role === 'ADMIN' || role === 'DRIVER') && (
          <button type="button" onClick={() => setMenuOpen(true)} className="dock-link" aria-expanded={menuOpen} aria-current={moreActive ? 'page' : undefined} aria-haspopup="dialog">
            <Icon name="more" /><span>More</span>
          </button>
        )}
      </nav>

      <Drawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} title="Your workspace" description="Everything you need for the road ahead.">
        <GreetingClock variant="compact" userName={session?.user?.name} className="w-full justify-between" />
        <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-emerald-300 p-4 shadow-[3px_3px_0px_0px_#000]">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg border-2 border-black bg-white text-base font-black text-black">{initials}</span>
          <div className="min-w-0"><p className="break-words text-sm font-extrabold text-black">{name}</p><p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-emerald-950">{role === 'ADMIN' ? 'Fleet administrator' : role === 'DRIVER' ? 'Driver workspace' : 'Employee workspace'}</p></div>
        </div>
        <nav aria-label="Workspace navigation" className="space-y-2">
          {links.map((link) => {
            const showBadge = role === 'ADMIN' && link.href === '/admin/bookings' && pendingActionCount > 0;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isNavigationActive(pathname, link.href) ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl border-2 border-black px-4 text-sm font-bold shadow-[2.5px_2.5px_0px_0px_#000] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                  isNavigationActive(pathname, link.href) ? 'bg-amber-300 text-black' : 'bg-white text-black hover:bg-amber-100'
                }`}
              >
                <Icon name={link.icon} />
                <span className="flex-1">{link.label}</span>
                {showBadge && (
                  <span
                    aria-label={`${pendingActionCount} pesanan butuh aksi`}
                    className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full border border-black bg-rose-500 text-white text-xs font-black shadow-[1px_1px_0px_0px_#000]"
                  >
                    {pendingActionCount > 99 ? '99+' : pendingActionCount}
                  </span>
                )}
                <Icon name="arrow" className="size-4 opacity-75" />
              </Link>
            );
          })}
        </nav>
        <div className="border-t-2 border-black pt-4">
          <button
            type="button"
            onClick={() => {
              resetInstallDismissal();
              signOut({ callbackUrl: '/login' });
            }}
            className="button-secondary w-full rounded-xl border-2 border-black bg-rose-200 text-black font-extrabold shadow-[3px_3px_0px_0px_#000] hover:bg-rose-300"
          >
            <Icon name="logout" />Sign out
          </button>
        </div>
      </Drawer>

      <Drawer isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications" description={unreadCount ? `${unreadCount} unread updates from your workspace.` : 'You’re all caught up.'}>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-black bg-amber-50/50 px-5 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000]"><Icon name="bell" className="size-6" /></span>
            <p className="text-base font-extrabold text-black">A little quiet here.</p><p className="max-w-60 text-xs font-medium leading-relaxed text-zinc-600">Booking and trip updates will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-3">{notifications.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => !item.readAt && void markNotificationRead(item.id)} className={`w-full rounded-xl border-2 border-black p-4 text-left shadow-[3px_3px_0px_0px_#000] transition-all hover:bg-amber-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${!item.readAt ? 'bg-amber-200/70' : 'bg-white'}`}>
                <span className="flex items-start justify-between gap-3"><span className="text-sm font-extrabold text-black">{item.title}</span>{!item.readAt && <span className="mt-1 size-2.5 shrink-0 rounded-full border border-black bg-emerald-500"><span className="sr-only">Unread</span></span>}</span>
                <span className="mt-1.5 block text-xs font-medium leading-relaxed text-zinc-800">{item.body}</span><RelativeTime date={item.createdAt} className="mt-2.5 block font-mono text-[11px] font-bold text-zinc-600" />
              </button>
            </li>
          ))}</ul>
        )}
      </Drawer>
    </>
  );
}
