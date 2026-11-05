import type { IconName } from '@/components/ui/Icon';

export interface NavigationItem {
  label: string;
  shortLabel: string;
  href: string;
  icon: IconName;
}

const navigation: Record<string, NavigationItem[]> = {
  ADMIN: [
    { label: 'Overview', shortLabel: 'Home', href: '/admin', icon: 'home' },
    { label: 'Live fleet', shortLabel: 'Live fleet', href: '/admin/fleet', icon: 'pin' },
    { label: 'Bookings', shortLabel: 'Bookings', href: '/admin/bookings', icon: 'calendar' },
    { label: 'Vehicles', shortLabel: 'Vehicles', href: '/admin/vehicles', icon: 'car' },
    { label: 'Drivers', shortLabel: 'Drivers', href: '/admin/drivers', icon: 'users' },
    { label: 'Trip history', shortLabel: 'Trips', href: '/admin/trips', icon: 'route' },
    { label: 'Team members', shortLabel: 'Team', href: '/admin/users', icon: 'users' },
  ],
  DRIVER: [
    { label: 'Your dashboard', shortLabel: 'Home', href: '/driver', icon: 'home' },
    { label: 'Your vehicle', shortLabel: 'Vehicle', href: '/driver/vehicle', icon: 'car' },
    { label: 'Trip history', shortLabel: 'History', href: '/driver/history', icon: 'route' },
  ],
  USER: [
    { label: 'Overview', shortLabel: 'Home', href: '/user', icon: 'home' },
    { label: 'Vehicles', shortLabel: 'Vehicles', href: '/user/vehicles', icon: 'car' },
    { label: 'My bookings', shortLabel: 'Bookings', href: '/user/bookings', icon: 'calendar' },
    { label: 'Live tracking', shortLabel: 'Tracking', href: '/user/tracking', icon: 'pin' },
  ],
};

export function getNavigation(role?: string): NavigationItem[] {
  return navigation[role ?? 'USER'] ?? navigation.USER;
}

export function isNavigationActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/admin' || href === '/driver' || href === '/user') return false;
  return pathname.startsWith(`${href}/`);
}
