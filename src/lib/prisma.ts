import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
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

  return process.env.DATABASE_URL ?? '';
}

function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString();
  const adapter = new PrismaPg({ connectionString });
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

if (process.env.NODE_ENV !== 'production' && !globalForPrisma.prisma && process.env.DATABASE_URL) {
  globalForPrisma.prisma = createPrismaClient();
}

