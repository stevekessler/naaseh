import type {
  FinancePersistence,
  FinanceRecordKey,
} from '../../../apps/api/src/finance/unit-of-work.js';

const id = (key: FinanceRecordKey) => JSON.stringify([key.PK, key.SK]);
/** Transactional command double: validates the real generated conditions before mutating any row. */
export function financePersistenceFixture() {
  const rows = new Map<string, FinanceRecordKey & Record<string, unknown>>();
  let writes = 0;
  let failAt = -1;
  let loseResponseAt = -1;
  const persistence: FinancePersistence = {
    get: async (key) => {
      if (Object.keys(key).sort().join(',') !== 'PK,SK')
        throw new Error('Non-key attributes in GetItem key.');
      return structuredClone(rows.get(id(key)));
    },
    write: async (items) => {
      writes++;
      if (writes === failAt) throw new Error('Injected interrupted write.');
      const touched = new Set<string>();
      if (items.length > 100) throw new Error('Atomic write limit exceeded.');
      for (const entry of items) {
        const operation = entry.Put ?? entry.Delete ?? entry.ConditionCheck;
        if (!operation) throw new Error('Unsupported fixture operation.');
        const key = ('Item' in operation ? operation.Item : operation.Key) as FinanceRecordKey;
        const identity = id(key);
        if (touched.has(identity)) throw new Error('Duplicate atomic record.');
        touched.add(identity);
        const current = rows.get(identity);
        if (operation.ConditionExpression?.includes('attribute_not_exists(PK)') && current)
          throw new Error('Conditional conflict.');
        if (operation.ConditionExpression?.includes('attribute_exists(PK)') && !current)
          throw new Error('Conditional conflict.');
        for (const [alias, name] of Object.entries(operation.ExpressionAttributeNames ?? {})) {
          const expected = operation.ExpressionAttributeValues?.[alias.replace('#', ':')];
          if (JSON.stringify(current?.[name]) !== JSON.stringify(expected))
            throw new Error('Conditional conflict.');
        }
      }
      for (const entry of items) {
        if (entry.Put) {
          const row = entry.Put.Item as FinanceRecordKey & Record<string, unknown>;
          rows.set(id(row), structuredClone(row));
        } else if (entry.Delete) rows.delete(id(entry.Delete.Key as FinanceRecordKey));
      }
      if (writes === loseResponseAt) throw new Error('Injected lost response.');
    },
  };
  return {
    rows,
    persistence,
    key: id,
    get writes() {
      return writes;
    },
    failAt(n: number) {
      failAt = n;
    },
    loseResponseAt(n: number) {
      loseResponseAt = n;
    },
  };
}
