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
});
