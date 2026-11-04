import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MediaTargetType } from '../generated/prisma/enums';
import { MediaService } from './media.service';

describe('bounded and privacy-safe RustFS media reads', () => {
  const originalFetch = global.fetch;
  let service: MediaService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      mediaUpload: {
        findFirst: jest.fn().mockResolvedValue({
          objectKey: 'private-storage-key', contentType: 'image/png',
        }),
      },
      siteSettings: { findUnique: jest.fn() },
    };
    service = new MediaService(prisma);
    jest.spyOn(service as any, 'presignedUrl').mockImplementation(
      () => 'http://internal-rustfs.example/test',
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const poster = () => service.getPublicMediaFile(MediaTargetType.SITE_ASSET, 'stage-poster-public');

  it('returns a real body from the RustFS proxy, not a signed storage URL', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    global.fetch = jest.fn().mockResolvedValue(new Response(bytes, {
      status: 200, headers: { 'content-type': 'image/png' },
    })) as typeof fetch;
    expect(await poster()).toEqual({ body: bytes, contentType: 'image/png' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('retries a transient RustFS GET exactly once and re-signs on every attempt', async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new Error('socket closed by storage'))
      .mockResolvedValueOnce(new Response(Buffer.from('PNG'), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    expect((await poster()).body.toString()).toBe('PNG');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((service as any).presignedUrl).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call: any[]) => call[1].method === 'GET')).toBe(true);
  });

  it('retries a 503 but refuses to retry HTTP 404 and 403', async () => {
    const fetched = jest.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(Buffer.from('OK'), { status: 200 }));
    global.fetch = fetched as typeof fetch;
    expect((await poster()).body.toString()).toBe('OK');
    expect(fetched).toHaveBeenCalledTimes(2);

    for (const [status, exception] of [
      [404, NotFoundException], [403, ServiceUnavailableException],
    ] as const) {
      const single = jest.fn().mockResolvedValue(new Response('', { status }));
      global.fetch = single as typeof fetch;
      await expect(poster()).rejects.toBeInstanceOf(exception);
      expect(single).toHaveBeenCalledTimes(1);
    }
  });

  it('fails closed when RustFS stays unavailable, without disclosing key or URL', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('signed-url secret should not escape'));
    global.fetch = failing as typeof fetch;
    await expect(poster()).rejects.toThrow('Временная ошибка чтения медиафайла');
    expect(failing).toHaveBeenCalledTimes(2);
    try { await poster(); } catch (error) {
      expect(String(error)).not.toContain('private-storage-key');
      expect(String(error)).not.toContain('signed-url secret');
    }
  });

  it('rejects oversized or empty payloads without re-requesting storage', async () => {
    for (const response of [
      new Response('x', { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } }),
      new Response(''),
    ]) {
      const once = jest.fn().mockResolvedValue(response);
      global.fetch = once as typeof fetch;
      await expect(poster()).rejects.toBeInstanceOf(BadRequestException);
      expect(once).toHaveBeenCalledTimes(1);
    }
  });

  it('also applies the same bounded read to authenticated previews', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(Buffer.from('preview'), { status: 200 }),
    ) as typeof fetch;
    const media = await service.getPrivateMediaFile(
      'admin-user', 'ADMIN', MediaTargetType.SITE_ASSET, 'branding-logoUrl',
    );
    expect(media.body.toString()).toBe('preview');
  });
});
