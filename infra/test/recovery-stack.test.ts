import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { NaasehStack } from '../lib/naaseh-stack.js';

let template: Template;
const webProps = {
  certificateArn:
    'arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000',
  domainName: 'gsd.thepandas.link',
  hostedZoneId: 'Z00000000000000000000',
  hostedZoneName: 'thepandas.link',
  webAclArn:
    'arn:aws:wafv2:us-east-1:111111111111:global/webacl/naaseh/00000000-0000-0000-0000-000000000000',
  webAssetPath: fileURLToPath(new URL('../../apps/web/public', import.meta.url)),
};

beforeAll(() => {
  template = Template.fromStack(
    new NaasehStack(new App(), 'RecoveryTest', {
      env: { account: '111111111111', region: 'us-west-2' },
      breakGlassRoleArn: 'arn:aws:iam::111111111111:role/naaseh-recovery-break-glass',
      ...webProps,
    }),
  );
}, 60_000);

describe('single-region recovery infrastructure', () => {
  it('rejects a production stack outside us-west-2', () => {
    expect(
      () =>
        new NaasehStack(new App(), 'WrongRegion', {
          env: { account: '111111111111', region: 'us-east-1' },
          breakGlassRoleArn: 'arn:aws:iam::111111111111:role/naaseh-recovery-break-glass',
          ...webProps,
        }),
    ).toThrow('us-west-2');
  });

  it('creates one retained regional DynamoDB table with PITR and deletion protection', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.resourceCountIs('AWS::DynamoDB::GlobalTable', 0);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      DeletionProtectionEnabled: true,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
    });
  });

  it('uses retained single-region KMS recovery and signing keys', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      KeySpec: 'RSA_3072',
      KeyUsage: 'ENCRYPT_DECRYPT',
      MultiRegion: false,
    });
    template.hasResourceProperties('AWS::KMS::Key', {
      KeySpec: 'RSA_3072',
      KeyUsage: 'SIGN_VERIFY',
      MultiRegion: false,
    });
    template.hasResource('AWS::KMS::Key', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
    const rendered = JSON.stringify(template.toJSON());
    expect(rendered).toContain('naaseh-recovery-key-registry/v1');
    expect(rendered).toContain('authority');
    expect(rendered).toContain('recovery');
    expect(rendered).not.toContain('recovery-account');
  });

  it('keeps secrets and private versioned media in one region without replication', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 3);
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Tags: Match.arrayWith([Match.objectLike({ Key: 'NaasehRotationReviewDays', Value: '90' })]),
    });
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: 'Enabled' },
    });
    const rendered = JSON.stringify(template.toJSON());
    expect(rendered).not.toContain('ReplicaRegions');
    expect(rendered).not.toContain('ReplicationConfiguration');
  });

  it('creates a locked same-region backup vault without copy actions', () => {
    template.hasResourceProperties('AWS::Backup::BackupVault', {
      LockConfiguration: {
        MinRetentionDays: 35,
        MaxRetentionDays: 365,
        ChangeableForDays: 3,
      },
    });
    template.hasResourceProperties('AWS::Backup::BackupPlan', {
      BackupPlan: {
        BackupPlanRule: Match.arrayWith([
          Match.objectLike({
            ScheduleExpression: 'cron(0 5 * * ? *)',
            Lifecycle: { DeleteAfterDays: 35 },
          }),
        ]),
      },
    });
    expect(JSON.stringify(template.toJSON())).not.toContain('CopyActions');
  });

  it('provisions quarterly isolated restore testing and safe failure alerts', () => {
    template.resourceCountIs('AWS::Backup::RestoreTestingPlan', 1);
    template.resourceCountIs('AWS::Backup::RestoreTestingSelection', 2);
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: Match.objectLike({
        source: ['aws.backup'],
        detail: { status: ['FAILED', 'ABORTED', 'EXPIRED'] },
      }),
    });
    const rendered = JSON.stringify(template.toJSON());
    expect(rendered).toContain('RECOVERY_MEMO_WRAPPING_KEY_ARN');
    expect(rendered).not.toContain('PRIMARY_MEMO_WRAPPING_KEY_ARN');
  });
});
