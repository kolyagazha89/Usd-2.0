import { deflateSync } from 'node:zlib';
import { validateDocxBytes, validateImageBytes } from './media-format-validation';

const crc = (data: Buffer) => {
  let sum = 0xffffffff;
  for (const b of data) {
    sum ^= b;
    for (let i = 0; i < 8; i += 1) sum = (sum >>> 1) ^ (sum & 1 ? 0xedb88320 : 0);
  }
  return (sum ^ 0xffffffff) >>> 0;
};
const chunk = (name: string, payload: Buffer) => {
  const body = Buffer.concat([Buffer.from(name, 'ascii'), payload]);
  const header = Buffer.alloc(4), checksum = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  checksum.writeUInt32BE(crc(body));
  return Buffer.concat([header, body, checksum]);
};
const png = (width=1, height=1) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0,255,0,0,255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const zip = (parts: Array<[string, string]>) => {
  const local: Buffer[] = [], central: Buffer[] = [];
  let position = 0;
  for (const [filename, text] of parts) {
    const name = Buffer.from(filename, 'utf8'), bytes = Buffer.from(text, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt16LE(20,4);
    head.writeUInt32LE(crc(bytes),14);
    head.writeUInt32LE(bytes.length,18);
    head.writeUInt32LE(bytes.length,22);
    head.writeUInt16LE(name.length,26);
    local.push(head,name,bytes);
    const centralHead = Buffer.alloc(46);
    centralHead.writeUInt32LE(0x02014b50);
    centralHead.writeUInt16LE(20,4);centralHead.writeUInt16LE(20,6);
    centralHead.writeUInt32LE(crc(bytes),16);
    centralHead.writeUInt32LE(bytes.length,20);
    centralHead.writeUInt32LE(bytes.length,24);
    centralHead.writeUInt16LE(name.length,28);
    centralHead.writeUInt32LE(position,42);
    central.push(centralHead,name);
    position += head.length + name.length + bytes.length;
  }
  const localData = Buffer.concat(local), centralData = Buffer.concat(central);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50);
  footer.writeUInt16LE(parts.length,8);
  footer.writeUInt16LE(parts.length,10);
  footer.writeUInt32LE(centralData.length,12);
  footer.writeUInt32LE(localData.length,16);
  return Buffer.concat([localData,centralData,footer]);
};

describe('media format validation before S3 promotion', () => {
  it('accepts a structurally valid PNG with bounded pixel dimensions', () => {
    expect(() => validateImageBytes(png(), 'image/png')).not.toThrow();
  });
  it('rejects truncated PNG and extreme dimensions even when chunk CRC is correct', () => {
    expect(() => validateImageBytes(png().subarray(0, 40), 'image/png')).toThrow();
    expect(() => validateImageBytes(png(10000, 10000), 'image/png')).toThrow();
  });
  it('rejects fake JPEG and WEBP wrappers without real image frame headers', () => {
    expect(() => validateImageBytes(Buffer.from([255,216,255,217]), 'image/jpeg')).toThrow();
    expect(() => validateImageBytes(Buffer.from('RIFF0000WEBPdata'), 'image/webp')).toThrow();
  });
  it('requires the real mandatory OOXML entries rather than a ZIP magic header', () => {
    const valid = zip([
      ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
      ['word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'],
    ]);
    expect(() => validateDocxBytes(valid)).not.toThrow();
    expect(() => validateDocxBytes(zip([['arbitrary.txt','not a docx'], ['second.txt','zip file']]))).toThrow();
    expect(() => validateDocxBytes(valid.subarray(0,valid.length-8))).toThrow();
    const withExternalLinks = zip([
      ['[Content_Types].xml','<Types/>'],
      ['word/document.xml','<w:document/>'],
      ['word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="External" Target="https://untrusted.example/x"/></Relationships>'],
    ]);
    expect(() => validateDocxBytes(withExternalLinks)).toThrow('внешние связи');
  });
});
