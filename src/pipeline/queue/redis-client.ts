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
    /*
     * Give up eventually instead of retrying forever.
     *
     * `maxRetriesPerRequest: null` is mandatory for BullMQ, and with no
     * retryStrategy ioredis then reconnects indefinitely — so an unreachable
     * Redis does not throw, it *hangs*. A `queue.add()` against a dead host
     * simply never settles, which on 17 Nov 2026 left a GitHub Actions cycle
     * sitting silently at `await scheduler.tick()` for 36 minutes with nothing
     * in the log, after the Upstash database behind REDIS_URL had been deleted
     * (its hostname stopped resolving entirely).
     *
     * getRedisClient() above already capped its retries this way; this
     * connection — the one QueueManager and all nine workers actually use — did
     * not. Twenty attempts at up to 5 s is roughly a minute of genuine
     * reconnection tolerance, after which the error surfaces instead of
     * becoming an invisible stall.
     */
    retryStrategy: (times: number) => {
      if (times > 20) {
        logger.error({ times, host: finalUrl.split('@')[1] }, 'Redis unreachable — giving up');
        return null;
      }
      return Math.min(times * 1000, 5000);
    },
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis worker connection error');
  });

  return client;
}

/**
 * Prove Redis is actually reachable, with a deadline, before doing any work.
 *
 * Every stage of this pipeline goes through BullMQ, so Redis being down is
 * total rather than partial — and because of the hang described above it
 * presents as silence rather than as an error. A batch job should find that out
 * in seconds and say so, not discover it by timing out an hour later.
 */
export async function assertRedisReachable(timeoutMs = 15000): Promise<void> {
  const { finalUrl, tlsOption } = resolveRedisOptions();
  const host = finalUrl.split('@')[1] ?? '(unknown host)';

  const probe = new Redis(finalUrl, {
    ...tlsOption,
    family: 4,
    lazyConnect: true,
    enableReadyCheck: false,
    connectTimeout: Math.min(timeoutMs, 10000),
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  probe.on('error', () => {
    /* handled by the race below; the listener only stops an unhandled 'error' */
  });

  try {
    await Promise.race([
      probe.connect().then(() => probe.ping()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    logger.info({ host }, 'Redis reachable');

    /*
     * Warn if Redis is allowed to evict keys.
     *
     * BullMQ's docs are blunt about this: `maxmemory-policy` must be
     * `noeviction`, and it is "the only setting that guarantees the correct
     * behavior of the queues". Anything else lets Redis drop queue keys under
     * memory pressure, and the symptom is jobs quietly vanishing mid-chain —
     * indistinguishable from the pipeline simply not working, which this
     * project has already spent three months mistaking for other causes.
     *
     * It matters most on managed Redis: Redis Cloud defaults new databases to
     * `volatile-lru`, not `noeviction`.
     *
     * Advisory only. Many managed providers block CONFIG GET for tenants, so a
     * refusal here says nothing about the policy and must not fail the run.
     */
    try {
      const config = (await probe.config('GET', 'maxmemory-policy')) as unknown as string[];
      const policy = Array.isArray(config) ? config[1] : undefined;
      if (policy && policy !== 'noeviction') {
        logger.warn({ policy }, 'Redis maxmemory-policy is not noeviction — BullMQ may lose jobs');
        console.log(
          `::warning title=Redis eviction policy::maxmemory-policy is "${policy}", not "noeviction". ` +
            'BullMQ requires noeviction; with eviction enabled Redis can drop queue keys and jobs will ' +
            'disappear silently. Change it in your Redis provider settings.'
        );
      } else if (policy) {
        logger.info({ policy }, 'Redis eviction policy OK');
      }
    } catch {
      logger.debug('Could not read maxmemory-policy (provider likely restricts CONFIG) — skipping check');
    }
  } catch (err) {
    throw new Error(
      `Redis is unreachable at ${host} (${(err as Error).message}). ` +
        'Every pipeline stage runs through BullMQ, so nothing can be queued or processed. ' +
        'Check that the Redis instance still exists and that REDIS_URL is current.'
    );
  } finally {
    try {
      probe.disconnect();
    } catch {
      /* already closed */
    }
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    if (typeof (redisClient as any).quit === 'function') {
      await (redisClient as any).quit();
    }
    redisClient = null;
  }
}
