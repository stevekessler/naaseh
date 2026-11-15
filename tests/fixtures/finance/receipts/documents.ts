import { crc32, deflateRawSync } from 'node:zlib';
import * as cfb from 'cfb';

export function fixturePdf(action = '') {
  const drawing = '1 0 0 rg 0 0 40 40 re f';
  const objects = [
    '<</Type /Catalog /Pages 2 0 R ' + action + '>>',
    '<</Type /Pages /Kids [3 0 R] /Count 1>>',
    '<</Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R>>',
    '<< /Length ' + drawing.length + ' >>\nstream\n' + drawing + '\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += index + 1 + ' 0 obj\n' + object + '\nendobj\n';
  }
  const xref = pdf.length;
  pdf += 'xref\n0 5\n0000000000 65535 f \n';
  for (const offset of offsets) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  return Buffer.from(pdf + 'trailer\n<</Size 5 /Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF\n');
}

export function zipFixture(parts: Iterable<[string, Buffer | string]>) {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let position = 0,
    count = 0;
  for (const [name, content] of parts) {
    const n = Buffer.from(name),
      bytes = Buffer.from(content),
      compressed = deflateRawSync(bytes);
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(n.length, 26);
    files.push(header, n, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(n.length, 28);
    entry.writeUInt32LE(position, 42);
    directory.push(entry, n);
    position += header.length + n.length + compressed.length;
    count++;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(
    directory.reduce((total, item) => total + item.length, 0),
    12,
  );
  end.writeUInt32LE(position, 16);
  return Buffer.concat([...files, ...directory, end]);
}

export function officeFixture(word: boolean, extras: Array<[string, Buffer | string]> = []) {
  const file = word ? 'word/document.xml' : 'xl/workbook.xml';
  const category = word ? 'wordprocessingml.document' : 'spreadsheetml.sheet';
  return zipFixture([
    [
      '[Content_Types].xml',
      `<Types><Override PartName="/${file}" ContentType="application/vnd.openxmlformats-officedocument.${category}.main+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `<Relationships><Relationship Type="test/officeDocument" Target="${file}"/></Relationships>`,
    ],
    [file, word ? '<w:document xmlns:w="urn:word"/>' : '<workbook/>'],
    ...extras,
  ]);
}

export function legacyOfficeFixture(word: boolean, encrypted = false) {
  const file = cfb.utils.cfb_new();
  if (word) {
    const fib = Buffer.alloc(512);
    fib.writeUInt16LE(0xa5ec);
    fib.writeUInt16LE(0x00c1, 2);
    if (encrypted) fib.writeUInt16LE(0x0100, 10);
    cfb.utils.cfb_add(file, 'WordDocument', fib);
    cfb.utils.cfb_add(file, '0Table', Buffer.alloc(64));
  } else {
    const workbook = Buffer.from(
      encrypted ? '09080400000605002f0000000a000000' : '09080400000605000a000000',
      'hex',
    );
    cfb.utils.cfb_add(file, 'Workbook', workbook);
  }
  return Buffer.from(cfb.write(file, { type: 'buffer' }));
}
