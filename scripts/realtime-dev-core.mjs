import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { decode } from 'next-auth/jwt';

export function createRealtimeServer({
  port = 3001,
  authSecret = process.env.AUTH_SECRET || 'dev-auth-secret-for-testing-only-32chars',
  internalToken = process.env.REALTIME_INTERNAL_TOKEN || 'dev-realtime-internal-token-12345',
  logger = console,
} = {}) {
  const server = http.createServer(async (req, res) => {
    // Health check
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'realtime-dev-shim' }));
      return;
    }

    // Publish endpoint
    if (req.method === 'POST' && req.url === '/publish') {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${internalToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        let event;
        try {
          event = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_JSON' }));
          return;
        }

        let delivered = 0;
        const serialized = JSON.stringify(event);

        for (const client of wss.clients) {
          if (client.readyState !== WebSocket.OPEN || !client.authenticated) {
            continue;
          }

          let shouldDeliver = false;

          if (event.type === 'location:update') {
            const vehicleId = event.data?.vehicleId;
            if (client.subscribeAll || (vehicleId && client.subscribedVehicles?.has(vehicleId))) {
              shouldDeliver = true;
            }
          } else if (event.type === 'booking:update') {
            const targetUserId = event.data?.userId;
            if (client.role === 'ADMIN' || client.subscribeAll || (targetUserId && client.userId === targetUserId)) {
              shouldDeliver = true;
            }
          } else if (event.type === 'notification') {
            const targetUserId = event.data?.userId;
            if (client.role === 'ADMIN' || client.userId === targetUserId) {
              shouldDeliver = true;
            }
          } else {
            // General event delivered to admins or all subscribers
            if (client.role === 'ADMIN' || client.subscribeAll) {
              shouldDeliver = true;
            }
          }

          if (shouldDeliver) {
            client.send(serialized);
            delivered++;
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
    ws.authenticated = false;
    ws.userId = null;
    ws.role = null;
    ws.subscribedVehicles = new Set();
    ws.subscribeAll = false;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON payload' }));
        return;
      }

      if (msg.type === 'auth') {
        try {
          let decoded = null;
          const salts = ['authjs.session-token', '__Secure-authjs.session-token', ''];
          for (const salt of salts) {
            try {
              decoded = await decode({
                token: msg.token,
                secret: authSecret,
                salt,
              });
              if (decoded) break;
            } catch {
              // try next salt
            }
          }

          if (!decoded) {
            ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid or expired token' }));
            ws.close(4001, 'Unauthorized');
            return;
          }

          ws.authenticated = true;
          ws.userId = decoded.userId || decoded.sub;
          ws.role = decoded.role;

          ws.send(JSON.stringify({
            type: 'auth:success',
            userId: ws.userId,
            role: ws.role,
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Token verification failed' }));
          ws.close(4001, 'Unauthorized');
        }
        return;
      }

      if (!ws.authenticated) {
        ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Authentication required' }));
        ws.close(4001, 'Unauthorized');
        return;
      }

      if (msg.type === 'subscribe') {
        if (msg.all) {
          if (ws.role !== 'ADMIN') {
            ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only admin can subscribe to all vehicles' }));
            return;
          }
          ws.subscribeAll = true;
        }

        if (Array.isArray(msg.vehicles)) {
          for (const vId of msg.vehicles) {
            if (typeof vId === 'string' && vId.trim()) {
              ws.subscribedVehicles.add(vId.trim());
            }
          }
        }

        ws.send(JSON.stringify({
          type: 'subscribed',
          vehicles: Array.from(ws.subscribedVehicles),
          all: ws.subscribeAll,
        }));
        return;
      }

      ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_MESSAGE', message: `Unhandled message type: ${msg.type}` }));
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  const start = () =>
    new Promise((resolve, reject) => {
      server.listen(port, () => {
        logger.info(`[Realtime Dev Shim] listening on http://localhost:${port} and ws://localhost:${port}`);
        resolve({ server, wss, port });
      });
      server.on('error', reject);
    });

  const stop = () =>
    new Promise((resolve) => {
      clearInterval(heartbeatInterval);
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close(() => {
        server.close(resolve);
      });
    });

  return { server, wss, start, stop, port };
}
