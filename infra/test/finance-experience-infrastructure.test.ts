import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NaasehStack } from '../lib/naaseh-stack.js';

const template = Template.fromStack(
  new NaasehStack(new App(), 'FinanceExperienceInfrastructureTest', {
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

describe('Finance experience serverless infrastructure and worker boundary', () => {
  it('reuses protected media/backups and grants bounded Finance self-dispatch without new always-on resources', () => {
    const functions = template.findResources('AWS::Lambda::Function');
    const finance = Object.entries(functions).find(([id]) =>
      id.startsWith('FinanceApiFunction'),
    )![1];
    expect(finance.Properties).toMatchObject({
      Timeout: 30,
      ReservedConcurrentExecutions: 5,
      RecursiveLoop: 'Allow',
    });
    const policies = Object.entries(template.findResources('AWS::IAM::Policy')).find(([id]) =>
      id.startsWith('FinanceApiFunctionServiceRoleDefaultPolicy'),
    )![1];
    const policy = JSON.stringify(policies);
    expect(policy).toContain('lambda:InvokeFunction');
    expect(policy).toContain('FinanceApiFunction');
    expect(policy).toContain('aws:ResourceTag/NaasehFinanceWorkerBoundary');
    expect(finance.Properties.Tags).toContainEqual({
      Key: 'NaasehFinanceWorkerBoundary',
      Value: 'FinanceExperienceInfrastructureTest/FinanceApiFunction',
    });
    expect(policy).not.toContain('kms:Decrypt');
    expect(policy).not.toContain('secretsmanager:GetSecretValue');
    expect(JSON.stringify(template.findResources('AWS::ApiGatewayV2::Route'))).toContain(
      '/api/v1/finance/receipts/{receiptId}/content',
    );
    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
    for (const routeKey of [
      'GET /api/v1/auth/finance-security',
      'PUT /api/v1/auth/finance-security',
      'PATCH /api/v1/auth/finance-security',
      'POST /api/v1/auth/finance-unlocks',
      'DELETE /api/v1/auth/finance-unlocks/current',
    ]) {
      const route = routes.find((resource) => resource.Properties.RouteKey === routeKey);
      expect(route?.Properties).toMatchObject({ AuthorizationType: 'NONE' });
      expect(JSON.stringify(route?.Properties.Target)).toContain('AuthFunction');
    }
    expect(JSON.stringify(template.findResources('AWS::Backup::BackupPlan'))).toContain(
      'NaasehFinanceReceipts',
    );
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.resourceCountIs('AWS::OpenSearchService::Domain', 0);
    template.resourceCountIs('AWS::RDS::DBInstance', 0);
  });
});
