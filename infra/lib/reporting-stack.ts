import { Duration } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export function createReportingReconciliation(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    logGroup: logs.ILogGroup;
  },
) {
  const fn = new nodejs.NodejsFunction(scope, 'WorkloadProjectionReconciliationFunction', {
    runtime: lambda.Runtime.NODEJS_24_X,
    entry: fileURLToPath(
      new URL('../../apps/api/src/reporting/projection-reconciliation-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    timeout: Duration.minutes(5),
    memorySize: 512,
    environment: options.environment,
    logGroup: options.logGroup,
    bundling: { minify: true, sourceMap: true },
  });
  options.table.grantReadWriteData(fn);
  new events.Rule(scope, 'WorkloadProjectionReconciliationSchedule', {
    schedule: events.Schedule.rate(Duration.hours(1)),
    targets: [new targets.LambdaFunction(fn)],
  });
  return { fn };
}
