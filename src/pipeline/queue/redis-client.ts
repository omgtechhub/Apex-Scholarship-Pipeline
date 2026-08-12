import Redis from 'ioredis';
import { createLogger } from '../logger/logger';

const logger = createLogger('redis');

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

  redisClient = new Redis(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error({ times }, 'Redis max retries exceeded');
        return null;
      }
      return Math.min(times * 1000, 5000);
    },
  });

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error', (err) => logger.error({ err }, 'Redis error'));
  redisClient.on('close', () => logger.warn('Redis connection closed'));

  return redisClient;
}

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    if (typeof (redisClient as any).quit === 'function') {
      await (redisClient as any).quit();
    }
    redisClient = null;
  }
}

