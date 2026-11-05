import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';

// Reject malformed wrappers and decompression bombs before a media upload
// can be promoted from an untrusted staging key to a published S3 object.
// This structural parser is deliberately dependency-free; a future image
// decoding service may add deeper pixel-level verification.
const fail = () => { throw new BadRequestException('Файл повреждён или не соответствует заявленному формату'); };
const MAX_PIXELS = 25_000_000;
const pixels = (width: number, height: number) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_PIXELS) fail();
};
const pngCrc = (bytes: Uint8Array, start: number, end: number) => {
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

function validatePng(bytes: Buffer) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail();
  let offset = 8, count = 0, imageData = false, ended = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail();
    const size = bytes.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) fail();
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || pngCrc(bytes, offset + 4, offset + 8 + size) !== bytes.readUInt32BE(offset + 8 + size)) fail();
    if (count === 0) {
      if (type !== 'IHDR' || size !== 13) fail();
      pixels(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12));
      if (![1, 2, 4, 8, 16].includes(bytes[offset + 16]) || ![0, 2, 3, 4, 6].includes(bytes[offset + 17])) fail();
    }
    if (type === 'IDAT') imageData = true;
    if (type === 'IEND') {
      if (size !== 0 || !imageData || end !== bytes.length) fail();
      ended = true;
    }
    offset = end;
    count += 1;
    if (count > 30000) fail();
  }
  if (!ended) fail();
}

function validateJpeg(bytes: Buffer) {
  if (bytes.length < 14 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) fail();
  let offset = 2, sawFrame = false, sawScan = false;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) fail();
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) fail();
    if (offset + 2 > bytes.length) fail();
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) fail();
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (size < 8) fail();
      pixels(bytes.readUInt16BE(offset + 3), bytes.readUInt16BE(offset + 5));
      sawFrame = true;
    }
    if (marker === 0xda) {
      // Even a correctly formed SOF cannot rescue a truncated entropy stream.
      if (offset + size >= bytes.length - 2) fail();
      sawScan = true; break;
    }
    offset += size;
  }
  if (!sawFrame || !sawScan) fail();
}

function validateWebp(bytes: Buffer) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) fail();
  let offset = 12, header = false, imageData = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    if (payload + length > bytes.length) fail();
    if (!header && type === 'VP8X' && length >= 10) {
      pixels(1 + bytes.readUIntLE(payload + 4, 3), 1 + bytes.readUIntLE(payload + 7, 3));
      header = true;
    }
    if (type === 'VP8 ' && length >= 10) imageData = true;
    if (!header && type === 'VP8 ' && length >= 10 && bytes[payload + 3] === 0x9d &&
        bytes[payload + 4] === 0x01 && bytes[payload + 5] === 0x2a) {
      pixels(bytes.readUInt16LE(payload + 6) & 0x3fff, bytes.readUInt16LE(payload + 8) & 0x3fff);
      header = true;
    }
    if (type === 'VP8L' && length >= 5) imageData = true;
    if (!header && type === 'VP8L' && length >= 5 && bytes[payload] === 0x2f) {
      const width = 1 + (((bytes[payload + 2] & 0x3f) << 8) | bytes[payload + 1]);
      const height = 1 + (((bytes[payload + 4] & 0x0f) << 10) | (bytes[payload + 3] << 2) | (bytes[payload + 2] >>> 6));
      pixels(width, height);
      header = true;
    }
    offset = payload + length + (length & 1);
  }
  if (!header || !imageData || offset !== bytes.length) fail();
}

export function validateImageBytes(bytes: Buffer, contentType: string) {
  if (contentType === 'image/png') return validatePng(bytes);
  if (contentType === 'image/jpeg') return validateJpeg(bytes);
  if (contentType === 'image/webp') return validateWebp(bytes);
  fail();
}

export function validateDocxBytes(bytes: Buffer) {
  // Validate the ZIP central directory and required OOXML parts, rather than
  // accepting any file starting with PK (including renamed ZIP archives).
  if (bytes.length < 64 || bytes.readUInt32LE(0) !== 0x04034b50) fail();
  const min = Math.max(0, bytes.length - 65557);
  let footer = -1;
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {
      footer = i; break;
    }
  }
  if (footer < 0 || bytes.readUInt16LE(footer + 4) !== 0 || bytes.readUInt16LE(footer + 6) !== 0) fail();
  const files = bytes.readUInt16LE(footer + 10);
  const centralSize = bytes.readUInt32LE(footer + 12);
  let offset = bytes.readUInt32LE(footer + 16);
  if (files < 2 || files > 6000 || offset + centralSize !== footer) fail();
  const mandatory = new Map<string, boolean>([['[Content_Types].xml', false], ['word/document.xml', false]]);
  let totalExpanded = 0;
  for (let i = 0; i < files; i += 1) {
    if (offset + 46 > footer || bytes.readUInt32LE(offset) !== 0x02014b50) fail();
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > footer || !nameLength || ![0, 8].includes(method)) fail();
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') ||
        /(?:vbaProject\.bin|\.exe|\.js)$/i.test(name)) fail();
    totalExpanded += uncompressed;
    if (totalExpanded > 40 * 1024 * 1024 || uncompressed > 10 * 1024 * 1024) fail();
    // External OOXML relationships may trigger remote requests when opened
    // by a document processor. Inspect all .rels parts, not only the main XML.
    if (mandatory.has(name) || name.endsWith('.rels')) {
      const local = bytes.readUInt32LE(offset + 42);
      if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) fail();
      const data = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      if (data + compressed > bytes.length) fail();
      const raw = bytes.subarray(data, data + compressed);
      let xml: Buffer = Buffer.alloc(0);
      try {
        xml = method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: 10 * 1024 * 1024 });
      } catch { fail(); }
      if (xml.length !== uncompressed || !xml.toString('utf8').includes('<')) fail();
      if (name.endsWith('.rels') && /TargetMode\s*=\s*["']External["']/i.test(xml.toString('utf8'))) {
        throw new BadRequestException('DOCX содержит внешние связи. Удалите их перед загрузкой.');
      }
      if (mandatory.has(name)) mandatory.set(name, true);
    }
    offset = next;
  }
  if (offset !== footer || [...mandatory.values()].some(found => !found)) fail();
}
