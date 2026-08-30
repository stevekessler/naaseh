export const crisisPlanSharingInfrastructure = Object.freeze({
  kms: {
    keySpec: 'RSA_3072',
    keyUsage: 'ENCRYPT_DECRYPT',
    encryptionAlgorithm: 'RSAES_OAEP_SHA_256',
    automaticRotation: false,
    alias: 'alias/naaseh/crisis-plan-sharing',
    fixedMonthlyKeyCount: 1,
  },
  broker: {
    compute: 'on-demand-lambda',
    reservedConcurrency: 2,
    bodyTableRead: false,
    logRequestBodies: false,
    cacheControl: 'no-store',
    throttlePerRecipientPerMinute: 10,
  },
  permissions: {
    broker: [
      'kms:Decrypt:crisis-plan-sharing-key',
      'dynamodb:GetItem:crisis-plan-grant-and-share',
      'dynamodb:GetItem:active-user-projection',
      'dynamodb:PutItem:one-use-request-receipt',
    ],
    ordinaryApi: [],
    admin: [],
    recoveryAdmin: [],
    reporting: [],
    export: [],
    notification: [],
  },
  signingRegistry: { signed: true, cacheSeconds: 300, publicOnly: true },
  expectedCost:
    'one RSA-3072 KMS key plus request-scaled KMS decrypt, Lambda, API Gateway, DynamoDB, CloudWatch, and backup usage',
  alwaysOnCapacity: false,
});

export function createCrisisPlanSharingResources(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    manifestSigningKey: kms.IKey;
    apiLogGroup: logs.ILogGroup;
  },
) {
  const sharingKey = new kms.Key(scope, 'CrisisPlanSharingKey', {
    alias: 'alias/naaseh/crisis-plan-sharing',
    description: 'RSA public-key authority for recipient-bound Crisis Plan CPK grants.',
    keySpec: kms.KeySpec.RSA_3072,
    keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
    multiRegion: false,
    removalPolicy: RemovalPolicy.RETAIN,
    pendingWindow: Duration.days(30),
  });
  const brokerLogs = new logs.LogGroup(scope, 'CrisisPlanBrokerLogs', {
    retention: logs.RetentionDays.THREE_MONTHS,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const common = {
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.seconds(15),
    bundling: { minify: true, sourceMap: true },
  } as const;
  const api = new nodejs.NodejsFunction(scope, 'CrisisPlanFunction', {
    ...common,
    entry: fileURLToPath(
      new URL('../../apps/api/src/journal/crisis-plan-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 512,
    logGroup: options.apiLogGroup,
    environment: {
      ...options.environment,
      CRISIS_PLAN_SHARING_KEY_ID: sharingKey.keyArn,
      BACKUP_MANIFEST_SIGNING_KEY_ARN: options.manifestSigningKey.keyArn,
    },
  });
  const broker = new nodejs.NodejsFunction(scope, 'CrisisPlanBrokerFunction', {
    ...common,
    entry: fileURLToPath(
      new URL('../../apps/api/src/journal/crisis-plan-broker-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    memorySize: 512,
    reservedConcurrentExecutions: 2,
    logGroup: brokerLogs,
    environment: {
      ...options.environment,
      CRISIS_PLAN_SHARING_KEY_ID: sharingKey.keyArn,
    },
  });
  options.table.grantReadWriteData(api);
  sharingKey.grant(api, 'kms:GetPublicKey');
  options.manifestSigningKey.grant(api, 'kms:GetPublicKey', 'kms:Sign');
  sharingKey.grantDecrypt(broker);
  broker.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [options.table.tableArn],
      conditions: {
        'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['CRISIS_PLAN#*'] },
        'ForAllValues:StringEquals': { 'dynamodb:Attributes': ['PK', 'SK', 'data'] },
      },
    }),
  );
  broker.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [options.table.tableArn],
      conditions: {
        'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['USER#*'] },
        'ForAllValues:StringEquals': {
          'dynamodb:Attributes': ['PK', 'SK', 'brokerActive'],
        },
      },
    }),
  );
  broker.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [options.table.tableArn],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': ['CRISIS_PLAN_BROKER_REQUEST#*'],
        },
        'ForAllValues:StringEquals': {
          'dynamodb:Attributes': ['PK', 'SK', 'expiresAt', 'data'],
        },
      },
    }),
  );
  for (const fn of [api, broker])
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['kms:ScheduleKeyDeletion', 'kms:DisableKey'],
        resources: ['*'],
      }),
    );
  return { sharingKey, api, broker, brokerLogs };
}
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
