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
  const featureMigrationGate = new nodejs.NodejsFunction(
    scope,
    'TaskSecurityFeatureMigrationGateFunction',
    {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: fileURLToPath(
        new URL('../../apps/api/src/migrations/feature-migration-registry.ts', import.meta.url),
      ),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      reservedConcurrentExecutions: 1,
      environment: options.environment,
      logGroup: options.logGroup,
      bundling: { minify: true, sourceMap: true },
    },
  );
  const extraLowInventory = new nodejs.NodejsFunction(scope, 'ExtraLowInventoryFunction', {
    runtime: lambda.Runtime.NODEJS_24_X,
    entry: fileURLToPath(
      new URL('../../apps/api/src/projects/extra-low-inventory-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    timeout: Duration.minutes(15),
    memorySize: 512,
    reservedConcurrentExecutions: 1,
    environment: options.environment,
    logGroup: options.logGroup,
    bundling: { minify: true, sourceMap: true },
  });
  options.table.grantReadData(extraLowInventory);
  new CfnOutput(scope, 'ArchiveProjectMigrationFunctionName', { value: fn.functionName });
  new CfnOutput(scope, 'TaskSecurityFeatureMigrationGateFunctionName', {
    value: featureMigrationGate.functionName,
  });
  new CfnOutput(scope, 'ExtraLowInventoryFunctionName', {
    value: extraLowInventory.functionName,
  });
  return { fn, featureMigrationGate, extraLowInventory };
}
