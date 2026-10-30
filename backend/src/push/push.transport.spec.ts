import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { PushTransport, pinnedPushAgent } from './push.transport';

describe('push transport networking', () => {
  it('pins the checked public address and family without a secondary DNS lookup', () => {
    const agent = pinnedPushAgent({ address: '17.57.144.10', family: 4 });
    try {
      const options = agent.options as any;
      expect(options.family).toBe(4);
      const callback = jest.fn();
      options.lookup('untrusted-rebinding.invalid', {}, callback);
      expect(callback).toHaveBeenCalledWith(null, '17.57.144.10', 4);
      expect(options.keepAlive).toBe(false);
    } finally {
      agent.destroy();
    }
  });
  it('revalidates subscriptions at dispatch before building a provider request', async () => {
    const transport = new PushTransport();
    jest.spyOn(transport, 'configured').mockReturnValue(true);
    const validate = jest
      .spyOn(transport, 'validate')
      .mockRejectedValue(new BadRequestException('Rejected DNS'));
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fixture',
      keys: { p256dh: 'synthetic', auth: 'synthetic' },
    };
    await expect(
      transport.send(subscription, {
        title: 'USD',
        body: 'Fixture',
        path: '/news',
        tag: 'fixture',
      }),
    ).rejects.toThrow('Rejected DNS');
    expect(validate).toHaveBeenCalledWith(subscription);
  });
});
