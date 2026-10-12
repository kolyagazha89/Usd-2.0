import { deflateRawSync } from 'node:zlib';
import { parseDocxRules } from './docx-rules-parser';

function makeDocx(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(value);
    const compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const localBytes = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const count = Object.keys(entries).length;
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

describe('parseDocxRules', () => {
  it('preserves headings, text across formatted runs, numbered lists, and tables', () => {
    const document = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Limited</w:t></w:r><w:r><w:t xml:space="preserve"> 2.0</w:t></w:r></w:p>
      <w:p><w:r><w:t>Основной текст.</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t>Пункт списка</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Класс</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Значение</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Limited</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>45k</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:sectPr/></w:body></w:document>`;
    const numbering = `<w:numbering><w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="3"/></w:num></w:numbering>`;
    const blocks = parseDocxRules(makeDocx({ 'word/document.xml': document, 'word/numbering.xml': numbering }));
    expect(blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Limited 2.0' });
    expect(blocks[1]).toEqual({ type: 'paragraph', text: 'Основной текст.' });
    expect(blocks[2]).toEqual({ type: 'list-item', ordered: true, level: 0, text: 'Пункт списка' });
    expect(blocks[3]).toEqual({ type: 'table', rows: [['Класс', 'Значение'], ['Limited', '45k']] });
  });

  it('rejects data that is not a DOCX archive', () => {
    expect(() => parseDocxRules(Buffer.from('not docx'))).toThrow('Файл не похож на DOCX');
  });
});
