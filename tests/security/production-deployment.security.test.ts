import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');

describe('production deployment workflow', () => {
  it('gates deployment on validation, the protected environment, and OIDC only in AWS jobs', () => {
    expect(workflow).toContain('needs: validate');
    expect(workflow.match(/environment: production/g)).toHaveLength(3);
    expect(workflow).toContain('id-token: write');
    expect(workflow).not.toMatch(/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
  });

  it('accepts only a full immutable rollback SHA and only deploys main', () => {
    expect(workflow).toContain('test "$GITHUB_REF" = refs/heads/main');
    expect(workflow).toContain("grep -Eq '^[0-9a-f]{40}$'");
    expect(workflow).toContain("ref: '${{ inputs.rollback_ref }}'");
  });

  it('runs a credential-safe smoke gate and rolls back only after a deployed release fails smoke', () => {
    expect(workflow).toContain('production-smoke.spec.ts');
    expect(workflow).toContain(
      "always() && needs.deploy.result == 'success' && needs.smoke.result == 'failure'",
    );
    expect(workflow).toContain('naaseh-production-rollback');
    expect(workflow).toContain('Build known-good web assets for rollback');
    expect(workflow.match(/--rollback/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
