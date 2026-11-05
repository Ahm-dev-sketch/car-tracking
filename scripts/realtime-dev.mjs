try {
  process.loadEnvFile();
} catch {
  // Ignore if .env not present or already loaded
}

import { createRealtimeServer } from './realtime-dev-core.mjs';

const port = parseInt(process.env.PORT || '3001', 10);
const authSecret = process.env.AUTH_SECRET || 'dev-auth-secret-for-testing-only-32chars';
const internalToken = process.env.REALTIME_INTERNAL_TOKEN || 'dev-realtime-internal-token-12345';

const realtimeServer = createRealtimeServer({
  port,
  authSecret,
  internalToken,
});

realtimeServer.start().catch((err) => {
  console.error('[Realtime Dev Shim] Failed to start:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n[Realtime Dev Shim] Shutting down...');
  await realtimeServer.stop();
  process.exit(0);
});
