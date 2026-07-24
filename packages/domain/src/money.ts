const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d{1,2}))?$/;

export function parseSignedMinor(value: string, unsignedMode: 'cost' | 'credit' = 'cost'): number {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new Error('Enter a monetary value with no more than two decimal places.');
  const [, explicitSign, whole = '0', fraction = ''] = match;
  const magnitude = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(magnitude)) throw new Error('Value is outside the supported range.');
  const sign =
    explicitSign === '-' ? -1 : explicitSign === '+' ? 1 : unsignedMode === 'cost' ? -1 : 1;
  return magnitude * sign;
}

export function totalMinor(values: readonly (number | null | undefined)[]): number {
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (!Number.isSafeInteger(total)) throw new Error('List total is outside the supported range.');
  return total;
}

export function formatMinor(value: number, currency = 'USD', locale?: string): string {
  if (!Number.isSafeInteger(value)) throw new Error('Value must be a safe minor-unit integer.');
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value / 100);
}
