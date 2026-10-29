import { rewriteLegacyPublicMediaUrls } from './legacy-media-url';

const DEST = 'https://api.usd-russia.ru';
const OLD = 'https://usd-api-production.up.railway.app';

describe('Legacy public URLs', () => {
  it('uses current API for archived CMS media links, nested arrays and cache parameters', () => {
    const raw = {
      branding: { logoUrl: OLD + '/media/public-file/SITE_ASSET/branding-logoUrl' },
      homepage: {
        stagePosters: { stage: OLD + '/media/public-file/SITE_ASSET/stage-poster-123?version=2' },
      },
      news: [{ imageUrl: OLD + '/media/public-file/SITE_ASSET/news-123' }],
    };
    const result = rewriteLegacyPublicMediaUrls(raw, DEST);
    expect(result.branding.logoUrl).toBe(DEST + '/media/public-file/SITE_ASSET/branding-logoUrl');
    expect(result.homepage.stagePosters.stage).toBe(DEST + '/media/public-file/SITE_ASSET/stage-poster-123?version=2');
    expect(result.news[0].imageUrl).toBe(DEST + '/media/public-file/SITE_ASSET/news-123');
    expect(raw.branding.logoUrl).toBe(OLD + '/media/public-file/SITE_ASSET/branding-logoUrl');
  });
  it('does not rewrite user-supplied external URLs, non-public assets, or lookalike domains', () => {
    const values = [
      'https://example.org/media/public-file/SITE_ASSET/a',
      'https://usd-api-production.up.railway.app.evil.com/media/public-file/SITE_ASSET/a',
      OLD + '/media/private-file/SITE_ASSET/a',
      OLD + '/auth/refresh',
      OLD + '/media/public-file/SITE_ASSET/',
      '/media/public-file/SITE_ASSET/relative',
      'javascript:alert(1)',
    ];
    expect(rewriteLegacyPublicMediaUrls(values, DEST)).toEqual(values);
  });
  it('refuses insecure or unrelated replacement API origins', () => {
    const url = OLD + '/media/public-file/SITE_ASSET/a';
    for (const target of ['http://api.usd-russia.ru','https://example.com',
      'https://api.usd-russia.ru.evil.com', 'https://user@api.usd-russia.ru']) {
      expect(rewriteLegacyPublicMediaUrls(url, target)).toBe(url);
    }
  });
});
