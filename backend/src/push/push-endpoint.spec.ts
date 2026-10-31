import { createECDH } from 'node:crypto';
import {
  validatePushSubscription,
  isPublicPushAddress,
  safePushPath,
} from './push-endpoint';
const p256dh = createECDH('prime256v1').generateKeys().toString('base64url');
const auth = Buffer.alloc(16, 7).toString('base64url');
const input = (endpoint: string) => ({ endpoint, keys: { p256dh, auth } });
describe('browser push endpoint trust boundary', () => {
  test.each([
    'http://fcm.googleapis.com/token',
    'https://127.0.0.1/token',
    'https://fcm.googleapis.com.evil.example/token',
    'https://evilpush.apple.com/token',
    'https://fcm.googleapis.com:8443/token',
    'https://user:pass@fcm.googleapis.com/token',
    'https://fcm.googleapis.com/token#fragment',
    'https://metadata.google.internal/token',
  ])('rejects untrusted endpoint %s', async (endpoint) => {
    await expect(
      validatePushSubscription(input(endpoint), async () => [
        { address: '8.8.8.8', family: 4 },
      ]),
    ).rejects.toThrow();
  });
  test.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    '2001:0000:1::1',
    '2001:2::1',
    '2001:10::1',
    '192.88.99.1',
  ])('rejects nonpublic DNS %s', async (address) => {
    expect(isPublicPushAddress(address)).toBe(false);
    await expect(
      validatePushSubscription(
        input('https://fcm.googleapis.com/token'),
        async () => [{ address, family: address.includes(':') ? 6 : 4 }],
      ),
    ).rejects.toThrow();
  });
  it('accepts real browser-service endpoint shape and valid encryption keys', async () => {
    const result = await validatePushSubscription(
      input('https://web.push.apple.com/token'),
      async () => [{ address: '17.57.144.10', family: 4 }],
    );
    expect(result.endpoint).toBe('https://web.push.apple.com/token');
    expect(result.address).toEqual({ address: '17.57.144.10', family: 4 });
  });
  it('rejects malformed keys and mixed public/private DNS answers', async () => {
    await expect(
      validatePushSubscription(
        {
          ...input('https://fcm.googleapis.com/token'),
          keys: { p256dh, auth: 'short' },
        },
        async () => [{ address: '8.8.8.8', family: 4 }],
      ),
    ).rejects.toThrow();
    await expect(
      validatePushSubscription(
        input('https://fcm.googleapis.com/token'),
        async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ],
      ),
    ).rejects.toThrow();
  });
});

describe('push click destination boundary', () => {
  test.each([
    '//evil.test',
    '/admin',
    '/stages/../../admin',
    '/news/%2e%2e/admin',
    '/news\\evil',
    '/news?x=1\n',
  ])('rejects %s', (path) => expect(() => safePushPath(path)).toThrow());
  it('keeps allowed app paths and query parameters', () =>
    expect(safePushPath('/stages/123?tab=info')).toBe('/stages/123?tab=info'));
});
