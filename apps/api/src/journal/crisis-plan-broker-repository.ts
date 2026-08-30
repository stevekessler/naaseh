import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import type { CrisisPlanShare } from '@naaseh/domain';
import type { BrokerBinding } from './crisis-plan-key-broker-handler.js';

type DocumentClient = { send(command: unknown): Promise<Record<string, any>> };

/** Broker-only storage surface: one authorization bit and opaque replay receipts. */
export class DynamoCrisisPlanBrokerRepository {
  constructor(
    private readonly client: DocumentClient = dynamodb as unknown as DocumentClient,
    private readonly table = tableName,
  ) {}

  async isRecipientActive(recipientId: string) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: `USER#${recipientId}`, SK: 'PROFILE' },
        ConsistentRead: true,
        ProjectionExpression: 'brokerActive',
      }),
    );
    return result.Item?.brokerActive === true;
  }

  async currentShare(planId: string, recipientId: string) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: `CRISIS_PLAN#${planId}`, SK: `SHARE#${recipientId}` },
        ConsistentRead: true,
        ProjectionExpression: '#data',
        ExpressionAttributeNames: { '#data': 'data' },
      }),
    );
    return result.Item?.data as CrisisPlanShare | undefined;
  }

  async claimRequest(binding: BrokerBinding, expiresAt: number) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            PK: `CRISIS_PLAN_BROKER_REQUEST#${binding.recipientId}`,
            SK: `REQUEST#${binding.requestId}`,
            expiresAt,
            data: { purpose: 'crisis-plan-broker-replay-guard' },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return true;
    } catch (error) {
      if (
        error instanceof ConditionalCheckFailedException ||
        (error instanceof Error && error.name === 'ConditionalCheckFailedException')
      )
        return false;
      throw error;
    }
  }
}
