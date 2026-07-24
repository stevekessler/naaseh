import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contractPath = 'specs/001-naaseh-v1-baseline/contracts/openapi.yaml';
const contract = readFileSync(contractPath, 'utf8');

describe('OpenAPI contract', () => {
  it('declares auth, sync, tasks, group lifecycle, categories, and admin paths', () => {
    for (const path of [
      '/auth/login:',
      '/sync/push:',
      '/tasks:',
      '/groups:',
      '/groups/{groupId}:',
      '/groups/{groupId}/join:',
      '/groups/{groupId}/members/{userId}:',
      '/categories:',
      '/admin/users:',
    ])
      expect(contract).toContain(path);
  });

  it('uses one same-origin versioned base path in contracts, clients, and infrastructure', () => {
    expect(contract).toContain('- url: /api/v1');
    const files = [
      'apps/web/src/features/auth/Login.tsx',
      'apps/web/src/features/groups/group-client.ts',
      'apps/web/src/sync/sync-engine.ts',
      'infra/lib/naaseh-stack.ts',
      'infra/lib/auth-security.ts',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(
        /(?:fetch\(|path:\s*|searchString:\s*)['"`]\/api\/(?!v1(?:\/|\$\{))/,
      );
    }
  });
});
