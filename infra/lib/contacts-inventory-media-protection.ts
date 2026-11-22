import { Stack } from 'aws-cdk-lib';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as kms from 'aws-cdk-lib/aws-kms';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct, IDependable } from 'constructs';

export function protectInventoryMedia(scope: Construct, bucket: s3.IBucket, key: kms.IKey) {
  const malwareRole = new iam.Role(scope, 'InventoryMalwareProtectionRole', {
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
      resources: [bucket.arnForObjects('candidates/*')],
    }),
    new iam.PolicyStatement({
      actions: ['s3:GetBucketNotification', 's3:PutBucketNotification', 's3:ListBucket'],
      resources: [bucket.bucketArn],
    }),
    new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [bucket.arnForObjects('malware-protection-resource-validation-object')],
    }),
  ]) {
    const { policyDependable } = malwareRole.addToPrincipalPolicy(statement);
    if (policyDependable) malwarePolicyDependencies.push(policyDependable);
  }
  const kmsGrant = key.grant(malwareRole, 'kms:Decrypt', 'kms:GenerateDataKey');
  const malwarePlan = new guardduty.CfnMalwareProtectionPlan(
    scope,
    'InventoryMalwareProtectionPlan',
    {
      role: malwareRole.roleArn,
      protectedResource: {
        s3Bucket: { bucketName: bucket.bucketName, objectPrefixes: ['candidates/'] },
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
}
