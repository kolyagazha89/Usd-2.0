import { inflateRawSync } from 'node:zlib';

export type RulesInlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type RulesBlock =
  | { type: 'heading'; level: number; text: string; runs?: RulesInlineRun[] }
  | { type: 'paragraph'; text: string; runs?: RulesInlineRun[] }
  | { type: 'list-item'; ordered: boolean; level: number; text: string; runs?: RulesInlineRun[] }
  | { type: 'table'; rows: string[][]; cellRuns?: RulesInlineRun[][][] };

const MAX_UNCOMPRESSED_ENTRY = 20 * 1024 * 1024;

function readZipEntry(buffer: Buffer, wanted: string): Buffer {
  let eocd = -1;
  const lower = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= lower; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('DOCX не является корректным ZIP-архивом');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Повреждён каталог DOCX');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === wanted) {
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Повреждён файл DOCX');
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      if (start + compressedSize > buffer.length) throw new Error('Повреждён файл DOCX');
      const compressed = buffer.subarray(start, start + compressedSize);
      if (method === 0) {
        if (compressed.length > MAX_UNCOMPRESSED_ENTRY) throw new Error('DOCX содержит слишком большой элемент');
        return Buffer.from(compressed);
      }
      if (method === 8) return inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_ENTRY });
      throw new Error('Неподдерживаемый способ сжатия DOCX');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('В DOCX отсутствует основной текст документа');
}

function decodeXml(value: string): string {
  return value
    .replace(/<w:tab\b[^>]*\/>/g, '\\t')
    .replace(/<w:br\b[^>]*\/>/g, '\\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function attributes(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of xml.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) result[match[1]] = decodeXml(match[2]);
  return result;
}

function safeHref(value: string | undefined): string | undefined {
  const href = (value ?? '').trim();
  if (!href || href.startsWith('#')) return href || undefined;
  try {
    const url = new URL(href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : undefined;
  } catch { return undefined; }
}

function relationshipTargets(buffer: Buffer): Map<string, string> {
  const targets = new Map<string, string>();
  try {
    const xml = readZipEntry(buffer, 'word/_rels/document.xml.rels').toString('utf8');
    for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
      const attrs = attributes(match[1]);
      if (attrs.Id && attrs.Target && attrs.TargetMode === 'External') {
        const href = safeHref(attrs.Target);
        if (href) targets.set(attrs.Id, href);
      }
    }
  } catch { /* A DOCX without external hyperlinks is valid. */ }
  return targets;
}

function runText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => decodeXml(match[1])).join('');
}

function parseRuns(xml: string, targets: Map<string, string>): RulesInlineRun[] {
  const runs: RulesInlineRun[] = [];
  const appendRun = (runXml: string, href?: string) => {
    const text = runText(runXml);
    if (!text) return;
    const properties = runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
    const boldTag = properties.match(/<w:b\b([^>]*)\/?\s*>/);
    const italicTag = properties.match(/<w:i\b([^>]*)\/?\s*>/);
    const bold = Boolean(boldTag) && attributes(boldTag[1])['w:val'] !== '0' && attributes(boldTag[1])['w:val'] !== 'false';
    const italic = Boolean(italicTag) && attributes(italicTag[1])['w:val'] !== '0' && attributes(italicTag[1])['w:val'] !== 'false';
    const next: RulesInlineRun = { text };
    if (bold) next.bold = true;
    if (italic) next.italic = true;
    if (href) next.href = href;
    const previous = runs[runs.length - 1];
    if (previous && previous.bold === next.bold && previous.italic === next.italic && previous.href === next.href) previous.text += text;
    else runs.push(next);
  };
  const tokens = /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>|<w:r\b[\s\S]*?<\/w:r>/g;
  for (const match of xml.matchAll(tokens)) {
    if (match[1] !== undefined) {
      const attrs = attributes(match[1]);
      const href = safeHref(targets.get(attrs['r:id']) ?? (attrs['w:anchor'] ? '#' + attrs['w:anchor'] : undefined));
      const inner = match[2];
      let found = false;
      for (const run of inner.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)) { appendRun(run[0], href); found = true; }
      if (!found) appendRun(inner, href);
    } else appendRun(match[0]);
  }
  return runs;
}

