import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { crc32, inflateSync } from 'node:zlib';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import * as cfb from 'cfb';
import { MAX_FINANCE_RECEIPT_BYTES, financeReceiptMediaTypes } from '@naaseh/domain';

const expandedLimit = 50_000_000;
const entryLimit = 1000;
type MediaType = (typeof financeReceiptMediaTypes)[keyof typeof financeReceiptMediaTypes];
const ole = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const png = Buffer.from('89504e470d0a1a0a', 'hex');
const zip = Buffer.from('504b0304', 'hex');
const has = (bytes: Buffer, prefix: Buffer) => bytes.subarray(0, prefix.length).equals(prefix);
const invalid = () => {
  throw new Error('Receipt content is unsafe or could not be inspected.');
};

export async function inspectReceiptBytes(input: Uint8Array, type: MediaType) {
  if (!input.byteLength || input.byteLength > MAX_FINANCE_RECEIPT_BYTES) invalid();
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  switch (type) {
    case financeReceiptMediaTypes.pdf:
      checkPdf(bytes);
      break;
    case financeReceiptMediaTypes.png:
      checkPng(bytes);
      break;
    case financeReceiptMediaTypes.jpg:
      checkJpeg(bytes);
      break;
    case financeReceiptMediaTypes.doc:
      checkOle(bytes, true);
      break;
    case financeReceiptMediaTypes.xls:
      checkOle(bytes, false);
      break;
    case financeReceiptMediaTypes.docx:
      await checkZip(bytes, true);
      break;
    case financeReceiptMediaTypes.xlsx:
      await checkZip(bytes, false);
      break;
    default:
      invalid();
  }
}

function checkPdf(bytes: Buffer) {
  const text = bytes.toString('latin1');
  const start = /startxref[\r\n ]+(\d+)[\r\n ]+%%EOF[\r\n \t]*$/u.exec(text);
  if (
    !/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/u.test(text) ||
    !start ||
    text.slice(Number(start[1]), Number(start[1]) + 4) !== 'xref'
  )
    invalid();
  // Object streams and encryption can hide dictionaries. This checker accepts
  // traditional xref tables and fails closed for formats it cannot inspect.
  const names = /\/((?:#[0-9a-f]{2}|[^\s/<>[\](){}/%])+)/giu;
  const blocked = new Set(
    'Encrypt XRef XRefStm ObjStm Prev JS JavaScript OpenAction AA A Action Launch URI GoToR GoToE SubmitForm ImportData ResetForm Hide SetOCGState Rendition Movie Sound RichMedia EmbeddedFile EmbeddedFiles Filespec EF AF XFA AcroForm Collection 3D 3DD ViewState FileAttachment'
      .toLowerCase()
      .split(' '),
  );
  let root = false,
    catalog = false,
    page = false;
  for (const [, name] of text.matchAll(names)) {
    const value = name!
      .replace(/#([a-f0-9]{2})/giu, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
      .toLowerCase();
    if (blocked.has(value)) invalid();
    root ||= value === 'root';
    catalog ||= value === 'catalog';
    page ||= value === 'page';
  }
  if (!root || !catalog || !page || !/\btrailer\s*<</u.test(text)) invalid();
}

function checkPng(bytes: Buffer) {
  if (!has(bytes, png)) invalid();
  let offset = 8,
    width = 0,
    height = 0,
    output = 0,
    entries = 0;
  const compressed: Buffer[] = [];
  while (offset + 12 <= bytes.length && ++entries <= entryLimit) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) invalid();
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid();
    if (type === 'IHDR' && offset === 8 && length === 13) {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8]!,
        color = data[9]!;
      const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
      const validDepth = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
      if (
        !width ||
        !height ||
        !channels ||
        !validDepth.includes(depth) ||
        data[10] ||
        data[11] ||
        data[12]
      )
        invalid();
      output = (1 + Math.ceil((width * channels! * depth) / 8)) * height;
      if (output > expandedLimit || width * height * 4 > expandedLimit) invalid();
    } else if (type === 'IDAT' && width && height) {
      compressed.push(data);
    } else if (type === 'IEND' && length === 0 && end === bytes.length && compressed.length) {
      const rows = inflateSync(Buffer.concat(compressed), { maxOutputLength: output });
      if (rows.byteLength !== output) invalid();
      for (let row = 0; row < rows.length; row += output / height) if (rows[row]! > 4) invalid();
      return;
    } else if (!['PLTE', 'tRNS', 'pHYs', 'gAMA', 'cHRM', 'sRGB', 'tIME'].includes(type)) invalid();
    offset = end;
  }
  invalid();
}

