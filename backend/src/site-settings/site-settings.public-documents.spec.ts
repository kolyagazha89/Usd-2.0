import { deflateRawSync } from 'node:zlib';
import { NotFoundException } from '@nestjs/common';
import { MediaTargetType } from '../generated/prisma/enums';
import { SiteSettingsController } from './site-settings.controller';

function oneParagraphDocx(text: string): Buffer {
  const name = Buffer.from('word/document.xml');
  const raw = Buffer.from('<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>');
  const compressed = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  const offset = Buffer.concat([local, name, compressed]);
  const directory = Buffer.concat([central, name]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset.length, 16);
  return Buffer.concat([offset, directory, end]);
}

describe('public legal document reader', () => {
  const id = 'legal-document-privacyPolicy-approved';
  const doc = { targetId: id, fileName: 'Policy.docx', url: 'https://api.example.test/media/public-file/SITE_ASSET/' + id };
  const service = { getPublic: jest.fn() };
  const media = { getPublicMediaFile: jest.fn() };
  const controller = new SiteSettingsController(service as any, media as any);

  beforeEach(() => {
    jest.clearAllMocks();
    service.getPublic.mockResolvedValue({
      success: true, settings: { legal: { legalApproved: true, documents: { privacyPolicy: doc } } },
    });
    media.getPublicMediaFile.mockResolvedValue({
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: oneParagraphDocx('Политика USD'),
    });
  });

  it('returns readable blocks for an approved published DOCX, using the checked media proxy', async () => {
    await expect(controller.publicDocument('privacyPolicy')).resolves.toMatchObject({
      success: true, fileName: 'Policy.docx',
      blocks: [{ type: 'paragraph', text: 'Политика USD' }],
    });
    expect(media.getPublicMediaFile).toHaveBeenCalledWith(MediaTargetType.SITE_ASSET, id);
  });

  it('never reads files for unknown keys, including prototype properties', async () => {
    for (const key of ['__proto__', 'constructor', 'not-a-legal-document', '../private']) {
      await expect(controller.publicDocument(key)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(media.getPublicMediaFile).not.toHaveBeenCalled();
  });

  it('does not read a draft or revoked document', async () => {
    service.getPublic.mockResolvedValue({ success: true, settings: { legal: { legalApproved: false, documents: {} } } });
    await expect(controller.publicDocument('privacyPolicy')).rejects.toBeInstanceOf(NotFoundException);
    expect(media.getPublicMediaFile).not.toHaveBeenCalled();
  });

  it('rejects non-Word content instead of rendering it as a legal document', async () => {
    media.getPublicMediaFile.mockResolvedValue({ contentType: 'image/png', body: Buffer.from('PNG') });
    await expect(controller.publicDocument('privacyPolicy')).rejects.toThrow('Файл документа недоступен');
  });
});
