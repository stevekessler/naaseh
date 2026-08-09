import { Duration, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as notifications from 'aws-cdk-lib/aws-s3-notifications';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import { withArgon2Bundling, withSharpBundling } from './native-node-bundling.js';

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
    dataKey: kms.IKey;
    media: s3.IBucket;
    passwordPepper: secretsmanager.ISecret;
    passwordPepperKey: kms.IKey;
    deletionConfirmationSecret: secretsmanager.ISecret;
    logGroup: logs.ILogGroup;
  },
) {
  const common = {
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.seconds(15),
    environment: {
      ...options.environment,
      PROFILE_MEDIA_BUCKET: options.media.bucketName,
      DELETION_CONFIRMATION_SECRET_ID: options.deletionConfirmationSecret.secretArn,
    },
  } as const;
  const admin = new nodejs.NodejsFunction(scope, 'AdminFunction', {
    ...common,
    entry: fileURLToPath(new URL('../../apps/api/src/admin/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    reservedConcurrentExecutions: 5,
    logGroup: options.logGroup,
    bundling: withArgon2Bundling({ minify: true, sourceMap: true }),
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
    bundling: withArgon2Bundling({ minify: true, sourceMap: true }),
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
    bundling: withSharpBundling({ minify: true, sourceMap: true }),
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
  const projects = new nodejs.NodejsFunction(scope, 'ProjectAdminFunction', {
    ...common,
    entry: fileURLToPath(new URL('../../apps/api/src/projects/handlers.ts', import.meta.url)),
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
      actions: ['dynamodb:GetItem'],
      resources: [options.table.tableArn],
    }),
  );
  provisionUser.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [options.table.tableArn],
      conditions: {
        'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': 'TransactWriteItems',
        },
      },
    }),
  );
  provisionUser.addToRolePolicy(
    new iam.PolicyStatement({
      actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
        'kms:DescribeKey',
      ],
      resources: [options.dataKey.keyArn],
      conditions: {
        StringEquals: {
          'kms:ViaService': `dynamodb.${Stack.of(scope).region}.${Stack.of(scope).urlSuffix}`,
        },
      },
    }),
  );
  options.passwordPepper.grantRead(admin);
  options.passwordPepper.grantRead(provisionUser);
  provisionUser.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: [options.passwordPepperKey.keyArn],
      conditions: {
        StringEquals: {
          'kms:ViaService': `secretsmanager.${Stack.of(scope).region}.${Stack.of(scope).urlSuffix}`,
        },
      },
    }),
  );
  options.deletionConfirmationSecret.grantRead(categories);
  options.deletionConfirmationSecret.grantRead(projects);
  options.table.grantReadWriteData(processor);
  options.table.grantReadWriteData(categories);
  options.table.grantReadWriteData(projects);
  options.media.grantReadWrite(admin, 'profiles/*');
  options.media.grantReadWrite(processor, 'profiles/*');
  options.media.grantDelete(processor, 'profiles/*');
  for (const fn of [admin, provisionUser, processor, categories, projects])
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
  return { admin, provisionUser, operatorPolicy, processor, categories, projects };
}

export function attachAdminRoutes(
  api: apigwv2.HttpApi,
  authorizer: apigwv2.IHttpRouteAuthorizer,
  functions: { admin: lambda.IFunction; categories: lambda.IFunction; projects: lambda.IFunction },
) {
  const admin = new integrations.HttpLambdaIntegration('AdminIntegration', functions.admin, {
    scopePermissionToRoute: false,
  });
  const categories = new integrations.HttpLambdaIntegration(
    'CategoryAdminIntegration',
    functions.categories,
    { scopePermissionToRoute: false },
  );
  const projects = new integrations.HttpLambdaIntegration(
    'ProjectAdminIntegration',
    functions.projects,
    { scopePermissionToRoute: false },
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
    ['/api/v1/projects', [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], projects],
    [
      '/api/v1/projects/{projectId}',
      [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE],
      projects,
    ],
    ['/api/v1/categories/{categoryId}/archive', [apigwv2.HttpMethod.POST], categories],
    ['/api/v1/categories/{categoryId}/restore', [apigwv2.HttpMethod.POST], categories],
    ['/api/v1/categories/{categoryId}/deletion-preview', [apigwv2.HttpMethod.GET], categories],
    ['/api/v1/projects/{projectId}/archive', [apigwv2.HttpMethod.POST], projects],
    ['/api/v1/projects/{projectId}/restore', [apigwv2.HttpMethod.POST], projects],
    ['/api/v1/projects/{projectId}/deletion-preview', [apigwv2.HttpMethod.GET], projects],
  ] as const)
    api.addRoutes({ path, methods: [...methods], integration, authorizer });
}
