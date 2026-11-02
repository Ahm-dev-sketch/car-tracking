import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { encode } from 'next-auth/jwt';
import { createRealtimeServer } from '../../../scripts/realtime-dev-core.mjs';
import { publishEvent } from '@/server/realtime/hub';
import { LocationUpdateData, ServerRealtimeMessage } from '@/types/realtime';

const TEST_PORT = 3199;
const AUTH_SECRET = 'test-auth-secret-for-realtime-tests-min32chars';
const INTERNAL_TOKEN = 'test-internal-token-12345';
const SALT = 'authjs.session-token';

describe('Phase 5 Realtime System & Dev Shim', () => {
  let devShim: ReturnType<typeof createRealtimeServer>;

  beforeAll(async () => {
    devShim = createRealtimeServer({
      port: TEST_PORT,
      authSecret: AUTH_SECRET,
      internalToken: INTERNAL_TOKEN,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      } as unknown as Console,
    });
    await devShim.start();
  });

  afterAll(async () => {
    await devShim.stop();
  });

  function waitForMessage(
    ws: WebSocket,
    timeoutMs = 2000
  ): Promise<ServerRealtimeMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);

      ws.once('message', (data) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(data.toString()));
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  it('(a) unauth WS connection: operations without auth rejected and closed', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);

    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Try to subscribe before authenticating
    ws.send(JSON.stringify({ type: 'subscribe', vehicles: ['veh-1'] }));

    const response = await waitForMessage(ws);
    expect(response).toEqual(
      expect.objectContaining({
        type: 'error',
        code: 'UNAUTHORIZED',
      })
    );

    // Connection should be closed
    const closeCode = await new Promise<number>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve(ws.readyState);
      } else {
        ws.once('close', (code) => resolve(code));
      }
    });
    expect(closeCode).toBe(4001);
  });

  it('(b) auth with valid token and subscribe to vehicle A', async () => {
    const userToken = await encode({
      token: { userId: 'usr-regular-1', role: 'USER' },
      secret: AUTH_SECRET,
      salt: SALT,
    });

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Send auth message
    ws.send(JSON.stringify({ type: 'auth', token: userToken }));
    const authReply = await waitForMessage(ws);
    expect(authReply).toEqual({
      type: 'auth:success',
      userId: 'usr-regular-1',
      role: 'USER',
    });

    // Subscribe to vehicle A
    ws.send(JSON.stringify({ type: 'subscribe', vehicles: ['veh-A'] }));
    const subReply = await waitForMessage(ws);
    expect(subReply).toEqual({
      type: 'subscribed',
      vehicles: ['veh-A'],
      all: false,
    });

    ws.close();
  });

  it('(c) & (d) publish location:update for A delivered to subscriber; B not delivered', async () => {
    const userToken = await encode({
      token: { userId: 'usr-regular-2', role: 'USER' },
      secret: AUTH_SECRET,
      salt: SALT,
    });

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    ws.send(JSON.stringify({ type: 'auth', token: userToken }));
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: 'subscribe', vehicles: ['veh-A'] }));
    await waitForMessage(ws);

    const receivedMessages: ServerRealtimeMessage[] = [];
    ws.on('message', (raw) => {
      receivedMessages.push(JSON.parse(raw.toString()));
    });

    // 1. Publish for non-subscribed vehicle B
    const locationB: LocationUpdateData = {
      vehicleId: 'veh-B',
      lat: 21.0,
      lng: 105.8,
      accuracyM: 10,
      recordedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      movement: 'MOVING',
    };

    const resB = await fetch(`http://localhost:${TEST_PORT}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({
        type: 'location:update',
        data: locationB,
      }),
    });
    const jsonB = await resB.json();
    expect(jsonB.delivered).toBe(0);

    // 2. Publish for subscribed vehicle A
    const locationA: LocationUpdateData = {
      vehicleId: 'veh-A',
      lat: 21.0285,
      lng: 105.8542,
      accuracyM: 15,
      recordedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      movement: 'MOVING',
      plateNumber: '29A-123.45',
    };

    const resA = await fetch(`http://localhost:${TEST_PORT}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({
        type: 'location:update',
        data: locationA,
      }),
    });
    const jsonA = await resA.json();
    expect(jsonA.delivered).toBe(1);

    // Wait a brief tick for WS delivery
    await new Promise((r) => setTimeout(r, 100));

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]).toEqual({
      type: 'location:update',
      data: locationA,
    });

    ws.close();
  });

  it('(e) admin all=true receives fleet event for any vehicle', async () => {
    const adminToken = await encode({
      token: { userId: 'admin-usr-1', role: 'ADMIN' },
      secret: AUTH_SECRET,
      salt: SALT,
    });

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    ws.send(JSON.stringify({ type: 'auth', token: adminToken }));
    await waitForMessage(ws);

    // Subscribe all
    ws.send(JSON.stringify({ type: 'subscribe', all: true }));
    const subReply = await waitForMessage(ws);
    expect(subReply).toEqual({
      type: 'subscribed',
      vehicles: [],
      all: true,
    });

    const receivedMessages: ServerRealtimeMessage[] = [];
    ws.on('message', (raw) => {
      receivedMessages.push(JSON.parse(raw.toString()));
    });

    // Publish event for arbitrary vehicle
    const locationC: LocationUpdateData = {
      vehicleId: 'veh-ANY-999',
      lat: 10.7769,
      lng: 106.7009,
      accuracyM: 20,
      recordedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      movement: 'STOPPED',
    };

    await fetch(`http://localhost:${TEST_PORT}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
      },
      body: JSON.stringify({
        type: 'location:update',
        data: locationC,
      }),
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]).toEqual({
      type: 'location:update',
      data: locationC,
    });

    ws.close();
  });

  it('(g) hub.publishEvent dev-mode failure does not throw on dead endpoint', async () => {
    const originalUrl = process.env.REALTIME_PUBLISH_URL;
    const originalMode = process.env.REALTIME_MODE;

    // Point to a closed port
    process.env.REALTIME_PUBLISH_URL = 'http://localhost:59999/publish';
    process.env.REALTIME_MODE = 'dev';

    try {
      await expect(
        publishEvent({
          type: 'location:update',
          data: {
            vehicleId: 'veh-test',
            lat: 0,
            lng: 0,
            accuracyM: 5,
            recordedAt: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            movement: 'STOPPED',
          },
        })
      ).resolves.toBeUndefined();
    } finally {
      process.env.REALTIME_PUBLISH_URL = originalUrl;
      process.env.REALTIME_MODE = originalMode;
    }
  });
});
