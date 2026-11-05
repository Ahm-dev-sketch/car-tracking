import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encode } from 'next-auth/jwt';
import { LocationHub, type WebSocketSessionState } from '../../../realtime/durable-object';

// Exercise the actual dev handlers without listening on ports or using a DB.
vi.mock('http', async () => {
  const { EventEmitter } = await import('node:events');
  return { default: { createServer: (handler: (...args: unknown[]) => void) => {
    const server = new EventEmitter();
    server.on('request', handler);
    return Object.assign(server, { close: (callback: () => void) => callback() });
  } } };
});
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    WebSocket: { OPEN: 1 },
    WebSocketServer: class extends EventEmitter {
      clients = new Set();
      close(callback: () => void) { callback(); }
    },
  };
});
import { createRealtimeServer } from '../../../scripts/realtime-dev-core.mjs';

const AUTH_SECRET = 'isolated-realtime-auth-secret-min32chars';
const INTERNAL_TOKEN = 'isolated-realtime-publish-token';
const SALT = 'authjs.session-token';
const LOCATION = { type: 'location:update', data: { vehicleId: 'vehicle-A', lat: 21, lng: 105 } };

class Socket extends EventEmitter {
  readyState = 1;
  session: WebSocketSessionState = { authenticated: false, subscribedVehicles: [], subscribeAll: false };
  messages: Array<Record<string, unknown>> = [];
  closed: number[] = [];
  failSend = false;
  send(raw: string) {
    if (this.failSend) throw new Error('Disconnected');
    this.messages.push(JSON.parse(raw));
  }
  close(code: number) { this.closed.push(code); this.readyState = 3; }
  terminate() { this.readyState = 3; }
  ping() {}
  serializeAttachment(session: WebSocketSessionState) { this.session = structuredClone(session); }
  deserializeAttachment() { return structuredClone(this.session); }
}

type Options = { authSecret?: string; internalToken?: string };
function transport(kind: string, options: Options = {}) {
  const authSecret = options.authSecret ?? AUTH_SECRET;
  const internalToken = options.internalToken ?? INTERNAL_TOKEN;
  const sockets: Socket[] = [];
  const hub = new LocationHub({ getWebSockets: () => sockets }, { AUTH_SECRET: authSecret, REALTIME_INTERNAL_TOKEN: internalToken });
  const dev = kind === 'dev' ? createRealtimeServer({ authSecret, internalToken }) : null;
  function connect() {
    const socket = new Socket();
    sockets.push(socket);
    if (dev) {
      dev.wss.clients.add(socket as never);
      dev.wss.emit('connection', socket);
    }
    return socket;
  }
  async function send(socket: Socket, message: unknown) {
    const raw = JSON.stringify(message);
    if (!dev) await hub.webSocketMessage(socket, raw);
    else await Reflect.apply(socket.listeners('message')[0], socket, [Buffer.from(raw)]);
  }
  async function auth(socket: Socket, claims: Record<string, unknown>, secret = AUTH_SECRET) {
    const token = await encode({ token: claims, secret, salt: SALT });
    await send(socket, { type: 'auth', token });
  }
  async function publish(event: unknown, bearer: string | null = INTERNAL_TOKEN) {
    const authorization = bearer === null ? undefined : `Bearer ${bearer}`;
    if (!dev) return hub.fetch(new Request('https://hub.test/publish', {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
      body: JSON.stringify(event),
    }));
    const request = Object.assign(new EventEmitter(), {
      method: 'POST', url: '/publish', headers: { authorization },
    });
    let status = 200;
    let body = '';
    const response = {
      writeHead: (code: number) => { status = code; },
      end: (value: string) => { body = value; },
    };
    await Reflect.apply(dev.server.listeners('request')[0], dev.server, [request, response]);
    request.emit('data', Buffer.from(JSON.stringify(event)));
    request.emit('end');
    return new Response(body, { status });
  }
  return { connect, send, auth, publish, stop: async () => { await dev?.stop(); } };
}

