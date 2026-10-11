import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NaasehStack } from '../lib/naaseh-stack.js';

const template = Template.fromStack(
  new NaasehStack(new App(), 'NativeClientInfrastructureTest', {
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

describe('native client infrastructure', () => {
  it('puts compatibility and authenticated telemetry on one request-driven Lambda', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /api/client/compatibility',
      AuthorizationType: 'NONE',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /api/client/telemetry',
      AuthorizationType: 'CUSTOM',
    });
    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
    const nativeRoutes = routes.filter(
      (resource) =>
        String(resource.Properties.RouteKey).startsWith('GET /api/client/') ||
        String(resource.Properties.RouteKey).startsWith('POST /api/client/'),
    );
    expect(nativeRoutes).toHaveLength(2);
    const syncRoute = routes.find(
      (resource) => resource.Properties.RouteKey === 'POST /api/v1/sync/push',
    );
    expect(syncRoute).toBeDefined();
    expect(nativeRoutes[0]?.Properties.Target).toEqual(syncRoute?.Properties.Target);
    expect(nativeRoutes[1]?.Properties.Target).toEqual(syncRoute?.Properties.Target);
  });

  it('creates no telemetry data store, queue, topic, log group, or other managed service', () => {
    const resources = template.toJSON().Resources as Record<
      string,
      { Type: string; Properties?: Record<string, unknown> }
    >;
    const telemetryResources = Object.entries(resources).filter(
      ([logicalId, resource]) =>
        /telemetry/i.test(logicalId) && resource.Type !== 'AWS::ApiGatewayV2::Route',
    );
    expect(telemetryResources).toEqual([]);
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    expect(
      Object.values(template.findResources('AWS::Logs::LogGroup')).some((resource) =>
        /telemetry/i.test(JSON.stringify(resource)),
      ),
    ).toBe(false);
  });
});