function plainText(runs: RulesInlineRun[]): string {
  return runs.map(run => run.text).join('').replace(/\s+/g, ' ').trim();
}

function parseParagraph(xml: string, orderedByNumId: Map<string, boolean>, targets: Map<string, string>): RulesBlock | null {
  const runs = parseRuns(xml, targets);
  const text = plainText(runs);
  if (!text) return null;
  const style = xml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1] ?? '';
  const heading = style.match(/Heading([1-6])/i);
  if (heading) return { type: 'heading', level: Number(heading[1]), text, runs };
  const numPr = xml.match(/<w:numPr\b[\s\S]*?<\/w:numPr>/)?.[0] ?? '';
  if (numPr) {
    const level = Number(numPr.match(/<w:ilvl\b[^>]*w:val="(\d+)"/)?.[1] ?? 0);
    const numId = numPr.match(/<w:numId\b[^>]*w:val="(\d+)"/)?.[1] ?? '';
    const ordered = orderedByNumId.get(numId) ?? false;
    return { type: 'list-item', ordered, level: Math.min(level, 8), text, runs };
  }
  return { type: 'paragraph', text, runs };
}

export function parseDocxRules(buffer: Buffer): RulesBlock[] {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('Файл не похож на DOCX');
  const document = readZipEntry(buffer, 'word/document.xml').toString('utf8');
  const body = document.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1];
  if (!body) throw new Error('Не удалось прочитать текст DOCX');
  const targets = relationshipTargets(buffer);
  const orderedByNumId = new Map<string, boolean>();
  try {
    const numbering = readZipEntry(buffer, 'word/numbering.xml').toString('utf8');
    const orderedByAbstract = new Map<string, boolean>();
    for (const match of numbering.matchAll(/<w:abstractNum\b([^>]*)>([\s\S]*?)<\/w:abstractNum>/g)) {
      const abstractId = match[1].match(/w:abstractNumId="(\d+)"/)?.[1];
      if (!abstractId) continue;
      const formats = [...match[2].matchAll(/<w:numFmt\b[^>]*w:val="([^"]+)"/g)].map(item => item[1]);
      orderedByAbstract.set(abstractId, formats.some(format => format !== 'bullet' && format !== 'none'));
    }
    for (const match of numbering.matchAll(/<w:num\b([^>]*)>([\s\S]*?)<\/w:num>/g)) {
      const numId = match[1].match(/w:numId="(\d+)"/)?.[1];
      const abstractId = match[2].match(/<w:abstractNumId\b[^>]*w:val="(\d+)"/)?.[1];
      if (numId && abstractId) orderedByNumId.set(numId, orderedByAbstract.get(abstractId) ?? false);
    }
  } catch { /* Some Word documents do not define numbering styles. */ }
  const blocks: RulesBlock[] = [];
  const elements = body.match(/<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g) ?? [];
  for (const element of elements) {
    if (element.startsWith('<w:tbl')) {
      const rows: string[][] = [];
      const cellRuns: RulesInlineRun[][][] = [];
      for (const row of element.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
        const values: string[] = [];
        const richCells: RulesInlineRun[][] = [];
        for (const cell of row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
          const paragraphs = [...cell[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(p => parseRuns(p[0], targets));
          const cellRunsValue = paragraphs.flatMap((p, index) => index ? [{ text: ' ' }, ...p] : p);
          const cellText = plainText(cellRunsValue);
          if (cellText) {
            values.push(cellText);
            richCells.push(cellRunsValue);
          } else {
            values.push('');
            richCells.push([]);
          }
        }
        if (values.some(value => value.length)) { rows.push(values); cellRuns.push(richCells); }
      }
      if (rows.length) blocks.push({ type: 'table', rows, cellRuns });
    } else {
      const block = parseParagraph(element, orderedByNumId, targets);
      if (block) blocks.push(block);
    }
    if (blocks.length > 10000) throw new Error('Документ содержит слишком много элементов для предпросмотра');
  }
  if (!blocks.length) throw new Error('В документе не найден текст');
  return blocks;
}
