/** Cloudflare WebSocket hibernation hub. Keep authorization in parity with the dev shim. */
export interface Env {
  AUTH_SECRET?: string;
  REALTIME_INTERNAL_TOKEN?: string;
}

export interface WebSocketSessionState {
  userId?: string;
  role?: string;
  driverId?: string;
  allowedVehicleIds?: string[];
  expiresAt?: number;
  authVersion?: number;
  authenticated: boolean;
  subscribedVehicles: string[];
  subscribeAll: boolean;
}

interface HubSocket {
  send(message: string): void;
  close(code: number, reason: string): void;
  serializeAttachment?(state: WebSocketSessionState): void;
  deserializeAttachment?(): WebSocketSessionState | undefined;
}
interface HubState {
  acceptWebSocket?(socket: HubSocket): void;
  getWebSockets?(): HubSocket[];
}
declare const WebSocketPair: new () => { 0: HubSocket; 1: HubSocket };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}
function emptySession(authVersion = 0): WebSocketSessionState {
  return { authenticated: false, subscribedVehicles: [], subscribeAll: false, authVersion };
}
function isActive(session: WebSocketSessionState): boolean {
  return session.authenticated && isId(session.userId) &&
    ['ADMIN', 'USER', 'DRIVER'].includes(session.role ?? '') &&
    typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
}

function canReceive(session: WebSocketSessionState, type: string, data: Record<string, unknown>): boolean {
  if (!isActive(session)) return false;
  const admin = session.role === 'ADMIN';
  const ownUser = isId(data.userId) && data.userId === session.userId;
  const ownDriver = session.role === 'DRIVER' && (
    (isId(session.driverId) && data.driverId === session.driverId) ||
    (isId(data.driverUserId) && data.driverUserId === session.userId) || ownUser
  );
  if (type === 'location:update') {
    if (!isId(data.vehicleId)) return false;
    const subscribed = session.subscribedVehicles?.includes(data.vehicleId);
    if (admin) return session.subscribeAll || subscribed;
    // driverId is a driver-profile ID, never the Auth.js userId. Existing tokens
    // and location events lack this mapping, so they grant no implicit access.
    return ownDriver || Boolean(subscribed && session.allowedVehicleIds?.includes(data.vehicleId));
  }
  if (type === 'booking:update' || type === 'notification') return admin || ownUser;
  if (type === 'offer') return admin || ownDriver;
  return admin;
}

export class LocationHub {
  constructor(public state: HubState, public env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/publish') {
      const secret = this.env.REALTIME_INTERNAL_TOKEN;
      if (!secret?.trim() || secret === 'dev-realtime-internal-token-12345' ||
          request.headers.get('Authorization') !== `Bearer ${secret}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      let event: unknown;
      try {
        event = await request.json();
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }
      if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data)) {
        return new Response('Invalid event', { status: 400 });
      }
      await this.broadcast(event);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket?.(pair[1]);
    pair[1].serializeAttachment?.(emptySession());
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & { webSocket: HubSocket });
  }

  // Direct RPC access is a trusted Worker binding capability; HTTP calls go
  // through the secret-protected route above. Recheck scope for every delivery,
  // including legacy attachments that predate claim-scoped subscriptions.
  async broadcast(event: unknown): Promise<void> {
    if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data)) return;
    const serialized = JSON.stringify(event);
    for (const ws of this.state.getWebSockets?.() ?? []) {
      const session = ws.deserializeAttachment?.() ?? emptySession();
      if (!canReceive(session, event.type, event.data)) continue;
      try {
        ws.send(serialized);
      } catch {
        // A disconnected socket must not prevent delivery to other recipients.
      }
    }
  }

  async webSocketMessage(ws: HubSocket, message: string | ArrayBuffer): Promise<void> {
    let msg: unknown;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON payload' }));
      return;
    }
    if (!isRecord(msg)) {
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' }));
      return;
    }
    const attachment = ws.deserializeAttachment?.() ?? emptySession();

    if (msg.type === 'auth') {
      const authVersion = (attachment.authVersion ?? 0) + 1;
      ws.serializeAttachment?.(emptySession(authVersion));
      try {
        const secret = this.env.AUTH_SECRET;
        if (!secret?.trim() || secret === 'dev-auth-secret-for-testing-only-32chars' || !isId(msg.token)) {
          throw new Error('Authentication is not configured or token is missing');
        }
        const { decode } = await import('next-auth/jwt');
        let decoded = null;
        for (const salt of ['authjs.session-token', '__Secure-authjs.session-token', '']) {
          try {
            decoded = await decode({ token: msg.token, secret, salt });
            if (decoded) break;
          } catch {
            // Auth.js uses different cookie salts for HTTP and HTTPS.
          }
        }
        if (ws.deserializeAttachment?.()?.authVersion !== authVersion) return;
        const userId = decoded?.userId ?? decoded?.sub;
        if (!decoded || !isId(userId) || typeof decoded.role !== 'string' || !['ADMIN', 'USER', 'DRIVER'].includes(decoded.role) ||
            typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp) || decoded.exp * 1000 <= Date.now()) {
          throw new Error('Invalid identity or expired token');
        }
        const session: WebSocketSessionState = {
          ...emptySession(authVersion),
          authenticated: true,
          userId,
          role: decoded.role,
          driverId: isId(decoded.driverId) ? decoded.driverId : undefined,
          allowedVehicleIds: Array.isArray(decoded.allowedVehicleIds) && decoded.allowedVehicleIds.every(isId)
            ? [...new Set(decoded.allowedVehicleIds as string[])] : [],
          expiresAt: decoded.exp * 1000,
        };
        ws.serializeAttachment?.(session);
        ws.send(JSON.stringify({ type: 'auth:success', userId: session.userId, role: session.role }));
      } catch {
        if (ws.deserializeAttachment?.()?.authVersion !== authVersion) return;
        ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid or expired authentication' }));
        ws.close(4001, 'Unauthorized');
      }
      return;
    }

    if (!isActive(attachment)) {
      ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Authentication required' }));
      ws.close(4001, 'Unauthorized');
      return;
    }
    if (msg.type === 'subscribe') {
      if ((msg.all !== undefined && typeof msg.all !== 'boolean') ||
          (msg.vehicles !== undefined && (!Array.isArray(msg.vehicles) || !msg.vehicles.every(isId)))) {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_SUBSCRIPTION' }));
        return;
      }
      const requested = (msg.vehicles ?? []) as string[];
      if (attachment.role !== 'ADMIN' && (msg.all === true ||
          requested.some((id) => !attachment.allowedVehicleIds?.includes(id)))) {
        ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Vehicle scope not permitted by token' }));
        return;
      }
      // Replacement, not accumulation: empty scopes revoke previous subscriptions.
      attachment.subscribeAll = attachment.role === 'ADMIN' && msg.all === true;
      attachment.subscribedVehicles = [...new Set(requested)];
      ws.serializeAttachment?.(attachment);
      ws.send(JSON.stringify({ type: 'subscribed', vehicles: attachment.subscribedVehicles, all: attachment.subscribeAll }));
      return;
    }
    ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_MESSAGE', message: 'Unhandled message type' }));
  }

  async webSocketClose(ws: HubSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    ws.close(code, reason);
  }
  async webSocketError(ws: HubSocket, _error: unknown): Promise<void> {
    ws.close(1011, 'Internal WebSocket Error');
  }
}
