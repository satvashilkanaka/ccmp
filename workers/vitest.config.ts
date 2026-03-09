import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    deps: {
      // Tell Vitest to NOT try to resolve workspace packages via source
      // Instead, use the mocked versions from vi.mock()
      optimizer: {
        web: { enabled: false },
        ssr: { enabled: false },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/processors/**/*.ts'],
      thresholds: {
        statements: 80,
      },
    },
  },
});
