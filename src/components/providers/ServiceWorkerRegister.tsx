'use client';

import { useEffect } from 'react';

export async function configureServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  if (process.env.NODE_ENV !== 'production') {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const appRegistrations = registrations.filter((registration) =>
      [registration.active, registration.waiting, registration.installing].some((worker) =>
        worker && worker.scriptURL === `${window.location.origin}/sw.js`
      )
    );
    await Promise.all(appRegistrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const names = await window.caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('fleettrack-')).map((name) => window.caches.delete(name)));
    }
    return;
  }

  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    installingWorker?.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        installingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    void configureServiceWorker().catch((error: unknown) => {
      console.warn('[PWA] Service worker setup failed:', error);
    });
  }, []);

  return null;
}
