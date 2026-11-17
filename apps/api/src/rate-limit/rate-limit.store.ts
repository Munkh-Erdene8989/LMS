import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface RateLimitHit {
  count: number;
  /** Цонх дуустал үлдсэн мс */
  resetMs: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
  close(): Promise<void>;
}

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

/** Нэг process-ийн санах ой. Redis байхгүй (dev, тест) үед; олон instance-д instance бүр тусдаа тоолно. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = this.now();
    if (this.buckets.size > 10_000) this.sweep(now);
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    return { count: b.count, resetMs: b.resetAt - now };
  }

  clear(): void {
    this.buckets.clear();
  }

  async close(): Promise<void> {
    this.clear();
  }

  private sweep(now: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

/** Redis (Railway): олон API instance нэг тоолуур хуваалцана. Redis унавал хүсэлтийг хаахгүй (fail-open). */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly log = new Logger('RateLimit');
  private readonly redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.redis.on('error', (err) => this.log.warn(`Redis алдаа: ${err.message}`));
  }

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    try {
      const k = `rl:${key}`;
      const count = await this.redis.incr(k);
      if (count === 1) await this.redis.pexpire(k, windowMs);
      let ttl = await this.redis.pttl(k);
      if (ttl < 0) {
        await this.redis.pexpire(k, windowMs);
        ttl = windowMs;
      }
      return { count, resetMs: ttl };
    } catch (err) {
      this.log.warn(`Rate limit шалгалт алгасав: ${(err as Error).message}`);
      return { count: 0, resetMs: 0 };
    }
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
