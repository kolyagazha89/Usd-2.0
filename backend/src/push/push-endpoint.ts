import { BadRequestException } from '@nestjs/common';
import { ECDH } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
export type PushAddress = { address: string; family: number };
export type PushResolver = (hostname: string) => Promise<PushAddress[]>;

const hasUnsafeCharacters = (value: string) =>
  /\s/.test(value) || Array.from(value).some((char) => char.charCodeAt(0) < 32);

export function isPublicPushAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && (b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const lower = new URL('http://[' + address + ']').hostname
      .slice(1, -1)
      .toLowerCase();
    return (
      /^[23]/.test(lower) &&
      !/^2001:(db8|0|2|10|20):/.test(lower) &&
      !lower.startsWith('2002:') &&
      !lower.startsWith('3fff:')
    );
  }
  return false;
}

/** Strict browser-service allowlist; DNS is checked on registration AND every send. */
export async function validatePushSubscription(
  input: PushSubscriptionInput,
  resolve: PushResolver = (hostname) => lookup(hostname, { all: true }),
): Promise<PushSubscriptionInput & { address: PushAddress }> {
  const reject = () =>
    new BadRequestException('Некорректная подписка браузерных уведомлений');
  if (
    !input ||
    typeof input.endpoint !== 'string' ||
    input.endpoint.length > 2048 ||
    hasUnsafeCharacters(input.endpoint)
  )
    throw reject();
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    throw reject();
  }
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === '/'
  )
    throw reject();
  const host = url.hostname.toLowerCase();
  if (!(
    host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    /^[a-z0-9-]+\.push\.apple\.com$/.test(host) ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(host)
  ))
    throw reject();
  const key = input.keys?.p256dh,
    auth = input.keys?.auth;
  if (
    typeof key !== 'string' ||
    typeof auth !== 'string' ||
    !/^[\w-]{87}$/.test(key) ||
    !/^[\w-]{22}$/.test(auth)
  )
    throw reject();
  try {
    const bytes = Buffer.from(key, 'base64url');
    if (
      bytes.length !== 65 ||
      bytes[0] !== 4 ||
      Buffer.from(auth, 'base64url').length !== 16
    )
      throw reject();
    ECDH.convertKey(bytes, 'prime256v1');
  } catch {
    throw reject();
  }
  let addresses: PushAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    throw reject();
  }
  if (
    !addresses.length ||
    addresses.some(
      (item) =>
        item.family !== isIP(item.address) ||
        !isPublicPushAddress(item.address),
    )
  )
    throw reject();
  return {
    endpoint: url.href,
    keys: { p256dh: key, auth },
    address: addresses[0],
  };
}

export function safePushPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 300 ||
    !/^\/(?:participant|stages|news)(?:[/?#]|$)/.test(value) ||
    value.includes('\\') ||
    hasUnsafeCharacters(value)
  )
    throw new BadRequestException(
      'Выберите ссылку на этап, новость или личный кабинет USD',
    );
  const url = new URL(value, 'https://push.invalid');
  if (
    url.origin !== 'https://push.invalid' ||
    !/^\/(?:participant|stages|news)(?:\/|$)/.test(url.pathname)
  )
    throw new BadRequestException('Некорректная ссылка USD');
  return url.pathname + url.search + url.hash;
}
