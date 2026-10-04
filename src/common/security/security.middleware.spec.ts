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

    for (let i = 0; i < 30; i += 1) {
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
});
