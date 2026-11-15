declare module 'yauzl' {
  import type { EventEmitter } from 'node:events';
  import type { Readable } from 'node:stream';
  export interface Entry {
    fileName: string;
    uncompressedSize: number;
    crc32: number;
    generalPurposeBitFlag: number;
  }
  export interface ZipFile extends EventEmitter {
    entryCount: number;
    readEntry(): void;
    close(): void;
    openReadStream(entry: Entry, callback: (error: Error | null, stream: Readable) => void): void;
  }
  export function fromBuffer(
    buffer: Buffer,
    options: {
      lazyEntries: true;
      validateEntrySizes: true;
      strictFileNames: true;
      autoClose: false;
    },
    callback: (error: Error | null, file: ZipFile) => void,
  ): void;
}
