import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
export class FinanceDynamoFixture {
  readonly items = new Map<string, Record<string, unknown>>();
  readonly transactions: unknown[] = [];
  key(value: { PK?: unknown; SK?: unknown }) {
    return `${String(value.PK)}|${String(value.SK)}`;
  }
  put(value: Record<string, unknown>) {
    this.items.set(this.key(value), structuredClone(value));
  }
  send = async (command: unknown): Promise<Record<string, unknown>> => {
    if (command instanceof GetCommand)
      return { Item: this.items.get(this.key(command.input.Key!)) };
    if (command instanceof QueryCommand) {
      const values = command.input.ExpressionAttributeValues ?? {};
      const pk = values[':pk'];
      const prefix = values[':prefix'] ?? values[':group'] ?? values[':rev'];
      let items = [...this.items.values()]
        .filter((item) => item.PK === pk && (!prefix || String(item.SK).startsWith(String(prefix))))
        .sort((a, b) => String(a.SK).localeCompare(String(b.SK)));
      if (command.input.ExclusiveStartKey)
        items = items.filter(
          (item) => String(item.SK) > String(command.input.ExclusiveStartKey!.SK),
        );
      const size = command.input.Limit ?? 1000;
      const more = items.length > size;
      items = items.slice(0, size);
      return {
        Items: items,
        ...(more ? { LastEvaluatedKey: { PK: items.at(-1)!.PK, SK: items.at(-1)!.SK } } : {}),
      };
    }
    if (command instanceof TransactWriteCommand) {
      const writes = command.input.TransactItems ?? [];
      if (writes.length > 100) throw new Error('Transaction too large');
      const seen = new Set<string>();
      for (const write of writes) {
        const operation = write.Put ?? write.Delete ?? write.Update ?? write.ConditionCheck;
        if (!operation) throw new Error('Unsupported write');
        const target = 'Item' in operation ? operation.Item : operation.Key;
        const key = this.key(target!);
        if (seen.has(key)) throw new Error('Duplicate transaction key');
        seen.add(key);
        const current = this.items.get(key),
          condition = operation.ConditionExpression;
        const values = operation.ExpressionAttributeValues ?? {};
        let accepted = true;
        if (condition?.includes(':expected'))
          accepted =
            !current || Number(current.version ?? current.value) === Number(values[':expected']);
        else if (condition?.includes(':base'))
          accepted =
            !current ||
            Number((current.data as { version: number })?.version) === Number(values[':base']);
        else if (condition?.includes(':active'))
          accepted = (current?.data as { active?: boolean } | undefined)?.active === true;
        else if (condition === 'attribute_not_exists(PK)') accepted = !current;
        if (!accepted)
          throw Object.assign(new Error('Conditional conflict'), {
            name: 'TransactionCanceledException',
          });
      }
      this.transactions.push(structuredClone(writes));
      for (const write of writes) {
        if (write.Put) this.put(write.Put.Item!);
        if (write.Delete) this.items.delete(this.key(write.Delete.Key!));
        if (write.Update) {
          const key = this.key(write.Update.Key!);
          this.put({
            ...this.items.get(key),
            ...write.Update.Key,
            ...(write.Update.ExpressionAttributeValues?.[':next'] !== undefined
              ? { value: write.Update.ExpressionAttributeValues[':next'] }
              : {}),
          });
        }
      }
      return {};
    }
    throw new Error('Unsupported database command');
  };
  client() {
    return { send: this.send } as unknown as Pick<DynamoDBDocumentClient, 'send'>;
  }
}