function checkJpeg(bytes: Buffer) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid();
  let offset = 2,
    frame = false,
    scan = false,
    segments = 0;
  while (offset < bytes.length && ++segments <= entryLimit) {
    if (bytes[offset++] !== 0xff) invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 && frame && scan && offset === bytes.length) return;
    if (offset + 2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) invalid();
    if (marker === 0xc0 || marker === 0xc2) {
      if (frame || length < 11 || bytes[offset + 2] !== 8) invalid();
      const height = bytes.readUInt16BE(offset + 3),
        width = bytes.readUInt16BE(offset + 5);
      const components = bytes[offset + 7]!;
      if (
        !height ||
        !width ||
        ![1, 3, 4].includes(components) ||
        length !== 8 + 3 * components ||
        height * width * 4 > expandedLimit
      )
        invalid();
      frame = true;
    } else if (marker === 0xda) {
      if (!frame || length !== 6 + 2 * bytes[offset + 2]!) invalid();
      scan = true;
      offset += length;
      while (offset + 1 < bytes.length) {
        if (bytes[offset++] !== 0xff) continue;
        const next = bytes[offset]!;
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
          offset++;
          continue;
        }
        offset--;
        break;
      }
      continue;
    } else if (
      marker !== 0xc4 &&
      marker !== 0xdb &&
      marker !== 0xdd &&
      marker !== 0xfe &&
      !(marker !== undefined && marker >= 0xe0 && marker <= 0xef)
    )
      invalid();
    offset += length;
  }
  invalid();
}

const unsafeOfficePath =
  /(?:^|\/)(?:vba[^/]*|macros?|macrosheets?|activex|embeddings?|objectpool|customui|externallinks?|encryptedpackage|encryptioninfo)(?:\/|\.|$)/iu;
const embedded = (bytes: Buffer) =>
  has(bytes, zip) || has(bytes, ole) || bytes.subarray(0, 5).toString() === '%PDF-';

async function checkZip(bytes: Buffer, word: boolean) {
  if (!has(bytes, zip)) invalid();
  const file = await new Promise<ZipFile>((resolve, reject) =>
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true, autoClose: false },
      (error, value) => (error ? reject(error) : resolve(value)),
    ),
  );
  let expanded = 0;
  const seen = new Set<string>();
  let types = '',
    relationship = '',
    main = '';
  const document = word ? 'word/document.xml' : 'xl/workbook.xml';
  try {
    if (file.entryCount > entryLimit) invalid();
    await new Promise<void>((resolve, reject) => {
      file.on('error', reject);
      file.once('end', resolve);
      file.on('entry', (entry: Entry) => {
        void (async () => {
          const name = entry.fileName.toLowerCase();
          if (
            entry.generalPurposeBitFlag & 1 ||
            seen.size >= entryLimit ||
            seen.has(name) ||
            unsafeOfficePath.test(name) ||
            Array.from(name).some((character) => character.charCodeAt(0) < 32) ||
            /[\\:%]|(^|\/)\.{1,2}(\/|$)/u.test(name) ||
            entry.uncompressedSize > expandedLimit - expanded
          )
            invalid();
          seen.add(name);
          if (!name.endsWith('/')) {
            const stream = await new Promise<NodeJS.ReadableStream>((ready, fail) =>
              file.openReadStream(entry, (error, value) => (error ? fail(error) : ready(value))),
            );
            const chunks: Buffer[] = [];
            try {
              for await (const chunk of stream) {
                const data = Buffer.from(chunk);
                expanded += data.length;
                if (expanded > expandedLimit) invalid();
                chunks.push(data);
              }
            } finally {
              (stream as import('node:stream').Readable).destroy();
            }
            const data = Buffer.concat(chunks);
            if (crc32(data) !== entry.crc32 || embedded(data)) invalid();
            if (/\.(?:xml|rels)$/u.test(name)) {
              const text = new TextDecoder('utf-8', { fatal: true })
                .decode(data)
                .replace(/&#(?:x([a-f0-9]+)|(\d+));/giu, (_, hex: string, decimal: string) => {
                  const code = hex ? parseInt(hex, 16) : Number(decimal);
                  if (!Number.isSafeInteger(code) || code < 1 || code > 0x10ffff) return invalid();
                  return String.fromCodePoint(code);
                });
              if (
                /<!\s*(?:doctype|entity)|TargetMode\s*=\s*["']External|(?:macroEnabled|vbaProject|activeX|oleObject|DDEAUTO|DDE\s|externalLink|altChunk|instrText|fldSimple|fldChar|WEBSERVICE|RTD\s*\(|CTL:\w+)/iu.test(
                  text,
                )
              )
                invalid();
              if (name === '[content_types].xml') types = text;
              if (name === '_rels/.rels') relationship = text;
              if (name === document) main = text;
            }
          }
          file.readEntry();
        })().catch(reject);
      });
      file.readEntry();
    });
  } finally {
    file.close();
  }
  const type = word ? 'wordprocessingml.document.main+xml' : 'spreadsheetml.sheet.main+xml';
  if (
    !types.includes('application/vnd.openxmlformats-officedocument.' + type) ||
    !types.includes('/' + document) ||
    !relationship.includes(document) ||
    !relationship.includes('/officeDocument') ||
    !(word ? /<(?:\w+:)?document\b/u : /<(?:\w+:)?workbook\b/u).test(main)
  )
    invalid();
}

