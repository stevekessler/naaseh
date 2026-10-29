import { parseFinanceCsv } from '@naaseh/domain';

self.onmessage = (event: MessageEvent<{ text: string }>) => {
  try {
    const rows = parseFinanceCsv(event.data.text, {
      onProgress: (progress) => self.postMessage({ type: 'progress', ...progress }),
    });
    self.postMessage({ type: 'complete', rows });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'CSV parsing failed.',
    });
  }
};
