import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/{contract,integration}/contacts-inventory-*.check.ts',
      'infra/test/contacts-inventory.check.ts',
    ],
    environment: 'node',
  },
});
