import Redis from 'ioredis';
import { createLogger } from '../logger/logger';

const logger = createLogger('redis');

let redisClient: Redis | null = null;

/**
 * Normalizes any Redis connection string input, stripping CLI prefixes
 * like '--tls -u' and extracting the pure redis:// or rediss:// URL.
 */
export function normalizeRedisUrl(inputUrl?: string): string {
  const raw = (inputUrl ?? process.env.REDIS_URL ?? '').trim();
  if (!raw) {
    throw new Error('REDIS_URL environment variable is missing or empty');
  }

  // Extract embedded redis:// or rediss:// URL (ignoring CLI flags like --tls -u)
  const match = raw.match(/(rediss?:\/\/[^\s"']+)/i);
  if (!match) {
    throw new Error(
      `Invalid REDIS_URL format: "${raw}". Expected a URL starting with redis:// or rediss://`
    );
  }

  let extractedUrl = match[1].trim();

  // If Upstash domain, upgrade scheme to rediss:// for TLS
  const isUpstash = extractedUrl.toLowerCase().includes('upstash.io');
  if (isUpstash && extractedUrl.toLowerCase().startsWith('redis://')) {
    extractedUrl = extractedUrl.replace(/^redis:\/\//i, 'rediss://');
  }

  return extractedUrl;
}

export function resolveRedisOptions(rawUrl?: string) {
  const finalUrl = normalizeRedisUrl(rawUrl);
  const isUpstash = finalUrl.toLowerCase().includes('upstash.io');
  const isRediss = finalUrl.toLowerCase().startsWith('rediss://');

  const tlsOption = (isUpstash || isRediss)
    ? { tls: {} }
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
  const client = new Redis(finalUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 4,
    connectTimeout: 10000,
    ...tlsOption,
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis worker connection error');
  });

  return client;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    if (typeof (redisClient as any).quit === 'function') {
      await (redisClient as any).quit();
    }
    redisClient = null;
  }
}
