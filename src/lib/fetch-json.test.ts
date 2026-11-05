import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './fetch-json';

const network = vi.fn();
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); network.mockReset(); });

describe('bounded dashboard requests', () => {
  it('returns JSON without caching private data', async () => {
    vi.stubGlobal('fetch', network.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'trip' } }))));
    await expect(fetchJson('/api/trips', { method: 'POST' })).resolves.toEqual({ data: { id: 'trip' } });
    expect(network).toHaveBeenCalledWith('/api/trips', expect.objectContaining({ cache: 'no-store', method: 'POST', signal: expect.any(AbortSignal) }));
  });

  it('surfaces the actual server rejection, not silent success', async () => {
    vi.stubGlobal('fetch', network.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Vehicle already in use' } }), { status: 409 })));
    await expect(fetchJson('/api/trips')).rejects.toThrow('Vehicle already in use');
  });

  it('handles HTML errors and malformed successful responses', async () => {
    vi.stubGlobal('fetch', network.mockResolvedValueOnce(new Response('<html>Unavailable</html>', { status: 503 })).mockResolvedValueOnce(new Response('invalid')));
    await expect(fetchJson('/api/trips')).rejects.toThrow('503');
    await expect(fetchJson('/api/trips')).rejects.toThrow('invalid response');
  });

  it.each(['request', 'body'])('bounds a stalled %s and aborts the connection', async (phase) => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    vi.stubGlobal('fetch', network.mockImplementation(() => phase === 'request' ? never : Promise.resolve({ ok: true, json: () => never })));
    const request = fetchJson('/api/trips');
    const rejected = expect(request).rejects.toThrow(/Refresh to check the latest status/);
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(network.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
