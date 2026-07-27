import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NaasehStack } from '../lib/naaseh-stack.js';

const template = Template.fromStack(
  new NaasehStack(new App(), 'GoogleSyncTest', {
    env: { account: '111111111111', region: 'us-west-2' },
    breakGlassRoleArn: 'arn:aws:iam::111111111111:role/break-glass',
    certificateArn: 'arn:aws:acm:us-east-1:111111111111:certificate/test',
    domainName: 'gsd.thepandas.link',
    hostedZoneId: 'Z00000000000000000000',
    hostedZoneName: 'thepandas.link',
    webAclArn: 'arn:aws:wafv2:us-east-1:111111111111:global/webacl/test/id',
    webAssetPath: fileURLToPath(new URL('../../apps/web/public', import.meta.url)),
  }),
);

describe('Google synchronization infrastructure', () => {
  it('creates bounded Node 24 reconciliation and isolated stream functions', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      ReservedConcurrentExecutions: 3,
      Timeout: 600,
      Environment: {
        Variables: Match.objectLike({
          GOOGLE_OAUTH_SECRET_ID: Match.anyValue(),
          NAASEH_DATA_KMS_KEY_ARN: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      ReservedConcurrentExecutions: 2,
      Timeout: 30,
      Environment: {
        Variables: Match.not(Match.objectLike({ GOOGLE_OAUTH_SECRET_ID: Match.anyValue() })),
      },
    });
  });

  it('schedules five-minute reconciliation and filters current task stream images', () => {
    template.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(5 minutes)' });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 25,
      BisectBatchOnFunctionError: true,
      MaximumRetryAttempts: 5,
      StartingPosition: 'LATEST',
      FilterCriteria: Match.objectLike({ Filters: Match.anyValue() }),
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
      BisectBatchOnFunctionError: true,
      MaximumRetryAttempts: 2,
      StartingPosition: 'LATEST',
      FilterCriteria: Match.objectLike({ Filters: Match.anyValue() }),
    });
  });

  it('keeps OAuth secret and KMS access away from the stream role', () => {
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const oauthReaders = policies.filter((policy) => {
      const rendered = JSON.stringify(policy);
      return (
        rendered.includes('GoogleOAuthCredentials') &&
        rendered.includes('secretsmanager:GetSecretValue')
      );
    });
    expect(oauthReaders).toHaveLength(1);
    const rendered = JSON.stringify(template.toJSON());
    expect(rendered).toContain('kms:Encrypt');
    expect(rendered).toContain('kms:Decrypt');
    expect(rendered).toContain('kms:ScheduleKeyDeletion');
    expect(rendered).toContain('secretsmanager:DeleteSecret');
  });

  it('retains logs, exposes all owner routes, and graphs provider failure classes', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
    for (const route of [
      'GET /api/v1/integrations/google/status',
      'POST /api/v1/integrations/google/connect',
      'GET /api/v1/integrations/google/callback',
      'POST /api/v1/integrations/google/sync',
      'POST /api/v1/integrations/google/disconnect',
      'PUT /api/v1/tasks/{taskId}/google-sharing',
    ])
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: route });
    const rendered = JSON.stringify(template.toJSON());
    for (const metric of [
      'GoogleSyncAuthorizationFailures',
      'GoogleSyncRevocations',
      'GoogleSyncThrottles',
      'GoogleSyncRunFailures',
      'GoogleSyncCheckpointStalls',
      'GoogleSyncConflicts',
      'GoogleSyncQuarantines',
      'GoogleSyncLagSeconds',
    ])
      expect(rendered).toContain(metric);
  });
});
