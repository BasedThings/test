import IORedis from 'ioredis';

import { env } from './env.js';

let redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully');
    });

    redis.on('error', (error: Error) => {
      console.error('Redis connection error:', error);
    });
  }

  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log('Redis disconnected');
  }
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedis();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