describe.each(['durable-object', 'dev'])('%s fail-closed authorization', (kind) => {
  let channel: ReturnType<typeof transport>;
  const extras: Array<ReturnType<typeof transport>> = [];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    channel = transport(kind);
  });
  afterEach(async () => {
    await channel.stop();
    for (const extra of extras.splice(0)) await extra.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rejects subscriptions before authentication', async () => {
    const ws = channel.connect();
    await channel.send(ws, { type: 'subscribe', vehicles: ['vehicle-A'] });
    expect(ws.messages.at(-1)).toMatchObject({ type: 'error', code: 'UNAUTHORIZED' });
    expect(ws.closed).toEqual([4001]);
  });

  it('does not accept vehicle scopes or roles supplied by the client', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'user-1', role: 'USER' });
    await channel.send(ws, {
      type: 'subscribe', vehicles: ['vehicle-A'], allowedVehicleIds: ['vehicle-A'], role: 'ADMIN', userId: 'admin',
    });
    expect(ws.messages.at(-1)).toMatchObject({ type: 'error', code: 'FORBIDDEN' });
    ws.messages.length = 0;
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([]);
  });

  it('permits only signed vehicle scope and rejects mixed unauthorized subscriptions atomically', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'user-1', role: 'USER', allowedVehicleIds: ['vehicle-A'] });
    await channel.send(ws, { type: 'subscribe', vehicles: ['vehicle-A'] });
    expect(ws.messages.at(-1)).toEqual({ type: 'subscribed', vehicles: ['vehicle-A'], all: false });
    await channel.send(ws, { type: 'subscribe', vehicles: ['vehicle-A', 'vehicle-B'] });
    expect(ws.messages.at(-1)).toMatchObject({ code: 'FORBIDDEN' });
    ws.messages.length = 0;
    await channel.publish({ ...LOCATION, data: { ...LOCATION.data, vehicleId: 'vehicle-B' } });
    expect(ws.messages).toEqual([]);
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([LOCATION]);
    await channel.send(ws, { type: 'subscribe', vehicles: [] });
    ws.messages.length = 0;
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([]);
  });

  it('does not let nonadmins set all=true, even with signed vehicle scope', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'user-1', role: 'USER', allowedVehicleIds: ['vehicle-A'] });
    await channel.send(ws, { type: 'subscribe', all: true });
    expect(ws.messages.at(-1)).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps the administrator all-vehicles contract', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'admin-user', role: 'ADMIN' });
    await channel.send(ws, { type: 'subscribe', all: true });
    expect(ws.messages.at(-1)).toEqual({ type: 'subscribed', vehicles: [], all: true });
    ws.messages.length = 0;
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([LOCATION]);
  });

  it('rechecks claim scope during fanout rather than trusting preexisting room membership', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'user-1', role: 'USER' });
    ws.session.subscribedVehicles = ['vehicle-A'];
    ws.session.subscribeAll = true;
    ws.messages.length = 0;
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([]);
  });

  it('does not equate driver-profile IDs with user IDs from the current JWT contract', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'driver-user', role: 'DRIVER' });
    await channel.send(ws, { type: 'subscribe', vehicles: ['vehicle-A'], driverId: 'driver-profile' });
    expect(ws.messages.at(-1)).toMatchObject({ code: 'FORBIDDEN' });
    ws.messages.length = 0;
    await channel.publish({ ...LOCATION, data: { ...LOCATION.data, driverId: 'driver-user' } });
    await channel.publish({ type: 'offer', data: { driverId: 'driver-user', offerId: 'offer' } });
    expect(ws.messages).toEqual([]);
    const notification = { type: 'notification', data: { userId: 'driver-user', title: 'Offer available' } };
    await channel.publish(notification);
    expect(ws.messages).toEqual([notification]);
  });

  it('allows own-driver events only with an explicit verified driver-profile or user mapping', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'driver-user', role: 'DRIVER', driverId: 'driver-profile' });
    ws.messages.length = 0;
    const own = { ...LOCATION, data: { ...LOCATION.data, driverId: 'driver-profile' } };
    await channel.publish(own);
    await channel.publish({ ...LOCATION, data: { ...LOCATION.data, driverId: 'other-profile' } });
    await channel.publish(LOCATION);
    const offer = { type: 'offer', data: { driverId: 'driver-profile', offerId: 'offer' } };
    await channel.publish(offer);
    await channel.publish({ type: 'offer', data: { offerId: 'untargeted' } });
    const userMapped = { ...LOCATION, data: { ...LOCATION.data, driverUserId: 'driver-user' } };
    await channel.publish(userMapped);
    expect(ws.messages).toEqual([own, offer, userMapped]);
  });

  it('delivers an offer targeted to the verified userId even when no driverId claim exists', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'driver-user', role: 'DRIVER' });
    ws.messages.length = 0;
    const own = { type: 'offer', data: { userId: 'driver-user', driverId: 'separate-driver-profile', offerId: 'offer' } };
    await channel.publish(own);
    await channel.publish({ type: 'offer', data: { userId: 'other-user', driverId: 'driver-user' } });
    expect(ws.messages).toEqual([own]);
  });

  it('allows drivers to subscribe to explicitly permitted vehicle IDs without guessing user/driver equivalence', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'driver-user', role: 'DRIVER', allowedVehicleIds: ['vehicle-A'] });
    await channel.send(ws, { type: 'subscribe', vehicles: ['vehicle-A'] });
    ws.messages.length = 0;
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([LOCATION]);
  });

  it('delivers own personal events but does not broadcast missing or unrelated recipients', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'user-1', role: 'USER' });
    ws.messages.length = 0;
    const own = { type: 'notification', data: { userId: 'user-1' } };
    await channel.publish(own);
    await channel.publish({ type: 'notification', data: { userId: 'other-user' } });
    await channel.publish({ type: 'notification', data: {} });
    await channel.publish({ type: 'offer', data: { userId: 'user-1' } });
    expect(ws.messages).toEqual([own]);
  });

  it('denies malformed signed vehicle scope instead of partially accepting it', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'user-1', role: 'USER', allowedVehicleIds: ['vehicle-A', null] });
    await channel.send(ws, { type: 'subscribe', vehicles: ['vehicle-A'] });
    expect(ws.messages.at(-1)).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fails closed for legacy hibernated sessions without an expiry', async () => {
    const ws = channel.connect();
    ws.session = { authenticated: true, userId: 'admin', role: 'ADMIN', subscribeAll: true, subscribedVehicles: [] };
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([]);
  });

  it('clears previous administrator/vehicle scope on reauthentication', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'admin', role: 'ADMIN' });
    await channel.send(ws, { type: 'subscribe', all: true });
    await channel.auth(ws, { userId: 'user-1', role: 'USER' });
    ws.messages.length = 0;
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([]);
  });

  it('revokes previous scope immediately when reauthentication fails', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'admin', role: 'ADMIN' });
    await channel.send(ws, { type: 'subscribe', all: true });
    await channel.send(ws, { type: 'auth', token: 'invalid-token' });
    ws.messages.length = 0;
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([]);
  });

  it('stops delivery when a previously valid token expires', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'admin', role: 'ADMIN' });
    await channel.send(ws, { type: 'subscribe', all: true });
    ws.messages.length = 0;
    vi.spyOn(Date, 'now').mockReturnValue(ws.session.expiresAt! + 1);
    await channel.publish(LOCATION);
    expect(ws.messages).toEqual([]);
  });

  it.each([
    { role: 'USER' }, { userId: '', role: 'USER' }, { userId: 'user-1', role: 'UNKNOWN' },
  ])('rejects invalid signed identity claims: %o', async (claims) => {
    const ws = channel.connect();
    await channel.auth(ws, claims);
    expect(ws.messages.at(-1)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(ws.closed).toContain(4001);
  });

  it('rejects a token signed with a different secret', async () => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'admin', role: 'ADMIN' }, 'untrusted-signing-secret-min32chars');
    expect(ws.messages.at(-1)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it.each([null, '', 'wrong-secret'])('rejects unauthorized HTTP publishing (%s)', async (token) => {
    const ws = channel.connect();
    await channel.auth(ws, { userId: 'admin', role: 'ADMIN' });
    await channel.send(ws, { type: 'subscribe', all: true });
    ws.messages.length = 0;
    expect((await channel.publish(LOCATION, token)).status).toBe(401);
    expect(ws.messages).toEqual([]);
  });

  it.each(['', 'dev-realtime-internal-token-12345'])('fails closed with missing or legacy publish secrets (%s)', async (internalToken) => {
    const unsafe = transport(kind, { internalToken });
    extras.push(unsafe);
    expect((await unsafe.publish(LOCATION, internalToken)).status).toBe(401);
  });

  it.each(['', 'dev-auth-secret-for-testing-only-32chars'])('fails closed with missing or legacy auth secrets (%s)', async (authSecret) => {
    const unsafe = transport(kind, { authSecret });
    extras.push(unsafe);
    const ws = unsafe.connect();
    await unsafe.auth(ws, { userId: 'admin', role: 'ADMIN' }, authSecret || AUTH_SECRET);
    expect(ws.messages.at(-1)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects malformed event envelopes instead of broadcasting them', async () => {
    expect((await channel.publish(null)).status).toBe(400);
    expect((await channel.publish({ type: 'location:update', data: null })).status).toBe(400);
  });

  it('does not let one failed socket prevent delivery to another authorized subscriber', async () => {
    const broken = channel.connect();
    const healthy = channel.connect();
    for (const ws of [broken, healthy]) {
      await channel.auth(ws, { userId: 'admin', role: 'ADMIN' });
      await channel.send(ws, { type: 'subscribe', all: true });
      ws.messages.length = 0;
    }
    broken.failSend = true;
    await channel.publish(LOCATION);
    expect(healthy.messages).toEqual([LOCATION]);
  });
});
