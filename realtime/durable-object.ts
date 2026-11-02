/**
 * Cloudflare Workers Durable Object - LocationHub
 *
 * Implements real-time WebSocket fleet tracking using Cloudflare WebSocket Hibernation API.
 * DEPLOYMENT NOTE: Wired into Cloudflare Workers deployment in Phase 8.
 *
 * Excluded from Next.js server bundle and Node runtime builds.
 */

export interface Env {
  AUTH_SECRET?: string;
}

export interface WebSocketSessionState {
  userId?: string;
  role?: string;
  authenticated: boolean;
  subscribedVehicles: string[];
  subscribeAll: boolean;
}

export class LocationHub {
  state: any;
  env: Env;

  constructor(state: any, env: Env) {
    this.state = state;
    this.env = env;
  }

  // WebSocket Hibernation: fetch handles WS upgrades and RPC broadcast requests
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal publish route (HTTP fallback)
    if (request.method === 'POST' && url.pathname === '/publish') {
      const event = await request.json();
      await this.broadcast(event);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    // @ts-ignore - Cloudflare WebSocketPair global
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair) as [any, any];

    // Accept server side of WebSocket with initial attachment state
    const initialAttachment: WebSocketSessionState = {
      authenticated: false,
      subscribedVehicles: [],
      subscribeAll: false,
    };

    if (this.state.acceptWebSocket) {
      this.state.acceptWebSocket(server);
      if (server.serializeAttachment) {
        server.serializeAttachment(initialAttachment);
      }
    }

    return new Response(null, {
      status: 101,
      // @ts-ignore
      webSocket: client,
    });
  }

  // RPC broadcast callable from Worker fetch handler
  async broadcast(event: any): Promise<void> {
    const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
    const serialized = JSON.stringify(event);

    for (const ws of sockets) {
      const attachment: WebSocketSessionState = ws.deserializeAttachment
        ? ws.deserializeAttachment()
        : { authenticated: false, subscribedVehicles: [], subscribeAll: false };

      if (!attachment.authenticated) {
        continue;
      }

      let shouldDeliver = false;

      if (event.type === 'location:update') {
        const vehicleId = event.data?.vehicleId;
        if (
          attachment.subscribeAll ||
          (vehicleId && attachment.subscribedVehicles?.includes(vehicleId))
        ) {
          shouldDeliver = true;
        }
      } else if (event.type === 'booking:update') {
        const targetUserId = event.data?.userId;
        if (
          attachment.role === 'ADMIN' ||
          attachment.subscribeAll ||
          (targetUserId && attachment.userId === targetUserId)
        ) {
          shouldDeliver = true;
        }
      } else if (event.type === 'notification') {
        const targetUserId = event.data?.userId;
        if (attachment.role === 'ADMIN' || attachment.userId === targetUserId) {
          shouldDeliver = true;
        }
      } else {
        if (attachment.role === 'ADMIN' || attachment.subscribeAll) {
          shouldDeliver = true;
        }
      }

      if (shouldDeliver) {
        ws.send(serialized);
      }
    }
  }

  // Hibernated WebSocket message handler
  async webSocketMessage(ws: any, message: string | ArrayBuffer): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON payload' }));
      return;
    }

    const attachment: WebSocketSessionState = ws.deserializeAttachment
      ? ws.deserializeAttachment()
      : { authenticated: false, subscribedVehicles: [], subscribeAll: false };

    if (msg.type === 'auth') {
      try {
        // Dynamic import next-auth/jwt decode (supported on Cloudflare Workers edge runtime)
        const { decode } = await import('next-auth/jwt');
        const secret = this.env.AUTH_SECRET || '';
        let decoded = null;

        for (const salt of ['authjs.session-token', '__Secure-authjs.session-token', '']) {
          try {
            decoded = await decode({ token: msg.token, secret, salt });
            if (decoded) break;
          } catch {
            // next salt
          }
        }

        if (!decoded) {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid or expired token' }));
          ws.close(4001, 'Unauthorized');
          return;
        }

        attachment.authenticated = true;
        attachment.userId = (decoded.userId || decoded.sub) as string;
        attachment.role = decoded.role as string;

        if (ws.serializeAttachment) {
          ws.serializeAttachment(attachment);
        }

        ws.send(JSON.stringify({
          type: 'auth:success',
          userId: attachment.userId,
          role: attachment.role,
        }));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Auth decoding failed' }));
        ws.close(4001, 'Unauthorized');
      }
      return;
    }

    if (!attachment.authenticated) {
      ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Authentication required' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    if (msg.type === 'subscribe') {
      if (msg.all) {
        if (attachment.role !== 'ADMIN') {
          ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only admin can subscribe to all vehicles' }));
          return;
        }
        attachment.subscribeAll = true;
      }

      if (Array.isArray(msg.vehicles)) {
        const set = new Set(attachment.subscribedVehicles);
        for (const v of msg.vehicles) {
          if (typeof v === 'string' && v.trim()) set.add(v.trim());
        }
        attachment.subscribedVehicles = Array.from(set);
      }

      if (ws.serializeAttachment) {
        ws.serializeAttachment(attachment);
      }

      ws.send(JSON.stringify({
        type: 'subscribed',
        vehicles: attachment.subscribedVehicles,
        all: attachment.subscribeAll,
      }));
      return;
    }

    ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_MESSAGE', message: `Unhandled message type: ${msg.type}` }));
  }

  async webSocketClose(ws: any, code: number, reason: string, _wasClean: boolean): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: any, _error: any): Promise<void> {
    ws.close(1011, 'Internal WebSocket Error');
  }
}
