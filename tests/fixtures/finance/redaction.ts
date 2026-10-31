const PROHIBITED_KEYS = new Set([
  'accessUrl',
  'setupToken',
  'rawCsv',
  'sessionToken',
  'authorization',
  'cookie',
]);

function walk(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, entry] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(`Unsafe finance fixture field at ${path}.${key}`);
    }
    walk(entry, `${path}.${key}`);
  }
}

export function assertSafeFinanceFixture(value: unknown): void {
  walk(value, '$');
}
