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
}

export async function stopWorkers() {
  if (activeWorkers.length > 0) {
    await Promise.all(activeWorkers.map((worker) => worker.close()));
    activeWorkers = [];
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  startWorkers();
  const shutdown = async () => {
    await stopWorkers();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
