import { ServerRealtimeEvent } from '@/types/realtime';
import { logger } from '@/lib/logger';

export interface CloudflareEnv {
  REALTIME_INTERNAL_TOKEN?: string;
  LOCATION_HUB?: {
    idFromName: (name: string) => unknown;
    get: (id: unknown) => {
      fetch: (url: string, init?: RequestInit) => Promise<Response>;
      broadcast?: (event: unknown) => Promise<void>;
    };
  };
}


async function deliver<T>(send: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      send(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Realtime delivery timed out'));
          controller.abort();
        }, 2500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Realtime publish facade.
// In dev / test: delivers to Node dev shim HTTP /publish endpoint.
// In production (Cloudflare): invokes Durable Object LocationHub binding (Phase 8 deploy).
export async function publishEvent(
  event: ServerRealtimeEvent,
  env?: CloudflareEnv
): Promise<void> {
  const mode =
    process.env.REALTIME_MODE ||
    (process.env.NODE_ENV === 'production' ? 'cloudflare' : 'dev');

  if (mode === 'cloudflare') {
    await publishToCloudflareDO(event, env);
    return;
  }

  // No public default secret: failed realtime delivery must not weaken auth.
  const internalToken = process.env.REALTIME_INTERNAL_TOKEN;
  if (!internalToken?.trim() || internalToken === 'dev-realtime-internal-token-12345') {
    logger.warn({ msg: 'Realtime publish skipped: REALTIME_INTERNAL_TOKEN is not configured' });
    return;
  }
  try {
    const res = await deliver((signal) => fetch(process.env.REALTIME_PUBLISH_URL || 'http://localhost:3001/publish', {
      signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify(event),
    }));

    if (!res.ok) {
      logger.warn({
        msg: 'Dev realtime shim publish returned non-200 status',
        status: res.status,
      });
    }
  } catch (err: unknown) {
    // Non-blocking: never crash caller (ingest / transitions) on publish failure
    logger.warn({
      msg: 'Failed to publish realtime event to dev shim',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Cloudflare Workers deploy-time stub.
// Real DO RPC call wired during Phase 8 deployment.
export async function publishToCloudflareDO(
  event: ServerRealtimeEvent,
  env?: CloudflareEnv
): Promise<void> {
  if (!env?.LOCATION_HUB) {
    logger.warn({
      msg: 'Cloudflare LOCATION_HUB binding not present in current environment (scheduled for Phase 8 deploy)',
    });
    return;
  }

  try {
    const hubId = env.LOCATION_HUB.idFromName('global-fleet');
    const hubStub = env.LOCATION_HUB.get(hubId);
    if (typeof hubStub.broadcast === 'function') {
      await deliver(() => hubStub.broadcast!(event));
    } else {
      const internalToken = env.REALTIME_INTERNAL_TOKEN ?? process.env.REALTIME_INTERNAL_TOKEN;
      if (!internalToken?.trim() || internalToken === 'dev-realtime-internal-token-12345') {
        logger.warn({ msg: 'Durable Object HTTP publish skipped: REALTIME_INTERNAL_TOKEN is not configured' });
        return;
      }
      const response = await deliver((signal) => hubStub.fetch('http://durable-object/publish', {
        signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify(event),
      }));
      if (!response.ok) {
        logger.warn({ msg: 'Durable Object HTTP publish returned non-200 status', status: response.status });
      }
    }
  } catch (err: unknown) {
    logger.warn({
      msg: 'Failed to publish realtime event to Cloudflare Durable Object',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
