import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';

const logger = createLogger('cleanup-worker');

export function createCleanupWorker(): Worker {
  const worker = new Worker(
    QUEUES.CLEANUP,
    async (job: Job) => {
      const task = (job.data as { task?: string }).task ?? job.name;
      if (task === 'cleanup-expired' || job.name === JOB_NAMES.CLEANUP_EXPIRED) await cleanupExpiredScholarships();
      if (task === 'cleanup-logs' || job.name === JOB_NAMES.CLEANUP_LOGS) await cleanupOldLogs();
    },
    { connection: createRedisConnection(), concurrency: 1 }
  );
  worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'Cleanup job failed'));
  return worker;
}

async function cleanupExpiredScholarships(): Promise<void> {
  const now = new Date();
  const result = await prisma.scholarship.updateMany({
    where: { deadline: { lt: now }, status: 'ACTIVE' },
    data: { status: 'EXPIRED' },
  });
  await prisma.executionLog.create({
    data: { type: 'cleanup', status: 'success', message: `Expired ${result.count} scholarships`, metadata: { count: result.count } },
  }).catch(() => undefined);
}

async function cleanupOldLogs(): Promise<void> {
  const days = Number(process.env.LOG_RETENTION_DAYS ?? 30);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  await Promise.all([
    prisma.crawlerLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.executionLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.queueHistory.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
}
