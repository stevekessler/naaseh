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
    const media = Object.entries(template.findResources('AWS::S3::Bucket')).find(([id]) =>
      id.startsWith('Media'),
    )?.[1];
    expect(media).toBeDefined();
    expect(media!.Properties.VersioningConfiguration).toEqual({ Status: 'Enabled' });
    expect(media!.Properties.IntelligentTieringConfigurations).toBeUndefined();
    for (const rule of media!.Properties.LifecycleConfiguration?.Rules ?? []) {
      expect(rule.Transitions).toBeUndefined();
      expect(rule.NoncurrentVersionTransitions).toBeUndefined();
    }
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
    const financeStatements = policies.Properties.PolicyDocument.Statement as {
      Action: string | string[];
      Condition?: { StringEquals?: Record<string, unknown> };
    }[];
    const decrypt = financeStatements.filter(({ Action }) =>
      [Action].flat().includes('kms:Decrypt'),
    );
    expect(decrypt).toHaveLength(1);
    expect(decrypt[0]?.Condition?.StringEquals).toEqual({
      'kms:ViaService': { 'Fn::Join': ['', ['s3.us-west-2.', { Ref: 'AWS::URLSuffix' }]] },
      'kms:EncryptionContext:aws:s3:arn': {
        'Fn::GetAtt': [expect.stringMatching(/^Media/u), 'Arn'],
      },
    });
    expect(policy).not.toContain('secretsmanager:GetSecretValue');
    expect(policy).toContain('events:PutEvents');
    expect(policy).toContain('event-bus/default');
    expect(policy).toContain('events:source');
    expect(policy).toContain('FinancePublicationRequested');
    expect(finance.Properties.Environment.Variables.NAASEH_FINANCE_PUBLICATION_EVENT_BUS).toBe(
      'default',
    );
    const importer = Object.entries(functions).find(([id]) =>
      id.startsWith('FinanceImportFunction'),
    )![1];
    expect(importer.Properties.Environment.Variables.NAASEH_FINANCE_PUBLICATION_EVENT_BUS).toBe(
      'default',
    );
    const sync = Object.entries(functions).find(([id]) => id.startsWith('SyncFunction'))![1];
    expect(sync.Properties.Environment.Variables.NAASEH_FINANCE_PUBLICATION_EVENT_BUS).toBe(
      'default',
    );
    const syncPolicy = Object.entries(template.findResources('AWS::IAM::Policy')).find(([id]) =>
      id.startsWith('SyncFunctionServiceRoleDefaultPolicy'),
    )![1];
    const syncStatements = syncPolicy.Properties.PolicyDocument.Statement;
    const syncSignal = syncStatements.find((statement: { Action: string | string[] }) =>
      [statement.Action].flat().includes('events:PutEvents'),
    );
    expect(syncSignal).toBeDefined();
    expect(JSON.stringify(syncSignal.Resource)).toContain('event-bus/default');
    expect(syncSignal.Condition.StringEquals).toEqual({
      'events:source': 'naaseh.finance.publication',
      'events:detail-type': 'FinancePublicationRequested',
    });
    const publicationRule = Object.entries(template.findResources('AWS::Events::Rule')).find(
      ([id]) => id.startsWith('FinancePublicationRequested'),
    )![1];
    expect(publicationRule.Properties.EventPattern).toMatchObject({
      source: ['naaseh.finance.publication'],
      'detail-type': ['FinancePublicationRequested'],
    });
    expect(JSON.stringify(publicationRule.Properties.Targets)).toContain(
      'naaseh.finance.publication-signal',
    );
    expect(JSON.stringify(publicationRule.Properties.Targets)).toContain('$.detail');
    expect(JSON.stringify(publicationRule.Properties.Targets)).toContain('$.source');
    expect(publicationRule.Properties.ScheduleExpression).toBe('rate(5 minutes)');
    const publicationRuleId = Object.entries(template.findResources('AWS::Events::Rule')).find(
      ([id]) => id.startsWith('FinancePublicationRequested'),
    )![0];
    expect(
      Object.values(template.findResources('AWS::Lambda::Permission')).some(
        (resource) =>
          resource.Properties.Principal === 'events.amazonaws.com' &&
          JSON.stringify(resource.Properties.SourceArn) ===
            JSON.stringify({ 'Fn::GetAtt': [publicationRuleId, 'Arn'] }),
      ),
    ).toBe(true);
    template.resourceCountIs('AWS::Events::EventBus', 0);
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
