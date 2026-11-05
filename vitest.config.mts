import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    // Opt-in only: legacy phase suites truncate a real PostgreSQL database.
    include: [
      'src/lib/**/*.test.ts',
      'src/components/**/*.test.ts',
      'src/server/auth.test.ts',
      'src/server/**/*.unit.test.ts',
      'src/server/**/*.regression.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
