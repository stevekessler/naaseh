const ZERO_EXPONENT = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);
const THREE_EXPONENT = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
const FOUR_EXPONENT = new Set(['CLF', 'UYW']);

export function currencyExponentFor(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be an uppercase ISO code.');
  if (ZERO_EXPONENT.has(currency)) return 0;
  if (THREE_EXPONENT.has(currency)) return 3;
  if (FOUR_EXPONENT.has(currency)) return 4;
  return 2;
}

export function parseMajorUnits(value: string, currency: string): number {
  const exponent = currencyExponentFor(currency);
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a decimal monetary value.');
  const [, sign = '', whole = '0', fraction = ''] = match;
  if (fraction.length > exponent) {
    throw new Error(`Currency ${currency} supports at most ${exponent} fraction digits.`);
  }
  const magnitude =
    BigInt(whole) * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, '0'));
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Money value is outside the safe range.');
  }
  return sign === '-' ? -Number(magnitude) : Number(magnitude);
}

export function addMinorUnits(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new Error('Money value must be a safe integer.');
    total += value;
    if (!Number.isSafeInteger(total)) throw new Error('Money total is outside the safe range.');
  }
  return total;
}
