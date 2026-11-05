import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolate transport effects without adding a DOM or React renderer dependency.
const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  values: [] as unknown[],
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
  useState: (initial: unknown) => {
    const index = harness.values.length;
    harness.values.push(typeof initial === 'function' ? initial() : initial);
    return [harness.values[index], (next: unknown) => {
      harness.values[index] = typeof next === 'function' ? next(harness.values[index]) : next;
    }];
  },
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'owner', role: 'USER' } } }) }));

import { useRealtime } from '@/hooks/useRealtime';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  messages: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { Socket.instances.push(this); }
  send(data: string) { this.messages.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = Socket.OPEN; this.onopen?.(); }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

let cleanups: Array<() => void>;
beforeEach(() => {
  harness.effects.length = 0;
  harness.values.length = 0;
  Socket.instances.length = 0;
  cleanups = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('WebSocket', Socket);
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount(options: Parameters<typeof useRealtime>[0]) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- React effects are isolated by the test double above.
  useRealtime(options);
  for (const setup of harness.effects) {
    const cleanup = setup();
    if (cleanup) cleanups.push(cleanup);
  }
  await Promise.resolve();
  return Socket.instances[0];
}

describe('Realtime transport lifecycle regressions', () => {
  it('authenticates before subscribing and does not claim open on the TCP handshake alone', async () => {
    const ws = await mount({ token: 'token', vehicleIds: ['vehicle'] });
    ws.open();
    expect(ws.messages).toEqual([{ type: 'auth', token: 'token' }]);
    expect(harness.values[5]).toBe('connecting');
    ws.receive({ type: 'auth:success', userId: 'owner', role: 'USER' });
    expect(ws.messages[1]).toEqual({ type: 'subscribe', vehicles: ['vehicle'] });
    expect(harness.values[5]).toBe('open');
  });

  it('does not connect when the session provides no realtime token', async () => {
    await mount({ vehicleIds: ['vehicle'] });
    expect(Socket.instances).toHaveLength(0);
    expect(harness.values[5]).toBe('closed');
  });

  it('ignores old socket events and does not reconnect after effect cleanup', async () => {
    const ws = await mount({ token: 'token', vehicleIds: ['vehicle'] });
    cleanups.forEach((cleanup) => cleanup());
    ws.open();
    ws.receive({ type: 'auth:success', userId: 'owner', role: 'USER' });
    ws.close();
    await vi.advanceTimersByTimeAsync(31000);
    expect(ws.messages).toHaveLength(0);
    expect(Socket.instances).toHaveLength(1);
  });

  it('does not replace newer coordinates with a delayed socket update', async () => {
    const ws = await mount({ token: 'token' });
    const latest = { vehicleId: 'vehicle', lat: 21, lng: 105, recordedAt: '2026-01-01T00:00:10Z' };
    ws.receive({ type: 'location:update', data: latest });
    ws.receive({ type: 'location:update', data: { ...latest, lat: 20, recordedAt: '2026-01-01T00:00:00Z' } });
    expect((harness.values[0] as Map<string, unknown>).get('vehicle')).toEqual(latest);
  });
});
