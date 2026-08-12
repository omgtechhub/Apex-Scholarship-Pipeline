import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES } from '../queue/queue-names';
import { processScholarship } from '../processing/processing-service';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';
import { JobStatus } from '../../../generated/prisma';


import type { ExtractedScholarship } from '../types';

const logger = createLogger('processing-worker');

export function createProcessingWorker() {
  const worker = new Worker(
    QUEUES.PROCESSING,
    async (job: Job) => {
      const { sourceId, scholarship } = job.data as {
        sourceId: string;
        scholarship: ExtractedScholarship;
      };
      const startedAt = new Date();

      logger.debug({ jobId: job.id, title: scholarship.title }, 'Processing job started');

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.PROCESSING },
        data: { status: JobStatus.ACTIVE, startedAt },
      }).catch(() => {});

      const result = await processScholarship(scholarship, sourceId);

      const duration = Date.now() - startedAt.getTime();

      // Record metrics
      await prisma.metric.create({
        data: {
          name: `scholarship_${result.status}`,
          value: 1,
          labels: { sourceId, status: result.status },
        },
      }).catch(() => {});

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.PROCESSING },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          duration,
          output: result as unknown as object,
        },
      }).catch(() => {});

      logger.debug({ jobId: job.id, status: result.status, scholarshipId: result.scholarshipId }, 'Processing done');
      return result;
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Processing job failed');
    if (job?.id) {
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id, queue: QUEUES.PROCESSING },
        data: { status: JobStatus.FAILED, error: err.message },
      }).catch(() => {});

      await prisma.metric.create({
        data: { name: 'processing_failure', value: 1 },
      }).catch(() => {});
    }
  });

  worker.on('error', (err) => logger.error({ err }, 'Processing worker error'));

  logger.info('Processing worker started');
  return worker;
}
