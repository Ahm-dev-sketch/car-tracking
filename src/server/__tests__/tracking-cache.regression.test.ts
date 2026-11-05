import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const cache = { put: vi.fn(), addAll: vi.fn().mockResolvedValue(undefined) };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(new Response('offline')),
    keys: vi.fn().mockResolvedValue(['fleettrack-v2', 'fleettrack-v3', 'fleettrack-v4', 'other-app-cache']),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response('private account data'));
  runInNewContext(source, {
    URL, Response, caches, fetch,
    self: {
      location: { origin: 'https://example.test' },
      addEventListener: (type: string, callback: (event: unknown) => void) => handlers.set(type, callback),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
  });
  function dispatch(path: string, mode = 'cors', headers = new Headers(), method = 'GET') {
    const respondWith = vi.fn();
    handlers.get('fetch')?.({ request: { url: `https://example.test${path}`, mode, method, headers }, respondWith });
    return respondWith;
  }
  return { handlers, cache, caches, fetch, dispatch };
}

describe('Authenticated tracking cache isolation', () => {
  it.each(['/api/tracking/live', '/api/auth/session', '/api/bookings', '/api/tracking/vehicle/vehicle'])('does not intercept or cache %s', (path) => {
    const sw = worker();
    expect(sw.dispatch(path)).not.toHaveBeenCalled();
    expect(sw.caches.match).not.toHaveBeenCalled();
    expect(sw.caches.open).not.toHaveBeenCalled();
  });

  it.each([
    '/_next/static/chunks/app/driver/page.js',
    '/_next/static/development/_buildManifest.js',
    '/_next/static/media/font.woff2',
    '/_next/static/media/logo.png',
    '/_next/webpack-hmr',
  ])('does not replay stale framework assets from service worker caches: %s', (path) => {
    const sw = worker();
    expect(sw.dispatch(path)).not.toHaveBeenCalled();
    expect(sw.caches.match).not.toHaveBeenCalled();
    expect(sw.caches.open).not.toHaveBeenCalled();
  });

  it('does not intercept authenticated RSC payloads', () => {
    const sw = worker();
    expect(sw.dispatch('/admin/fleet?_rsc=payload', 'cors', new Headers({ RSC: '1' }))).not.toHaveBeenCalled();
  });

  it('does not cache authenticated HTML navigations', async () => {
    const sw = worker();
    const respond = sw.dispatch('/admin/fleet', 'navigate');
    expect(await respond.mock.calls[0][0]).toBeInstanceOf(Response);
    expect(sw.caches.open).not.toHaveBeenCalled();
    expect(sw.cache.put).not.toHaveBeenCalled();
  });

  it('falls back only to the public offline page, not a previous account page', async () => {
    const sw = worker();
    sw.fetch.mockRejectedValue(new Error('offline'));
    const respond = sw.dispatch('/user/tracking', 'navigate');
    await respond.mock.calls[0][0];
    expect(sw.caches.match).toHaveBeenCalledExactlyOnceWith('/offline');
  });

  it('purges the legacy cache containing authenticated responses', async () => {
    const sw = worker();
    const waitUntil = vi.fn();
    sw.handlers.get('activate')?.({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(sw.caches.delete).toHaveBeenCalledTimes(2);
    expect(sw.caches.delete).toHaveBeenCalledWith('fleettrack-v2');
    expect(sw.caches.delete).toHaveBeenCalledWith('fleettrack-v3');
    expect(sw.caches.delete).not.toHaveBeenCalledWith('fleettrack-v4');
    expect(sw.caches.delete).not.toHaveBeenCalledWith('other-app-cache');
  });

  it('leaves mutations unintercepted', () => {
    const sw = worker();
    expect(sw.dispatch('/api/tracking/locations', 'cors', new Headers(), 'POST')).not.toHaveBeenCalled();
  });
});
