import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { DynamoCrisisPlanBrokerRepository } from '../../src/journal/crisis-plan-broker-repository.js';

describe('DynamoDB Crisis Plan broker authorization', () => {
  it('reads only the minimal active projection and never requests the credential-bearing data map', async () => {
    const send = vi.fn().mockResolvedValue({ Item: { brokerActive: true } });
    const repository = new DynamoCrisisPlanBrokerRepository({ send }, 'table');

    await expect(repository.isRecipientActive('recipient-1')).resolves.toBe(true);
    const command = send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      TableName: 'table',
      Key: { PK: 'USER#recipient-1', SK: 'PROFILE' },
      ConsistentRead: true,
      ProjectionExpression: 'brokerActive',
    });
    expect(JSON.stringify(command.input)).not.toContain('data');
  });

  it('claims a request conditionally with a short DynamoDB TTL and denies duplicates', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new ConditionalCheckFailedException({ message: 'duplicate', $metadata: {} }),
      );
    const repository = new DynamoCrisisPlanBrokerRepository({ send }, 'table');
    const binding = {
      requestId: '22222222-2222-4222-8222-222222222222',
      recipientId: 'recipient-1',
      ownerId: 'owner-1',
      planId: '11111111-1111-4111-8111-111111111111',
      shareVersion: 1,
      keyGeneration: 1,
      ephemeralPublicKeySpki: 'public',
    };

    await expect(repository.claimRequest(binding, 1_788_000_120)).resolves.toBe(true);
    await expect(repository.claimRequest(binding, 1_788_000_120)).resolves.toBe(false);
    const command = send.mock.calls[0]![0] as { input: Record<string, any> };
    expect(command.input.Item).toEqual({
      PK: 'CRISIS_PLAN_BROKER_REQUEST#recipient-1',
      SK: 'REQUEST#22222222-2222-4222-8222-222222222222',
      expiresAt: 1_788_000_120,
      data: { purpose: 'crisis-plan-broker-replay-guard' },
    });
    expect(command.input.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  it('projects only the share grant map needed for authorization', async () => {
    const send = vi.fn().mockResolvedValue({ Item: { data: { state: 'active' } } });
    const repository = new DynamoCrisisPlanBrokerRepository({ send }, 'table');
    await repository.currentShare('plan-1', 'recipient-1');
    const command = send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Key: { PK: 'CRISIS_PLAN#plan-1', SK: 'SHARE#recipient-1' },
      ProjectionExpression: '#data',
      ExpressionAttributeNames: { '#data': 'data' },
    });
  });
});
