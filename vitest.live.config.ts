import { defineConfig } from 'vitest/config';

// `npm run test:live`: the end-to-end test against dev, or prod with UNCOLA_LIVE_ENV=prod (test/live/*.e2e.ts).
// `npm test` never picks these up, so it stays offline.
export default defineConfig({
  test: {
    include: ['test/live/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
