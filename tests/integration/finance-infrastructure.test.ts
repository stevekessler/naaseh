import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NaasehStack } from '../../infra/lib/naaseh-stack.js';

const template = Template.fromStack(
  new NaasehStack(new App(), 'FinanceInfrastructureTest', {
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

const resources = template.toJSON().Resources as Record<string, unknown>;
const financeResource = (prefix: string, type: string) =>
  Object.entries(template.findResources(type)).find(([logicalId]) =>
    logicalId.startsWith(prefix),
  )?.[1];

describe('Finance infrastructure boundaries', () => {
  it('reuses the existing on-demand table without database or search services', () => {
    template.resourceCountIs('AWS::RDS::DBInstance', 0);
    template.resourceCountIs('AWS::RDS::DBCluster', 0);
    template.resourceCountIs('AWS::OpenSearchService::Domain', 0);
    template.resourceCountIs('AWS::OpenSearchServerless::Collection', 0);
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', { BillingMode: 'PAY_PER_REQUEST' });
  });

  it('bounds Finance compute and gives each boundary only its required KMS operation', () => {
    expect(
      financeResource('FinanceApiFunction', 'AWS::Lambda::Function')?.Properties,
    ).toMatchObject({
      ReservedConcurrentExecutions: 5,
      Timeout: 30,
    });
    expect(
      financeResource('FinanceImportFunction', 'AWS::Lambda::Function')?.Properties,
    ).toMatchObject({
      ReservedConcurrentExecutions: 1,
      Timeout: 120,
    });

    const apiPolicy = JSON.stringify(
      financeResource('FinanceApiFunctionServiceRoleDefaultPolicy', 'AWS::IAM::Policy'),
    );
    const importPolicy = JSON.stringify(
      financeResource('FinanceImportFunctionServiceRoleDefaultPolicy', 'AWS::IAM::Policy'),
    );
    expect(apiPolicy).toContain('"Action":"kms:Encrypt"');
    expect(apiPolicy).not.toContain('"Action":"kms:Decrypt"');
    expect(importPolicy).toContain('"Action":"kms:Decrypt"');
    expect(importPolicy).not.toContain('"Action":"kms:Encrypt"');
    for (const policy of [apiPolicy, importPolicy]) {
      expect(policy).toContain('kms:EncryptionContext:purpose');
      expect(policy).toContain('naaseh-finance-connection');
    }
  });

  it('includes Finance canonical data in the existing backup and restore boundary', () => {
    const renderedPlan = JSON.stringify(template.findResources('AWS::Backup::BackupPlan'));
    const renderedSelection = JSON.stringify(
      template.findResources('AWS::Backup::BackupSelection'),
    );
    const tableLogicalId = Object.keys(template.findResources('AWS::DynamoDB::Table'))[0];
    expect(renderedPlan).toContain('NaasehFinanceCanonicalData');
    expect(renderedPlan).toContain('included');
    expect(renderedSelection).toContain('CanonicalOperationsAndDurableResources');
    expect(renderedSelection).toContain(tableLogicalId);
  });

  it('reuses retained 30-day logs and emits low-cardinality Finance metrics and alarms', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
    const rendered = JSON.stringify(resources);
    expect(rendered).toContain('Finance synchronization and imports');
    for (const metric of [
      'FinanceImportDispatches',
      'FinanceImportDuration',
      'FinanceCsvCommittedRows',
      'FinanceImportFailures',
      'FinanceDataIntegrityFailures',
      'FinanceAuthorizationDenials',
    ]) {
      expect(rendered).toContain(metric);
    }
    expect(rendered).toContain('FinanceFailureSignalAlarm');
  });
});
