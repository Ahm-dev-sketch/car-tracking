import {
  SNAPSHOT_PREFIX,
  OUTBOX_STORAGE_KEY,
  TRIP_ID_MAP_KEY,
} from '@/lib/offline-sync';

const UNAUTHORIZED_DEBOUNCE_MS = 2000;
const LAST_USER_ID_KEY = 'kcic_last_user_id';

let interceptorInstalled = false;
let lastUnauthorizedAt = 0;

export type ClearScope = 'all' | 'snapshots';

function isSnapshotKey(key: string): boolean {
  return key.startsWith(SNAPSHOT_PREFIX);
}

function isOutboxKey(key: string): boolean {
  return key === OUTBOX_STORAGE_KEY || key === TRIP_ID_MAP_KEY;
}

function removeMatchingKeys(storage: Storage, predicate: (key: string) => boolean): void {
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && predicate(key)) toRemove.push(key);
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

function forEachStorage(fn: (storage: Storage) => void): void {
  if (typeof window === 'undefined') return;
  try {
    fn(window.localStorage);
  } catch {
    // Ignore.
  }
  try {
    fn(window.sessionStorage);
  } catch {
    // Ignore.
  }
}

/**
 * Clear auth-derived client caches.
 * - 'all':       wipe read snapshots + offline outbox + trip-id map + last-user marker
 *                (explicit logout, or a different user logging in).
 * - 'snapshots': wipe read snapshots only, PRESERVING unsent offline mutations
 *                (automatic session expiry — the user may still need to replay them).
 */
export function clearAuthState(scope: ClearScope = 'all'): void {
  forEachStorage((storage) => {
    removeMatchingKeys(storage, isSnapshotKey);
    if (scope === 'all') {
      removeMatchingKeys(storage, isOutboxKey);
      try {
        storage.removeItem(LAST_USER_ID_KEY);
      } catch {
        // Ignore.
      }
    }
  });
}

function isOnline(): boolean {
  try {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

/**
 * Confirmed 401 while online → automatic session expiry. Preserve the offline outbox,
 * clear read snapshots, and redirect. Debounced so many parallel 401s act once.
 */
export function handleUnauthorized(): void {
  const now = Date.now();
  if (now - lastUnauthorizedAt < UNAUTHORIZED_DEBOUNCE_MS) return;
  lastUnauthorizedAt = now;
  clearAuthState('snapshots');
  redirectToLogin();
}

/**
 * next-auth reported 'unauthenticated'. Never wipe anything on a network drop; while online,
 * clear read snapshots only (the offline outbox is always preserved on this path).
 */
export function handleUnauthenticatedStatus(): void {
  if (!isOnline()) return;
  clearAuthState('snapshots');
}

/** Explicit sign-out: the user clicked logout, so it is safe to drop everything. */
export function onExplicitLogout(): void {
  clearAuthState('all');
}

export function readLastUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_USER_ID_KEY);
  } catch {
    return null;
  }
}

export function writeLastUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_USER_ID_KEY, userId);
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

function isNextAuthPath(pathname: string): boolean {
  // next-auth's own endpoints (session, signin, callbacks incl. credential submission).
  // A wrong password returns 401 here — never auto-logout on it.
  return pathname.startsWith('/api/auth/');
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
    // Strictly 401 — never 403 Forbidden or any other status.
    if (res && res.status === 401) {
      const pathname = requestPathname(input);
      if (pathname.startsWith('/api/') && !isNextAuthPath(pathname)) {
        handleUnauthorized();
      }
    }
    return res;
  };
}
