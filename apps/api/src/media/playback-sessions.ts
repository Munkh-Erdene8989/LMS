import Redis from 'ioredis';

/**
 * Зэрэг тоглуулалтын хязгаар (SPEC: ≤ 2 төхөөрөмж). Хэрэглэгч бүрт төхөөрөмжийн slot-ууд;
 * slot heartbeat-ээр сунгагдана, ирэхгүй бол TTL-ийн дараа өөрөө чөлөөлөгдөнө.
 * Production: Redis (sorted set, score = дуусах ms). Dev (Redis-гүй) ба тест: process дотор.
 */
export interface PlaybackSessionStore {
  /**
   * Төхөөрөмжийн slot-ыг авах эсвэл сунгах. Аль хэдийн slot-тай төхөөрөмж үргэлж сунгана;
   * шинэ төхөөрөмж идэвхтэй slot `limit`-ээс бага үед л. Хязгаар хэтэрвэл false.
   */
  claim(userId: string, deviceId: string, opts: { limit: number; ttlMs: number }): Promise<boolean>;
  release(userId: string, deviceId: string): Promise<void>;
  close(): Promise<void>;
}

export const PLAYBACK_SESSIONS = Symbol('PLAYBACK_SESSIONS');

const key = (userId: string) => `playback:${userId}`;

/** Хуучирсныг цэвэрлэх → шалгах → нэмэх нь атомар (Lua) — хоёр төхөөрөмж зэрэг орж 3 болохгүй. */
const CLAIM_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local device = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if not redis.call('ZSCORE', key, device) and redis.call('ZCARD', key) >= limit then
  return 0
end
redis.call('ZADD', key, now + ttl, device)
redis.call('PEXPIRE', key, ttl)
return 1
`;

export class RedisPlaybackSessionStore implements PlaybackSessionStore {
  private readonly redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  }

  async claim(userId: string, deviceId: string, opts: { limit: number; ttlMs: number }): Promise<boolean> {
    const result = await this.redis.eval(CLAIM_SCRIPT, 1, key(userId), Date.now(), opts.ttlMs, opts.limit, deviceId);
    return Number(result) === 1;
  }

  async release(userId: string, deviceId: string): Promise<void> {
    await this.redis.zrem(key(userId), deviceId);
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }

  /** Тестэд */
  async clearUser(userId: string): Promise<void> {
    await this.redis.del(key(userId));
  }
}

/** Process доторх хувилбар. Тест `advance(ms)`-ээр цагийг урагшлуулна. */
export class InMemoryPlaybackSessionStore implements PlaybackSessionStore {
  private readonly slots = new Map<string, Map<string, number>>();
  private offsetMs = 0;

  async claim(userId: string, deviceId: string, opts: { limit: number; ttlMs: number }): Promise<boolean> {
    const now = this.now();
    const devices = this.slots.get(userId) ?? new Map<string, number>();
    for (const [d, expiresAt] of devices) if (expiresAt <= now) devices.delete(d);
    if (!devices.has(deviceId) && devices.size >= opts.limit) return false;
    devices.set(deviceId, now + opts.ttlMs);
    this.slots.set(userId, devices);
    return true;
  }

  async release(userId: string, deviceId: string): Promise<void> {
    this.slots.get(userId)?.delete(deviceId);
  }

  async close(): Promise<void> {}

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  clear(): void {
    this.slots.clear();
    this.offsetMs = 0;
  }

  private now(): number {
    return Date.now() + this.offsetMs;
  }
}
