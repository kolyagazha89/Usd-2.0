import { jest } from '@jest/globals';
import { SecurityMiddleware } from './security.middleware';

describe('SecurityMiddleware', () => {
  const createResponse = () => {
    const headers = new Map<string, string | number>();
    return {
      setHeader: jest.fn((name: string, value: string | number) => {
        headers.set(name, value);
      }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headers,
    } as any;
  };

  const createRequest = (ip: string, path = '/api') =>
    ({
      ip,
      socket: { remoteAddress: ip },
      path,
      originalUrl: path,
    }) as any;

  it('limits repeated requests from one client', () => {
    const middleware = new SecurityMiddleware();
    const next = jest.fn();

    for (let i = 0; i < 180; i += 1) {
      middleware.use(createRequest('203.0.113.10'), createResponse(), next);
    }

    const response = createResponse();
    middleware.use(
      createRequest('203.0.113.10'),
      response,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalled();
    expect(response.headers.get('Retry-After')).toBeTruthy();
  });

  it('uses a stricter window for authentication endpoints', () => {
    const middleware = new SecurityMiddleware();
    const next = jest.fn();

    for (let i = 0; i < 60; i += 1) {
      middleware.use(
        createRequest('203.0.113.11', '/auth/login'),
        createResponse(),
        next,
      );
    }

    const response = createResponse();
    middleware.use(
      createRequest('203.0.113.11', '/auth/login'),
      response,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(429);
  });

  it('does not allow shared-venue refresh requests to consume the login budget', () => {
    const middleware = new SecurityMiddleware();
    const next = jest.fn();
    for (let i = 0; i < 100; i += 1) {
      middleware.use(createRequest('203.0.113.12','/auth/refresh'),createResponse(),next);
    }
    const response = createResponse();
    middleware.use(createRequest('203.0.113.12','/auth/login'),response,next);
    expect(response.status).not.toHaveBeenCalledWith(429);
  });

  it.each(['/AUTH/LOGIN', '/auth/login/', '/Auth/Login/'])(
    'shares the login budget with the Express route variant %s',
    (path) => {
      const middleware = new SecurityMiddleware();
      const next = jest.fn();
      for (let i = 0; i < 60; i += 1) {
        middleware.use(createRequest('203.0.113.13', '/auth/login'), createResponse(), next);
      }
      const response = createResponse();
      middleware.use(createRequest('203.0.113.13', path), response, next);
      expect(response.status).toHaveBeenCalledWith(429);
    },
  );

  it('applies the recovery quota to mixed-case routes with a trailing slash', () => {
    const middleware = new SecurityMiddleware();
    const next = jest.fn();
    for (let i = 0; i < 60; i += 1) {
      middleware.use(createRequest('203.0.113.14', '/AUTH/FORGOT-PASSWORD/'), createResponse(), next);
    }
    const response = createResponse();
    middleware.use(createRequest('203.0.113.14', '/auth/reset-password'), response, next);
    expect(response.status).toHaveBeenCalledWith(429);
  });
});
