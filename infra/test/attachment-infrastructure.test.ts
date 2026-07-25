import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import { describe, expect, it } from 'vitest';
import { createProfileMediaResources } from '../lib/media-stack.js';
const stack = new Stack(new App(), 'AttachmentControls', {
  env: { account: '111111111111', region: 'us-west-2' },
});
const key = new kms.Key(stack, 'Key');
createProfileMediaResources(stack, {
  primaryKey: key,
  allowedOrigin: 'https://gsd.thepandas.link',
});
const template = Template.fromStack(stack);
describe('attachment infrastructure', () => {
  it('uses KMS, versioning, public block, CORS, lifecycle, GuardDuty, and clean-only reads', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: Match.anyValue(),
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      CorsConfiguration: Match.anyValue(),
      LifecycleConfiguration: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: 'ProfileMediaNoncurrentVersions',
            NoncurrentVersionExpiration: { NoncurrentDays: 7 },
            Prefix: 'profiles/',
            Status: 'Enabled',
          }),
        ]),
      },
    });
    expect(JSON.stringify(template.toJSON())).toContain('BucketKeyEnabled');
    template.resourceCountIs('AWS::GuardDuty::MalwareProtectionPlan', 1);
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Action: 's3:GetObject' })]),
      }),
    });
  });
});
