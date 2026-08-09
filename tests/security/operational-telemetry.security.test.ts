import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NaasehStack } from '../../infra/lib/naaseh-stack.js';

const template = Template.fromStack(
  new NaasehStack(new App(), 'TelemetryTest', {
    env: { account: '111111111111', region: 'us-west-2' },
    breakGlassRoleArn: 'arn:aws:iam::111111111111:role/recovery',
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

describe('operational telemetry', () => {
  it.each([
    'SyncConflicts',
    'SyncRetryableFailures',
    'SyncBacklogDepth',
    'WebPushDeliveryFailures',
    'UserProvisionFailures',
    'UserStatusChanges',
    'CategoryAdminChanges',
  ])(
    'keeps the content-free %s metric on the dashboard without a dedicated alarm',
    (metricName) => {
      const dashboard = JSON.stringify(template.findResources('AWS::CloudWatch::Dashboard'));
      const alarms = JSON.stringify(template.findResources('AWS::CloudWatch::Alarm'));
      expect(dashboard).toContain(metricName);
      expect(alarms).not.toContain(metricName);
    },
  );

  it('keeps workflow execution data out of restore logs', () => {
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      LoggingConfiguration: Match.objectLike({ IncludeExecutionData: false }),
    });
    expect(JSON.stringify(template.toJSON())).not.toContain('memoPlaintext');
  });
});
