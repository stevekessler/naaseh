import { Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as notifications from 'aws-cdk-lib/aws-s3-notifications';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export const adminControls = {
  adminRoutes: true,
  privateMedia: true,
  imageProcessing: true,
  authorizationAlarms: true,
} as const;

export function createAdminFunctions(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    media: s3.IBucket;
    passwordPepper: secretsmanager.ISecret;
    logGroup: logs.ILogGroup;
  },
) {
  const common = {
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.seconds(15),
    environment: { ...options.environment, PROFILE_MEDIA_BUCKET: options.media.bucketName },
  } as const;
  const admin = new nodejs.NodejsFunction(scope, 'AdminFunction', {
    ...common,
    entry: fileURLToPath(new URL('../../apps/api/src/admin/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    reservedConcurrentExecutions: 5,
    logGroup: options.logGroup,
    bundling: { minify: true, sourceMap: true, nodeModules: ['@node-rs/argon2'] },
  });
  const provisionUser = new nodejs.NodejsFunction(scope, 'ProvisionUserFunction', {
    ...common,
    entry: fileURLToPath(
      new URL('../../apps/api/src/admin/provision-user-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 1024,
    reservedConcurrentExecutions: 2,
    logGroup: options.logGroup,
    bundling: { minify: true, sourceMap: true, nodeModules: ['@node-rs/argon2'] },
  });
  const processor = new nodejs.NodejsFunction(scope, 'ProfilePictureProcessor', {
    ...common,
    entry: fileURLToPath(
      new URL('../../apps/api/src/admin/profile-picture-processor.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 1024,
    reservedConcurrentExecutions: 2,
    logGroup: options.logGroup,
    bundling: { minify: true, sourceMap: true, nodeModules: ['sharp'] },
  });
  const categories = new nodejs.NodejsFunction(scope, 'CategoryAdminFunction', {
    ...common,
    entry: fileURLToPath(new URL('../../apps/api/src/categories/handlers.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    reservedConcurrentExecutions: 5,
    logGroup: options.logGroup,
    bundling: { minify: true, sourceMap: true },
  });
  options.table.grantReadWriteData(admin);
  provisionUser.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:TransactWriteItems'],
      resources: [options.table.tableArn],
    }),
  );
  options.passwordPepper.grantRead(admin);
  options.passwordPepper.grantRead(provisionUser);
  options.table.grantReadWriteData(processor);
  options.table.grantReadWriteData(categories);
  options.media.grantReadWrite(admin, 'profiles/*');
  options.media.grantReadWrite(processor, 'profiles/*');
  options.media.grantDelete(processor, 'profiles/*');
  for (const fn of [admin, provisionUser, processor, categories])
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['s3:PutBucketPolicy', 's3:PutBucketPublicAccessBlock'],
        resources: [options.media.bucketArn],
      }),
    );
  const operatorPolicy = new iam.ManagedPolicy(scope, 'ProvisionUserOperatorPolicy', {
    description: 'Allows operators to invoke only the Naaseh user-provisioning function.',
    statements: [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [provisionUser.functionArn],
      }),
    ],
  });
  options.media.addEventNotification(
    s3.EventType.OBJECT_CREATED,
    new notifications.LambdaDestination(processor),
    { prefix: 'profiles/', suffix: '' },
  );
  const alarms = [
    new cloudwatch.Alarm(scope, 'AdminFunctionErrors', {
      metric: admin.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }),
    new cloudwatch.Alarm(scope, 'ProvisionUserFailures', {
      metric: new cloudwatch.Metric({
        namespace: 'Naaseh',
        metricName: 'UserProvisionFailures',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }),
    new cloudwatch.Alarm(scope, 'CategoryAdminErrors', {
      metric: categories.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }),
    new cloudwatch.Alarm(scope, 'ProfilePictureProcessingErrors', {
      metric: processor.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }),
  ];
  return { admin, provisionUser, operatorPolicy, processor, categories, alarms };
}

export function attachAdminRoutes(
  api: apigwv2.HttpApi,
  authorizer: apigwv2.IHttpRouteAuthorizer,
  functions: { admin: lambda.IFunction; categories: lambda.IFunction },
) {
  const admin = new integrations.HttpLambdaIntegration('AdminIntegration', functions.admin);
  const categories = new integrations.HttpLambdaIntegration(
    'CategoryAdminIntegration',
    functions.categories,
  );
  for (const [path, methods, integration] of [
    ['/api/v1/admin/users', [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], admin],
    ['/api/v1/admin/users/{userId}', [apigwv2.HttpMethod.PATCH], admin],
    ['/api/v1/admin/profile-pictures/upload', [apigwv2.HttpMethod.POST], admin],
    ['/api/v1/categories', [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], categories],
    [
      '/api/v1/categories/{categoryId}',
      [apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE],
      categories,
    ],
  ] as const)
    api.addRoutes({ path, methods: [...methods], integration, authorizer });
}
