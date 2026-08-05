import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { NaasehStack } from '../lib/naaseh-stack.js';

let template: Template;

beforeAll(() => {
  template = Template.fromStack(
    new NaasehStack(new App(), 'UrgencyRestoreWorkflow', {
      env: { account: '111111111111', region: 'us-west-2' },
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

describe('urgency and stack restore workflow infrastructure', () => {
  it('backs up canonical operations and marks snapshots as rebuildable', () => {
    template.hasResourceProperties('AWS::Backup::BackupPlan', {
      BackupPlan: {
        BackupPlanRule: Match.arrayWith([
          Match.objectLike({
            RecoveryPointTags: {
              NaasehPersonalStackCanonicalOperations: 'included',
              NaasehPersonalStackSnapshots: 'rebuildable',
            },
          }),
        ]),
      },
    });
  });

  it('requires canonical operations, urgency history, and total reconciliation', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 900,
      MemorySize: 512,
      ReservedConcurrentExecutions: 1,
      Environment: {
        Variables: Match.objectLike({
          PERSONAL_STACK_CANONICAL_OPERATIONS_REQUIRED: 'true',
          PERSONAL_STACK_SNAPSHOTS_REBUILDABLE: 'true',
          PERSONAL_STACK_CORRUPT_SCOPE_POLICY: 'fail-closed',
          URGENCY_FIELDS_REQUIRED: 'true',
          COMPLETION_URGENCY_SNAPSHOTS_REQUIRED: 'true',
          URGENCY_TOTALS_RECONCILIATION_REQUIRED: 'true',
        }),
      },
    });
  });

  it('limits validation to isolated restore resources and records pass/fail evidence', () => {
    const rendered = JSON.stringify(template.toJSON());
    expect(rendered).toContain('awsbackup-restore-test*');
    expect(rendered).toContain('backup:DescribeRestoreJob');
    expect(rendered).toContain('backup:PutRestoreValidationResult');
    expect(rendered).toContain('dynamodb:DescribeTable');
    expect(rendered).toContain('dynamodb:Scan');
    expect(rendered).toContain('ValidateRestoreJob');
    expect(rendered).toContain('ValidateRestoredResource');
    expect(rendered).toContain('RecordEvidence');
    expect(rendered).toContain('RecordFailure');
    expect(rendered).toContain('NotifyFailure');
  });

  it('keeps restore execution encrypted, traced, time-bounded, and free of payload logs', () => {
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      TracingConfiguration: { Enabled: true },
      LoggingConfiguration: Match.objectLike({
        IncludeExecutionData: false,
        Level: 'ERROR',
      }),
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 90,
      KmsKeyId: Match.anyValue(),
    });
  });
});
