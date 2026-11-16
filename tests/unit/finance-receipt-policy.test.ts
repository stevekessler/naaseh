import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import sharp from 'sharp';
import { financeReceiptMediaTypes } from '@naaseh/domain';
import { inspectReceiptBytes } from '../../apps/api/src/attachments/receipt-policy-checker.js';
import {
  fixturePdf,
  officeFixture,
  legacyOfficeFixture,
} from '../fixtures/finance/receipts/documents.js';
import { describe, expect, it } from 'vitest';
import {
  validateFilePolicy,
  validateReceiptFilePolicy,
} from '../../apps/api/src/attachments/file-policy.js';

const types = financeReceiptMediaTypes;

describe('Finance receipt file declarations', () => {
  it.each(Object.entries(types))(
    'accepts %s at the exact byte boundaries',
    (extension, mediaType) => {
      for (const sizeBytes of [1, 10_000_000]) {
        expect(
          validateReceiptFilePolicy({
            filename: 'Invoice.' + extension.toUpperCase(),
            mediaType,
            sizeBytes,
          }),
        ).toMatchObject({ mediaType, sizeBytes });
      }
    },
  );

  it.each([0, 10_000_001, 1.5, Infinity])('rejects an invalid size of %s', (sizeBytes) => {
    expect(() =>
      validateReceiptFilePolicy({
        filename: 'receipt.pdf',
        mediaType: 'application/pdf',
        sizeBytes,
      }),
    ).toThrow();
  });

  it('checks claimed type against the sanitized final extension', () => {
    expect(() =>
      validateReceiptFilePolicy({ filename: 'office.docm', mediaType: types.docx, sizeBytes: 10 }),
    ).toThrow();
    expect(() =>
      validateReceiptFilePolicy({ filename: 'receipt.jpg', mediaType: types.pdf, sizeBytes: 10 }),
    ).toThrow();
    expect(() =>
      validateReceiptFilePolicy({
        filename: 'x.pdf',
        mediaType: types.pdf,
        sizeBytes: 10,
        existingCount: 100,
      } as never),
    ).not.toThrow();
    expect(
      validateReceiptFilePolicy({
        filename: '../Invoice.pdf',
        mediaType: 'application/octet-stream',
        sizeBytes: 1,
      }),
    ).toMatchObject({ filename: '.._Invoice.pdf', mediaType: types.pdf });
  });

  it('preserves the generic policy and its file count cap', () => {
    expect(
      validateFilePolicy({ filename: 'notes.txt', mediaType: 'text/plain', sizeBytes: 1 }),
    ).toBeDefined();
    expect(() =>
      validateFilePolicy({
        filename: 'notes.txt',
        mediaType: 'text/plain',
        sizeBytes: 1,
        existingCount: 10,
      }),
    ).toThrow();
    expect(() =>
      validateReceiptFilePolicy({ filename: 'notes.txt', mediaType: 'text/plain', sizeBytes: 1 }),
    ).toThrow();
  });
});

describe('Finance receipt content inspection', () => {
  it('checks PDF signatures, traditional xrefs, and escaped active action names', async () => {
    await expect(inspectReceiptBytes(fixturePdf(), types.pdf)).resolves.toBeUndefined();
    await expect(
      inspectReceiptBytes(fixturePdf('/Open#41ction 4 0 R'), types.pdf),
    ).rejects.toThrow();
    await expect(inspectReceiptBytes(fixturePdf('/Type /ObjStm'), types.pdf)).rejects.toThrow();
    await expect(inspectReceiptBytes(Buffer.from('%PDF-1.4'), types.pdf)).rejects.toThrow();
  });

  it('requires a complete image and the declared media type', async () => {
    const image = sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } });
    const jpeg = await image.jpeg().toBuffer();
    const png = await image.png().toBuffer();
    await expect(inspectReceiptBytes(jpeg, types.jpg)).resolves.toBeUndefined();
    await expect(inspectReceiptBytes(png, types.png)).resolves.toBeUndefined();
    await expect(inspectReceiptBytes(jpeg, types.png)).rejects.toThrow();
    await expect(inspectReceiptBytes(png.subarray(0, -1), types.png)).rejects.toThrow();
  });

  it('distinguishes Word from Excel, and rejects VBA, external relationships and encryption', async () => {
    await expect(inspectReceiptBytes(officeFixture(true), types.docx)).resolves.toBeUndefined();
    await expect(inspectReceiptBytes(officeFixture(false), types.xlsx)).resolves.toBeUndefined();
    await expect(
      inspectReceiptBytes(legacyOfficeFixture(true), types.doc),
    ).resolves.toBeUndefined();
    await expect(
      inspectReceiptBytes(legacyOfficeFixture(false), types.xls),
    ).resolves.toBeUndefined();
    await expect(inspectReceiptBytes(officeFixture(false), types.docx)).rejects.toThrow();
    await expect(
      inspectReceiptBytes(officeFixture(true, [['word/vbaProject.bin', 'VBA']]), types.docx),
    ).rejects.toThrow();
    await expect(
      inspectReceiptBytes(
        officeFixture(true, [
          ['word/_rels/document.xml.rels', '<Relationship TargetMode="&#69;xternal"/>'],
        ]),
        types.docx,
      ),
    ).rejects.toThrow();
    await expect(inspectReceiptBytes(legacyOfficeFixture(true, true), types.doc)).rejects.toThrow();
    await expect(
      inspectReceiptBytes(legacyOfficeFixture(false, true), types.xls),
    ).rejects.toThrow();
  });

  it('bounds archive expansion, entries, and nested content', async () => {
    await expect(
      inspectReceiptBytes(
        officeFixture(true, [['word/large.bin', Buffer.alloc(50_000_001)]]),
        types.docx,
      ),
    ).rejects.toThrow();
    await expect(
      inspectReceiptBytes(
        officeFixture(
          true,
          Array.from({ length: 1000 }, (_, i) => ['word/' + i, 'x']),
        ),
        types.docx,
      ),
    ).rejects.toThrow();
    await expect(
      inspectReceiptBytes(
        officeFixture(false, [['xl/media/nested.bin', officeFixture(true)]]),
        types.xlsx,
      ),
    ).rejects.toThrow();
  });
});

it('runs inspection through the packaged worker entry used by the Lambda', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'naaseh-receipt-worker-'));
  try {
    const bundle = join(directory, 'index.cjs');
    await build({
      entryPoints: ['apps/api/src/attachments/receipt-policy-checker.ts'],
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      logLevel: 'silent',
    });
    const script = `const check = require(${JSON.stringify(bundle)}).checkReceiptPolicy;
      const good = Buffer.from(${JSON.stringify(fixturePdf().toString('base64'))}, 'base64');
      const bad = Buffer.from(${JSON.stringify(fixturePdf('/AA 4 0 R').toString('base64'))}, 'base64');
      (async () => { console.log(JSON.stringify([
        await check(good, 'application/pdf'),
        await check(bad, 'application/pdf'),
      ])); })().catch(() => process.exit(1));`;
    const { stdout } = await promisify(execFile)(process.execPath, ['-e', script]);
    expect(JSON.parse(stdout)).toEqual([true, false]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
