import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import { createLogger } from '../logger/logger';
import QueueManager from '../queue/queue-manager';
import PublishingService from '../publishing/publishing-service';
import prisma from '../database/prisma-client';
import { JobStatus } from '../../../generated/prisma';



const logger = createLogger('publishing-worker');

export function createPublishingWorker() {
  const worker = new Worker(
    QUEUES.PUBLISHING,
    async (job: Job) => {
      const { articleId } = job.data as { articleId: string };
      const startedAt = new Date();

      logger.info({ jobId: job.id, articleId }, 'Publishing job started');

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.PUBLISHING },
        data: { status: JobStatus.ACTIVE, startedAt },
      }).catch(() => {});

      const publicationId = await PublishingService.publishArticle(articleId);

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.PUBLISHING },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          duration: Date.now() - startedAt.getTime(),
          output: { articleId, publicationId },
        },
      }).catch(() => {});

      await prisma.metric.create({
        data: { name: 'article_published', value: 1, labels: { articleId, publicationId } },
      }).catch(() => {});

      logger.info({ articleId, publicationId }, 'Publishing job completed');
      return { articleId, publicationId };
    },
    { connection: createRedisConnection(), concurrency: 2 }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Publishing job failed');
    if (job?.id) {
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id, queue: QUEUES.PUBLISHING },
        data: { status: JobStatus.FAILED, error: err.message },
      }).catch(() => {});
      await prisma.metric.create({
        data: { name: 'publishing_failure', value: 1, labels: { articleId: (job.data as any)?.articleId } },
      }).catch(() => {});
    }
  });

  worker.on('error', (err) => logger.error({ err }, 'Publishing worker error'));
  return worker;
}
