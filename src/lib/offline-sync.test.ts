import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SNAPSHOT_PREFIX,
  clearOfflineQueue,
  enqueueOfflineAction,
  getOfflineQueue,
  getOfflineQueueCount,
  getSnapshot,
  processOfflineQueue,
  removeSnapshot,
  saveSnapshot,
} from './offline-sync';

interface StorageMock extends Storage {
  map: Map<string, string>;
}

function createStorageMock(): StorageMock {
  const map = new Map<string, string>();
  const mock: StorageMock = {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) ?? null) : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(String(key), String(value));
    },
  } as StorageMock;
  return mock;
}

function okResponse(body: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let storage: StorageMock;

beforeEach(() => {
  storage = createStorageMock();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('snapshots', () => {
  it('round-trips JSON under the snapshot prefix and returns null on miss', () => {
    saveSnapshot('draft', { bookingId: 'b-1', seats: 3 });
    expect(storage.map.has(`${SNAPSHOT_PREFIX}draft`)).toBe(true);
    expect(getSnapshot<{ bookingId: string; seats: number }>('draft')).toEqual({ bookingId: 'b-1', seats: 3 });
    expect(getSnapshot('missing')).toBeNull();

    removeSnapshot('draft');
    expect(getSnapshot('draft')).toBeNull();
    expect(storage.map.has(`${SNAPSHOT_PREFIX}draft`)).toBe(false);
  });

  it('returns null on parse error', () => {
    storage.map.set(`${SNAPSHOT_PREFIX}corrupt`, '{not json');
    expect(getSnapshot('corrupt')).toBeNull();
  });
});

describe('offline queue', () => {
  it('enqueues in FIFO order sorted ascending by createdAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(3000);
    enqueueOfflineAction('DRIVER_END_TRIP', { endpoint: '/api/trips/t1/end', tripId: 't1' });
    vi.setSystemTime(1000);
    enqueueOfflineAction('USER_CREATE_BOOKING', { endpoint: '/api/bookings', payload: { foo: 1 } });
    vi.setSystemTime(2000);
    enqueueOfflineAction('DRIVER_START_TRIP', { endpoint: '/api/trips/start', tempTripId: 't1' });

    const queue = getOfflineQueue();
    expect(queue.map((a) => a.createdAt)).toEqual([1000, 2000, 3000]);
    expect(queue.map((a) => a.type)).toEqual([
      'USER_CREATE_BOOKING',
      'DRIVER_START_TRIP',
      'DRIVER_END_TRIP',
    ]);
  });

  it('defaults method to POST and stamps id/createdAt', () => {
    const action = enqueueOfflineAction('USER_CREATE_BOOKING', { endpoint: '/api/bookings' });
    expect(action.method).toBe('POST');
    expect(action.id.length).toBeGreaterThan(0);
    expect(action.createdAt).toBeTypeOf('number');
  });

  it('caps DRIVER_LOCATION_PING queue at 200 total points, dropping oldest first', () => {
    enqueueOfflineAction('DRIVER_LOCATION_PING', { endpoint: '/ping', payload: { points: new Array(100).fill(0) } });
    enqueueOfflineAction('DRIVER_LOCATION_PING', { endpoint: '/ping', payload: { points: new Array(100).fill(0) } });
    enqueueOfflineAction('DRIVER_LOCATION_PING', { endpoint: '/ping', payload: { points: new Array(100).fill(0) } });

    const queue = getOfflineQueue();
    expect(queue).toHaveLength(2);
    const total = queue.reduce(
      (sum, a) => sum + (((a.payload as { points: unknown[] }).points ?? []).length ?? 0),
      0,
    );
    expect(total).toBe(200);
  });
});

describe('processOfflineQueue', () => {
  it('resolves tempTripId -> realTripId across start, ping, end', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (url === '/api/trips/start') return okResponse({ data: { id: 'real-456' } }, 201);
      return okResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    enqueueOfflineAction('DRIVER_START_TRIP', { endpoint: '/api/trips/start', tempTripId: 'offline-trip-123' });
    enqueueOfflineAction('DRIVER_LOCATION_PING', {
      endpoint: '/api/trips/offline-trip-123/ping',
      tripId: 'offline-trip-123',
      payload: { points: [] },
    });
    enqueueOfflineAction('DRIVER_END_TRIP', { endpoint: '/api/trips/offline-trip-123/end', tripId: 'offline-trip-123' });

    const result = await processOfflineQueue();

    expect(result).toEqual({ processed: 3, remaining: 0, droppedPermanent: 0 });
    expect(getOfflineQueueCount()).toBe(0);

    const endCall = calls.find((c) => c.url.includes('/end'));
    expect(endCall?.url).toBe('/api/trips/real-456/end');
  });

  it('permanent error (409) drops the item and continues to the next', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ error: 'conflict' }, 409))
      .mockResolvedValueOnce(okResponse({ id: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    enqueueOfflineAction('USER_CREATE_BOOKING', { endpoint: '/api/bookings/conflict' });
    enqueueOfflineAction('DRIVER_ACCEPT_OFFER', { endpoint: '/api/offers/1/accept', offerId: '1' });

    const result = await processOfflineQueue();

    expect(result).toEqual({ processed: 1, remaining: 0, droppedPermanent: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getOfflineQueueCount()).toBe(0);
  });

  it('transient network error stops flush and leaves the queue intact', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    enqueueOfflineAction('DRIVER_START_TRIP', { endpoint: '/api/trips/start', tempTripId: 'a' });
    enqueueOfflineAction('DRIVER_END_TRIP', { endpoint: '/api/trips/a/end', tripId: 'a' });

    const result = await processOfflineQueue();

    expect(result).toEqual({ processed: 0, remaining: 2, droppedPermanent: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getOfflineQueueCount()).toBe(2);
  });

  it('leaves the queue intact when navigator is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    enqueueOfflineAction('DRIVER_START_TRIP', { endpoint: '/api/trips/start' });

    const result = await processOfflineQueue();

    expect(result).toEqual({ processed: 0, remaining: 1, droppedPermanent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOfflineQueueCount()).toBe(1);
  });
});

describe('SSR safety', () => {
  it('returns safe defaults when there is no localStorage', async () => {
    vi.unstubAllGlobals();

    expect(getSnapshot('x')).toBeNull();
    expect(getOfflineQueue()).toEqual([]);
    expect(getOfflineQueueCount()).toBe(0);
    expect(clearOfflineQueue()).toBeUndefined();
    expect(() => saveSnapshot('x', { a: 1 })).not.toThrow();

    await expect(processOfflineQueue()).resolves.toEqual({ processed: 0, remaining: 0, droppedPermanent: 0 });
  });
});