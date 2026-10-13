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
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1, text: 'Limited 2.0' });
    expect(blocks[1]).toMatchObject({ type: 'paragraph', text: 'Основной текст.' });
    expect(blocks[2]).toMatchObject({ type: 'list-item', ordered: true, level: 0, text: 'Пункт списка' });
    expect(blocks[3]).toMatchObject({ type: 'table', rows: [['Класс', 'Значение'], ['Limited', '45k']] });
  });


  it('preserves bold, italic and safe external hyperlinks in paragraphs and table cells', () => {
    const document = `<?xml version="1.0"?><w:document xmlns:w="x" xmlns:r="y"><w:body>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Жирный</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> курсив</w:t></w:r><w:hyperlink r:id="rId1"><w:r><w:rPr><w:b/></w:rPr><w:t> ссылка</w:t></w:r></w:hyperlink></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:hyperlink r:id="rId1"><w:r><w:t>Официальный источник</w:t></w:r></w:hyperlink></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`;
    const relationships = `<Relationships><Relationship Id="rId1" Type="hyperlink" Target="https://usd-russia.ru/rules" TargetMode="External"/></Relationships>`;
    const blocks = parseDocxRules(makeDocx({
      'word/document.xml': document,
      'word/_rels/document.xml.rels': relationships,
    }));
    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
      text: 'Жирный курсив ссылка',
      runs: [
        { text: 'Жирный', bold: true },
        { text: ' курсив', italic: true },
        { text: ' ссылка', bold: true, href: 'https://usd-russia.ru/rules' },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: 'table',
      rows: [['Официальный источник']],
      cellRuns: [[[ { text: 'Официальный источник', href: 'https://usd-russia.ru/rules' } ]]],
    });
  });

  it('drops unsafe external hyperlink schemes', () => {
    const document = `<w:document xmlns:w="x" xmlns:r="y"><w:body><w:p><w:hyperlink r:id="rId1"><w:r><w:t>небезопасно</w:t></w:r></w:hyperlink></w:p></w:body></w:document>`;
    const relationships = `<Relationships><Relationship Id="rId1" Type="hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>`;
    const [block] = parseDocxRules(makeDocx({
      'word/document.xml': document,
      'word/_rels/document.xml.rels': relationships,
    }));
    expect(block).toMatchObject({ type: 'paragraph', text: 'небезопасно', runs: [{ text: 'небезопасно' }] });
  });

  it('preserves duplicate headings, Cyrillic text, nested list levels and wide tables', () => {
    const duplicateHeading = '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Общие требования</w:t></w:r></w:p>';
    const listItem = (level: number, text: string) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="9"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const wideCells = Array.from({ length: 12 }, (_, index) =>
      `<w:tc><w:p><w:r><w:t>Колонка ${index + 1}</w:t></w:r></w:p></w:tc>`,
    ).join('');
    const document = `<w:document xmlns:w="x"><w:body>
      ${duplicateHeading}${duplicateHeading}
      ${listItem(0, 'Первый пункт')}${listItem(1, 'Вложенный пункт')}${listItem(2, 'Глубокий пункт')}
      <w:tbl><w:tr>${wideCells}</w:tr></w:tbl>
    </w:body></w:document>`;
    const numbering = '<w:numbering><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="9"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
    const blocks = parseDocxRules(makeDocx({ 'word/document.xml': document, 'word/numbering.xml': numbering }));

    expect(blocks.filter(block => block.type === 'heading')).toHaveLength(2);
    expect(blocks.filter(block => block.type === 'heading').map(block => block.text)).toEqual(['Общие требования', 'Общие требования']);
    expect(blocks.filter(block => block.type === 'list-item').map(block => block.level)).toEqual([0, 1, 2]);
    expect(blocks.filter(block => block.type === 'list-item').map(block => block.text)).toEqual(['Первый пункт', 'Вложенный пункт', 'Глубокий пункт']);
    const table = blocks.find(block => block.type === 'table');
    expect(table?.type === 'table' ? table.rows[0] : []).toHaveLength(12);
    expect(table?.type === 'table' ? table.rows[0][11] : '').toBe('Колонка 12');
  });

  it('ignores empty paragraphs and empty tables but rejects an entirely empty document', () => {
    const document = '<w:document xmlns:w="x"><w:body><w:p></w:p><w:tbl><w:tr><w:tc><w:p></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Содержимое</w:t></w:r></w:p></w:body></w:document>';
    expect(parseDocxRules(makeDocx({ 'word/document.xml': document }))).toMatchObject([
      { type: 'paragraph', text: 'Содержимое' },
    ]);
    const empty = '<w:document xmlns:w="x"><w:body><w:p></w:p><w:tbl><w:tr><w:tc><w:p></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
    expect(() => parseDocxRules(makeDocx({ 'word/document.xml': empty }))).toThrow('В документе не найден текст');
  });

  it('rejects malformed DOCX structure with a readable error', () => {
    const malformed = '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Оборванный документ</w:t></w:r></w:p>';
    expect(() => parseDocxRules(makeDocx({ 'word/document.xml': malformed }))).toThrow('Не удалось прочитать текст DOCX');
  });

  it('rejects oversized uncompressed XML entries before decompressing them', () => {
    const tooLarge = 'x'.repeat(20 * 1024 * 1024 + 1);
    const document = `<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>${tooLarge}</w:t></w:r></w:p></w:body></w:document>`;
    expect(() => parseDocxRules(makeDocx({ 'word/document.xml': document }))).toThrow('DOCX содержит слишком большой элемент');
  });

  it('rejects data that is not a DOCX archive', () => {
    expect(() => parseDocxRules(Buffer.from('not docx'))).toThrow('Файл не похож на DOCX');
  });
});
