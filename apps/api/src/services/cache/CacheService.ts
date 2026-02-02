import { getRedis } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

export class CacheService {
  private prefix = 'arb:';

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedis();
      const data = await redis.get(this.getKey(key));
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error('Cache get error', error as Error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 60): Promise<void> {
    try {
      const redis = getRedis();
      await redis.set(
        this.getKey(key),
        JSON.stringify(value),
        'EX',
        ttlSeconds
      );
    } catch (error) {
      logger.error('Cache set error', error as Error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const redis = getRedis();
      await redis.del(this.getKey(key));
    } catch (error) {
      logger.error('Cache delete error', error as Error);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const redis = getRedis();
      const keys = await redis.keys(this.getKey(pattern));
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.error('Cache delete pattern error', error as Error);
    }
  }

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 60
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

export const cacheService = new CacheService();
