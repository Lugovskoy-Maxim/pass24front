import { Injectable } from '@nestjs/common';
import { RATE_LIMITS } from './mstyle-v2.constants';
import { hmacHex } from './mstyle-v2.crypto';
import { problem } from './mstyle-v2.problem';
import { MstyleV2Config } from './mstyle-v2.config';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class MstyleRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly cfg: MstyleV2Config) {}

  identifierKey(value: string): string {
    return hmacHex(this.cfg.rateLimitSecret(), `id:${value}`);
  }

  consume(
    name: keyof typeof RATE_LIMITS,
    key: string,
  ): { remaining: number; resetAt: number } {
    const spec = RATE_LIMITS[name];
    const now = Date.now();
    const bucketKey = `${name}:${key}`;
    const current = this.buckets.get(bucketKey);
    if (!current || current.resetAt <= now) {
      const next = { count: 1, resetAt: now + spec.windowMs };
      this.buckets.set(bucketKey, next);
      return { remaining: spec.limit - 1, resetAt: next.resetAt };
    }
    if (current.count >= spec.limit) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      problem(429, 'RATE_LIMITED', { retryable: true, retryAfter });
    }
    current.count += 1;
    return { remaining: spec.limit - current.count, resetAt: current.resetAt };
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
