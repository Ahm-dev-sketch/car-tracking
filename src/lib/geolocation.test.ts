import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocationBuffer,
  getGeolocation,
  normalizeGeolocationError,
  requestCurrentPosition,
} from './geolocation';

const position: GeolocationPosition = {
  coords: {
    latitude: 21,
    longitude: 105,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: 1000,
  toJSON: () => ({}),
};

function deferred() {
  let resolve!: () => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GPS requests', () => {
  let success: PositionCallback;
  let failure: PositionErrorCallback;
  const nativeRequest = vi.fn<Geolocation['getCurrentPosition']>();

  beforeEach(() => {
    vi.useFakeTimers();
    nativeRequest.mockReset();
    nativeRequest.mockImplementation((onSuccess, onFailure) => {
      success = onSuccess;
      failure = onFailure!;
    });
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: nativeRequest } });
  });

  it('rejects after an independent 15 seconds when the permission prompt never resolves', async () => {
    const request = requestCurrentPosition();
    const rejected = expect(request).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(14999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    success(position);
    failure({ code: 1 } as GeolocationPositionError);
    await expect(request).rejects.toMatchObject({ code: 3 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('requires a real high-accuracy GPS result and clears its watchdog on success', async () => {
    const request = requestCurrentPosition();
    expect(nativeRequest).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
    success(position);
    await expect(request).resolves.toBe(position);
    expect(vi.getTimerCount()).toBe(0);
    failure({ code: 1 } as GeolocationPositionError);
    await vi.advanceTimersByTimeAsync(15000);
    await expect(request).resolves.toBe(position);
  });

  it.each([
    [1, /permission denied/i],
    [2, /position unavailable/i],
    [3, /timed out/i],
  ])('normalizes native error code %i to a human Error', async (code, message) => {
    const request = requestCurrentPosition();
    failure({ code, message: 'opaque native failure' } as GeolocationPositionError);
    await expect(request).rejects.toBeInstanceOf(Error);
    await expect(request).rejects.toThrow(message);
    await expect(request).rejects.toMatchObject({ code });
    expect(vi.getTimerCount()).toBe(0);
    success(position);
    await expect(request).rejects.toThrow(message);
  });

  it('normalizes synchronous native failures and removes the watchdog', async () => {
    nativeRequest.mockImplementation(() => { throw { code: 1 }; });
    await expect(requestCurrentPosition()).rejects.toThrow(/permission denied/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects insecure contexts without invoking native GPS', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    await expect(requestCurrentPosition()).rejects.toThrow(/HTTPS or localhost/);
    expect(nativeRequest).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects unsupported browsers without a pending timer', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestCurrentPosition()).rejects.toThrow(/not supported/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects outside a browser', async () => {
    vi.stubGlobal('window', undefined);
    expect(() => getGeolocation()).toThrow(/browser/i);
    await expect(requestCurrentPosition()).rejects.toBeInstanceOf(Error);
  });

  it('provides a human fallback for unknown native failures', () => {
    expect(normalizeGeolocationError(null).message).toMatch(/unable to obtain/i);
    expect(normalizeGeolocationError(new Error('GPS disabled')).message).toBe('GPS disabled');
  });
});

describe('location buffer', () => {
  it('serializes overlapping flushes and drains every batch before resolving', async () => {
    const send = deferred();
    const onFlush = vi.fn<(batch: number[]) => Promise<void> | void>()
      .mockImplementationOnce(() => send.promise);
    const buffer = createLocationBuffer(() => onFlush);
    for (let i = 1; i <= 12; i++) buffer.push(i);
    const first = buffer.flush();
    expect(buffer.flush()).toBe(first);
    await Promise.resolve();
    expect(onFlush.mock.calls).toEqual([[[1, 2, 3, 4, 5]]]);
    buffer.push(13);
    expect(buffer.flush()).toBe(first);
    send.resolve();
    await first;
    expect(onFlush.mock.calls).toEqual([
      [[1, 2, 3, 4, 5]],
      [[6, 7, 8, 9, 10]],
      [[11, 12, 13]],
    ]);
    await buffer.flush();
    expect(onFlush).toHaveBeenCalledTimes(3);
  });

  it('keeps the newest 20 points when full', async () => {
    const onFlush = vi.fn<(batch: number[]) => void>();
    const buffer = createLocationBuffer(() => onFlush);
    for (let i = 1; i <= 30; i++) buffer.push(i);
    await buffer.flush();
    expect(onFlush.mock.calls.flatMap(([batch]) => batch)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 11),
    );
  });

  it('rethrows HTTP failures and restores failed data behind the newest-data cap', async () => {
    const send = deferred();
    const httpError = new Error('HTTP 503');
    const onFlush = vi.fn<(batch: number[]) => Promise<void> | void>()
      .mockImplementationOnce(() => send.promise);
    const buffer = createLocationBuffer(() => onFlush);
    for (let i = 1; i <= 10; i++) buffer.push(i);
    const flushing = buffer.flush();
    const rejected = expect(flushing).rejects.toBe(httpError);
    await Promise.resolve();
    for (let i = 11; i <= 23; i++) buffer.push(i);
    send.reject(httpError);
    await rejected;
    onFlush.mockClear();
    await buffer.flush();
    expect(onFlush.mock.calls.flatMap(([batch]) => batch)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 4),
    );
  });

  it('retains the original batch on synchronous callback failure, even if the callback mutates it', async () => {
    const error = new Error('send failed');
    const onFlush = vi.fn<(batch: number[]) => void>().mockImplementationOnce((batch) => {
      batch.length = 0;
      throw error;
    });
    const buffer = createLocationBuffer(() => onFlush);
    buffer.push(1);
    buffer.push(2);
    await expect(buffer.flush()).rejects.toBe(error);
    await buffer.flush();
    expect(onFlush).toHaveBeenLastCalledWith([1, 2]);
  });

  it('retains data until a flush callback exists', async () => {
    const onFlush = vi.fn<(batch: number[]) => void>();
    let callback: typeof onFlush | undefined = undefined;
    const buffer = createLocationBuffer(() => callback);
    buffer.push(1);
    await buffer.flush();
    callback = onFlush;
    await buffer.flush();
    expect(onFlush).toHaveBeenCalledWith([1]);
  });

  it('clear discards queued data without sending', async () => {
    const onFlush = vi.fn<(batch: number[]) => void>();
    const buffer = createLocationBuffer(() => onFlush);
    buffer.push(1);
    buffer.clear();
    await buffer.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('clear prevents old %s callbacks from sending or restoring session data', async (outcome) => {
    const send = deferred();
    const onFlush = vi.fn<(batch: number[]) => Promise<void> | void>()
      .mockImplementationOnce(() => send.promise);
    const buffer = createLocationBuffer(() => onFlush);
    for (let i = 1; i <= 8; i++) buffer.push(i);
    const flushing = buffer.flush();
    const finished = outcome === 'reject'
      ? expect(flushing).rejects.toThrow('old session')
      : expect(flushing).resolves.toBeUndefined();
    await Promise.resolve();
    buffer.clear();
    buffer.push(99);
    const nextSession = buffer.flush();
    expect(onFlush).toHaveBeenCalledTimes(1);
    if (outcome === 'reject') send.reject(new Error('old session'));
    else send.resolve();
    await finished;
    await nextSession;
    expect(onFlush.mock.calls).toEqual([[[1, 2, 3, 4, 5]], [[99]]]);
  });

  it('clear invalidates a flush before its callback begins', async () => {
    const onFlush = vi.fn<(batch: number[]) => void>();
    const buffer = createLocationBuffer(() => onFlush);
    buffer.push(1);
    const flushing = buffer.flush();
    buffer.clear();
    await flushing;
    expect(onFlush).not.toHaveBeenCalled();
  });
});
