import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NaasehEdgeStack } from '../lib/edge-stack.js';
import { NaasehStack } from '../lib/naaseh-stack.js';

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
const template = Template.fromStack(
  new NaasehStack(new App(), 'Test', {
    env: { account: '111111111111', region: 'us-west-2' },
    alertEmail: 'alerts@example.com',
    breakGlassRoleArn: 'arn:aws:iam::111111111111:role/naaseh-recovery-break-glass',
    ...webProps,
  }),
);
const edgeTemplate = Template.fromStack(
  new NaasehEdgeStack(new App(), 'EdgeTest', {
    env: { account: '111111111111', region: 'us-east-1' },
    domainName: webProps.domainName,
    hostedZoneId: webProps.hostedZoneId,
    hostedZoneName: webProps.hostedZoneName,
  }),
);

describe('foundation infrastructure', () => {
  it('keeps the production template below the resource budget', () => {
    const resourceCount = Object.keys(template.toJSON().Resources ?? {}).length;
    expect(resourceCount).toBeLessThanOrEqual(400);
    template.resourceCountIs('AWS::ApiGatewayV2::Integration', 17);
    template.resourceCountIs('AWS::Lambda::Permission', 23);
  });

  it('keeps focused helpers inside one deployable stack', () => {
    template.resourceCountIs('AWS::CloudFormation::Stack', 0);
    template.resourceCountIs('AWS::Backup::BackupPlan', 1);
    template.resourceCountIs('AWS::Backup::BackupVault', 1);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 3);
  });
  it('uses private, retained S3 origins and CloudFront OAC over HTTPS', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: 'Enabled' },
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['gsd.thepandas.link'],
        ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: 'TLSv1.2_2021' }),
        WebACLId: webProps.webAclArn,
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: '/api/v1/*', ViewerProtocolPolicy: 'https-only' }),
        ]),
      }),
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: Match.objectLike({
            ContentSecurityPolicy: Match.stringLikeRegexp("frame-ancestors 'none'"),
          }),
          FrameOptions: { FrameOption: 'DENY', Override: true },
        }),
      }),
    });
    edgeTemplate.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'CLOUDFRONT',
      VisibilityConfig: Match.objectLike({ CloudWatchMetricsEnabled: true }),
    });
    edgeTemplate.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'gsd.thepandas.link',
      ValidationMethod: 'DNS',
    });
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 0);
    template.hasResourceProperties('AWS::Route53::RecordSet', { Name: 'gsd.thepandas.link.' });
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      DistributionPaths: ['/*'],
    });
  });

  it('configures the HTTP API with safe structured access logs and Node 24 Lambdas', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 100,
        ThrottlingRateLimit: 50,
      },
      AccessLogSettings: Match.objectLike({
        Format: Match.serializedJson({
          requestId: '$context.requestId',
          routeKey: '$context.routeKey',
          status: '$context.status',
          responseLength: '$context.responseLength',
        }),
      }),
    });
    template.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs24.x' });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({ NODE_ENV: 'production' }),
      },
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /api/v1/auth/login',
    });
    for (const route of [
      'POST /api/v1/sync/push',
      'POST /api/v1/tasks',
      'GET /api/v1/groups',
      'POST /api/v1/groups/{groupId}/join',
      'DELETE /api/v1/groups/{groupId}/members/{userId}',
      'POST /api/v1/tasks/{taskId}/hidden-memo/recovery',
      'GET /api/v1/categories',
      'POST /api/v1/categories',
      'PATCH /api/v1/categories/{categoryId}',
      'DELETE /api/v1/categories/{categoryId}',
    ])
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: route });
  });

  it('limits password-pepper access to authentication and provisioning boundaries', () => {
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const pepperReaders = policies.filter((policy) => {
      const rendered = JSON.stringify(policy);
      return (
        rendered.includes('PasswordPepper') && rendered.includes('secretsmanager:GetSecretValue')
      );
    });
    expect(pepperReaders).toHaveLength(5);
  });

  it('throttles group joins independently and scopes profile-media access', () => {
    edgeTemplate.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'GroupJoinRateLimit',
          Statement: Match.objectLike({
            RateBasedStatement: Match.objectLike({ Limit: 10, EvaluationWindowSec: 60 }),
          }),
        }),
      ]),
    });
    const rendered = JSON.stringify(template.toJSON());
    expect(rendered).toContain('profiles/*');
    expect(rendered).toContain('schedule/default/naaseh-reminder-*');
    expect(rendered).toContain('GroupIntegration');
    expect(rendered).toContain('ProfilePictureProcessor');
  });

  it('isolates recovery decrypt permission and bounds recovery concurrency', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 1,
      Environment: {
        Variables: Match.objectLike({
          RECOVERY_MEMO_WRAPPING_KEY_ARN: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'kms:Decrypt', Effect: 'Allow' }),
          Match.objectLike({
            Action: Match.arrayWith(['kms:ScheduleKeyDeletion', 'kms:DisableKey']),
            Effect: 'Deny',
            Resource: '*',
          }),
        ]),
      }),
    });
  });

  it('protects the regional on-demand table with PITR, streams, TTL, and the initial GSI', () => {
    template.resourceCountIs('AWS::DynamoDB::GlobalTable', 0);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      SSESpecification: { SSEEnabled: true },
      GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: 'GSI1' })]),
      DeletionProtectionEnabled: true,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it('creates retained log groups, only critical alarms, and a dashboard', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 9);
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 90 });
    template.resourceCountIs('AWS::CloudWatch::Alarm', 8);
    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.resourceCountIs('AWS::SNS::TopicPolicy', 1);
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.com',
    });
    const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
    expect(alarms).toHaveLength(8);
    for (const alarm of alarms) expect(alarm.Properties?.AlarmActions).toHaveLength(1);
    const rendered = JSON.stringify(template.toJSON());
    for (const alarm of [
      'RecoveryKeyPolicyChangeAlarm',
      'RuntimeSecretPolicyChangeAlarm',
      'PermanentDeletionFailureAlarm',
      'AttachmentThreatAlarm',
      'WorkloadProjectionDriftAlarm',
      'OrganizationDeleteFailureAlarm',
      'BackupFailureAlarm',
      'RestoreWorkflowFailureAlarm',
    ])
      expect(rendered).toContain(alarm);
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });
});
