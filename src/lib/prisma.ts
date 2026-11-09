import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
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

  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1');

  // Configure pg.Pool with SSL support for remote PostgreSQL (Supabase / Neon / AWS RDS)
  // and connection timeout to prevent serverless function hangs.
  const pool =
    globalForPrisma.pool ||
    new pg.Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 10,
    });

  if (!globalForPrisma.pool) {
    pool.on('error', (err) => {
      console.error('[Prisma pg.Pool background error]:', err);
    });
    globalForPrisma.pool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// ponytail: lazy proxy connects via Hyperdrive on CF Workers or DATABASE_URL on Node
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

if (process.env.NODE_ENV !== 'production' && !globalForPrisma.prisma && (process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
  globalForPrisma.prisma = createPrismaClient();
}

