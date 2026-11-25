'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Drawer } from '@/components/ui/Drawer';
import { Icon } from '@/components/ui/Icon';
import { GreetingClock } from '@/components/ui/GreetingClock';
import { resetInstallDismissal } from '@/components/providers/InstallPrompt';
import { onExplicitLogout } from '@/lib/auth-lifecycle';
import { applyPendingOfflineBadgeDeduction } from '@/lib/user-booking-badge';
import { getNavigation, isNavigationActive } from './navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTranslation } from '@/components/providers/LanguageProvider';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

const THEME_EVENT = 'kcic-theme-change';

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function getDarkSnapshot() {
  return document.documentElement.classList.contains('dark');
}

export function NavBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t, format } = useTranslation();
  const role = session?.user?.role;
  const links = getNavigation(role).map((link) => ({
    ...link,
    label: (t.nav.links as Record<string, string>)[link.href] ?? link.label,
    shortLabel: (t.nav.shortLinks as Record<string, string>)[link.href] ?? link.shortLabel,
  }));
  const dockLinks = role === 'ADMIN' ? links.slice(0, 3) : links;
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pendingActionCount, setPendingActionCount] = useState(0);
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const name = session?.user?.name || session?.user?.email || t.nav.yourAccount;
  const initials = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const moreActive = role === 'ADMIN' && links.slice(3).some((link) => isNavigationActive(pathname, link.href));
  const hasMoreButton = role === 'ADMIN' || role === 'DRIVER';

  // The pre-hydration head script owns the initial class, so treat the root
  // classList as an external store; the server snapshot stays 'light'.
  const isDark = useSyncExternalStore(subscribeTheme, getDarkSnapshot, () => false);

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    window.dispatchEvent(new Event(THEME_EVENT));
  };

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

  const isActionBadgeTarget = (href: string) =>
    (role === 'ADMIN' && href === '/admin/bookings') ||
    (role === 'USER' && href === '/user/bookings');
  const badgeText = pendingActionCount > 99 ? '99+' : pendingActionCount;
  const badgeAriaLabel =
    role === 'ADMIN'
      ? format(t.nav.adminActionAria, { count: pendingActionCount })
      : format(t.nav.userActionAria, { count: pendingActionCount });

  useEffect(() => {
    const endpoint =
      role === 'ADMIN'
        ? '/api/admin/bookings/action-required'
        : role === 'USER'
        ? '/api/user/bookings/action-required'
        : null;

    if (!session?.user || !endpoint) {
      setPendingActionCount(0);
      return;
    }

    let cancelled = false;
    const loadPendingCount = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const json = await response.json();
          if (!cancelled && typeof json.data?.count === 'number' && !json.warning) {
            const count =
              role === 'USER'
                ? applyPendingOfflineBadgeDeduction(json.data.count, session.user.id)
                : json.data.count;
            setPendingActionCount(count);
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
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadPendingCount();
      }
    };
    const onBookingChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { count?: unknown } | null) : null;
      if (detail && typeof detail.count === 'number') {
        const count =
          role === 'USER'
            ? applyPendingOfflineBadgeDeduction(detail.count, session.user.id)
            : detail.count;
        setPendingActionCount(count);
        return;
      }
      void loadPendingCount();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('bookings:changed', onBookingChanged);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('bookings:changed', onBookingChanged);
    };
  }, [session?.user, session?.user?.id, role]);

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
          <Link href={links[0].href} className="flex min-h-11 shrink-0 items-center gap-2.5" aria-label={t.nav.brandHomeAria}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-lg shadow-xs" />
            <span className="text-lg font-semibold tracking-tight text-slate-900">KCIC <span className="font-bold text-brand-500 dark:text-rose-400">Fleet</span></span>
          </Link>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t.nav.mainNavAria}>
            {links.map((link) => {
              const showBadge = isActionBadgeTarget(link.href) && pendingActionCount > 0;
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
                      aria-label={badgeAriaLabel}
                      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold tabular-nums leading-none text-white"
                    >
                      {badgeText}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">
            <GreetingClock variant="navbar" />
            <LanguageSwitcher compact />
            <button type="button" onClick={toggleTheme} className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-[#1e293b] dark:text-[#e2e8f0] dark:hover:bg-[#334155] dark:hover:text-[#f8fafc]" aria-label={isDark ? t.nav.themeToLight : t.nav.themeToDark} aria-pressed={isDark}>
              <Icon name={isDark ? 'sun' : 'moon'} className="size-[18px]" />
            </button>
            <button type="button" onClick={() => setNotificationsOpen(true)} className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-[#1e293b] dark:text-[#e2e8f0] dark:hover:bg-[#334155] dark:hover:text-[#f8fafc]" aria-label={unreadCount ? format(t.nav.notificationsWithUnreadAria, { count: unreadCount }) : t.nav.notifications} aria-haspopup="dialog">
              <Icon name="bell" className="size-[18px]" />
              {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-brand-500 text-[9px] font-semibold leading-none tabular-nums text-white ring-2 ring-white dark:ring-[#1e293b]">{unreadCount}</span>}
            </button>
            <span className="mx-0.5 h-6 w-px bg-slate-200 dark:bg-[#334155]" aria-hidden="true" />
            <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 pl-1 pr-2 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#e2e8f0] dark:hover:border-[#475569] dark:hover:bg-[#334155]" aria-label={t.nav.openWorkspaceAria} aria-haspopup="dialog" aria-expanded={menuOpen}>
              <span className="grid size-7 place-items-center rounded-md border border-slate-200 bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-700 dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#e2e8f0]">{initials}</span>
              <span className="hidden text-xs font-medium text-slate-600 xl:inline">{role === 'ADMIN' ? t.nav.roles.ADMIN : role === 'DRIVER' ? t.nav.roles.DRIVER : t.nav.roles.USER}</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="mobile-dock" aria-label={t.nav.mobileNavAria}>
        {dockLinks.map((link) => {
          const isActive = isNavigationActive(pathname, link.href);
          const showBadge = isActionBadgeTarget(link.href) && pendingActionCount > 0;
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
                    aria-label={badgeAriaLabel}
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-semibold tabular-nums leading-none text-white ring-2 ring-white dark:ring-[#111827]"
                  >
                    {badgeText}
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
            className="dock-tab dock-tab--more"
            aria-expanded={menuOpen}
            aria-current={moreActive ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-label={t.nav.openMoreAria}
          >
            <span className="dock-tab-icon">
              <Icon name="more" className="size-5" />
            </span>
            <span className="dock-tab-label" aria-hidden="true">{t.nav.moreMenu}</span>
          </button>
        )}
      </nav>

      <Drawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} title={t.nav.yourWorkspaceTitle} description={t.nav.yourWorkspaceDesc}>
        <GreetingClock variant="compact" userName={session?.user?.name} className="w-full justify-between" />
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-[#334155] dark:bg-[#111827]">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#e2e8f0]">{initials}</span>
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{name}</p><p className="mt-0.5 text-xs font-medium text-slate-500">{role === 'ADMIN' ? t.nav.roleDescAdmin : role === 'DRIVER' ? t.nav.roleDescDriver : t.nav.roleDescUser}</p></div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-[#334155] dark:bg-[#111827]">
          <span className="text-xs font-semibold text-slate-700">{t.nav.languageLabel}</span>
          <LanguageSwitcher compact />
        </div>
        <nav aria-label={t.nav.workspaceNavAria} className="space-y-0.5">
          {links.map((link) => {
            const showBadge = isActionBadgeTarget(link.href) && pendingActionCount > 0;
            const active = isNavigationActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-[#1e293b]'
                }`}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-500" aria-hidden="true" />}
                <Icon name={link.icon} className={`size-4 ${active ? 'text-brand-500 dark:text-rose-400' : 'text-slate-400'}`} />
                <span className="flex-1">{link.label}</span>
                {showBadge && (
                  <span
                    aria-label={badgeAriaLabel}
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-semibold tabular-nums text-white"
                  >
                    {badgeText}
                  </span>
                )}
                <Icon name="chevronRight" className="size-4 text-slate-300 dark:text-slate-400" />
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={async () => {
              resetInstallDismissal();
              if (role === 'DRIVER') {
                // End the driver session BEFORE signOut clears the auth cookie,
                // so presence flips to offline. Bounded wait keeps logout snappy
                // while still giving the PATCH a real chance to land.
                const endSession = fetch('/api/driver/sessions/current/end', {
                  method: 'PATCH',
                  keepalive: true,
                }).catch(() => {});
                await Promise.race([
                  endSession,
                  new Promise((resolve) => setTimeout(resolve, 1500)),
                ]);
              }
              onExplicitLogout();
              signOut({ callbackUrl: '/login' });
            }}
            className="inline-flex w-full min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-danger-200 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <Icon name="logout" className="size-4" />{t.nav.signOut}
          </button>
        </div>
      </Drawer>

      <Drawer isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} title={t.nav.notifications} description={unreadCount ? format(t.nav.notificationsUnreadDesc, { count: unreadCount }) : t.nav.notificationsAllCaughtUp}>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-slate-200 bg-white text-slate-400"><Icon name="bell" className="size-5" /></span>
            <p className="text-sm font-semibold text-slate-900">{t.nav.notificationsQuietTitle}</p><p className="max-w-60 text-xs leading-relaxed text-slate-500">{t.nav.notificationsQuietDesc}</p>
          </div>
        ) : (
          <ul className="space-y-2">{notifications.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => !item.readAt && void markNotificationRead(item.id)} className={`w-full cursor-pointer rounded-xl border p-3.5 text-left transition-colors hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${!item.readAt ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200 bg-white'}`}>
                <span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-slate-900">{item.title}</span>{!item.readAt && <span className="relative mt-1.5 inline-flex size-2 shrink-0"><span className="inline-flex size-2 rounded-full bg-brand-500 status-ping" /><span className="sr-only">{t.nav.srUnread}</span></span>}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">{item.body}</span><RelativeTime date={item.createdAt} className="mt-2 block text-[11px] font-medium text-slate-400" />
              </button>
            </li>
          ))}</ul>
        )}
      </Drawer>
    </>
  );
}
