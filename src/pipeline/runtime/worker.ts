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
const workers = [
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

const shutdown = async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
logger.info({ count: workers.length }, 'Worker runtime started');
