export type OfflineActionType =
  | 'USER_CREATE_BOOKING'
  | 'ADMIN_ASSIGN_BOOKING'
  | 'DRIVER_ACCEPT_OFFER'
  | 'DRIVER_START_TRIP'
  | 'DRIVER_LOCATION_PING'
  | 'DRIVER_END_TRIP';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  payload?: unknown;
  createdAt: number;
  bookingId?: string;
  offerId?: string;
  tripId?: string; // real or temp id
  tempTripId?: string; // temp id only (DRIVER_START_TRIP)
}

export const SNAPSHOT_PREFIX = 'kcic_snapshot_';
export const OUTBOX_STORAGE_KEY = 'kcic_outbox_queue';

const TRIP_ID_MAP_KEY = 'kcic_trip_id_map';
const PING_POINT_CAP = 200;

// --- SSR-safe storage helpers ------------------------------------------------

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function storageGet(key: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore: quota/security errors must not throw in the client.
  }
}

function storageRemove(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore.
  }
}

// --- Snapshots ---------------------------------------------------------------

export function saveSnapshot<T>(key: string, data: T): void {
  storageSet(`${SNAPSHOT_PREFIX}${key}`, JSON.stringify(data));
}

export function getSnapshot<T>(key: string): T | null {
  const raw = storageGet(`${SNAPSHOT_PREFIX}${key}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function removeSnapshot(key: string): void {
  storageRemove(`${SNAPSHOT_PREFIX}${key}`);
}

// --- Queue -------------------------------------------------------------------

function readQueue(): OfflineAction[] {
  const raw = storageGet(OUTBOX_STORAGE_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineAction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineAction[]): void {
  storageSet(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
}

export interface EnqueueInput {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  payload?: unknown;
  bookingId?: string;
  offerId?: string;
  tripId?: string;
  tempTripId?: string;
}

function payloadPointCount(item: OfflineAction): number {
  const payload = item.payload;
  if (payload != null && typeof payload === 'object' && !Array.isArray(payload)) {
    const points = (payload as Record<string, unknown>).points;
    if (Array.isArray(points)) return points.length;
  }
  return 0;
}

function trimLocationPings(queue: OfflineAction[]): OfflineAction[] {
  const pings = queue.filter((a) => a.type === 'DRIVER_LOCATION_PING');
  let total = pings.reduce((sum, a) => sum + payloadPointCount(a), 0);
  if (total <= PING_POINT_CAP) return queue;

  const kept = queue.filter((a) => a.type !== 'DRIVER_LOCATION_PING');
  for (const ping of pings) {
    if (total > PING_POINT_CAP) {
      total -= payloadPointCount(ping);
      continue; // drop the oldest
    }
    kept.push(ping);
  }
  return kept.sort((a, b) => a.createdAt - b.createdAt);
}

export function enqueueOfflineAction(type: OfflineActionType, input: EnqueueInput): OfflineAction {
  const now = Date.now();
  const action: OfflineAction = {
    id: `${type}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    endpoint: input.endpoint,
    method: input.method ?? 'POST',
    createdAt: now,
  };
  if (input.payload !== undefined) action.payload = input.payload;
  if (input.bookingId !== undefined) action.bookingId = input.bookingId;
  if (input.offerId !== undefined) action.offerId = input.offerId;
  if (input.tripId !== undefined) action.tripId = input.tripId;
  if (input.tempTripId !== undefined) action.tempTripId = input.tempTripId;

  const queue = readQueue();
  queue.push(action);
  queue.sort((a, b) => a.createdAt - b.createdAt);
  writeQueue(type === 'DRIVER_LOCATION_PING' ? trimLocationPings(queue) : queue);
  return action;
}

export function getOfflineQueue(): OfflineAction[] {
  return [...readQueue()].sort((a, b) => a.createdAt - b.createdAt);
}

export function getOfflineQueueCount(): number {
  return readQueue().length;
}

export function clearOfflineQueue(): void {
  writeQueue([]);
}

// --- Trip id map -------------------------------------------------------------

function readTripMap(): Record<string, string> {
  const raw = storageGet(TRIP_ID_MAP_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeTripMap(map: Record<string, string>): void {
  storageSet(TRIP_ID_MAP_KEY, JSON.stringify(map));
}

// --- Replay ------------------------------------------------------------------

export interface ProcessResult {
  processed: number;
  remaining: number;
  droppedPermanent: number;
}

let flushing = false;

export async function processOfflineQueue(opts?: { onSyncComplete?: () => void }): Promise<ProcessResult> {
  if (flushing) {
    return { processed: 0, remaining: getOfflineQueueCount(), droppedPermanent: 0 };
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { processed: 0, remaining: getOfflineQueueCount(), droppedPermanent: 0 };
    }
  } catch {
    // Assume online if navigator is unavailable.
  }

  if (typeof fetch !== 'function') {
    return { processed: 0, remaining: getOfflineQueueCount(), droppedPermanent: 0 };
  }

  flushing = true;
  const initialCount = getOfflineQueueCount();
  let processed = 0;
  let droppedPermanent = 0;

  try {
    const queue = readQueue();
    const map = readTripMap();
    let i = 0;

    while (i < queue.length) {
      const original = queue[i];
      const item: OfflineAction = { ...original };
      if (item.payload != null && typeof item.payload === 'object') {
        item.payload = Array.isArray(item.payload)
          ? [...(item.payload as unknown[])]
          : { ...(item.payload as Record<string, unknown>) };
      }

      // Rewrite temp trip id -> real trip id before sending.
      const oldTripId = item.tripId;
      if (oldTripId != null && map[oldTripId] != null) {
        const mapped = map[oldTripId];
        item.endpoint = item.endpoint.split(oldTripId).join(mapped);
        item.tripId = mapped;
        if (item.payload != null && typeof item.payload === 'object' && !Array.isArray(item.payload)) {
          const p = item.payload as Record<string, unknown>;
          if (p.tripId === oldTripId) p.tripId = mapped;
        }
      }

      let res: Response;
      try {
        res = await fetch(item.endpoint, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: item.method === 'GET' ? undefined : JSON.stringify(item.payload),
        });
      } catch {
        break; // transient network error: stop, keep current + remaining.
      }

      if (res.ok) {
        queue.splice(i, 1);
        processed++;
        if (item.type === 'DRIVER_START_TRIP') {
          const body: unknown = await res.json().catch(() => null);
          const parsed = body as null | { data?: { id?: unknown }; id?: unknown };
          const realId = parsed?.data?.id ?? parsed?.id;
          const key = item.tempTripId ?? item.tripId;
          if (realId && key != null) {
            map[key] = String(realId);
          }
        }
        continue;
      }

      const status = res.status;
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        queue.splice(i, 1); // permanent: drop, continue to next.
        droppedPermanent++;
        continue;
      }

      break; // transient (>=500, 408, 429).
    }

    writeQueue(queue);
    writeTripMap(map);

    const remaining = queue.length;
    const shouldDispatch = processed >= 1 || (initialCount > 0 && remaining === 0);

    try {
      opts?.onSyncComplete?.();
    } catch {
      // Ignore callback errors.
    }

    if (shouldDispatch && typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('offline-sync:complete'));
      } catch {
        // Ignore dispatch errors.
      }
    }

    return { processed, remaining, droppedPermanent };
  } finally {
    flushing = false;
  }
}