import { describe, expect, it } from 'vitest';
import { getNavigation, isNavigationActive } from './navigation';

describe('role-based navigation', () => {
  it('keeps each role inside its own workspace', () => {
    for (const role of ['ADMIN', 'DRIVER', 'USER']) {
      const links = getNavigation(role);
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((link) => link.href.startsWith(`/${role.toLowerCase()}`))).toBe(true);
      expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
    }
  });

  it('retains all management destinations and has a safe user default', () => {
    expect(getNavigation('ADMIN').map((link) => link.href)).toEqual(expect.arrayContaining([
      '/admin', '/admin/fleet', '/admin/bookings', '/admin/vehicles', '/admin/drivers', '/admin/trips', '/admin/users',
    ]));
    expect(getNavigation()).toEqual(getNavigation('USER'));
    expect(getNavigation('unknown')).toEqual(getNavigation('USER'));
  });
});

describe('active navigation', () => {
  it('does not highlight home on every child page', () => {
    expect(isNavigationActive('/user', '/user')).toBe(true);
    expect(isNavigationActive('/user/bookings', '/user')).toBe(false);
    expect(isNavigationActive('/admin/fleet', '/admin')).toBe(false);
    expect(isNavigationActive('/driver/history', '/driver')).toBe(false);
  });

  it('matches nested routes only on a path boundary', () => {
    expect(isNavigationActive('/user/bookings/123', '/user/bookings')).toBe(true);
    expect(isNavigationActive('/user/bookings-archive', '/user/bookings')).toBe(false);
    expect(isNavigationActive('/driver/history', '/driver/history')).toBe(true);
    expect(isNavigationActive('/user/vehicles', '/user/tracking')).toBe(false);
  });
});
