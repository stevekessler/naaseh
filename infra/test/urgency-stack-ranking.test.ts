import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { NaasehStack } from '../lib/naaseh-stack.js';

let template: Template;

beforeAll(() => {
  template = Template.fromStack(
    new NaasehStack(new App(), 'UrgencyStackRankingInfrastructure', {
      env: { account: '111111111111', region: 'us-west-2' },
      alertEmail: 'alerts@example.com',
      breakGlassRoleArn: 'arn:aws:iam::111111111111:role/naaseh-recovery-break-glass',
      certificateArn:
        'arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000',
      domainName: 'gsd.thepandas.link',
      hostedZoneId: 'Z00000000000000000000',
      hostedZoneName: 'thepandas.link',
      webAclArn:
        'arn:aws:wafv2:us-east-1:111111111111:global/webacl/naaseh/00000000-0000-0000-0000-000000000000',
      webAssetPath: fileURLToPath(new URL('../../apps/web/public', import.meta.url)),
    }),
  );
}, 60_000);

describe('urgency and personal-stack infrastructure', () => {
  it('uses encrypted pay-per-use storage with cursor TTL, streams, and PITR', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      SSESpecification: Match.objectLike({ SSEEnabled: true, SSEType: 'KMS' }),
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      DeletionProtectionEnabled: true,
    });
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: 'Encryption and signing key material for opaque pagination cursors.',
      KmsKeyId: Match.anyValue(),
      GenerateSecretString: Match.objectLike({ PasswordLength: 64 }),
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({ CURSOR_SIGNING_SECRET: Match.anyValue() }),
      },
    });
  });

  it('keeps reporting read-only while rank and pointer writers receive scoped table operations', () => {
    const resources = template.toJSON().Resources as Record<
      string,
      { Type: string; Properties?: Record<string, unknown> }
    >;
    const reportingRole = Object.keys(resources).find((id) =>
      id.startsWith('ReportingFunctionServiceRole'),
    );
    const rankingRole = Object.keys(resources).find((id) =>
      id.startsWith('RankingFunctionServiceRole'),
    );
    expect(reportingRole).toBeDefined();
    expect(rankingRole).toBeDefined();

    const actionsFor = (roleId: string) =>
      Object.values(resources)
        .filter(
          (resource) =>
            resource.Type === 'AWS::IAM::Policy' &&
            JSON.stringify(resource.Properties?.Roles).includes(roleId),
        )
        .flatMap((resource) => {
          const document = resource.Properties?.PolicyDocument as {
            Statement?: Array<{ Action?: string | string[] }>;
          };
          return (document.Statement ?? []).flatMap((statement) => statement.Action ?? []);
        });

    const reportingActions = actionsFor(reportingRole!);
    expect(reportingActions).toEqual(
      expect.arrayContaining(['dynamodb:Query', 'dynamodb:GetItem']),
    );
    expect(reportingActions).not.toEqual(
      expect.arrayContaining(['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem']),
    );
    expect(actionsFor(rankingRole!)).toEqual(
      expect.arrayContaining(['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query']),
    );
  });

  it('bounds ranking, compaction, reporting, and reconciliation compute', () => {
    const functions = template.findResources('AWS::Lambda::Function');
    const find = (prefix: string) =>
      Object.entries(functions).find(([id]) => id.startsWith(prefix))?.[1].Properties;

    expect(find('RankingFunction')).toMatchObject({
      Timeout: 30,
      MemorySize: 512,
      ReservedConcurrentExecutions: 10,
    });
    expect(find('StackCompactorFunction')).toMatchObject({
      Timeout: 300,
      MemorySize: 1024,
      ReservedConcurrentExecutions: 2,
    });
    expect(find('ReportingFunction')).toMatchObject({ Timeout: 15, MemorySize: 512 });
    expect(find('WorkloadProjectionReconciliationFunction')).toMatchObject({
      Timeout: 300,
      MemorySize: 512,
    });
  });

  it('retains logs and alarms on pagination, projection, consistency, and rank failures', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 90 });
    const rendered = JSON.stringify(template.toJSON());
    for (const metric of [
      'FilteredReadLatency',
      'FilteredReadAmplification',
      'FilteredShortPages',
      'FilteredReadUnits',
      'FilteredReadBytes',
      'PaginationContextRestarts',
      'PaginationCursorExpiries',
      'UrgencyTotalConsistencyFailures',
      'ProjectionReconciliationFailures',
      'StackReorderFailures',
      'StackCompactionFailures',
    ])
      expect(rendered).toContain(metric);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      TreatMissingData: 'notBreaching',
      AlarmActions: Match.anyValue(),
    });
  });
});
