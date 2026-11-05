import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({ logger: { warn } }));
import { publishEvent, publishToCloudflareDO, type CloudflareEnv } from '@/server/realtime/hub';

const event = { type: 'notification' as const, data: {
  id: 'notice', userId: 'recipient', type: 'DISPATCH_OFFER', title: 'Offer', body: 'Details', createdAt: new Date().toISOString(),
} };
const network = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', network);
  vi.stubEnv('REALTIME_MODE', 'dev');
  vi.stubEnv('REALTIME_INTERNAL_TOKEN', '');
  vi.stubEnv('REALTIME_PUBLISH_URL', 'https://shim.test/publish');
  network.mockResolvedValue(new Response('{}'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function binding(fetch = vi.fn().mockResolvedValue(new Response('{}')), broadcast?: (event: unknown) => Promise<void>) {
  const stub = { fetch, broadcast };
  const env: CloudflareEnv = {
    LOCATION_HUB: { idFromName: () => 'hub-id', get: () => stub },
  };
  return { env, stub };
}

describe('Realtime publish authentication', () => {
  it.each(['', 'dev-realtime-internal-token-12345'])('does not send dev publishes with missing or legacy secrets (%s)', async (token) => {
    vi.stubEnv('REALTIME_INTERNAL_TOKEN', token);
    await expect(publishEvent(event)).resolves.toBeUndefined();
    expect(network).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('uses the configured URL and secret at call time, without public fallback credentials', async () => {
    vi.stubEnv('REALTIME_INTERNAL_TOKEN', 'private-publish-secret');
    await publishEvent(event);
    expect(network).toHaveBeenCalledWith('https://shim.test/publish', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer private-publish-secret' },
      body: JSON.stringify(event),
    }));
  });

  it('does not break business mutations when dev delivery fails', async () => {
    vi.stubEnv('REALTIME_INTERNAL_TOKEN', 'private-publish-secret');
    network.mockRejectedValueOnce(new Error('No connection'));
    await expect(publishEvent(event)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('bounds a stalled realtime request without blocking a committed action forever', async () => {
    vi.useFakeTimers();
    vi.stubEnv('REALTIME_INTERNAL_TOKEN', 'private-publish-secret');
    network.mockImplementationOnce(() => new Promise(() => {}));
    const sending = publishEvent(event);
    await vi.advanceTimersByTimeAsync(2500);
    await expect(sending).resolves.toBeUndefined();
    expect(network.mock.calls[0][1].signal.aborted).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ error: 'Realtime delivery timed out' }));
  });

  it('bounds stalled Durable Object RPC delivery too', async () => {
    vi.useFakeTimers();
    const { env } = binding(undefined, () => new Promise(() => {}));
    const sending = publishToCloudflareDO(event, env);
    await vi.advanceTimersByTimeAsync(2500);
    await expect(sending).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ error: 'Realtime delivery timed out' }));
  });

  it('does not use an unprotected Cloudflare HTTP fallback', async () => {
    const { env, stub } = binding();
    await publishToCloudflareDO(event, env);
    expect(stub.fetch).not.toHaveBeenCalled();
  });

  it('protects the Cloudflare HTTP fallback with the bound secret', async () => {
    const { env, stub } = binding();
    env.REALTIME_INTERNAL_TOKEN = 'private-bound-secret';
    await publishToCloudflareDO(event, env);
    expect(stub.fetch).toHaveBeenCalledWith('http://durable-object/publish', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer private-bound-secret' },
    }));
  });

  it('can use the process-configured secret for Cloudflare HTTP delivery', async () => {
    vi.stubEnv('REALTIME_INTERNAL_TOKEN', 'private-process-secret');
    const { env, stub } = binding();
    await publishToCloudflareDO(event, env);
    expect(stub.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer private-process-secret' }),
    }));
  });

  it('logs rejected Cloudflare HTTP delivery without throwing', async () => {
    const { env } = binding(vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
    env.REALTIME_INTERNAL_TOKEN = 'private-bound-secret';
    await expect(publishToCloudflareDO(event, env)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('preserves direct RPC publishing through the trusted Worker binding', async () => {
    const broadcast = vi.fn().mockResolvedValue(undefined);
    const { env, stub } = binding(undefined, broadcast);
    await publishToCloudflareDO(event, env);
    expect(broadcast).toHaveBeenCalledExactlyOnceWith(event);
    expect(stub.fetch).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});
