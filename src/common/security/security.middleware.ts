import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private lastCleanupAt = 0;
  private readonly maxBuckets = 50_000;

  use(request: Request, response: Response, next: NextFunction) {
    const now = Date.now();
    this.cleanup(now);

    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const path = request.path || request.originalUrl.split('?')[0] || '/';

    const isAuthRoute = path.startsWith('/auth/');
    const isSensitiveAuthRoute =
      /^\/auth\/(login|register|verify-email|resend-verification|forgot-password|reset-password|refresh|logout)$/.test(path);

    const windowMs = isSensitiveAuthRoute
      ? 15 * 60 * 1000
      : 60 * 1000;

    const limit = isSensitiveAuthRoute
      ? 30
      : isAuthRoute
        ? 60
        : 180;

    const key = `${ip}:${isSensitiveAuthRoute ? 'auth-sensitive' : isAuthRoute ? 'auth' : 'global'}`;
    const bucket = this.buckets.get(key);

    if (!bucket && this.buckets.size >= this.maxBuckets) {
      this.evictOldestBucket(now);
    }

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      this.setRateHeaders(response, limit, limit - 1, now + windowMs);
      next();
      return;
    }

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000),
      );

      response.setHeader('Retry-After', retryAfterSeconds);
      response.status(429).json({
        statusCode: 429,
        message: 'Слишком много запросов. Повторите попытку позже.',
      });
      return;
    }

    bucket.count += 1;
    this.setRateHeaders(
      response,
      limit,
      Math.max(0, limit - bucket.count),
      bucket.resetAt,
    );

    next();
  }

  private setRateHeaders(
    response: Response,
    limit: number,
    remaining: number,
    resetAt: number,
  ) {
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));
  }

  private evictOldestBucket(now: number) {
    let oldestKey: string | undefined;
    let oldestResetAt = Number.POSITIVE_INFINITY;

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
        return;
      }
      if (bucket.resetAt < oldestResetAt) {
        oldestResetAt = bucket.resetAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.buckets.delete(oldestKey);
    }
  }

  private cleanup(now: number) {
    if (now - this.lastCleanupAt < 60_000) {
      return;
    }

    this.lastCleanupAt = now;

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
