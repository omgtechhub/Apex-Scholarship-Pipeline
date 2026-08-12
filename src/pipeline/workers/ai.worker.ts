import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import QueueManager from '../queue/queue-manager';
import ArticleService from '../articles/article.service';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';
import { JobStatus, ArticleStatus } from '../../../generated/prisma';



const logger = createLogger('ai-worker');

export function createAIWorker() {
  const worker = new Worker(
    QUEUES.AI,
    async (job: Job) => {
      const { scholarshipId } = job.data as { scholarshipId: string };
      const startedAt = new Date();

      logger.info({ jobId: job.id, scholarshipId }, 'AI job started');

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.AI },
        data: { status: JobStatus.ACTIVE, startedAt },
      }).catch(() => {});

      // Generate article
      const articleId = await ArticleService.generateArticle(scholarshipId);

      // Enqueue for SEO generation
      await QueueManager.add(QUEUES.SEO, JOB_NAMES.GENERATE_SEO, { articleId, scholarshipId });

      const duration = Date.now() - startedAt.getTime();

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.AI },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          duration,
          output: { articleId },
        },
      }).catch(() => {});

      // Record metric
      await prisma.metric.create({
        data: { name: 'ai_article_generated', value: 1, labels: { scholarshipId, articleId } },
      }).catch(() => {});

      logger.info({ jobId: job.id, scholarshipId, articleId }, 'AI job done');
      return { articleId };
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
      limiter: { max: 10, duration: 60000 }, // rate limit AI calls
    }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'AI job failed');
    if (job?.id) {
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id, queue: QUEUES.AI },
        data: { status: JobStatus.FAILED, error: err.message },
      }).catch(() => {});

      await prisma.metric.create({
        data: { name: 'ai_failure', value: 1 },
      }).catch(() => {});

      // If article exists, mark as failed
      const { scholarshipId } = job.data as { scholarshipId?: string };
      if (scholarshipId) {
        const article = await prisma.article.findFirst({
          where: { scholarshipId, status: ArticleStatus.GENERATING },
        });
        if (article) {
          await prisma.article.update({
            where: { id: article.id },
            data: { status: ArticleStatus.FAILED },
          }).catch(() => {});
        }
      }
    }
  });

  worker.on('error', (err) => logger.error({ err }, 'AI worker error'));

  logger.info('AI worker started');
  return worker;
}
