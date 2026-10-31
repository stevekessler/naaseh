/** Monthly 500-position bitmaps bound short substring postings and read amplification. */
export const TEXT_POSTING_CHUNK_SIZE = 500;
export const TEXT_POSTING_BYTES = 63;
export const normalizeFinanceText = (text: string) =>
  Array.from(text.normalize('NFKC').toLocaleLowerCase('en-US'))
    .map((char) =>
      char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff
        ? '\uFFFD'
        : char,
    )
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();

export function financeTextGrams(text: string, min = 1, max = 3): string[] {
  const characters = Array.from(normalizeFinanceText(text));
  const grams = new Set<string>();
  for (let start = 0; start < characters.length; start++)
    for (let length = min; length <= max && start + length <= characters.length; length++)
      grams.add(characters.slice(start, start + length).join(''));
  return [...grams].sort();
}
export const financeFactSearchText = (fact: {
  description: string;
  payee?: string;
  memo?: string;
  merchantName?: string;
}) => [fact.description, fact.payee, fact.memo, fact.merchantName].filter(Boolean).join(' ');

function validOrdinal(ordinal: number) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > Number.MAX_SAFE_INTEGER - 500)
    throw new Error('Invalid text posting ordinal.');
}
export function shortTextPostingKey(
  accountId: string,
  gram: string,
  month: string,
  ordinal: number,
) {
  validOrdinal(ordinal);
  if (
    !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ||
    !accountId ||
    !gram ||
    Array.from(gram).length > 2
  )
    throw new Error('Invalid short-text posting context.');
  return {
    PK: `FINANCE#FACT_SEARCH#${accountId}#text#${encodeURIComponent(gram)}`,
    SK: `DATE#${month}#${String(Math.floor(ordinal / 500)).padStart(12, '0')}`,
  };
}
export const textOrdinalKey = (accountId: string, month: string, ordinal: number) => ({
  PK: `FINANCE#TEXT_ORDINAL#${accountId}#${month}`,
  SK: `ORDINAL#${String(ordinal).padStart(12, '0')}`,
});
export function textPostingOrdinals(bits: Uint8Array, baseOrdinal: number): number[] {
  validOrdinal(baseOrdinal);
  if (
    !(bits instanceof Uint8Array) ||
    bits.length !== TEXT_POSTING_BYTES ||
    baseOrdinal % 500 !== 0 ||
    bits[62]! & 0xf0
  )
    throw new Error('Malformed text posting bitmap.');
  const values: number[] = [];
  for (let bit = 499; bit >= 0; bit--)
    if (bits[Math.floor(bit / 8)]! & (1 << bit % 8)) values.push(baseOrdinal + bit);
  return values;
}
export function updateTextPostingBit(
  previous: Uint8Array,
  ordinal: number,
  included: boolean,
): Uint8Array {
  validOrdinal(ordinal);
  textPostingOrdinals(previous, Math.floor(ordinal / 500) * 500);
  const bits = new Uint8Array(previous);
  const bit = ordinal % 500;
  const index = Math.floor(bit / 8);
  if (included) bits[index] = bits[index]! | (1 << bit % 8);
  else bits[index] = bits[index]! & ~(1 << bit % 8);
  return bits;
}
