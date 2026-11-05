import { defineConfig } from 'vitest/config';
import path from 'path';

// Explicit opt-in: the database suites truncate car_tracking_test.
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [
      'src/server/**/*.integration.test.ts',
      'src/server/__tests__/phase5.realtime.test.ts',
      'src/server/__tests__/phase8.*.test.ts',
      'src/server/__tests__/phase9.dispatch.test.ts',
    ],
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
});
