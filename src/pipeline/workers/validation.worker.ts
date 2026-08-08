import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import QueueManager from '../queue/queue-manager';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';
import { JobStatus, ScholarshipStatus } from '../../../generated/prisma';

const logger = createLogger('validation-worker');

export function createValidationWorker() {
  const worker = new Worker(
    QUEUES.VALIDATION,
    async (job: Job) => {
      const { scholarshipId } = job.data as { scholarshipId: string };
      const startedAt = new Date();

      logger.debug({ jobId: job.id, scholarshipId }, 'Validation job started');

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.VALIDATION },
        data: { status: JobStatus.ACTIVE, startedAt },
      }).catch(() => {});

      // Fetch scholarship and validate it's ready for article generation
      const scholarship = await prisma.scholarship.findUnique({
        where: { id: scholarshipId },
      });

      if (!scholarship) {
        throw new Error(`Scholarship not found: ${scholarshipId}`);
      }

      if (scholarship.status === ScholarshipStatus.REJECTED || scholarship.status === ScholarshipStatus.ARCHIVED) {
        logger.info({ scholarshipId, status: scholarship.status }, 'Scholarship not eligible for article generation');
        return { scholarshipId, eligible: false, reason: scholarship.status };
      }

      // Check if scholarship has critical issues preventing article generation
      const issues: string[] = [];

      if (!scholarship.title || scholarship.title.length < 3) {
        issues.push('Missing or invalid title');
      }

      if (!scholarship.officialUrl) {
        issues.push('Missing official URL');
      }

      if (scholarship.deadline && scholarship.deadline < new Date()) {
        // Scholarship has passed — mark expired and skip
        await prisma.scholarship.update({
          where: { id: scholarshipId },
          data: { status: ScholarshipStatus.EXPIRED },
        });
        logger.info({ scholarshipId }, 'Scholarship expired, skipping article generation');
        return { scholarshipId, eligible: false, reason: 'expired' };
      }

      if (issues.length > 0) {
        logger.warn({ scholarshipId, issues }, 'Scholarship failed validation for article generation');
        await prisma.metric.create({
          data: { name: 'validation_failure', value: 1, labels: { scholarshipId } },
        }).catch(() => {});
        return { scholarshipId, eligible: false, issues };
      }

      // Enqueue for AI article generation
      await QueueManager.add(QUEUES.AI, JOB_NAMES.GENERATE_ARTICLE, { scholarshipId });

      const duration = Date.now() - startedAt.getTime();

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.VALIDATION },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          duration,
          output: { scholarshipId, eligible: true },
        },
      }).catch(() => {});

      logger.debug({ scholarshipId }, 'Scholarship validated, queued for AI');
      return { scholarshipId, eligible: true };
    },
    {
      connection: createRedisConnection(),
      concurrency: 10,
    }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Validation job failed');
    if (job?.id) {
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id, queue: QUEUES.VALIDATION },
        data: { status: JobStatus.FAILED, error: err.message },
      }).catch(() => {});
    }
  });

  worker.on('error', (err) => logger.error({ err }, 'Validation worker error'));

  logger.info('Validation worker started');
  return worker;
}
