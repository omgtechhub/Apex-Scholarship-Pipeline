import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES, QUEUES as Q } from '../queue/queue-names';
import CrawlerManager from '../crawler/crawler-manager';
import QueueManager from '../queue/queue-manager';
import { JOB_NAMES } from '../queue/queue-names';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';
import { JobStatus } from '../../../generated/prisma';

const logger = createLogger('crawler-worker');

export function createCrawlerWorker() {
  const worker = new Worker(
    QUEUES.CRAWLER,
    async (job: Job) => {
      const { sourceId } = job.data as { sourceId: string };
      const startedAt = new Date();

      logger.info({ jobId: job.id, sourceId }, 'Crawler job started');

      // Update queue history
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.CRAWLER },
        data: { status: JobStatus.ACTIVE, startedAt },
      }).catch(() => {});

      const result = await CrawlerManager.crawlSource(sourceId);

      // Enqueue each scholarship for processing
      for (const scholarship of result.scholarships) {
        await QueueManager.add(Q.PROCESSING, JOB_NAMES.PROCESS_SCHOLARSHIP, {
          sourceId,
          scholarship,
        });
      }

      const duration = Date.now() - startedAt.getTime();

      // Record metric
      await prisma.metric.createMany({
        data: [
          { name: 'crawl_success', value: 1, labels: { sourceId } },
          { name: 'scholarships_discovered', value: result.scholarships.length, labels: { sourceId } },
          { name: 'crawl_duration_ms', value: result.duration, labels: { sourceId } },
        ],
      }).catch(() => {});

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.CRAWLER },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          duration,
          output: {
            scholarships: result.scholarships.length,
            pagesVisited: result.pagesVisited,
            errors: result.errors,
          },
        },
      }).catch(() => {});

      logger.info({ jobId: job.id, sourceId, count: result.scholarships.length }, 'Crawler job done');
      return { count: result.scholarships.length, errors: result.errors.length };
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
      limiter: { max: 5, duration: 60000 },
    }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Crawler job failed');
    if (job?.id) {
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id, queue: QUEUES.CRAWLER },
        data: { status: JobStatus.FAILED, error: err.message, completedAt: new Date() },
      }).catch(() => {});

      // Record failure metric
      const { sourceId } = job.data as { sourceId: string };
      await prisma.metric.create({
        data: { name: 'crawl_failure', value: 1, labels: { sourceId } },
      }).catch(() => {});

      // Update consecutive fails
      await prisma.scholarshipSource.update({
        where: { id: sourceId },
        data: { consecutiveFails: { increment: 1 } },
      }).catch(() => {});
    }
  });

  worker.on('error', (err) => logger.error({ err }, 'Crawler worker error'));

  logger.info('Crawler worker started');
  return worker;
}
