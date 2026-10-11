import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NaasehStack } from '../lib/naaseh-stack.js';

const template = Template.fromStack(
  new NaasehStack(new App(), 'NativeNotificationInfrastructure', {
    env: { account: '111111111111', region: 'us-west-2' },
    alertEmail: 'alerts@example.com',
    breakGlassRoleArn: 'arn:aws:iam::111111111111:role/break-glass',
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

describe('native notification infrastructure', () => {
  it('reuses the existing notification Lambda, table, schedule role, secret, and task log group', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.resourceCountIs('AWS::SNS::PlatformApplication', 0);
    const functions = Object.entries(template.findResources('AWS::Lambda::Function'));
    const notifications = functions.filter(([id]) => id.startsWith('NotificationFunction'));
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.[1].Properties.Environment.Variables.WEB_PUSH_SECRET_ID).toBeDefined();
  });

  it('adds no SNS mobile push, queue, new notification table, or notification log group', () => {
    template.resourceCountIs('AWS::SQS::Queue', 0);
    expect(
      Object.keys(template.findResources('AWS::DynamoDB::Table')).filter((id) =>
        /notification/i.test(id),
      ),
    ).toEqual([]);
    expect(
      Object.keys(template.findResources('AWS::Logs::LogGroup')).filter((id) =>
        /notification|apns/i.test(id),
      ),
    ).toEqual([]);
  });
});
