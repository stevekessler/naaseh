import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { backupControls } from './backup-stack.js';

export class ContactsInventoryDataStack extends Stack {
  readonly records: dynamodb.Table;
  readonly deletionLedger: dynamodb.Table;
  readonly media: s3.Bucket;

  constructor(scope: Construct, id: string, props: StackProps & { webOrigin: string }) {
    super(scope, id, { ...props, terminationProtection: true });
    const webOrigin = new URL(props.webOrigin);
    if (webOrigin.protocol !== 'https:' || webOrigin.origin !== props.webOrigin)
      throw new Error('Configure an exact HTTPS origin for Contacts and Inventory uploads.');

    const key = new kms.Key(this, 'DataEncryption', {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const tableProps = {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: key,
    };
    this.records = new dynamodb.Table(this, 'Records', tableProps);
    this.deletionLedger = new dynamodb.Table(this, 'DeletionLedger', tableProps);
    this.media = new s3.Bucket(this, 'Media', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      versioned: true,
      eventBridgeEnabled: true,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedOrigins: [webOrigin.origin],
          allowedMethods: [s3.HttpMethods.PUT],
          allowedHeaders: ['content-type', 'x-amz-*'],
          exposedHeaders: ['etag', 'x-amz-version-id'],
          maxAge: 300,
        },
      ],
    });
    const backupVault = new backup.BackupVault(this, 'BackupVault', {
      encryptionKey: key,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const backupPlan = new backup.BackupPlan(this, 'DailyBackup', {
      backupPlanRules: [
        new backup.BackupPlanRule({
          backupVault,
          scheduleExpression: events.Schedule.cron({ minute: '0', hour: '5' }),
          deleteAfter: Duration.days(backupControls.vaultLockDays),
          recoveryPointTags: { NaasehFeature: 'contacts-inventory' },
        }),
      ],
    });
    const selection = backupPlan.addSelection('RecordsLedgerAndMedia', {
      resources: [
        backup.BackupResource.fromDynamoDbTable(this.records),
        backup.BackupResource.fromDynamoDbTable(this.deletionLedger),
        backup.BackupResource.fromArn(this.media.bucketArn),
      ],
    });
    const backupRole = selection.grantPrincipal;
    if (!iam.Role.isRole(backupRole)) throw new Error('A dedicated backup role is required.');
    backupRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSBackupServiceRolePolicyForS3Backup'),
    );
    key.grantEncryptDecrypt(backupRole);
    new CfnOutput(this, 'MediaUploadOrigin', {
      value: `https://${this.media.bucketRegionalDomainName}`,
    });
  }
  grantRuntimeAccess(role: iam.IRole) {
    this.records.grantReadWriteData(role);
    // The serving role can append deletion history without permission to delete entries.
    this.deletionLedger.grant(role, 'dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query');
    this.media.grantPut(role, 'candidates/*');
    this.media.grantRead(role, 'candidates/*');
  }
}
