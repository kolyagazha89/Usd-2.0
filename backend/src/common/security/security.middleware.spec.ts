import { jest } from '@jest/globals';
import { SecurityMiddleware } from './security.middleware';

const response = () => ({ setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }) as any;
const request = (route = '/results/stage/test', method = 'GET') => ({ ip: '203.0.113.10', socket: {}, path: route, originalUrl: route, method }) as any;

describe('SecurityMiddleware event traffic', () => {
  it('allows 1000 spectators polling every five seconds behind a common IP', () => {
    const limits = new SecurityMiddleware(); const next = jest.fn();
    const res = response();
    for (let i = 0; i < 12_000; i++) limits.use(request(), res, next);
    expect(next).toHaveBeenCalledTimes(12_000);
    expect(res.status).not.toHaveBeenCalled();
  });
  it('does not spend credential or write quota on reads, OPTIONS or refresh', () => {
    const limits = new SecurityMiddleware();
    for (let i = 0; i < 500; i++) {
      limits.use(request('/results'), response(), jest.fn());
      limits.use(request('/auth/login', 'OPTIONS'), response(), jest.fn());
      limits.use(request('/auth/refresh', 'POST'), response(), jest.fn());
    }
    const next = jest.fn(); const res = response();
    limits.use(request('/auth/login', 'POST'), res, next);
    limits.use(request('/results', 'POST'), res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
  it('retains a bounded IP credential quota with Retry-After', () => {
    const limits = new SecurityMiddleware();
    for (let i = 0; i < 300; i++) limits.use(request('/auth/login', 'POST'), response(), jest.fn());
    const res = response(); limits.use(request('/auth/login', 'POST'), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });
  it('separates verified users sharing an IP and their read/write budgets', () => {
    const limits = new SecurityMiddleware(); const res = response();
    for (let i = 0; i < 120; i++) limits.assertAuthenticated(request('/results', 'POST'), res, 'judge-a');
    expect(() => limits.assertAuthenticated(request('/results', 'POST'), res, 'judge-a')).toThrow();
    expect(() => limits.assertAuthenticated(request('/results', 'POST'), res, 'judge-b')).not.toThrow();
    expect(() => limits.assertAuthenticated(request('/results'), res, 'judge-a')).not.toThrow();
  });
  it('renews quotas at the end of their window', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    try {
      const limits = new SecurityMiddleware(); const res = response();
      for (let i = 0; i < 120; i++) limits.assertAuthenticated(request('/', 'POST'), res, 'judge');
      now.mockReturnValue(160_001);
      expect(() => limits.assertAuthenticated(request('/', 'POST'), res, 'judge')).not.toThrow();
    } finally { now.mockRestore(); }
  });
});
