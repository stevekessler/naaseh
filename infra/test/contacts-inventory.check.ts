import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ContactsInventoryDataStack } from '../lib/contacts-inventory-data-stack.js';
import { ContactsInventoryReleaseStack } from '../lib/contacts-inventory-release-stack.js';
import { createWebResources } from '../lib/web-stack.js';

describe('Contacts and Inventory artifact origin', () => {
  it('synthesizes a retained private feature bucket and disables manifest caching', () => {
    const stack = new Stack(new App(), 'Host', {
      env: { region: 'us-west-2', account: '123456789012' },
    });
    createWebResources(stack, {
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/cert',
      domainName: 'naaseh.example.test',
      webAclArn: 'arn:aws:wafv2:us-east-1:123456789012:global/webacl/site/id',
      webAssetPath: 'tests/fixtures',
      contactsInventoryMediaOrigin: 'https://upload.example.test',
    });
    const template = Template.fromStack(stack);
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      Properties: {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        Tags: Match.arrayWith([Match.objectLike({ Key: 'Feature', Value: 'contacts-inventory' })]),
      },
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: '/features/contacts-inventory/releases/*' }),
          Match.objectLike({
            PathPattern: '/features/contacts-inventory/*',
            CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
          }),
        ]),
      },
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp(
              "connect-src 'self' https://upload[.]example[.]test",
            ),
          },
        },
      },
    });
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      Prune: true,
      DestinationBucketName: { Ref: Match.stringLikeRegexp('^Web') },
    });
  });
});

describe('Contacts and Inventory data stack', () => {
  it('retains both tables, media, and recovery keys and selects them for backup', () => {
    const stack = new ContactsInventoryDataStack(new App(), 'ContactsInventoryData', {
      webOrigin: 'https://naaseh.example.test',
    });
    const template = Template.fromStack(stack);
    template.resourcePropertiesCountIs(
      'AWS::DynamoDB::Table',
      {
        BillingMode: 'PAY_PER_REQUEST',
        DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      },
      2,
    );
    for (const table of Object.values(template.findResources('AWS::DynamoDB::Table'))) {
      expect(table.DeletionPolicy).toBe('Retain');
    }
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      Properties: {
        VersioningConfiguration: { Status: 'Enabled' },
        CorsConfiguration: {
          CorsRules: [
            Match.objectLike({
              AllowedOrigins: ['https://naaseh.example.test'],
              AllowedMethods: ['PUT'],
            }),
          ],
        },
      },
    });
    template.hasResourceProperties('AWS::Backup::BackupSelection', {
      BackupSelection: {
        Resources: Match.arrayWith([
          { 'Fn::GetAtt': [Match.stringLikeRegexp('^Records'), 'Arn'] },
          { 'Fn::GetAtt': [Match.stringLikeRegexp('^DeletionLedger'), 'Arn'] },
          { 'Fn::GetAtt': [Match.stringLikeRegexp('^Media'), 'Arn'] },
        ]),
      },
    });
  });
});

describe('Contacts and Inventory release stack', () => {
  it('owns only release-scoped routes pinned to an immutable Lambda version', () => {
    const app = new App();
    const webOrigin = 'https://naaseh.example.test';
    const data = new ContactsInventoryDataStack(app, 'ContactsInventoryData', { webOrigin });
    const release = new ContactsInventoryReleaseStack(app, 'ContactsInventoryRelease', {
      data,
      webOrigin,
      releaseId: 'fixture-release-a',
      artifactPath: 'tests/fixtures',
    });
    const template = Template.fromStack(release);
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 0);
    template.resourceCountIs('AWS::DynamoDB::Table', 0);
    template.resourceCountIs('AWS::S3::Bucket', 0);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      ApiId: { Ref: 'HostApiId' },
      AuthorizerId: { Ref: 'HostAuthorizerId' },
      AuthorizationType: 'CUSTOM',
      RouteKey: 'ANY /api/v1/contacts-inventory/releases/fixture-release-a/{proxy+}',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationUri: { Ref: Match.stringLikeRegexp('^FeatureApiCurrentVersion') },
    });
  });
});
