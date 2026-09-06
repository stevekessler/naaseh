import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { describe, expect, it } from 'vitest';
import {
  createCrisisPlanSharingResources,
  crisisPlanSharingInfrastructure,
} from '../lib/crisis-plan-sharing-stack.js';

const stack = new Stack(new App(), 'CrisisPlanResources');
const table = new dynamodb.Table(stack, 'Data', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
});
const signingKey = new kms.Key(stack, 'SigningKey', {
  keySpec: kms.KeySpec.RSA_3072,
  keyUsage: kms.KeyUsage.SIGN_VERIFY,
});
const apiLogGroup = new logs.LogGroup(stack, 'ApiLogs');
createCrisisPlanSharingResources(stack, {
  environment: { NAASEH_TABLE: table.tableName },
  table,
  manifestSigningKey: signingKey,
  apiLogGroup,
});
const template = Template.fromStack(stack);

describe('Crisis Plan sharing infrastructure', () => {
  it('separates the RSA-3072 broker key and adds no always-on capacity', () => {
    expect(crisisPlanSharingInfrastructure.kms).toMatchObject({
      keySpec: 'RSA_3072',
      keyUsage: 'ENCRYPT_DECRYPT',
    });
    expect(crisisPlanSharingInfrastructure.broker).toMatchObject({
      bodyTableRead: false,
      logRequestBodies: false,
    });
    expect(crisisPlanSharingInfrastructure.permissions.broker).toContain(
      'kms:Decrypt:crisis-plan-sharing-key',
    );
    for (const role of [
      'ordinaryApi',
      'admin',
      'recoveryAdmin',
      'reporting',
      'export',
      'notification',
    ] as const)
      expect(crisisPlanSharingInfrastructure.permissions[role]).not.toContain(
        'kms:Decrypt:crisis-plan-sharing-key',
      );
    expect(crisisPlanSharingInfrastructure.alwaysOnCapacity).toBe(false);
  });

  it('synthesizes the KMS key, isolated broker, retained logs, and least-privilege grants', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.hasResourceProperties('AWS::KMS::Key', {
      KeySpec: 'RSA_3072',
      KeyUsage: 'ENCRYPT_DECRYPT',
      EnableKeyRotation: Match.absent(),
    });
    template.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/naaseh/crisis-plan-sharing',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 2,
      Environment: {
        Variables: Match.objectLike({ CRISIS_PLAN_SHARING_KEY_ID: Match.anyValue() }),
      },
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 90,
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:GetItem',
            Condition: {
              'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['USER#*'] },
              'ForAllValues:StringEquals': {
                'dynamodb:Attributes': ['PK', 'SK', 'brokerActive'],
              },
            },
          }),
          Match.objectLike({
            Action: 'dynamodb:PutItem',
            Condition: {
              'ForAllValues:StringLike': {
                'dynamodb:LeadingKeys': ['CRISIS_PLAN_BROKER_REQUEST#*'],
              },
              'ForAllValues:StringEquals': {
                'dynamodb:Attributes': ['PK', 'SK', 'expiresAt', 'data'],
              },
            },
          }),
        ]),
      },
    });
  });
});
