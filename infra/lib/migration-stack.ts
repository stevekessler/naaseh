import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export function createArchiveProjectMigration(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    logGroup: logs.ILogGroup;
  },
) {
  const fn = new nodejs.NodejsFunction(scope, 'ArchiveProjectMigrationFunction', {
    runtime: lambda.Runtime.NODEJS_24_X,
    entry: fileURLToPath(
      new URL('../../apps/api/src/projects/migration-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    timeout: Duration.minutes(15),
    memorySize: 512,
    reservedConcurrentExecutions: 1,
    environment: options.environment,
    logGroup: options.logGroup,
    bundling: { minify: true, sourceMap: true },
  });
  options.table.grantReadWriteData(fn);
  new CfnOutput(scope, 'ArchiveProjectMigrationFunctionName', { value: fn.functionName });
  return { fn };
}
