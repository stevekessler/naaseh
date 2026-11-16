import { describe, expect, it } from 'vitest';
import { deploymentConfig, deploymentTarget } from '../lib/config.js';

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

describe('deployment target isolation', () => {
  const staging = {
    CDK_DEFAULT_ACCOUNT: '222222222222',
    NAASEH_STAGING_ACCOUNT_ID: '222222222222',
    NAASEH_STAGING_DOMAIN_NAME: 'app.staging.example.com',
    NAASEH_STAGING_HOSTED_ZONE_NAME: 'staging.example.com',
    NAASEH_STAGING_HOSTED_ZONE_ID: 'ZSTAGING123',
    NAASEH_STAGING_BREAK_GLASS_ROLE_ARN: 'arn:aws:iam::222222222222:role/staging-recovery',
  };
  const noContext = () => undefined;

  it('keeps production identifiers and default DNS settings', () => {
    expect(deploymentTarget('production', {}, noContext)).toMatchObject({
      edgeId: 'NaasehEdge',
      applicationId: 'NaasehProd',
      domainName: 'gsd.thepandas.link',
      hostedZoneName: 'thepandas.link',
    });
  });

  it('uses explicit staging DNS and ignores production context and alert defaults', () => {
    expect(deploymentTarget('staging', staging, () => 'production-context')).toMatchObject({
      account: '222222222222',
      edgeId: 'NaasehStagingEdge',
      applicationId: 'NaasehStaging',
      domainName: 'app.staging.example.com',
      hostedZoneId: 'ZSTAGING123',
      alertEmail: undefined,
    });
  });

  it('rejects a mismatched account or the production account', () => {
    expect(() =>
      deploymentTarget('staging', { ...staging, CDK_DEFAULT_ACCOUNT: '333333333333' }, noContext),
    ).toThrow('match NAASEH_STAGING_ACCOUNT_ID');
    expect(() =>
      deploymentTarget(
        'staging',
        {
          ...staging,
          CDK_DEFAULT_ACCOUNT: '093733938983',
          NAASEH_STAGING_ACCOUNT_ID: '093733938983',
        },
        noContext,
      ),
    ).toThrow('separate from production');
  });

  it('requires the staging hostname to belong to the supplied zone and rejects production DNS', () => {
    expect(() =>
      deploymentTarget(
        'staging',
        { ...staging, NAASEH_STAGING_DOMAIN_NAME: 'unrelated.example.com' },
        noContext,
      ),
    ).toThrow('delegated hosted zone');
    expect(() =>
      deploymentTarget(
        'staging',
        { ...staging, NAASEH_STAGING_HOSTED_ZONE_ID: 'Z03233042WRAYW9S16I7T' },
        noContext,
      ),
    ).toThrow('production hostname or hosted zone');
  });

  it('rejects a recovery role from a different account', () => {
    expect(() =>
      deploymentTarget(
        'staging',
        {
          ...staging,
          NAASEH_STAGING_BREAK_GLASS_ROLE_ARN: 'arn:aws:iam::333333333333:role/recovery',
        },
        noContext,
      ),
    ).toThrow('isolated staging account');
  });
});
