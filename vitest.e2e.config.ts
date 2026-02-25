import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 180_000,   // 3 minutes per test — real API calls
    hookTimeout: 30_000,
    pool: 'forks',          // Isolate e2e tests in separate process
    poolOptions: {
      forks: {
        singleFork: true,   // Run all e2e tests in same process (shared DB state)
      },
    },
  },
});
