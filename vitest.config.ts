import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/*/src/**/*.test.ts', 'workers/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: [
        'apps/api/src/modules/**/*.service.ts',
        'workers/src/processors/**/*.ts',
      ],
      thresholds: {
        statements: 80,
      },
    },
  },
});
