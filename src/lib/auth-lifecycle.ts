import {
  SNAPSHOT_PREFIX,
  OUTBOX_STORAGE_KEY,
  TRIP_ID_MAP_KEY,
} from '@/lib/offline-sync';

const UNAUTHORIZED_DEBOUNCE_MS = 2000;

let interceptorInstalled = false;
let lastUnauthorizedAt = 0;

function isAuthStorageKey(key: string): boolean {
  return (
    key.startsWith(SNAPSHOT_PREFIX) ||
    key === OUTBOX_STORAGE_KEY ||
    key === TRIP_ID_MAP_KEY
  );
}

function removeMatchingKeys(storage: Storage): void {
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && isAuthStorageKey(key)) toRemove.push(key);
    }
  } catch {
    return;
  }
  for (const key of toRemove) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore: storage can throw (quota/security/privacy).
    }
  }
}

export function clearAuthState(): void {
  if (typeof window === 'undefined') return;
  try {
    removeMatchingKeys(window.localStorage);
  } catch {
    // Ignore: accessing storage itself can throw.
  }
  try {
    removeMatchingKeys(window.sessionStorage);
  } catch {
    // Ignore.
  }
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.location.pathname.startsWith('/login')) return;
    // Full-page redirect is intentional: it clears client auth state and
    // re-establishes the session. next/navigation's redirect/router are not
    // available in this plain (non-React) module.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  } catch {
    // Ignore.
  }
}

export function handleUnauthorized(): void {
  const now = Date.now();
  if (now - lastUnauthorizedAt < UNAUTHORIZED_DEBOUNCE_MS) return;
  lastUnauthorizedAt = now;
  clearAuthState();
  redirectToLogin();
}

function requestPathname(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') {
      return new URL(input, window.location.origin).pathname;
    }
    if (input instanceof URL) {
      return input.pathname;
    }
    return new URL(input.url).pathname;
  } catch {
    return '';
  }
}

export function installAuthInterceptor(): void {
  if (interceptorInstalled) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await originalFetch(input, init);
    if (res && res.status === 401) {
      const pathname = requestPathname(input);
      if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
        handleUnauthorized();
      }
    }
    return res;
  };
}
