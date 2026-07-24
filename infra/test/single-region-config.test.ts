import { describe, expect, it } from 'vitest';
import { deploymentConfig } from '../lib/config.js';

describe('single-region deployment configuration', () => {
  it('defaults to us-west-2', () => {
    expect(deploymentConfig({}).region).toBe('us-west-2');
  });

  it('accepts an explicit us-west-2 production region', () => {
    expect(
      deploymentConfig({ NAASEH_AWS_REGION: 'us-west-2', NAASEH_STAGE: 'production' }).region,
    ).toBe('us-west-2');
  });

  it('rejects another production region', () => {
    expect(() =>
      deploymentConfig({ NAASEH_AWS_REGION: 'us-east-1', NAASEH_STAGE: 'production' }),
    ).toThrow('us-west-2');
  });

  it('does not expose recovery-region configuration', () => {
    expect(deploymentConfig({})).not.toHaveProperty('recoveryRegion');
  });
});
