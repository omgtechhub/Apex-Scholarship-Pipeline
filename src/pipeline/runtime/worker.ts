/*
 * Load .env before anything else imports a client that reads it.
 *
 * This file is a process entry point: `npx tsx src/pipeline/runtime/worker.ts`
 * and the WORKER/SCHEDULER legs of `npm run start:all` each boot their own
 * Node process, and nothing in the import chain called dotenv. Next.js loads
 * .env for the web process only, so these two got an empty environment - no
 * DATABASE_URL, no REDIS_URL, no GROQ_API_KEY.
 *
 * The failure mode is the dangerous kind: node-cron still schedules, the
 * process stays alive, and every tick fails silently against a database it
 * cannot reach. It looks like it is running.
 */
import 'dotenv/config';
import { createCrawlerWorker } from '../workers/crawler.worker';
import { createProcessingWorker } from '../workers/processing.worker';
import { createValidationWorker } from '../workers/validation.worker';
import { createAIWorker } from '../workers/ai.worker';
import { createSEOWorker } from '../workers/seo.worker';
import { createCleanupWorker } from '../workers/cleanup.worker';
import { createNotificationWorker } from '../workers/notification.worker';
import { createPublishingWorker } from '../workers/publishing.worker';
import { createQualityWorker } from '../workers/quality.worker';
import { createLogger } from '../logger/logger';

const logger = createLogger('worker-runtime');

let activeWorkers: Array<ReturnType<typeof createCrawlerWorker>> = [];

export function startWorkers() {
  if (activeWorkers.length > 0) return activeWorkers;
  try {
    activeWorkers = [
      createCrawlerWorker(),
      createProcessingWorker(),
      createValidationWorker(),
      createAIWorker(),
      createSEOWorker(),
      createCleanupWorker(),
      createNotificationWorker(),
      createPublishingWorker(),
      createQualityWorker(),
    ];
    logger.info({ count: activeWorkers.length }, 'Worker runtime started');
    return activeWorkers;
  } catch (err) {
    logger.error({ err }, 'Worker runtime initialization failed');
    throw err;
  }
}

export async function stopWorkers() {
  if (activeWorkers.length > 0) {
    await Promise.all(activeWorkers.map((worker) => worker.close()));
    activeWorkers = [];
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  try {
    startWorkers();
  } catch (err) {
    logger.error({ err }, 'Worker process startup failed');
    process.exit(1);
  }
  const shutdown = async () => {
    await stopWorkers();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
