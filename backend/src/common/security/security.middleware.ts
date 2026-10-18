import { HttpException, Injectable, NestMiddleware } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };
type Policy = { name: string; limit: number; windowMs: number };
const MINUTE = 60_000;

/** Single-instance limits. Only verified identities may use per-user quotas. */
@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private lastCleanupAt = 0;
  private readonly maxBuckets = 50_000;

  use(request: Request, response: Response, next: NextFunction) {
    if (request.method === 'OPTIONS') { next(); return; }
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const route = request.path || request.originalUrl.split('?')[0] || '/';
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const isCredentials = /^\/auth\/(login|register|verify-email|resend-verification|forgot-password|reset-password|confirm-email-change)$/.test(route);
    const isSession = /^\/auth\/(refresh|logout)$/.test(route);
    const policy: Policy = isCredentials
      ? { name: 'credentials-ip', limit: 300, windowMs: 15 * MINUTE }
      : isSession
        ? { name: 'session-ip', limit: 1200, windowMs: MINUTE }
        : isRead
          ? { name: 'read-ip', limit: 20_000, windowMs: MINUTE }
          : { name: 'write-ip', limit: 1200, windowMs: MINUTE };
    const denied = this.consume(ip, policy, response);
    if (denied) { response.status(429).json(denied); return; }
    next();
  }

  /** Run after the body parser, so credential attempts have both IP and account
   * limits without forcing unrelated people on a venue Wi-Fi into one quota. */
  useCredentials(request: Request, response: Response, next: NextFunction) {
    if (request.method !== 'POST' || !/^\/auth\/(login|forgot-password|resend-verification)$/.test(request.path)) { next(); return; }
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    if (!email) { next(); return; }
    const identity = (request.ip || request.socket.remoteAddress || 'unknown') + ':' + createHash('sha256').update(email).digest('hex');
    const denied = this.consume(identity, {name:'credentials-account-ip', limit:20, windowMs:15 * MINUTE}, response);
    if (denied) { response.status(429).json(denied); return; }
    next();
  }

  /** Called after JWT verification and account lookup, never from token text. */
  assertAuthenticated(request: Request, response: Response, userId: string) {
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const denied = this.consume(userId, {name:isRead ? 'user-read' : 'user-write', limit:isRead ? 600 : 120, windowMs:MINUTE}, response);
    if (denied) throw new HttpException(denied, 429);
  }

  private consume(identity: string, policy: Policy, response: Response) {
    const now = Date.now();
    if (now - this.lastCleanupAt >= MINUTE) {
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
      this.lastCleanupAt = now;
    }
    const key = policy.name + ':' + identity;
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maxBuckets) {
        response.setHeader('Retry-After', 60);
        return {statusCode:429, message:'Слишком много запросов. Повторите попытку позже.'};
      }
      bucket = {count:0, resetAt:now + policy.windowMs};
      this.buckets.set(key, bucket);
    }
    response.setHeader('X-RateLimit-Limit', policy.limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, policy.limit - bucket.count - 1));
    response.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
    if (bucket.count >= policy.limit) {
      response.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      return {statusCode:429, message:'Слишком много запросов. Повторите попытку позже.'};
    }
    bucket.count++;
    return null;
  }
}
