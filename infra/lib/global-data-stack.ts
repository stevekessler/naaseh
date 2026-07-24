import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import type { Construct } from 'constructs';

export const regionalDataControls = {
  region: 'us-west-2',
  billing: 'PAY_PER_REQUEST',
  pitr: true,
  deletionProtection: true,
} as const;

/** Creates the sole regional data store for the v1 deployment. */
export function createRegionalDataResources(scope: Construct) {
  const key = new kms.Key(scope, 'DataKey', {
    alias: 'alias/naaseh-data',
    description: 'Single-Region encryption key for Naaseh application data.',
    enableKeyRotation: true,
    multiRegion: false,
    removalPolicy: RemovalPolicy.RETAIN,
    pendingWindow: Duration.days(30),
  });
  const table = new dynamodb.Table(scope, 'Data', {
    partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
    sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    deletionProtection: true,
    encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
    encryptionKey: key,
    stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    timeToLiveAttribute: 'expiresAt',
    removalPolicy: RemovalPolicy.RETAIN,
  });
  table.addGlobalSecondaryIndex({
    indexName: 'GSI1',
    partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
    sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
  });
  return { key, table };
}

// Compatibility names keep focused helper imports stable while the physical table is regional.
export const createGlobalDataResources = createRegionalDataResources;
