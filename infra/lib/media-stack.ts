import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct, IDependable } from 'constructs';

export const mediaControls = {
  private: true,
  versioned: true,
  replicated: false,
  backedUp: true,
} as const;

export function createProfileMediaResources(
  scope: Construct,
  options: { primaryKey: kms.IKey; allowedOrigin: string },
) {
  const media = new s3.Bucket(scope, 'Media', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    encryption: s3.BucketEncryption.KMS,
    encryptionKey: options.primaryKey,
    versioned: true,
    bucketKeyEnabled: true,
    cors: [
      {
        allowedOrigins: [options.allowedOrigin],
        allowedMethods: [s3.HttpMethods.PUT],
        allowedHeaders: [
          'content-type',
          'x-amz-checksum-sha256',
          'x-amz-server-side-encryption',
          'x-amz-server-side-encryption-aws-kms-key-id',
        ],
        exposedHeaders: ['etag', 'x-amz-version-id'],
        maxAge: 300,
      },
    ],
    lifecycleRules: [
      {
        id: 'AttachmentIncompleteUploads',
        prefix: 'attachments/',
        abortIncompleteMultipartUploadAfter: Duration.days(1),
        noncurrentVersionExpiration: Duration.days(30),
      },
      {
        id: 'RejectedAttachments',
        prefix: 'attachments/',
        tagFilters: { GuardDutyMalwareScanStatus: 'THREATS_FOUND' },
        expiration: Duration.days(1),
      },
      {
        id: 'ProfileMediaNoncurrentVersions',
        prefix: 'profiles/',
        // Deleting an uploaded original from a versioned bucket creates a delete
        // marker. Bound retention of that untrusted, user-supplied version.
        noncurrentVersionExpiration: Duration.days(7),
        abortIncompleteMultipartUploadAfter: Duration.days(1),
      },
    ],
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const malwareRole = new iam.Role(scope, 'AttachmentMalwareProtectionRole', {
    assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com'),
  });
  const managedRuleArn = Stack.of(scope).formatArn({
    service: 'events',
    resource: 'rule',
    resourceName: 'DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*',
  });
  const malwarePolicyDependencies: IDependable[] = [];
  for (const statement of [
    new iam.PolicyStatement({
      actions: ['events:PutRule', 'events:DeleteRule', 'events:PutTargets', 'events:RemoveTargets'],
      resources: [managedRuleArn],
      conditions: {
        StringLike: {
          'events:ManagedBy': 'malware-protection-plan.guardduty.amazonaws.com',
        },
      },
    }),
    new iam.PolicyStatement({
      actions: ['events:DescribeRule', 'events:ListTargetsByRule'],
      resources: [managedRuleArn],
    }),
    new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetObjectVersionTagging',
        's3:PutObjectVersionTagging',
      ],
      resources: [media.arnForObjects('attachments/*')],
    }),
    new iam.PolicyStatement({
      actions: ['s3:GetBucketNotification', 's3:PutBucketNotification', 's3:ListBucket'],
      resources: [media.bucketArn],
    }),
    new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [media.arnForObjects('malware-protection-resource-validation-object')],
    }),
  ]) {
    const { policyDependable } = malwareRole.addToPrincipalPolicy(statement);
    if (policyDependable) malwarePolicyDependencies.push(policyDependable);
  }
  const kmsGrant = options.primaryKey.grant(malwareRole, 'kms:Decrypt', 'kms:GenerateDataKey');
  const malwarePlan = new guardduty.CfnMalwareProtectionPlan(
    scope,
    'AttachmentMalwareProtectionPlan',
    {
      role: malwareRole.roleArn,
      protectedResource: {
        s3Bucket: { bucketName: media.bucketName, objectPrefixes: ['attachments/'] },
      },
      actions: { tagging: { status: 'ENABLED' } },
    },
  );
  // GuardDuty validates the role while creating the plan. Make CloudFormation wait for both the
  // complete S3/EventBridge policy and the KMS grant instead of racing IAM propagation.
  for (const policyDependable of malwarePolicyDependencies) {
    malwarePlan.node.addDependency(policyDependable);
  }
  kmsGrant.applyBefore(malwarePlan);
  media.addToResourcePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:GetObject'],
      resources: [media.arnForObjects('attachments/*')],
      conditions: {
        StringNotEquals: { 's3:ExistingObjectTag/GuardDutyMalwareScanStatus': 'NO_THREATS_FOUND' },
        ArnNotEquals: { 'aws:PrincipalArn': malwareRole.roleArn },
      },
    }),
  );
  return { media, malwareRole };
}
