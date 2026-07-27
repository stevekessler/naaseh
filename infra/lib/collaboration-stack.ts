import { Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export const collaborationControls = {
  joinBurst: 5,
  joinRatePerMinute: 10,
  leastPrivilege: true,
  authorizationAlarms: true,
} as const;

export function createCollaborationFunction(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    pepper: secretsmanager.ISecret;
    logGroup: logs.ILogGroup;
  },
) {
  const group = new nodejs.NodejsFunction(scope, 'GroupFunction', {
    entry: fileURLToPath(new URL('../../apps/api/src/groups/handlers.ts', import.meta.url)),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.seconds(15),
    memorySize: 1024,
    reservedConcurrentExecutions: collaborationControls.joinBurst,
    logGroup: options.logGroup,
    environment: options.environment,
    bundling: { minify: true, sourceMap: true, nodeModules: ['@node-rs/argon2'] },
  });
  options.table.grantReadWriteData(group);
  options.pepper.grantRead(group);
  group.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['kms:ScheduleKeyDeletion', 'secretsmanager:DeleteSecret'],
      resources: ['*'],
    }),
  );
  return { group };
}

export function attachCollaborationRoutes(
  api: apigwv2.HttpApi,
  authorizer: apigwv2.IHttpRouteAuthorizer,
  group: lambda.IFunction,
) {
  const integration = new integrations.HttpLambdaIntegration('GroupIntegration', group, {
    scopePermissionToRoute: false,
  });
  for (const [path, methods] of [
    ['/api/v1/groups', [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST]],
    ['/api/v1/groups/{groupId}', [apigwv2.HttpMethod.GET]],
    ['/api/v1/groups/{groupId}/join', [apigwv2.HttpMethod.POST]],
    ['/api/v1/groups/{groupId}/members/{userId}', [apigwv2.HttpMethod.DELETE]],
  ] as const)
    api.addRoutes({
      path,
      methods: [...methods],
      integration,
      authorizer,
    });
}
