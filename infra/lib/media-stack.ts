import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

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
    ],
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const malwareRole = new iam.Role(scope, 'AttachmentMalwareProtectionRole', {
    assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com'),
  });
  media.grantReadWrite(malwareRole, 'attachments/*');
  options.primaryKey.grantEncryptDecrypt(malwareRole);
  malwareRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:ListBucket',
        's3:GetBucketNotification',
        's3:PutBucketNotification',
      ],
      resources: [media.bucketArn, media.arnForObjects('attachments/*')],
    }),
  );
  new guardduty.CfnMalwareProtectionPlan(scope, 'AttachmentMalwareProtectionPlan', {
    role: malwareRole.roleArn,
    protectedResource: {
      s3Bucket: { bucketName: media.bucketName, objectPrefixes: ['attachments/'] },
    },
    actions: { tagging: { status: 'ENABLED' } },
  });
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
