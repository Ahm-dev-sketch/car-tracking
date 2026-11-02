import { ServerRealtimeEvent } from '@/types/realtime';
import { logger } from '@/lib/logger';

export interface CloudflareEnv {
  LOCATION_HUB?: {
    idFromName: (name: string) => unknown;
    get: (id: unknown) => {
      fetch: (url: string, init?: RequestInit) => Promise<Response>;
      broadcast?: (event: unknown) => Promise<void>;
    };
  };
}

const DEV_PUBLISH_URL =
  process.env.REALTIME_PUBLISH_URL || 'http://localhost:3001/publish';
const INTERNAL_TOKEN =
  process.env.REALTIME_INTERNAL_TOKEN || 'dev-realtime-internal-token-12345';

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

  // Dev shim publish
  try {
    const res = await fetch(DEV_PUBLISH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify(event),
    });

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
      await hubStub.broadcast(event);
    } else {
      await hubStub.fetch('http://durable-object/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    }
  } catch (err: unknown) {
    logger.warn({
      msg: 'Failed to publish realtime event to Cloudflare Durable Object',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
