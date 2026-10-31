import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Agent, request } from 'node:https';
import webPush from 'web-push';
import {
  validatePushSubscription,
  type PushSubscriptionInput,
  type PushAddress,
} from './push-endpoint';

/** Node's explicit address family also disables automatic alternate-family DNS lookups. */
export function pinnedPushAgent(address: PushAddress) {
  return new Agent({
    keepAlive: false,
    family: address.family,
    lookup: (_host, _options, callback) =>
      callback(null, address.address, address.family),
  });
}

@Injectable()
export class PushTransport {
  configured(): boolean {
    return (
      process.env.PUSH_ENABLED === 'true' &&
      Boolean(
        process.env.PUSH_VAPID_PUBLIC_KEY &&
        process.env.PUSH_VAPID_PRIVATE_KEY &&
        process.env.PUSH_VAPID_SUBJECT,
      )
    );
  }
  publicKey(): string | null {
    return this.configured() ? process.env.PUSH_VAPID_PUBLIC_KEY! : null;
  }
  validate(input: PushSubscriptionInput) {
    return validatePushSubscription(input);
  }
  async send(
    subscription: PushSubscriptionInput,
    payload: { title: string; body: string; path: string; tag: string },
  ): Promise<number> {
    if (!this.configured())
      throw new ServiceUnavailableException('Push-уведомления не настроены');
    const checked = await this.validate(subscription);
    const details = webPush.generateRequestDetails(
      checked,
      JSON.stringify(payload),
      {
        TTL: 3600,
        contentEncoding: 'aes128gcm',
        urgency: 'normal',
        vapidDetails: {
          subject: process.env.PUSH_VAPID_SUBJECT!,
          publicKey: process.env.PUSH_VAPID_PUBLIC_KEY!,
          privateKey: process.env.PUSH_VAPID_PRIVATE_KEY!,
        },
      },
    );
    const url = new URL(details.endpoint);
    // Pin the checked public DNS address. Never follow redirects or use a user proxy.
    const agent = pinnedPushAgent(checked.address);
    try {
      return await new Promise<number>((resolve, reject) => {
        const req = request(
          url,
          { method: details.method, headers: details.headers, agent },
          (res) => {
            res.resume();
            res.on('end', () =>
              res.statusCode && res.statusCode >= 200 && res.statusCode < 300
                ? resolve(res.statusCode)
                : reject(
                    Object.assign(new Error('Push provider rejected request'), {
                      statusCode: res.statusCode,
                    }),
                  ),
            );
            res.on('error', reject);
          },
        );
        const deadline = setTimeout(
          () => req.destroy(new Error('Push transport deadline')),
          15000,
        );
        deadline.unref();
        req.on('close', () => clearTimeout(deadline));
        req.on('error', reject);
        if (details.body) req.write(details.body);
        req.end();
      });
    } finally {
      agent.destroy();
    }
  }
}
