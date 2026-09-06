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

  it('keeps the unprovisioned staging placeholder unable to access or deploy AWS', () => {
    const workflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
    expect(workflow).toMatch(/^permissions: \{ contents: read \}$/m);
    expect(workflow).toContain('staging-not-provisioned');
    expect(workflow).not.toContain('id-token: write');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toMatch(/cdk (deploy|synth)/u);
    expect(workflow).not.toContain('configure-aws-credentials');
  });

  it('keeps automatic validation on one bounded runner and cancels superseded commits', () => {
    const workflow = readFileSync('.github/workflows/validate.yml', 'utf8');
    expect(workflow.match(/runs-on: ubuntu-latest/g)).toHaveLength(1);
    expect(workflow.match(/- run: npm ci/g)).toHaveLength(1);
    expect(workflow).toContain('timeout-minutes: 15');
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}",
    );
    expect(workflow).toContain(
      'run: npm audit --omit=dev --audit-level=high --workspace @naaseh/api --workspace @naaseh/web',
    );
    expect(workflow).toContain('- run: npm run test:e2e:quick');
  });
});
