import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import { createCryptoRecoveryFunction } from './crypto-recovery-stack.js';
import { attachAdminRoutes, createAdminFunctions } from './admin-stack.js';
import { attachCollaborationRoutes, createCollaborationFunction } from './collaboration-stack.js';
import { createNotificationResources } from './notification-stack.js';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { createDeletionResources } from './deletion-stack.js';
import { createGoogleSyncResources } from './google-sync-stack.js';
import { withArgon2Bundling } from './native-node-bundling.js';

export const sharedLambdaDefaults = (
  environment: Record<string, string>,
): Pick<nodejs.NodejsFunctionProps, 'runtime' | 'timeout' | 'bundling' | 'environment'> => ({
  runtime: lambda.Runtime.NODEJS_24_X,
  timeout: Duration.seconds(15),
  bundling: { minify: true, sourceMap: true },
  environment,
});

export function createHttpApi(scope: Construct) {
  const accessLogs = new logs.LogGroup(scope, 'ApiAccessLogs', {
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const api = new apigwv2.HttpApi(scope, 'HttpApi', { createDefaultStage: false });
  const stage = new apigwv2.HttpStage(scope, 'DefaultStage', {
    httpApi: api,
    stageName: '$default',
    autoDeploy: true,
    throttle: { burstLimit: 100, rateLimit: 50 },
  });
  const resource = stage.node.defaultChild as apigwv2.CfnStage;
  resource.accessLogSettings = {
    destinationArn: accessLogs.logGroupArn,
    format: JSON.stringify({
      requestId: '$context.requestId',
      routeKey: '$context.routeKey',
      status: '$context.status',
      responseLength: '$context.responseLength',
    }),
  };
  return { api, accessLogs };
}

export function createApplicationApi(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    allowedOrigin: string;
    table: dynamodb.Table;
    pepper: secretsmanager.ISecret;
    dataKey: kms.IKey;
    media: s3.IBucket;
    exportBucket: s3.IBucket;
    exportKey: kms.IKey;
    exportStateMachine: sfn.IStateMachine;
    logGroups: { task: logs.ILogGroup; auth: logs.ILogGroup; sync: logs.ILogGroup };
    recoveryKeyArn: string;
    recoveryWrappingKey: kms.IKey;
    manifestSigningKey: kms.IKey;
    webPushSecret: secretsmanager.ISecret;
    googleOAuthSecret: secretsmanager.ISecret;
    alerts: sns.ITopic;
  },
) {
  const defaults = sharedLambdaDefaults(options.environment);
  const task = new nodejs.NodejsFunction(scope, 'TaskFunction', {
    ...defaults,
    entry: fileURLToPath(new URL('../../apps/api/src/tasks/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    logGroup: options.logGroups.task,
  });
  const auth = new nodejs.NodejsFunction(scope, 'AuthFunction', {
    ...defaults,
    entry: fileURLToPath(new URL('../../apps/api/src/auth/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 1024,
    reservedConcurrentExecutions: 5,
    bundling: withArgon2Bundling(defaults.bundling),
    logGroup: options.logGroups.auth,
  });
  const authCalibration = new nodejs.NodejsFunction(scope, 'Argon2CalibrationFunction', {
    ...defaults,
    entry: fileURLToPath(
      new URL('../../apps/api/src/auth/calibration-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 1024,
    reservedConcurrentExecutions: 1,
    timeout: Duration.minutes(5),
    bundling: withArgon2Bundling(defaults.bundling),
    logGroup: options.logGroups.auth,
  });
  const sync = new nodejs.NodejsFunction(scope, 'SyncFunction', {
    ...defaults,
    entry: fileURLToPath(new URL('../../apps/api/src/sync/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    reservedConcurrentExecutions: 10,
    logGroup: options.logGroups.sync,
  });
  const stackCompactor = new nodejs.NodejsFunction(scope, 'StackCompactorFunction', {
    ...defaults,
    entry: fileURLToPath(new URL('../../apps/api/src/ranking/stack-compactor.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 1024,
    timeout: Duration.minutes(5),
    reservedConcurrentExecutions: 2,
    logGroup: options.logGroups.sync,
  });
  const ranking = new nodejs.NodejsFunction(scope, 'RankingFunction', {
    ...sharedLambdaDefaults({
      ...options.environment,
      STACK_COMPACTOR_FUNCTION_NAME: stackCompactor.functionName,
    }),
    entry: fileURLToPath(new URL('../../apps/api/src/ranking/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    timeout: Duration.seconds(30),
    reservedConcurrentExecutions: 10,
    logGroup: options.logGroups.sync,
  });
  stackCompactor.grantInvoke(ranking);
  sync.addEnvironment('STACK_COMPACTOR_FUNCTION_NAME', stackCompactor.functionName);
  stackCompactor.grantInvoke(sync);
  const contentEnvironment = {
    ...options.environment,
    NAASEH_ATTACHMENT_BUCKET: options.media.bucketName,
    NAASEH_ATTACHMENT_KMS_KEY_ARN: options.dataKey.keyArn,
  };
  const list = new nodejs.NodejsFunction(scope, 'ListFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(new URL('../../apps/api/src/lists/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    logGroup: options.logGroups.task,
  });
  const lifecycle = new nodejs.NodejsFunction(scope, 'LifecycleFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(new URL('../../apps/api/src/lifecycle/handlers.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    logGroup: options.logGroups.task,
  });
  const listCopy = new nodejs.NodejsFunction(scope, 'ListCopyFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(new URL('../../apps/api/src/lists/copy-handlers.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    timeout: Duration.minutes(2),
    logGroup: options.logGroups.task,
  });
  const directory = new nodejs.NodejsFunction(scope, 'DirectoryFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(new URL('../../apps/api/src/directory/handlers.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    logGroup: options.logGroups.task,
  });
  const reporting = new nodejs.NodejsFunction(scope, 'ReportingFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(new URL('../../apps/api/src/reporting/handlers.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    logGroup: options.logGroups.task,
  });
  const attachment = new nodejs.NodejsFunction(scope, 'AttachmentFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(new URL('../../apps/api/src/attachments/handler.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 512,
    logGroup: options.logGroups.task,
  });
  const attachmentScan = new nodejs.NodejsFunction(scope, 'AttachmentScanFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(
      new URL('../../apps/api/src/attachments/scan-result-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 256,
    logGroup: options.logGroups.task,
  });
  const attachmentReconcile = new nodejs.NodejsFunction(scope, 'AttachmentReconciliationFunction', {
    ...sharedLambdaDefaults(contentEnvironment),
    entry: fileURLToPath(
      new URL('../../apps/api/src/attachments/reconciliation-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 256,
    timeout: Duration.minutes(5),
    logGroup: options.logGroups.task,
  });
  const exportCoordinator = new nodejs.NodejsFunction(scope, 'ExportTodosFunction', {
    ...sharedLambdaDefaults({
      ...contentEnvironment,
      NAASEH_EXPORT_BUCKET: options.exportBucket.bucketName,
      NAASEH_EXPORT_KMS_KEY_ARN: options.exportKey.keyArn,
      NAASEH_EXPORT_STATE_MACHINE_ARN: options.exportStateMachine.stateMachineArn,
    }),
    entry: fileURLToPath(
      new URL('../../apps/api/src/exports/coordinator-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 512,
    timeout: Duration.seconds(30),
    logGroup: options.logGroups.sync,
  });
  const deletion = createDeletionResources(scope, {
    environment: contentEnvironment,
    table: options.table,
    media: options.media,
    logGroup: options.logGroups.task,
    alerts: options.alerts,
  });
  const { group } = createCollaborationFunction(scope, {
    environment: { ...options.environment, ALLOWED_ORIGINS: options.allowedOrigin },
    table: options.table,
    pepper: options.pepper,
    logGroup: options.logGroups.task,
  });
  const recovery = createCryptoRecoveryFunction(scope, {
    environment: options.environment,
    table: options.table,
    pepper: options.pepper,
    recoveryKeyArn: options.recoveryKeyArn,
  }).fn;
  const { admin, provisionUser, operatorPolicy, processor, categories, projects } =
    createAdminFunctions(scope, {
      environment: { ...options.environment, ALLOWED_ORIGINS: options.allowedOrigin },
      table: options.table,
      media: options.media,
      passwordPepper: options.pepper,
      deletionConfirmationSecret: deletion.secret,
      logGroup: options.logGroups.auth,
    });
  const notification = createNotificationResources(scope, {
    environment: options.environment,
    table: options.table,
    webPushSecret: options.webPushSecret,
    taskFunction: task,
    logGroup: options.logGroups.task,
  }).fn;
  const googleSync = createGoogleSyncResources(scope, {
    environment: options.environment,
    allowedOrigin: options.allowedOrigin,
    table: options.table,
    dataKey: options.dataKey,
    oauthSecret: options.googleOAuthSecret,
  }).api;
  const authorizerFunction = new nodejs.NodejsFunction(scope, 'AuthorizerFunction', {
    ...defaults,
    entry: fileURLToPath(new URL('../../apps/api/src/auth/authorizer.ts', import.meta.url)),
    handler: 'handler',
    memorySize: 256,
    timeout: Duration.seconds(5),
    bundling: { minify: true },
  });
  const functions = [
    task,
    auth,
    sync,
    ranking,
    stackCompactor,
    authorizerFunction,
    list,
    lifecycle,
    listCopy,
    directory,
    attachment,
    attachmentScan,
    attachmentReconcile,
    exportCoordinator,
    deletion.apiHandler,
  ];
  for (const fn of functions) {
    fn.addEnvironment('ALLOWED_ORIGINS', options.allowedOrigin);
    options.table.grantReadWriteData(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['kms:ScheduleKeyDeletion', 'secretsmanager:DeleteSecret'],
        resources: ['*'],
      }),
    );
  }
  reporting.addEnvironment('ALLOWED_ORIGINS', options.allowedOrigin);
  options.table.grantReadData(reporting);
  reporting.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['dynamodb:PutItem', 'dynamodb:DeleteItem'],
      resources: [options.table.tableArn],
      conditions: { 'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['CURSOR#*'] } },
    }),
  );
  reporting.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['kms:ScheduleKeyDeletion', 'secretsmanager:DeleteSecret'],
      resources: ['*'],
    }),
  );
  // Only the login handler needs the password pepper. Collaboration, recovery,
  // and provisioning receive their grants in their isolated stacks.
  options.pepper.grantRead(auth);
  options.dataKey.grantEncryptDecrypt(task);
  options.dataKey.grantEncryptDecrypt(ranking);
  options.dataKey.grantEncryptDecrypt(stackCompactor);
  options.recoveryWrappingKey.grant(sync, 'kms:GetPublicKey');
  options.manifestSigningKey.grant(sync, 'kms:GetPublicKey', 'kms:Sign');
  options.media.grantReadWrite(task);
  for (const fn of [attachment, attachmentScan, attachmentReconcile, listCopy]) {
    options.media.grantReadWrite(fn, 'attachments/*');
    options.dataKey.grantEncryptDecrypt(fn);
  }
  options.exportBucket.grantReadWrite(exportCoordinator, 'exports/*');
  options.exportKey.grantEncryptDecrypt(exportCoordinator);
  options.exportStateMachine.grantStartExecution(exportCoordinator);
  new events.Rule(scope, 'AttachmentScanResults', {
    eventPattern: {
      source: ['aws.guardduty'],
      detailType: ['GuardDuty Malware Protection Object Scan Result'],
    },
    targets: [new eventTargets.LambdaFunction(attachmentScan)],
  });
  new events.Rule(scope, 'AttachmentReconciliationSchedule', {
    schedule: events.Schedule.rate(Duration.hours(1)),
    targets: [new eventTargets.LambdaFunction(attachmentReconcile)],
  });
  const { api } = createHttpApi(scope);
  const sessionAuthorizer = new authorizers.HttpLambdaAuthorizer(
    'SessionAuthorizer',
    authorizerFunction,
    {
      responseTypes: [authorizers.HttpLambdaResponseType.SIMPLE],
      identitySource: ['$request.header.Cookie'],
      resultsCacheTtl: Duration.seconds(0),
    },
  );
  const integrationsByFunction = new Map<lambda.IFunction, integrations.HttpLambdaIntegration>();
  const integrationFor = (fn: lambda.IFunction) => {
    const existing = integrationsByFunction.get(fn);
    if (existing) return existing;
    const integration = new integrations.HttpLambdaIntegration(`${fn.node.id}Integration`, fn, {
      scopePermissionToRoute: false,
    });
    integrationsByFunction.set(fn, integration);
    return integration;
  };
  const route = (
    _id: string,
    path: string,
    methods: apigwv2.HttpMethod[],
    fn: lambda.IFunction,
    authorize = true,
  ) =>
    api.addRoutes({
      path,
      methods,
      integration: integrationFor(fn),
      ...(authorize ? { authorizer: sessionAuthorizer } : {}),
    });
  route('LoginIntegration', '/api/v1/auth/login', [apigwv2.HttpMethod.POST], auth, false);
  route('SessionIntegration', '/api/v1/auth/session', [apigwv2.HttpMethod.GET], auth, false);
  route('LogoutIntegration', '/api/v1/auth/logout', [apigwv2.HttpMethod.POST], auth, false);
  route(
    'TaskIntegration',
    '/api/v1/tasks',
    [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
    task,
  );
  route(
    'TaskItemIntegration',
    '/api/v1/tasks/{taskId}',
    [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH],
    task,
  );
  route(
    'TaskDeletionPreviewIntegration',
    '/api/v1/tasks/{taskId}/deletion-preview',
    [apigwv2.HttpMethod.GET],
    deletion.apiHandler,
  );
  route(
    'TaskProjectAssignmentIntegration',
    '/api/v1/tasks/{taskId}/project',
    [apigwv2.HttpMethod.PATCH],
    task,
  );
  route(
    'TaskPermanentDeleteIntegration',
    '/api/v1/tasks/{taskId}',
    [apigwv2.HttpMethod.DELETE],
    deletion.apiHandler,
  );
  route(
    'TaskCompletionIntegration',
    '/api/v1/tasks/{taskId}/completion',
    [apigwv2.HttpMethod.POST],
    task,
  );
  route('ArchiveIntegration', '/api/v1/archive', [apigwv2.HttpMethod.GET], lifecycle);
  route(
    'OrganizationTreeIntegration',
    '/api/v1/reporting/organization-tree',
    [apigwv2.HttpMethod.GET],
    reporting,
  );
  route(
    'OrganizationDrilldownIntegration',
    '/api/v1/reporting/organization-tree/drilldown',
    [apigwv2.HttpMethod.GET],
    reporting,
  );
  route(
    'CompletionReportIntegration',
    '/api/v1/reporting/completion-report',
    [apigwv2.HttpMethod.GET],
    reporting,
  );
  route(
    'TaskArchiveIntegration',
    '/api/v1/tasks/{taskId}/archive',
    [apigwv2.HttpMethod.POST],
    lifecycle,
  );
  route(
    'TaskRestoreIntegration',
    '/api/v1/tasks/{taskId}/restore',
    [apigwv2.HttpMethod.POST],
    lifecycle,
  );
  route(
    'TaskCompleteArchiveIntegration',
    '/api/v1/tasks/{taskId}/complete',
    [apigwv2.HttpMethod.POST],
    lifecycle,
  );
  route(
    'TaskRevisionIntegration',
    '/api/v1/tasks/{taskId}/revisions',
    [apigwv2.HttpMethod.GET],
    task,
  );
  route('SyncIntegration', '/api/v1/sync/push', [apigwv2.HttpMethod.POST], sync);
  route('SyncPullIntegration', '/api/v1/sync/pull', [apigwv2.HttpMethod.POST], sync);
  route('SyncBootstrapIntegration', '/api/v1/sync/bootstrap', [apigwv2.HttpMethod.GET], sync);
  route('OverallStackIntegration', '/api/v1/stacks/overall', [apigwv2.HttpMethod.GET], ranking);
  route(
    'OverallStackReorderIntegration',
    '/api/v1/stacks/overall/reorders',
    [apigwv2.HttpMethod.POST],
    ranking,
  );
  route(
    'ProjectStackIntegration',
    '/api/v1/projects/{projectId}/stack',
    [apigwv2.HttpMethod.GET],
    ranking,
  );
  route(
    'ProjectStackReorderIntegration',
    '/api/v1/projects/{projectId}/stack/reorders',
    [apigwv2.HttpMethod.POST],
    ranking,
  );
  route(
    'StackOperationIntegration',
    '/api/v1/stack-operations/{operationId}',
    [apigwv2.HttpMethod.GET],
    ranking,
  );
  route(
    'GoogleSyncStatusIntegration',
    '/api/v1/integrations/google/status',
    [apigwv2.HttpMethod.GET],
    googleSync,
  );
  route(
    'GoogleSyncConnectIntegration',
    '/api/v1/integrations/google/connect',
    [apigwv2.HttpMethod.POST],
    googleSync,
  );
  route(
    'GoogleSyncCallbackIntegration',
    '/api/v1/integrations/google/callback',
    [apigwv2.HttpMethod.GET],
    googleSync,
  );
  route(
    'GoogleTaskListsIntegration',
    '/api/v1/integrations/google/task-lists',
    [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
    googleSync,
  );
  route(
    'GoogleSyncPreviewIntegration',
    '/api/v1/integrations/google/preview',
    [apigwv2.HttpMethod.POST],
    googleSync,
  );
  route(
    'GoogleSyncSettingsIntegration',
    '/api/v1/integrations/google/settings',
    [apigwv2.HttpMethod.PATCH],
    googleSync,
  );
  route(
    'GoogleSyncRunIntegration',
    '/api/v1/integrations/google/sync',
    [apigwv2.HttpMethod.POST],
    googleSync,
  );
  route(
    'GoogleSyncRunStatusIntegration',
    '/api/v1/integrations/google/runs/{runId}',
    [apigwv2.HttpMethod.GET],
    googleSync,
  );
  route(
    'GoogleSyncQuarantineIntegration',
    '/api/v1/integrations/google/quarantine',
    [apigwv2.HttpMethod.GET],
    googleSync,
  );
  route(
    'GoogleSyncQuarantineRetryIntegration',
    '/api/v1/integrations/google/quarantine/{operationId}/retry',
    [apigwv2.HttpMethod.POST],
    googleSync,
  );
  route(
    'GoogleSyncConflictsIntegration',
    '/api/v1/integrations/google/conflicts',
    [apigwv2.HttpMethod.GET],
    googleSync,
  );
  route(
    'GoogleSyncConflictIntegration',
    '/api/v1/integrations/google/conflicts/{conflictId}',
    [apigwv2.HttpMethod.POST],
    googleSync,
  );
  route(
    'GoogleSyncDisconnectPreviewIntegration',
    '/api/v1/integrations/google/disconnect-preview',
    [apigwv2.HttpMethod.GET],
    googleSync,
  );
  route(
    'GoogleSyncDisconnectIntegration',
    '/api/v1/integrations/google/disconnect',
    [apigwv2.HttpMethod.POST],
    googleSync,
  );
  route(
    'GoogleTaskSharingIntegration',
    '/api/v1/tasks/{taskId}/google-sharing',
    [apigwv2.HttpMethod.PUT],
    googleSync,
  );
  route('ListsIntegration', '/api/v1/lists', [apigwv2.HttpMethod.POST], list);
  route(
    'ListFinishIntegration',
    '/api/v1/lists/{listId}/finish',
    [apigwv2.HttpMethod.POST],
    lifecycle,
  );
  route(
    'ListArchiveIntegration',
    '/api/v1/lists/{listId}/archive',
    [apigwv2.HttpMethod.POST],
    lifecycle,
  );
  route(
    'ListRestoreIntegration',
    '/api/v1/lists/{listId}/restore',
    [apigwv2.HttpMethod.POST],
    lifecycle,
  );
  route(
    'ListIntegration',
    '/api/v1/lists/{listId}',
    [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PATCH],
    list,
  );
  route(
    'ListDeletionPreviewIntegration',
    '/api/v1/lists/{listId}/deletion-preview',
    [apigwv2.HttpMethod.GET],
    deletion.apiHandler,
  );
  route(
    'ListProjectAssignmentIntegration',
    '/api/v1/lists/{listId}/project',
    [apigwv2.HttpMethod.PATCH],
    list,
  );
  route(
    'ListPermanentDeleteIntegration',
    '/api/v1/lists/{listId}',
    [apigwv2.HttpMethod.DELETE],
    deletion.apiHandler,
  );
  route(
    'DeletionJobIntegration',
    '/api/v1/deletion-jobs/{jobId}',
    [apigwv2.HttpMethod.GET],
    deletion.apiHandler,
  );
  route('ListItemsIntegration', '/api/v1/lists/{listId}/items', [apigwv2.HttpMethod.POST], list);
  route(
    'ListItemIntegration',
    '/api/v1/lists/{listId}/items/{itemId}',
    [apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE],
    list,
  );
  route(
    'ListCompletionIntegration',
    '/api/v1/lists/{listId}/items/{itemId}/completion',
    [apigwv2.HttpMethod.POST],
    list,
  );
  route(
    'ListResetIntegration',
    '/api/v1/lists/{listId}/items/{itemId}/reset-to-global',
    [apigwv2.HttpMethod.POST],
    list,
  );
  route(
    'ListCopyIntegration',
    '/api/v1/lists/{listId}/copies',
    [apigwv2.HttpMethod.POST],
    listCopy,
  );
  route(
    'ListCopyStatusIntegration',
    '/api/v1/list-copies/{copyId}',
    [apigwv2.HttpMethod.GET],
    listCopy,
  );
  route(
    'DirectoryIntegration',
    '/api/v1/directory-items',
    [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
    directory,
  );
  route(
    'DirectoryItemIntegration',
    '/api/v1/directory-items/{directoryItemId}',
    [apigwv2.HttpMethod.PATCH],
    directory,
  );
  route(
    'AttachmentUploadsIntegration',
    '/api/v1/attachments/uploads',
    [apigwv2.HttpMethod.POST],
    attachment,
  );
  route(
    'AttachmentIntegration',
    '/api/v1/attachments/{attachmentId}',
    [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.DELETE],
    attachment,
  );
  route(
    'AttachmentCompleteIntegration',
    '/api/v1/attachments/{attachmentId}/complete',
    [apigwv2.HttpMethod.POST],
    attachment,
  );
  route(
    'AttachmentRetryIntegration',
    '/api/v1/attachments/{attachmentId}/retry',
    [apigwv2.HttpMethod.POST],
    attachment,
  );
  route(
    'AttachmentDownloadIntegration',
    '/api/v1/attachments/{attachmentId}/download',
    [apigwv2.HttpMethod.GET],
    attachment,
  );
  route('TaskLockIntegration', '/api/v1/tasks/{taskId}/lock', [apigwv2.HttpMethod.POST], task);
  route(
    'PinRecoveryIntegration',
    '/api/v1/tasks/{taskId}/hidden-memo/recovery',
    [apigwv2.HttpMethod.POST],
    recovery,
  );
  route(
    'PushSubscriptionIntegration',
    '/api/v1/push-subscriptions',
    [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
    notification,
  );
  attachCollaborationRoutes(api, sessionAuthorizer, group);
  attachAdminRoutes(api, sessionAuthorizer, { admin, categories, projects });
  return {
    api,
    functions: {
      task,
      auth,
      authCalibration,
      sync,
      ranking,
      stackCompactor,
      group,
      recovery,
      admin,
      provisionUser,
      provisionUserOperatorPolicy: operatorPolicy,
      categories,
      projects,
      processor,
      notification,
      authorizer: authorizerFunction,
      list,
      lifecycle,
      listCopy,
      directory,
      reporting,
      attachment,
      attachmentScan,
      attachmentReconcile,
      exportCoordinator,
      deletion: deletion.apiHandler,
      googleSync,
    },
  };
}
