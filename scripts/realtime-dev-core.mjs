import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { decode } from 'next-auth/jwt';

// Keep these checks in parity with realtime/durable-object.ts. Only verified JWT
// claims grant scope; neither client subscription IDs nor query parameters do.
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isId(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}
function emptySession(authVersion = 0) {
  return { authenticated: false, subscribedVehicles: [], subscribeAll: false, authVersion };
}
function isActive(session) {
  return session.authenticated && isId(session.userId) &&
    ['ADMIN', 'USER', 'DRIVER'].includes(session.role) &&
    typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
}
function canReceive(session, type, data) {
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
    // A driver-profile ID must never be compared with an Auth.js userId.
    return ownDriver || Boolean(subscribed && session.allowedVehicleIds?.includes(data.vehicleId));
  }
  if (type === 'booking:update' || type === 'notification') return admin || ownUser;
  if (type === 'offer') return admin || ownDriver;
  return admin;
}

export function createRealtimeServer({
  port = 3001,
  authSecret = process.env.AUTH_SECRET,
  internalToken = process.env.REALTIME_INTERNAL_TOKEN,
  logger = console,
} = {}) {
  // The launcher historically supplies these public fallback strings. Reject
  // them here as well as missing configuration, even when explicitly passed.
  const authConfigured = typeof authSecret === 'string' && authSecret.trim() && authSecret !== 'dev-auth-secret-for-testing-only-32chars';
  const publishConfigured = typeof internalToken === 'string' && internalToken.trim() && internalToken !== 'dev-realtime-internal-token-12345';
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'realtime-dev-shim' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/publish') {
      if (!publishConfigured || req.headers.authorization !== `Bearer ${internalToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let event;
        try {
          event = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_JSON' }));
          return;
        }
        if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_EVENT' }));
          return;
        }
        let delivered = 0;
        const serialized = JSON.stringify(event);
        for (const client of wss.clients) {
          if (client.readyState !== WebSocket.OPEN || !canReceive(client.session ?? emptySession(), event.type, event.data)) continue;
          try {
            client.send(serialized);
            delivered++;
          } catch {
            // One disconnected recipient must not prevent other deliveries.
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, delivered }));
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.session = emptySession();
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON payload' }));
        return;
      }
      if (!isRecord(msg)) {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' }));
        return;
      }
      if (msg.type === 'auth') {
        const authVersion = (ws.session.authVersion ?? 0) + 1;
        ws.session = emptySession(authVersion);
        try {
          if (!authConfigured || !isId(msg.token)) throw new Error('Authentication is not configured or token is missing');
          let decoded = null;
          for (const salt of ['authjs.session-token', '__Secure-authjs.session-token', '']) {
            try {
              decoded = await decode({ token: msg.token, secret: authSecret, salt });
              if (decoded) break;
            } catch {
              // Auth.js uses different cookie salts for HTTP and HTTPS.
            }
          }
          if (ws.session.authVersion !== authVersion) return;
          const userId = decoded?.userId ?? decoded?.sub;
          if (!decoded || !isId(userId) || typeof decoded.role !== 'string' || !['ADMIN', 'USER', 'DRIVER'].includes(decoded.role) ||
              typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp) || decoded.exp * 1000 <= Date.now()) {
            throw new Error('Invalid identity or expired token');
          }
          ws.session = {
            ...emptySession(authVersion),
            authenticated: true,
            userId,
            role: decoded.role,
            driverId: isId(decoded.driverId) ? decoded.driverId : undefined,
            allowedVehicleIds: Array.isArray(decoded.allowedVehicleIds) && decoded.allowedVehicleIds.every(isId)
              ? [...new Set(decoded.allowedVehicleIds)] : [],
            expiresAt: decoded.exp * 1000,
          };
          ws.send(JSON.stringify({ type: 'auth:success', userId: ws.session.userId, role: ws.session.role }));
        } catch {
          if (ws.session.authVersion !== authVersion) return;
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid or expired authentication' }));
          ws.close(4001, 'Unauthorized');
        }
        return;
      }
      if (!isActive(ws.session)) {
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
        const requested = msg.vehicles ?? [];
        if (ws.session.role !== 'ADMIN' && (msg.all === true ||
            requested.some((id) => !ws.session.allowedVehicleIds?.includes(id)))) {
          ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Vehicle scope not permitted by token' }));
          return;
        }
        ws.session.subscribeAll = ws.session.role === 'ADMIN' && msg.all === true;
        ws.session.subscribedVehicles = [...new Set(requested)];
        ws.send(JSON.stringify({ type: 'subscribed', vehicles: ws.session.subscribedVehicles, all: ws.session.subscribeAll }));
        return;
      }
      ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_MESSAGE', message: 'Unhandled message type' }));
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  const start = () => new Promise((resolve, reject) => {
    server.listen(port, () => {
      logger.info(`[Realtime Dev Shim] listening on http://localhost:${port} and ws://localhost:${port}`);
      resolve({ server, wss, port });
    });
    server.on('error', reject);
  });
  const stop = () => new Promise((resolve) => {
    clearInterval(heartbeatInterval);
    for (const client of wss.clients) client.terminate();
    wss.close(() => { server.close(resolve); });
  });
  return { server, wss, start, stop, port };
}
