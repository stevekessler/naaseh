import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  findUnsafeActionReferences,
  validateWorkflowActions,
} from '../../tools/validate-github-actions.mjs';

describe('GitHub Actions supply-chain controls', () => {
  it('pins every external action in every workflow to an immutable commit SHA', async () => {
    await expect(validateWorkflowActions()).resolves.toBeGreaterThan(0);
  });

  it('rejects mutable tags while allowing local reusable workflows', () => {
    expect(findUnsafeActionReferences('- uses: actions/checkout@v6')).toEqual([
      { line: 1, reference: 'actions/checkout@v6' },
    ]);
    expect(findUnsafeActionReferences("uses: './.github/workflows/validate.yml'")).toEqual([]);
  });

  it('limits staging OIDC to its deploy job and keeps secrets out of shell interpolation', () => {
    const workflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
    expect(workflow).toMatch(/^permissions: \{ contents: read \}$/m);
    expect(workflow.match(/id-token: write/g)).toHaveLength(1);
    expect(workflow).toContain("BREAK_GLASS_ROLE: '${{ secrets.RECOVERY_BREAK_GLASS_ROLE_ARN }}'");
    expect(workflow).toContain('-c "breakGlassRoleArn=$BREAK_GLASS_ROLE"');
    expect(workflow).not.toContain('breakGlassRoleArn=${{ secrets.');
  });
});
