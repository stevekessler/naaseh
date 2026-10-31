import { parseMajorUnits } from './money.js';

export interface CsvParseOptions {
  maxBytes?: number;
  maxRows?: number;
  signal?: AbortSignal;
  onProgress?: (event: { rowsParsed: number; complete: boolean }) => void;
}

export function parseFinanceCsv(text: string, options: CsvParseOptions = {}): string[][] {
  if (options.signal?.aborted) throw new Error('CSV parsing cancelled.');
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > (options.maxBytes ?? 10_000_000)) throw new Error('CSV file exceeds the size limit.');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const pushRow = () => {
    row.push(field);
    field = '';
    if (row.some((cell) => cell.length > 0) || rows.length === 0) rows.push(row);
    row = [];
    if (rows.length > (options.maxRows ?? 50_001)) throw new Error('CSV row limit exceeded.');
    options.onProgress?.({ rowsParsed: rows.length, complete: false });
  };
  for (let index = 0; index < text.length; index += 1) {
    if (options.signal?.aborted) throw new Error('CSV parsing cancelled.');
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') pushRow();
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field || row.length) pushRow();
  options.onProgress?.({ rowsParsed: rows.length, complete: true });
  return rows;
}

type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'M/D/YYYY';
type AmountMapping =
  | { mode: 'signed'; amountColumn: string }
  | { mode: 'debit-credit'; debitColumn: string; creditColumn: string };
export interface CsvMapping {
  dateColumn: string;
  descriptionColumn: string;
  dateFormat: DateFormat;
  amountMapping: AmountMapping;
  currency: string;
  payeeColumn?: string;
  memoColumn?: string;
}

const parseDate = (value: string, format: DateFormat) => {
  let year: number;
  let month: number;
  let day: number;
  if (format === 'YYYY-MM-DD')
    [year, month, day] = value.split('-').map(Number) as [number, number, number];
  else [month, day, year] = value.split('/').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Unsupported or invalid CSV date: ${value}`);
  }
  return date.toISOString();
};

export function mapFinanceCsvRows(rows: readonly string[][], mapping: CsvMapping) {
  const headers = rows[0] ?? [];
  const column = (name: string) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`Missing CSV column: ${name}`);
    return index;
  };
  const dateIndex = column(mapping.dateColumn);
  const descriptionIndex = column(mapping.descriptionColumn);
  const amountIndexes =
    mapping.amountMapping.mode === 'signed'
      ? { signed: column(mapping.amountMapping.amountColumn) }
      : {
          debit: column(mapping.amountMapping.debitColumn),
          credit: column(mapping.amountMapping.creditColumn),
        };
  return rows.slice(1).map((row, index) => {
    let amountMinor: number;
    if ('signed' in amountIndexes)
      amountMinor = parseMajorUnits(row[amountIndexes.signed] ?? '', mapping.currency);
    else {
      const debit = row[amountIndexes.debit]?.trim();
      const credit = row[amountIndexes.credit]?.trim();
      if (!!debit === !!credit)
        throw new Error('Each CSV row requires exactly one debit or credit amount.');
      amountMinor = debit
        ? -Math.abs(parseMajorUnits(debit, mapping.currency))
        : Math.abs(parseMajorUnits(credit!, mapping.currency));
    }
    const description = row[descriptionIndex]?.trim();
    if (!description) throw new Error('CSV description is required.');
    return {
      ordinal: index + 1,
      amountMinor,
      transactedAt: parseDate(row[dateIndex] ?? '', mapping.dateFormat),
      description,
    };
  });
}

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
};

export async function digestCsvBytes(bytes: Uint8Array): Promise<string> {
  const normalized = new TextDecoder('utf-8', { fatal: true })
    .decode(bytes)
    .replace(/\r\n?/g, '\n');
  return sha256(new TextEncoder().encode(normalized));
}

export async function digestDuplicateDecisions(
  suspectedOrdinals: readonly number[],
  decisions: ReadonlyArray<{ ordinal: number; decision: 'include' | 'exclude' }>,
): Promise<string> {
  const expected = [...new Set(suspectedOrdinals)].sort((a, b) => a - b);
  const ordered = [...decisions].sort((a, b) => a.ordinal - b.ordinal);
  if (
    ordered.length !== expected.length ||
    ordered.some((item, index) => item.ordinal !== expected[index])
  ) {
    throw new Error('Every suspected duplicate requires exactly one decision.');
  }
  return sha256(new TextEncoder().encode(JSON.stringify(ordered)));
}

export function findSuspectedDuplicates(
  incoming: ReadonlyArray<{
    ordinal: number;
    transactedAt: string;
    amountMinor: number;
    description: string;
  }>,
  existing: ReadonlyArray<{ transactedAt: string; amountMinor: number; description: string }>,
) {
  return incoming.flatMap((row) =>
    existing.some(
      (item) =>
        item.transactedAt === row.transactedAt &&
        item.amountMinor === row.amountMinor &&
        item.description.normalize('NFC') === row.description.normalize('NFC'),
    )
      ? [{ ordinal: row.ordinal, reason: 'same-date-amount-description' as const }]
      : [],
  );
}
