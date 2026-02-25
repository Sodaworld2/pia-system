import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/souls/personalities/**', 'dao-foundation-files/**'],
    },
    // Timeout for integration tests (DB operations can be slow)
    testTimeout: 15000,
  },
});
