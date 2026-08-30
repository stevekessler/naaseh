import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { DynamoCrisisPlanRepository } from '../../src/journal/crisis-plan-repository.js';
import { DynamoJournalRepository } from '../../src/journal/journal-repository.js';
import {
  crisisPlanGrantFixture,
  crisisPlanRecordFixture,
} from '../../../../tests/fixtures/crisis-plan.js';

class FakeDocumentClient {
  readonly commands: unknown[] = [];
  constructor(private readonly responses: Array<Record<string, unknown>>) {}
  async send(command: unknown) {
    this.commands.push(command);
    return this.responses.shift() ?? {};
  }
}

describe('durable Journal and Crisis Plan repositories', () => {
  it('atomically gates the first Journal entry on a persisted Crisis Plan', async () => {
    const client = new FakeDocumentClient([{}, { Item: { value: 0 } }, {}]);
    const repository = new DynamoJournalRepository(
      client,
      'Data',
      () => '2026-08-30T12:00:00.000Z',
    );
    const entryId = '22222222-2222-4222-8222-222222222222';
    const dateToken = 'A'.repeat(43);
    await repository.save(
      'owner-1',
      {
        id: '33333333-3333-4333-8333-333333333333',
        entityType: 'journalEntry',
        operation: 'upsert',
        entityId: entryId,
        baseVersion: 0,
        dateToken,
        payload: {
          entryId,
          dateToken,
          projection: {
            recordKind: 'projection',
            schemaVersion: 1,
            keyVersion: 1,
            iv: 'A'.repeat(16),
            ciphertext: 'A'.repeat(24),
            byteSize: 16,
          },
          body: {
            recordKind: 'body',
            schemaVersion: 1,
            keyVersion: 1,
            iv: 'B'.repeat(16),
            ciphertext: 'B'.repeat(24),
            byteSize: 16,
          },
        },
        createdAt: '2026-08-30T12:00:00.000Z',
      },
      {
        entryId,
        dateToken,
        projection: {
          recordKind: 'projection',
          schemaVersion: 1,
          keyVersion: 1,
          iv: 'A'.repeat(16),
          ciphertext: 'A'.repeat(24),
          byteSize: 16,
        },
        body: {
          recordKind: 'body',
          schemaVersion: 1,
          keyVersion: 1,
          iv: 'B'.repeat(16),
          ciphertext: 'B'.repeat(24),
          byteSize: 16,
        },
      },
      1,
    );
    const transaction = client.commands.at(-1) as TransactWriteCommand;
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ConditionCheck: expect.objectContaining({
            Key: { PK: 'JOURNAL#OWNER#owner-1', SK: 'CRISIS_PLAN' },
          }),
        }),
        expect.objectContaining({
          Put: expect.objectContaining({
            Item: expect.objectContaining({
              PK: 'JOURNAL#OWNER#owner-1',
              SK: `ENTRY#${entryId}`,
            }),
          }),
        }),
      ]),
    );
  });

  it('revokes by rotating the plan, all grants, receipt, and feed in one DynamoDB transaction', async () => {
    const currentRevokedShare = {
      planId: crisisPlanRecordFixture().planId,
      ownerId: 'owner-1',
      recipientId: 'recipient-1',
      version: 1,
      state: 'active' as const,
      grant: crisisPlanGrantFixture(),
      updatedAt: '2026-08-29T12:00:00.000Z',
    };
    const client = new FakeDocumentClient([
      { Item: { data: crisisPlanRecordFixture() } },
      { Item: { data: currentRevokedShare } },
      { Item: { value: 7 } },
      {},
    ]);
    const repository = new DynamoCrisisPlanRepository(client, 'Data');
    const replacement = crisisPlanRecordFixture({
      version: 2,
      keyGeneration: 2,
      body: { ...crisisPlanRecordFixture().body, keyGeneration: 2 },
      ownerWrap: { ...crisisPlanRecordFixture().ownerWrap, keyGeneration: 2 },
      updatedAt: '2026-08-30T12:00:00.000Z',
    });
    const remaining = {
      ...currentRevokedShare,
      recipientId: 'recipient-2',
      version: 2,
      grant: crisisPlanGrantFixture({
        recipientId: 'recipient-2',
        shareVersion: 2,
        keyGeneration: 2,
      }),
      updatedAt: replacement.updatedAt,
    };
    await repository.rotate(
      replacement,
      [remaining],
      '44444444-4444-4444-8444-444444444444',
      'recipient-1',
    );
    const transactions = client.commands.filter(
      (command) => command instanceof TransactWriteCommand,
    ) as TransactWriteCommand[];
    expect(transactions).toHaveLength(1);
    const items = transactions[0]!.input.TransactItems ?? [];
    expect(items).toHaveLength(6);
    expect(items.filter((item) => item.Put?.Item?.SK === 'CRISIS_PLAN')).toHaveLength(1);
    expect(items.filter((item) => String(item.Put?.Item?.SK).startsWith('SHARE#'))).toHaveLength(2);
    expect(items.some((item) => String(item.Put?.Item?.SK).startsWith('MUTATION#'))).toBe(true);
    expect(items.some((item) => item.Update?.Key?.SK === 'COUNTER')).toBe(true);
    expect(items.some((item) => String(item.Put?.Item?.SK).startsWith('CHANGE#'))).toBe(true);
  });
});