function checkOle(bytes: Buffer, word: boolean) {
  if (!has(bytes, ole) || bytes.length < 512) invalid();
  const container = cfb.read(bytes, { type: 'buffer' });
  if (container.FileIndex.length > entryLimit) invalid();
  const streams = new Map<string, Buffer>();
  let expanded = 0;
  for (const [index, entry] of container.FileIndex.entries()) {
    const name = String(container.FullPaths[index]).toLowerCase();
    if (unsafeOfficePath.test(name) || name.split('/').filter(Boolean).length > 3) invalid();
    if (entry.type !== 2) continue;
    const data = Buffer.from(entry.content ?? []);
    expanded += data.length;
    if (expanded > expandedLimit || embedded(data)) invalid();
    const leaf = name.split('/').at(-1)!;
    if (streams.has(leaf)) invalid();
    streams.set(leaf, data);
  }
  if (word) {
    const doc = streams.get('worddocument');
    if (!doc || doc.length < 32 || doc.readUInt16LE(0) !== 0xa5ec || doc.readUInt16LE(2) < 0x00c1)
      return invalid();
    const flags = doc.readUInt16LE(10);
    if ((flags & 0x8100) !== 0 || !streams.get(flags & 0x0200 ? '1table' : '0table')?.length)
      invalid();
    if ([...streams.keys()].some((key) => /(?:^|\W)(?:ole|object|macro|vba)/u.test(key))) invalid();
    const fields = /DDE(?:AUTO)?|INCLUDE(?:TEXT|PICTURE)|LINK\s|MACROBUTTON|HYPERLINK/iu;
    if (fields.test(doc.toString('latin1')) || fields.test(doc.toString('utf16le'))) invalid();
  } else {
    const workbook = streams.get('workbook');
    if (
      !workbook ||
      workbook.length < 12 ||
      workbook.readUInt16LE(0) !== 0x0809 ||
      workbook.readUInt16LE(4) !== 0x0600 ||
      workbook.readUInt16LE(6) !== 0x0005
    )
      return invalid();
    let offset = 0,
      eof = false;
    while (offset + 4 <= workbook.length) {
      const type = workbook.readUInt16LE(offset),
        length = workbook.readUInt16LE(offset + 2);
      offset += 4;
      if (
        offset + length > workbook.length ||
        [0x002f, 0x00d3, 0x01ae, 0x0023, 0x005d].includes(type)
      )
        invalid();
      if (
        type === 0x0809 &&
        (length < 4 || [0x0006, 0x0040].includes(workbook.readUInt16LE(offset + 2)))
      )
        invalid();
      if (type === 0x0085 && (length < 6 || [1, 6].includes(workbook[offset + 5]!))) invalid();
      eof = type === 0x000a;
      offset += length;
    }
    if (offset !== workbook.length || !eof) invalid();
  }
}

// Lambda bundles the handler and this module into one CommonJS entry. The worker
// loads that same bundle and executes only the inspection branch below.
if (!isMainThread && workerData?.type === 'finance-receipt-policy') {
  void inspectReceiptBytes(workerData.bytes, workerData.mediaType).then(
    () => parentPort?.postMessage(true),
    () => parentPort?.postMessage(false),
  );
}

export function checkReceiptPolicy(bytes: Uint8Array, mediaType: MediaType): Promise<boolean> {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_FINANCE_RECEIPT_BYTES)
    return Promise.resolve(false);
  return new Promise((resolve) => {
    const worker = new Worker(__filename, {
      workerData: { type: 'finance-receipt-policy', bytes: Uint8Array.from(bytes), mediaType },
      resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    const finish = (clean: boolean) => {
      clearTimeout(deadline);
      void worker.terminate().catch(() => {});
      resolve(clean);
    };
    const deadline = setTimeout(() => finish(false), 5000);
    worker.once('message', (reply: unknown) => finish(reply === true));
    worker.once('error', () => finish(false));
    worker.once('exit', () => finish(false));
  });
}
