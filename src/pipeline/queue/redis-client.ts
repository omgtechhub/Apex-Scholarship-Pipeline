import Redis from 'ioredis';
import { createLogger } from '../logger/logger';

const logger = createLogger('redis');

let redisClient: Redis | null = null;

function resolveRedisOptions(rawUrl?: string) {
  const url = rawUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const isUpstash = url.includes('upstash.io');
  const isRediss = url.startsWith('rediss://');
  const finalUrl = (isUpstash && url.startsWith('redis://'))
    ? url.replace('redis://', 'rediss://')
    : url;

  const tlsOption = (isUpstash || isRediss || finalUrl.startsWith('rediss://'))
    ? { tls: { rejectUnauthorized: false } }
    : {};

  return { finalUrl, tlsOption };
}

export function getRedisClient(): Redis {
  if (redisClient) return redisClient;

  const { finalUrl, tlsOption } = resolveRedisOptions();

  redisClient = new Redis(finalUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
    family: 4,
    connectTimeout: 10000,
    ...tlsOption,
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
  const { finalUrl, tlsOption } = resolveRedisOptions();
  return new Redis(finalUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 4,
    connectTimeout: 10000,
    ...tlsOption,
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
