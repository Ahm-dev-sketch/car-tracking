'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { RelativeTime } from '@/components/ui/RelativeTime';

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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  // Click outside to close notifications dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!session?.user) return;
    try {
      const res = await fetch('/api/notifications?limit=8');
      if (res.ok) {
        const json = await res.json();
        const items: NotificationItem[] = json.data || [];
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.readAt).length);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [session]);

  const markNotificationRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  let links: { label: string; href: string }[] = [];
  if (role === 'ADMIN') {
    links = [
      { label: 'Overview', href: '/admin' },
      { label: 'Vehicles', href: '/admin/vehicles' },
      { label: 'Drivers', href: '/admin/drivers' },
      { label: 'Bookings', href: '/admin/bookings' },
      { label: 'Live Fleet', href: '/admin/fleet' },
      { label: 'Trips', href: '/admin/trips' },
      { label: 'Users', href: '/admin/users' },
    ];
  } else if (role === 'DRIVER') {
    links = [
      { label: 'Active Trip', href: '/driver' },
      { label: 'My Vehicle', href: '/driver/vehicle' },
      { label: 'Trip History', href: '/driver/history' },
    ];
  } else {
    // Default USER
    links = [
      { label: 'Overview', href: '/user' },
      { label: 'Vehicles', href: '/user/vehicles' },
      { label: 'My Bookings', href: '/user/bookings' },
      { label: 'Live Tracking', href: '/user/tracking' },
    ];
  }

  const roleBadgeColor =
    role === 'ADMIN'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : role === 'DRIVER'
      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
      : 'bg-zinc-100 text-zinc-800 border-zinc-200';

  return (
    <nav className="bg-white border-b border-zinc-200 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Brand & Left Nav */}
          <div className="flex items-center gap-6">
            <Link
              href={role === 'ADMIN' ? '/admin' : role === 'DRIVER' ? '/driver' : '/user'}
              className="flex items-center gap-2 font-bold text-zinc-900 tracking-tight text-sm uppercase min-h-[44px]"
            >
              <div className="w-6 h-6 rounded bg-zinc-900 text-white flex items-center justify-center font-mono text-xs font-bold">
                F
              </div>
              <span>FleetOps</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {links.map((link) => {
                const isActive =
                  pathname === link.href || (link.href !== '/admin' && link.href !== '/user' && link.href !== '/driver' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-zinc-100 text-zinc-900 font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right Actions: Notifications, User, Signout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Notifications Bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((v) => !v)}
                className="relative min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-md cursor-pointer"
                aria-label="View notifications"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-600" />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-lg shadow-xl border border-zinc-200 overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                    <span className="text-xs font-semibold text-zinc-800">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] bg-rose-100 text-rose-800 font-semibold px-1.5 py-0.5 rounded">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-500">
                        No notifications
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => !n.readAt && markNotificationRead(n.id)}
                          className={`p-3 text-left transition-colors cursor-pointer ${
                            !n.readAt ? 'bg-zinc-50/80 hover:bg-zinc-100/60' : 'hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-900 truncate">
                              {n.title}
                            </span>
                            <RelativeTime date={n.createdAt} className="text-[10px] shrink-0" />
                          </div>
                          <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile & Role */}
            {session?.user && (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-zinc-200">
                <div className="text-right">
                  <div className="text-xs font-semibold text-zinc-800 leading-tight">
                    {session.user.name || session.user.email}
                  </div>
                  <span className={`inline-block text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border ${roleBadgeColor}`}>
                    {role}
                  </span>
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded hover:bg-zinc-100 cursor-pointer flex items-center justify-center"
            >
              Sign out
            </button>

            {/* Mobile hamburger button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-md cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 bg-white px-4 pt-2 pb-3 space-y-1">
          {links.map((link) => {
            const isActive =
              pathname === link.href || (link.href !== '/admin' && link.href !== '/user' && link.href !== '/driver' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center min-h-[44px] px-3 py-2 rounded-md text-xs font-medium ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-900 font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
