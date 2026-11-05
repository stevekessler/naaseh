import { parseProtectedFinanceCsv } from './csv-worker-client.js';
import { currentFinanceAccess } from '../security/finance-access.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mapFinanceCsvRows } from '@naaseh/domain';
import { DuplicateReview, type CsvMappingState, type DuplicateCandidate } from './csv-import.js';

export function CsvImportWizard({
  duplicates = [],
  currency = 'USD',
  onCommit,
}: {
  duplicates?: DuplicateCandidate[];
  currency?: string;
  onCommit: (rows?: ReturnType<typeof mapFinanceCsvRows>) => Promise<void>;
}) {
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [mapping, setMapping] = useState<CsvMappingState>({
    dateColumn: '',
    descriptionColumn: '',
    dateFormat: 'YYYY-MM-DD',
    amountMapping: { mode: 'signed', amountColumn: '' },
  });
  const [review] = useState(() => new DuplicateReview(duplicates));
  const [, render] = useState(0);
  const parseRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const cancel = () => {
      parseRequest.current?.abort();
      setRawRows([]);
      setProgress('');
    };
    const unsubscribe = currentFinanceAccess().onLock(cancel);
    return () => {
      parseRequest.current?.abort();
      unsubscribe();
    };
  }, []);
  const headers = rawRows[0] ?? [];
  const mappingResult = useMemo(() => {
    if (
      !rawRows.length ||
      !mapping.dateColumn ||
      !mapping.descriptionColumn ||
      (mapping.amountMapping.mode === 'signed' && !mapping.amountMapping.amountColumn)
    ) {
      return { rows: [] as ReturnType<typeof mapFinanceCsvRows>, error: '' };
    }
    try {
      return { rows: mapFinanceCsvRows(rawRows, { ...mapping, currency }), error: '' };
    } catch (reason) {
      return {
        rows: [] as ReturnType<typeof mapFinanceCsvRows>,
        error: reason instanceof Error ? reason.message : 'CSV mapping failed.',
      };
    }
  }, [currency, mapping, rawRows]);
  const mapped = mappingResult.rows;
  const select = (label: string, value: string, change: (next: string) => void) => (
    <label>
      {label}
      <select value={value} onChange={(event) => change(event.target.value)}>
        <option value="">Choose a column</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
  const parseFile = async (file: File | undefined) => {
    parseRequest.current?.abort();
    const request = new AbortController();
    parseRequest.current = request;
    setRawRows([]);
    setError('');
    setProgress('');
    if (!file) return;
    try {
      setProgress('Reading CSV…');
      const rows = await parseProtectedFinanceCsv(file, {
        signal: request.signal,
        onProgress: (count) => setProgress(`Read ${count} rows…`),
      });
      if (request.signal.aborted) return;
      setRawRows(rows);
      setProgress(`Ready to review ${Math.max(0, rows.length - 1)} rows.`);
    } catch {
      if (!request.signal.aborted) {
        setError('CSV parsing failed.');
        setProgress('');
      }
    }
  };
  const candidate = review.current;
  return (
    <section>
      <h2>Import CSV</h2>
      <label>
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void parseFile(event.target.files?.[0])}
        />
      </label>
      <p role="status">{progress}</p>
      {error || mappingResult.error ? <p role="alert">{error || mappingResult.error}</p> : null}
      {headers.length ? (
        <fieldset>
          <legend>Map columns</legend>
          {select('Date column', mapping.dateColumn, (dateColumn) =>
            setMapping((current) => ({ ...current, dateColumn })),
          )}
          {select('Description column', mapping.descriptionColumn, (descriptionColumn) =>
            setMapping((current) => ({ ...current, descriptionColumn })),
          )}
          {select(
            'Amount column',
            mapping.amountMapping.mode === 'signed' ? mapping.amountMapping.amountColumn : '',
            (amountColumn) =>
              setMapping((current) => ({
                ...current,
                amountMapping: { mode: 'signed', amountColumn },
              })),
          )}
          <label>
            Date format
            <select
              value={mapping.dateFormat}
              onChange={(event) =>
                setMapping((current) => ({
                  ...current,
                  dateFormat: event.target.value as CsvMappingState['dateFormat'],
                }))
              }
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="M/D/YYYY">M/D/YYYY</option>
            </select>
          </label>
          <p>{mapped.length} valid rows ready for review.</p>
        </fieldset>
      ) : null}
      {candidate ? (
        <fieldset>
          <legend>Possible duplicate {candidate.ordinal}</legend>
          <p>
            {candidate.date} — {candidate.description}
          </p>
          <button
            onClick={() => {
              review.decide(candidate.ordinal, 'include');
              render((value) => value + 1);
            }}
          >
            Include
          </button>
          <button
            onClick={() => {
              review.decide(candidate.ordinal, 'exclude');
              render((value) => value + 1);
            }}
          >
            Exclude
          </button>
        </fieldset>
      ) : null}
      <button
        disabled={!review.complete || mapped.length === 0}
        onClick={() => void onCommit(mapped)}
      >
        Commit reviewed import
      </button>
    </section>
  );
}
