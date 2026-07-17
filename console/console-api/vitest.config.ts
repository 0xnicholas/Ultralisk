import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Exclude pure-route wiring tests that require Postgres / running server.
    testTimeout: 5000,
  },
});
