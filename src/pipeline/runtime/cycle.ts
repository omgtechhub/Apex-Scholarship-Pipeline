/*
 * One complete pipeline cycle, in a single short-lived process.
 *
 * WHY THIS EXISTS
 * ---------------
 * The pipeline was designed as two always-on Render services: a `worker`
 * holding nine BullMQ consumers open forever, and a `cron` running
 * scheduler-cron.ts every 30 minutes to enqueue work for it. Neither was ever
 * actually created on Render — only the web service was — so nothing ever
 * consumed the queue and not one article was ever produced in production.
 *
 * Rather than pay for two long-running services, this runs the whole chain as
 * a batch job that starts, does the work, and exits — which is what a CI runner
 * can host for free. It is the entry point for
 * .github/workflows/pipeline-cycle.yml.
 *
 * WHAT IT DOES
 *   1. starts the nine workers (crawler -> processing -> validation -> ai ->
 *      seo -> quality -> publishing, plus cleanup and notification)
 *   2. runs one scheduler tick, which enqueues a crawl for every source whose
 *      nextCrawlAt is due
 *   3. waits until every queue is empty, then shuts down
 *
 * Note it does NOT call runSchedulerCron(). That function's `finally` block
 * closes the queues, Redis and Prisma — which would tear down the connections
 * the workers started in step 1 are using. It is written for a process that
 * only enqueues. We call scheduler.tick() directly and own the teardown.
 */
import 'dotenv/config';
import { startWorkers, stopWorkers } from './worker';
import { scheduler } from '../scheduler/scheduler';
import QueueManager from '../queue/queue-manager';
import { closeRedis, assertRedisReachable } from '../queue/redis-client';
import prisma, { disconnectDatabase } from '../database/prisma-client';
import { createLogger } from '../logger/logger';

const logger = createLogger('cycle');

/*
 * Count states that mean "work is still outstanding".
 *
 * `completed` and `failed` are excluded deliberately: DEFAULT_JOB_OPTIONS keeps
 * the last 100 completed and 500 failed jobs on purpose, so counting them would
 * mean the cycle never sees an empty queue and always burns its full budget.
 *
 * `delayed` IS counted. A job waiting out the 15-minute backoff that
 * rateLimitBackoffStrategy applies to a Groq 429 is real pending work, and
 * exiting while it sits there would abandon the article mid-chain.
 */
const PENDING_STATES = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'paused',
  'waiting-children',
] as const;

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Hard ceiling. GitHub caps a job at 6 h; the workflow's timeout must exceed this. */
const MAX_MINUTES = envInt('CYCLE_MAX_MINUTES', 50);
/** Consecutive empty readings before declaring the queues drained. */
const IDLE_CHECKS = envInt('CYCLE_IDLE_CHECKS', 3);
/** Seconds between readings. */
const POLL_SECONDS = envInt('CYCLE_POLL_SECONDS', 10);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Grace period for in-flight worker handlers to finish their own writes. */
const SETTLE_MS = 3000;

let shuttingDown = false;
let cycleSucceeded = false;

interface Outstanding {
  total: number;
  perQueue: Record<string, number>;
}

async function outstanding(): Promise<Outstanding> {
  const all = await QueueManager.getAllJobCounts();
  const perQueue: Record<string, number> = {};
  let total = 0;

  for (const [queue, counts] of Object.entries(all)) {
    let n = 0;
    for (const state of PENDING_STATES) n += counts[state] ?? 0;
    if (n > 0) perQueue[queue] = n;
    total += n;
  }
  return { total, perQueue };
}

/** What the run actually accomplished, read from the database rather than the queue. */
async function report(since: Date): Promise<string> {
  const [scholarships, published, failed] = await Promise.all([
    prisma.scholarship.count({ where: { createdAt: { gte: since } } }),
    prisma.article.count({ where: { status: 'PUBLISHED', updatedAt: { gte: since } } }),
    prisma.article.count({ where: { status: 'FAILED', updatedAt: { gte: since } } }),
  ]);
  return `new scholarships: ${scholarships} | articles published: ${published} | articles failed: ${failed}`;
}

