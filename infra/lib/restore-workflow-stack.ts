import { Arn, ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export const restoreStates = [
  'ValidateRestoreJob',
  'ValidateRestoredResource',
  'RecordEvidence',
] as const;

export type RestoreState = (typeof restoreStates)[number];
export const restoreFailureStates = ['RecordFailure', 'NotifyFailure'] as const;

export type RestoreExecution = {
  status: 'SUCCEEDED' | 'FAILED';
  executed: Array<RestoreState | (typeof restoreFailureStates)[number]>;
  failedAt?: RestoreState;
};

/** Pure routing model kept in lockstep with the deployed validation state machine. */
export function executeRestoreWorkflow(failAt?: RestoreState): RestoreExecution {
  const executed: RestoreExecution['executed'] = [];
  for (const state of restoreStates) {
    executed.push(state);
    if (state === failAt) {
      executed.push('RecordFailure', 'NotifyFailure');
      return { status: 'FAILED', executed, failedAt: state };
    }
  }
  return { status: 'SUCCEEDED', executed };
}

/**
 * AWS Backup Restore Testing performs the actual isolated restore and cleanup. This workflow
 * is invoked by the completed-job event, verifies that exact isolated resource, and reports
 * SUCCESSFUL/FAILED through PutRestoreValidationResult before AWS Backup removes it.
 */
export function createRestoreWorkflow(
  scope: Construct,
  options: {
    restoreTestingPlanArn: string;
    manifestSigningKey: kms.IKey;
    recoveryWrappingKey: kms.IKey;
    logGroup: logs.ILogGroup;
  },
) {
  const stack = Stack.of(scope);
  const entry = fileURLToPath(
    new URL('../../apps/api/src/crypto-recovery/restore-testing-validator.ts', import.meta.url),
  );
  const validator = new nodejs.NodejsFunction(scope, 'RestoreTestingValidator', {
    entry,
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.minutes(15),
    memorySize: 512,
    reservedConcurrentExecutions: 1,
    logGroup: options.logGroup,
    environment: {
      RESTORE_TESTING_PLAN_ARN: options.restoreTestingPlanArn,
      MANIFEST_SIGNING_KEY_ARN: options.manifestSigningKey.keyArn,
      RECOVERY_MEMO_WRAPPING_KEY_ARN: options.recoveryWrappingKey.keyArn,
    },
    bundling: { minify: true, sourceMap: true },
  });
  options.manifestSigningKey.grantVerify(validator);
  options.recoveryWrappingKey.grantDecrypt(validator);

  validator.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['backup:DescribeRestoreJob', 'backup:PutRestoreValidationResult'],
      resources: ['*'],
    }),
  );
  validator.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['dynamodb:DescribeTable', 'dynamodb:Scan'],
      resources: [
        Arn.format(
          {
            service: 'dynamodb',
            resource: 'table',
            resourceName: 'awsbackup-restore-test*',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          },
          stack,
        ),
      ],
    }),
  );
  validator.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['s3:ListBucket', 's3:ListBucketVersions'],
      resources: ['arn:aws:s3:::awsbackup-restore-test*'],
    }),
  );

  const invoke = (id: string, action: RestoreState, resultPath: string) =>
    new tasks.LambdaInvoke(scope, id, {
      lambdaFunction: validator,
      payload: sfn.TaskInput.fromObject({ action, 'input.$': '$' }),
      payloadResponseOnly: true,
      resultPath,
      retryOnServiceExceptions: true,
    });
  const validateJob = invoke('ValidateRestoreJob', 'ValidateRestoreJob', '$.job');
  const validateResource = invoke(
    'ValidateRestoredResource',
    'ValidateRestoredResource',
    '$.resourceValidation',
  );
  const recordEvidence = invoke('RecordEvidence', 'RecordEvidence', '$.validationResult');
  const recordFailure = new tasks.LambdaInvoke(scope, 'RecordFailure', {
    lambdaFunction: validator,
    payload: sfn.TaskInput.fromObject({ action: 'RecordFailure', 'input.$': '$' }),
    payloadResponseOnly: true,
    resultPath: '$.validationResult',
    retryOnServiceExceptions: true,
  });
  const notifyFailure = new sfn.Fail(scope, 'NotifyFailure', {
    cause: 'AWS Backup restore testing validation failed; failure evidence was recorded.',
    error: 'NaasehRestoreValidationFailed',
  });
  recordFailure.next(notifyFailure);
  for (const task of [validateJob, validateResource, recordEvidence])
    task.addCatch(recordFailure, { resultPath: '$.failure' });

  const definition = sfn.Chain.start(validateJob)
    .next(validateResource)
    .next(recordEvidence)
    .next(new sfn.Succeed(scope, 'RestoreValidationSucceeded'));
  const stateMachine = new sfn.StateMachine(scope, 'IsolatedRestoreStateMachine', {
    definitionBody: sfn.DefinitionBody.fromChainable(definition),
    timeout: Duration.hours(4),
    tracingEnabled: true,
    logs: {
      destination: options.logGroup,
      level: sfn.LogLevel.ERROR,
      includeExecutionData: false,
    },
  });
  return { stateMachine, validator };
}
