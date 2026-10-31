import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAppRoute, routePath } from '../../apps/web/src/app/router.js';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');
const openApi = read('specs/015-finance-budget-management/contracts/finance.openapi.yaml');
const syncContract = read('specs/015-finance-budget-management/contracts/sync.md');
const runtimeContract = read('packages/contracts/src/finance.ts');

describe('Finance v1 deliberately has no export surface', () => {
  it('defines no export or download endpoint or operation in OpenAPI', () => {
    const paths = [...openApi.matchAll(/^ {2}(\/finance[^:]+):$/gmu)].map((match) => match[1]);
    const operationIds = [...openApi.matchAll(/^ {6}operationId: (.+)$/gmu)].map(
      (match) => match[1],
    );
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => !/(?:export|download)/iu.test(path!))).toBe(true);
    expect(operationIds.every((operation) => !/(?:export|download)/iu.test(operation!))).toBe(true);
    expect(openApi).not.toMatch(/(?:text\/csv|application\/octet-stream|application\/pdf)/iu);
  });

  it('defines no Finance export mutation, feed type, schema, or downloadable format', () => {
    const supportedOperations = syncContract.match(/Supported operations are ([^.]+)\./u)?.[1];
    expect(supportedOperations).toBeDefined();
    expect(supportedOperations).not.toMatch(/export/iu);
    expect(syncContract).toContain('No Finance export mutation or feed type exists in v1.');
    expect(runtimeContract).not.toMatch(/financeExport|exportFinance|downloadFinance/iu);
    expect(runtimeContract).not.toMatch(/text\/csv|application\/octet-stream|application\/pdf/iu);
  });

  it('does not recognize an export route and only builds the documented Finance routes', () => {
    expect(parseAppRoute('/finance/export')).toEqual({ section: 'tasks' });
    expect([
      routePath({ section: 'finance' }),
      routePath({ section: 'finance', view: 'accounts' }),
      routePath({ section: 'finance', view: 'transactions' }),
      routePath({ section: 'finance', view: 'merchants' }),
      routePath({ section: 'finance', view: 'budgets' }),
    ]).toEqual([
      '/finance',
      '/finance/accounts',
      '/finance/transactions',
      '/finance/merchants',
      '/finance/budgets',
    ]);
  });
});
