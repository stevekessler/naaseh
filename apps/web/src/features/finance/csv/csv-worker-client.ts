import CsvWorker from './csv.worker.ts?worker';
import { currentFinanceAccess } from '../security/finance-access.js';

/** CSV text and parsed rows belong to the current protected visit, including file-read time. */
export async function parseProtectedFinanceCsv(
  file: Pick<File, 'text'>,
  options: {
    signal?: AbortSignal;
    worker?: () => Worker;
    onProgress?: (rows: number) => void;
  } = {},
): Promise<string[][]> {
  return currentFinanceAccess().read(async (signal) => {
    const text = await file.text();
    if (signal.aborted) throw new Error('Unlock Finance to continue.');
    return new Promise<string[][]>((resolve, reject) => {
      const worker = (options.worker ?? (() => new CsvWorker()))();
      let settled = false;
      const finish = (rows?: string[][], message?: string) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        worker.terminate();
        if (rows) resolve(rows);
        else reject(new Error(message ?? 'CSV parsing failed.'));
      };
      const abort = () => finish(undefined, 'Unlock Finance to continue.');
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = (
        event: MessageEvent<{ type?: string; rows?: string[][]; rowsParsed?: number }>,
      ) => {
        if (settled || signal.aborted) return;
        if (event.data.type === 'progress') options.onProgress?.(event.data.rowsParsed ?? 0);
        else if (event.data.type === 'complete' && Array.isArray(event.data.rows))
          finish(event.data.rows);
        else if (event.data.type === 'error') finish();
      };
      worker.onerror = () => finish();
      if (signal.aborted) abort();
      else worker.postMessage({ text });
    });
  }, options.signal);
}
