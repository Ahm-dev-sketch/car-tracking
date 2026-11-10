export function normalizeGeolocationError(cause: unknown): Error & { code?: number } {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    && typeof cause.code === 'number' ? cause.code : undefined;
  const message = code === 1
    ? 'Location permission denied. Please allow location access in your browser settings.'
    : code === 2
      ? 'Position unavailable. Check your device GPS signal.'
      : code === 3
        ? 'GPS request timed out. Please allow location access and try again.'
        : cause instanceof Error ? cause.message : 'Unable to obtain your location. Please try again.';
  return Object.assign(new Error(message), { code });
}

export function getGeolocation(): Geolocation {
  if (typeof window === 'undefined') {
    throw new Error('Geolocation is only available in a browser.');
  }
  if (!window.isSecureContext) {
    throw new Error('Location access requires a secure connection (HTTPS or localhost).');
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser.');
  }
  return navigator.geolocation;
}

export function requestCurrentPosition(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  watchdogMs?: number
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (cause: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(normalizeGeolocationError(cause));
    };

    try {
      const geolocation = getGeolocation();
      // The native timeout may not include time spent waiting for permission.
      const effectiveTimeout = watchdogMs ?? (typeof options.timeout === 'number' ? options.timeout : 15000);
      timer = setTimeout(() => fail({ code: 3 }), effectiveTimeout);
      geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(position);
        },
        fail,
        options
      );
    } catch (cause) {
      fail(cause);
    }
  });
}

export async function requestPositionWithFallback(
  options?: { timeoutMs?: number; allowCached?: boolean }
): Promise<GeolocationPosition> {
  const allowCached = options?.allowCached ?? true;
  // 1. Fast attempt with relaxed maximumAge (30s) so recent mobile GPS fix returns immediately (<50ms)
  try {
    return await requestCurrentPosition(
      {
        enableHighAccuracy: true,
        timeout: options?.timeoutMs ?? 10000,
        maximumAge: allowCached ? 30000 : 0,
      },
      (options?.timeoutMs ?? 10000) + 1000
    );
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : undefined;
    // If permission was denied (code 1), don't retry - rethrow immediately
    if (code === 1) {
      throw err;
    }
    // If high accuracy timed out (code 3) or position unavailable (code 2), fallback to fast network location
    return await requestCurrentPosition(
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 120000,
      },
      9000
    );
  }
}

export function createLocationBuffer<T>(getOnFlush: () => ((points: T[]) => Promise<void> | void) | undefined) {
  let points: T[] = [];
  let generation = 0;
  let inFlight: Promise<void> | null = null;
  let inFlightGeneration = 0;

  const flush = (): Promise<void> => {
    if (inFlight) {
      if (inFlightGeneration === generation) return inFlight;
      // A new session waits for the old send, but does not inherit its failure.
      return inFlight.then(flush, flush);
    }
    const started = generation;
    inFlightGeneration = started;
    // Defer invocation until inFlight is assigned, including for synchronous callbacks.
    const pending = Promise.resolve().then(async () => {
      while (started === generation && points.length > 0) {
        const onFlush = getOnFlush();
        if (!onFlush) return;
        const batch = points.splice(0, 5);
        const retry = [...batch];
        try {
          await onFlush(batch);
        } catch (cause) {
          if (started === generation) points = [...retry, ...points].slice(-20);
          throw cause;
        }
      }
    });
    inFlight = pending.finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  return {
    push(point: T) {
      points = [...points, point].slice(-20);
    },
    hasPending() {
      return points.length > 0;
    },
    clear() {
      generation += 1;
      points = [];
    },
    flush,
  };
}
