import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureServiceWorker } from './ServiceWorkerRegister';

const origin = 'https://fleet.example.test';
const ownedRegistration = {
  active: { scriptURL: `${origin}/sw.js` },
  waiting: null,
  installing: null,
  unregister: vi.fn(),
  addEventListener: vi.fn(),
};
const otherRegistration = {
  active: { scriptURL: `${origin}/other-worker.js` },
  waiting: null,
  installing: null,
  unregister: vi.fn(),
};
const serviceWorker = { register: vi.fn(), getRegistrations: vi.fn(), controller: ownedRegistration.active };
const cacheStorage = { keys: vi.fn(), delete: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubGlobal('window', { location: { origin }, caches: cacheStorage });
  vi.stubGlobal('navigator', { serviceWorker });
  serviceWorker.getRegistrations.mockResolvedValue([ownedRegistration, otherRegistration]);
  serviceWorker.register.mockResolvedValue(ownedRegistration);
  ownedRegistration.unregister.mockResolvedValue(true);
  cacheStorage.keys.mockResolvedValue(['fleettrack-v2', 'fleettrack-v3', 'other-app-cache']);
  cacheStorage.delete.mockResolvedValue(true);
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('service worker lifecycle', () => {
  it('does not register a worker in development and removes only this app’s legacy worker/cache', async () => {
    await configureServiceWorker();
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(ownedRegistration.unregister).toHaveBeenCalledOnce();
    expect(otherRegistration.unregister).not.toHaveBeenCalled();
    expect(cacheStorage.delete.mock.calls).toEqual([['fleettrack-v2'], ['fleettrack-v3']]);
  });

  it('preserves production PWA registration without using a stale HTTP-cached worker script', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await configureServiceWorker();
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(cacheStorage.delete).not.toHaveBeenCalled();
  });

  it('activates an already waiting production worker', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const waiting = { postMessage: vi.fn() };
    serviceWorker.register.mockResolvedValue({ ...ownedRegistration, waiting });
    await configureServiceWorker();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('does nothing outside the browser', async () => {
    vi.stubGlobal('window', undefined);
    await configureServiceWorker();
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(serviceWorker.getRegistrations).not.toHaveBeenCalled();
  });

  it('does nothing when the browser does not support service workers', async () => {
    vi.stubGlobal('navigator', {});
    await configureServiceWorker();
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(serviceWorker.getRegistrations).not.toHaveBeenCalled();
  });
});
