/**
 * Client-side IndexedDB & LocalStorage Cache for Reverse Geocoding.
 * Avoids repeated network calls for coordinates already resolved.
 */

export interface GeocodeCacheRecord {
  key: string; // "lat.4,lng.4" (~11m spatial grid)
  lat: number;
  lng: number;
  address: string;
  cachedAt: number;
}

const DB_NAME = 'kcic_fleet_geocode_v1';
const STORE_NAME = 'geocodes';
const DB_VERSION = 1;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days TTL

// Hot in-memory cache for synchronous 0ms hits
const memoryCache = new Map<string, GeocodeCacheRecord>();

export function getSpatialKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/**
 * Read from LocalStorage fallback
 */
function readLocalStorage(key: string): GeocodeCacheRecord | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(`geo_cache_${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeocodeCacheRecord;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(`geo_cache_${key}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write to LocalStorage fallback
 */
function writeLocalStorage(record: GeocodeCacheRecord) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(`geo_cache_${record.key}`, JSON.stringify(record));
  } catch {
    // LocalStorage quota might be full; ignore gracefully
  }
}

/**
 * Query cache: Memory -> IndexedDB -> LocalStorage
 */
export async function getCachedGeocode(lat: number, lng: number): Promise<string | null> {
  const key = getSpatialKey(lat, lng);

  // 1. Hot memory
  const mem = memoryCache.get(key);
  if (mem) {
    if (Date.now() - mem.cachedAt <= CACHE_TTL_MS) {
      return mem.address;
    }
    memoryCache.delete(key);
  }

  // 2. IndexedDB
  const db = await getIDB();
  if (db) {
    try {
      const record = await new Promise<GeocodeCacheRecord | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (record) {
        if (Date.now() - record.cachedAt <= CACHE_TTL_MS) {
          memoryCache.set(key, record);
          return record.address;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 3. LocalStorage
  const ls = readLocalStorage(key);
  if (ls) {
    memoryCache.set(key, ls);
    return ls.address;
  }

  return null;
}

/**
 * Save entry to Memory, IndexedDB, and LocalStorage
 */
export async function setCachedGeocode(lat: number, lng: number, address: string): Promise<void> {
  const key = getSpatialKey(lat, lng);
  const record: GeocodeCacheRecord = {
    key,
    lat,
    lng,
    address,
    cachedAt: Date.now(),
  };

  memoryCache.set(key, record);
  writeLocalStorage(record);

  const db = await getIDB();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * High-level reverse geocode with client cache.
 * If cached, resolves in 0ms without hitting server or Nominatim.
 */
export async function reverseGeocodeWithCache(
  lat: number,
  lng: number,
  fallbackHubName?: string | null
): Promise<string> {
  // Check local cache first
  const cached = await getCachedGeocode(lat, lng);
  if (cached) {
    return cached;
  }

  // Cache miss -> Fetch from reverse geocoding API
  try {
    const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
    if (res.ok) {
      const json = await res.json();
      if (json.data?.address) {
        const resolved = String(json.data.address).trim();
        await setCachedGeocode(lat, lng, resolved);
        return resolved;
      }
    }
  } catch {
    // Ignore network error and proceed to fallback
  }

  if (fallbackHubName) return fallbackHubName;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Reset memory and test caches
 */
export function resetMemoryGeocodeCache() {
  memoryCache.clear();
}
