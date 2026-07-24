import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'infra/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    environment: 'node',
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      // Unit coverage protects portable business rules and synthesized infrastructure.
      // API integration/security suites and Playwright cover deployed adapters and UI.
      include: [
        'packages/domain/src/**/*.ts',
        'packages/contracts/src/**/*.ts',
        'packages/observability/src/**/*.ts',
        'infra/lib/**/*.ts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cdk.out/**',
        '**/coverage/**',
        '**/*.config.{js,mjs,ts}',
      ],
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
});
