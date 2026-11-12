import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

function getConnectionString(): string {
  try {
    const cf = (globalThis as unknown as Record<symbol, { env?: { HYPERDRIVE?: { connectionString?: string } } }>)[
      Symbol.for('__cloudflare-context__')
    ];
    if (cf?.env?.HYPERDRIVE?.connectionString) {
      return cf.env.HYPERDRIVE.connectionString;
    }
  } catch {
    // ignore
  }

  const globalScope = globalThis as unknown as {
    env?: { HYPERDRIVE?: { connectionString?: string } };
  };

  const hyperdrive =
    globalScope.env?.HYPERDRIVE ||
    (process.env as unknown as { HYPERDRIVE?: { connectionString?: string } })?.HYPERDRIVE;

  if (hyperdrive?.connectionString) {
    return hyperdrive.connectionString;
  }

  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DIRECT_URL ||
    ''
  );
}

function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString();
  if (!connectionString) {
    console.warn(
      '[Prisma Init Warning]: No database connection string found in environment variables (DATABASE_URL, POSTGRES_PRISMA_URL, etc.)'
    );
  }

  const isServerless = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

  // Singleton pg.Pool attached to globalThis across warm serverless invocations
  if (!globalForPrisma.pgPool) {
    const pool = new pg.Pool({
      connectionString,
      // In serverless, a modest pool (3) avoids read requests queueing on a single client
      // within a warm invocation; still bounded to prevent connection-pool exhaustion on free-tier Supabase.
      max: isServerless ? 3 : 5,
      connectionTimeoutMillis: 20000, // 20s timeout tolerance for serverless cold-starts & connection queues
      idleTimeoutMillis: 15000,
    });

    pool.on('error', (err) => {
      console.warn('[Prisma pg.Pool] Unexpected error on idle client:', err.message);
    });

    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(globalForPrisma.pgPool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// Global database client singleton stored on globalThis across all environments (including production serverless)
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const client = globalForPrisma.prisma;
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

// Eager initialization on globalThis if connection string is present
if (!globalForPrisma.prisma && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
  globalForPrisma.prisma = createPrismaClient();
}