export async function runCycle(): Promise<void> {
  const startedAt = new Date();
  const deadline = startedAt.getTime() + MAX_MINUTES * 60_000;

  /*
   * Do not let a straggler sink a cycle that already succeeded.
   *
   * BullMQ's worker.close() resolves once the current job's handler returns,
   * but handlers fire their own follow-up writes — queue history, metrics — and
   * those can land after disconnectDatabase() has ended the pg pool. The result
   * is an uncaught "Cannot use a pool after calling end on the pool" that kills
   * the process with exit 1 *after* the work is done and reported, turning a
   * good run red. Observed exactly that: 3 articles published, summary printed,
   * then exit 1.
   *
   * So: once shutdown has begun, a late error is logged and the already-decided
   * exit code stands. Before shutdown it still fails the run, because an
   * uncaught error mid-cycle is real.
   */
  const onLateError = (err: unknown) => {
    if (shuttingDown) {
      logger.warn({ err }, 'Ignoring error raised after the cycle finished');
      process.exit(cycleSucceeded ? 0 : 1);
    }
    logger.error({ err }, 'Uncaught error during cycle');
    process.exit(1);
  };
  process.on('uncaughtException', onLateError);
  process.on('unhandledRejection', onLateError);

  logger.info(
    { maxMinutes: MAX_MINUTES, idleChecks: IDLE_CHECKS, pollSeconds: POLL_SECONDS },
    'Cycle starting'
  );

  let hitDeadline = false;

  try {
    /*
     * 0. Prove Redis is up before anything else.
     *
     * Learned the hard way: with the Upstash database behind REDIS_URL deleted,
     * this cycle sat at `await scheduler.tick()` for 36 minutes emitting
     * nothing, because ioredis reconnects forever rather than failing. Fifteen
     * seconds spent confirming the dependency is cheaper than an hour of
     * silence, and it names the real problem in the log.
     */
    await assertRedisReachable();

    // 1. Consumers first, so anything the tick enqueues is picked up at once.
    startWorkers();

    // 2. Enqueue. tick() only schedules sources whose nextCrawlAt is due and
    //    pushes nextCrawlAt forward by crawlIntervalMin, so it self-throttles —
    //    running this workflow more often than the interval is harmless.
    await scheduler.tick();

    /*
     * The nightly cleanup, preserved from scheduler-cron.ts. That version fired
     * when it happened to run inside the 02:00 UTC half-hour; since GitHub's
     * scheduler drops and delays runs, relying on landing in a 30-minute window
     * would mean cleanup silently never happening. CYCLE_CLEANUP=1 lets a
     * dedicated daily workflow run ask for it explicitly instead.
     */
    const now = new Date();
    if (process.env.CYCLE_CLEANUP === '1' || now.getUTCHours() === 2) {
      logger.info('Enqueueing daily cleanup');
      await scheduler.enqueueCleanup();
    }

    // 3. Drain.
    let idle = 0;
    let lastLogged = -1;

    for (;;) {
      await sleep(POLL_SECONDS * 1000);

      const { total, perQueue } = await outstanding();

      if (total !== lastLogged) {
        logger.info({ outstanding: total, perQueue }, 'Queue depth');
        lastLogged = total;
      }

      if (total === 0) {
        idle += 1;
        if (idle >= IDLE_CHECKS) break;
      } else {
        // A non-empty reading resets the count: stages hand off to each other,
        // so a momentary zero between two jobs is not the end of the chain.
        idle = 0;
      }

      if (Date.now() >= deadline) {
        hitDeadline = true;
        logger.warn({ outstanding: total, perQueue }, 'Cycle budget exhausted — stopping with work outstanding');
        break;
      }
    }

    const summary = await report(startedAt);
    logger.info({ durationSec: Math.round((Date.now() - startedAt.getTime()) / 1000) }, `Cycle finished — ${summary}`);

    cycleSucceeded = true;

    // Surfaced for the workflow log; GitHub renders ::notice:: in the run summary.
    console.log(`::notice title=Pipeline cycle::${summary}`);
    if (hitDeadline) {
      console.log(
        '::warning title=Pipeline cycle incomplete::Queues still had work when the time budget ran out. ' +
          'Usually a Groq rate-limit backoff; the next run resumes it.'
      );
    }
  } finally {
    // Order matters: stop consuming, then close producers, then the connections
    // underneath them.
    shuttingDown = true;
    try {
      await stopWorkers();
      // Let handlers that already returned finish their trailing writes before
      // the pool they use disappears. See onLateError for why this is not the
      // only guard.
      await sleep(SETTLE_MS);
      await QueueManager.closeAll();
      await closeRedis();
      await disconnectDatabase();
    } catch (err) {
      logger.error({ err }, 'Error during teardown');
    }
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runCycle()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Cycle failed');
      console.log(`::error title=Pipeline cycle failed::${(err as Error)?.message ?? 'unknown error'}`);
      process.exit(1);
    });
}
