import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { describe, expect, it } from 'vitest';
import { createExportResources } from '../lib/export-stack.js';

const stack = new Stack(new App(), 'ExportControls', {
  env: { account: '111111111111', region: 'us-west-2' },
});
const table = new dynamodb.Table(stack, 'Table', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
});
createExportResources(stack, { table, allowedOrigin: 'https://tasks.example.com' });
const template = Template.fromStack(stack);

describe('export infrastructure', () => {
  it('isolates KMS staging, blocks public access, expires data, and coordinates an exact snapshot', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.anyValue(),
      LifecycleConfiguration: Match.anyValue(),
      CorsConfiguration: {
        CorsRules: [
          Match.objectLike({
            AllowedMethods: ['GET'],
            AllowedOrigins: ['https://tasks.example.com'],
          }),
        ],
      },
    });
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
    expect(JSON.stringify(template.toJSON())).toContain('ExportTime');
  });
});
