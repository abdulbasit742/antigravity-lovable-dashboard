import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    environment: 'node',
    include: ['server/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 10_000,
  },
});
