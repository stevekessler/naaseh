import { Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';

export const restoreSchedule = {
  source: 'aws.backup',
  status: 'COMPLETED',
  isolated: true,
  cleanupOwner: 'AWS Backup Restore Testing',
  notifyOnFailure: true,
} as const;

/**
 * The AWS Backup restore-testing plan owns the quarterly schedule and the actual restores.
 * This rule starts validation only after AWS reports that an isolated restore completed.
 */
export function createRestoreSchedule(
  scope: Construct,
  stateMachine: sfn.IStateMachine,
  restoreTestingPlanArn: string,
  alerts: sns.ITopic,
) {
  const schedule = new events.Rule(scope, 'CompletedRestoreTestingValidationTrigger', {
    description: 'Validate only completed jobs from the approved AWS Backup restore-testing plan.',
    eventPattern: {
      source: [restoreSchedule.source],
      detailType: ['Restore Job State Change'],
      detail: {
        status: [restoreSchedule.status],
        restoreTestingPlanArn: [restoreTestingPlanArn],
        resourceType: ['DynamoDB', 'S3'],
      },
    },
  });
  schedule.addTarget(
    new targets.SfnStateMachine(stateMachine, {
      retryAttempts: 2,
      maxEventAge: Duration.hours(2),
    }),
  );

  const failures = new events.Rule(scope, 'RestoreWorkflowFailureRule', {
    eventPattern: {
      source: ['aws.states'],
      detailType: ['Step Functions Execution Status Change'],
      detail: {
        status: ['FAILED', 'TIMED_OUT', 'ABORTED'],
        stateMachineArn: [stateMachine.stateMachineArn],
      },
    },
  });
  failures.addTarget(new targets.SnsTopic(alerts));
  const failureAlarm = new cloudwatch.Alarm(scope, 'RestoreWorkflowFailureAlarm', {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Events',
      metricName: 'MatchedEvents',
      dimensionsMap: { RuleName: failures.ruleName },
      statistic: 'Sum',
      period: Duration.minutes(5),
    }),
    threshold: 1,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  failureAlarm.addAlarmAction(new actions.SnsAction(alerts));
  return { schedule, failures, failureAlarm };
}
