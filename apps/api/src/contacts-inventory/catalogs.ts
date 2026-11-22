import { createHash } from 'node:crypto';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  type QueryCommandOutput,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  contactTypeSchema,
  locationSchema,
  prescriberContactTypeId,
  type ContactType,
  type InventoryLocation,
  type MutationPrecondition,
} from '@naaseh/contacts-inventory-contracts';
import { dynamodb } from '../shared/dynamodb.js';
import { WorkspaceError } from './repository.js';

const partition = 'CATALOG';
const prefix = 'contact-types#';
const locationPrefix = 'locations#';
const seed: ContactType = { id: prescriberContactTypeId, name: 'Prescriber', revision: 1 };

export class ContactCatalog {
  constructor(
    private readonly table: string,
    private readonly workspace: string,
  ) {}

  private async get(sk: string) {
    const { Item } = await dynamodb.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: partition, sk },
        ConsistentRead: true,
      }),
    );
    return Item;
  }

  async type(id: string) {
    const item = await this.get(prefix + id);
    return item ? contactTypeSchema.parse(item.value) : id === seed.id ? seed : undefined;
  }

  async location(id: string) {
    const item = await this.get(locationPrefix + id);
    return item ? locationSchema.parse(item.value) : undefined;
  }

  async locations() {
    return this.listValues(locationPrefix, (value) => locationSchema.parse(value));
  }

  async list() {
    return this.listValues(prefix, (value) => contactTypeSchema.parse(value), [seed]);
  }

  private async listValues<T extends ContactType>(
    keyPrefix: string,
    parse: (value: unknown) => T,
    defaults: T[] = [],
  ) {
    const types = new Map(defaults.map((value) => [value.id, value]));
    let cursor: QueryCommandOutput['LastEvaluatedKey'];
    do {
      const page = await dynamodb.send(
        new QueryCommand({
          TableName: this.table,
          ConsistentRead: true,
          Limit: 100,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': partition, ':prefix': keyPrefix },
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        const type = parse(item.value);
        types.set(type.id, type);
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return [...types.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }

  async write(id: string, name: string, actor: string, precondition: MutationPrecondition) {
    const revision = precondition.mode === 'create' ? 1 : precondition.revision + 1;
    const value = contactTypeSchema.parse({ id, name, revision });
    return this.writeValue(prefix, value, actor, precondition, id === seed.id);
  }

  async writeLocation(
    id: string,
    fields: Pick<InventoryLocation, 'name' | 'details'>,
    actor: string,
    precondition: MutationPrecondition,
  ) {
    const revision = precondition.mode === 'create' ? 1 : precondition.revision + 1;
    const value = locationSchema.parse({ id, ...fields, revision });
    return this.writeValue(locationPrefix, value, actor, precondition);
  }

  private async writeValue<T extends ContactType>(
    keyPrefix: string,
    value: T,
    actor: string,
    precondition: MutationPrecondition,
    seeded = false,
  ) {
    const { mode, mutationId, generation } = precondition;
    const sk = keyPrefix + value.id;
    const receipt = `RECEIPT#${JSON.stringify([actor, mutationId])}`;
    const input =
      keyPrefix === prefix
        ? [value.id, value.name, mode, value.revision, generation]
        : [keyPrefix, value, mode, generation];
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const repeated = async () => {
      const recorded = await this.get(receipt);
      if (!recorded) return false;
      if (recorded.digest !== digest) throw new WorkspaceError('idempotency_conflict');
      return true;
    };
    if (await repeated()) return value;
    if (mode === 'create' && seeded) throw new WorkspaceError('revision_conflict');

    const condition =
      mode === 'create'
        ? 'attribute_not_exists(pk)'
        : seeded && precondition.revision === 1
          ? 'attribute_not_exists(pk) OR #value.revision = :revision'
          : '#value.revision = :revision';
    try {
      await dynamodb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: this.table,
                Key: { pk: `WORKSPACE#${this.workspace}`, sk: 'STATE' },
                ConditionExpression:
                  generation === 1
                    ? 'attribute_not_exists(pk) OR #generation = :generation'
                    : '#generation = :generation',
                ExpressionAttributeNames: { '#generation': 'generation' },
                ExpressionAttributeValues: { ':generation': generation },
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { pk: partition, sk, value },
                ConditionExpression: condition,
                ...(mode === 'update'
                  ? {
                      ExpressionAttributeNames: { '#value': 'value' },
                      ExpressionAttributeValues: { ':revision': precondition.revision },
                    }
                  : {}),
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { pk: partition, sk: receipt, digest },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
          ],
        }),
      );
      return value;
    } catch (error) {
      if (
        error instanceof TransactionCanceledException &&
        error.CancellationReasons?.some(({ Code }) => Code === 'ConditionalCheckFailed')
      ) {
        if (await repeated()) return value;
        throw new WorkspaceError('revision_conflict');
      }
      throw error;
    }
  }
}
