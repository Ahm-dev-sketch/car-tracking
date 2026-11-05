const CACHE_NAME = 'fleettrack-v4';
const PRECACHE_URLS = ['/offline'];

// Install: precache essential shell and offline fallback
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: purge obsolete caches and claim active clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith('fleettrack-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Message listener for skipWaiting trigger
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch routing
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never cache non-GET requests (mutations, ingest, auth POST/PATCH)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Next owns framework bundle caching. Dev chunk URLs can keep the same name
  // after edits; replaying them against fresh HTML causes hydration mismatches.
  // Private API/RSC responses must also never outlive their session.
  if (url.origin === self.location.origin &&
      (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/') || request.headers.get('RSC') === '1')) {
    return;
  }

  // Navigation is network-only; never replay another account's HTML offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(async () => {
          const offlinePage = await caches.match('/offline');
          return offlinePage || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }


  // Public images and icons only; framework assets use Next/browser HTTP caching.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/icons/') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png'))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        });
      })
    );
  }
});
