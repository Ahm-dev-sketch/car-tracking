// Server-only TTL in-memory cache stored on globalThis.
// Storing on globalThis (rather than module scope) keeps the cache stable across
// Next.js dev hot-reloads and avoids duplicate singleton state in serverless edges.

type CacheEntry = { value: unknown; expiresAt: number };

const globalCache = globalThis as unknown as {
  __kcicCache?: Map<string, CacheEntry>;
};

function getStore(): Map<string, CacheEntry> {
  if (!globalCache.__kcicCache) {
    globalCache.__kcicCache = new Map<string, CacheEntry>();
  }
  return globalCache.__kcicCache;
}

export function getCached<T>(key: string): T | undefined {
  const entry = getStore().get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    getStore().delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  getStore().set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(key: string): void {
  getStore().delete(key);
}