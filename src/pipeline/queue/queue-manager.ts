import { Queue, QueueEvents, JobsOptions } from 'bullmq';
import { createRedisConnection } from './redis-client';
import { QUEUES, QueueName, JobName } from './queue-names';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';
import { JobStatus } from '@prisma/client';

const logger = createLogger('queue-manager');

const queues = new Map<string, Queue>();

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export const AI_JOB_OPTIONS: JobsOptions = {
  attempts: 10,
  backoff: { type: 'rateLimitBackoff' },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export function rateLimitBackoffStrategy(attemptsMade: number, _type?: string, err?: Error): number {
  if (
    err &&
    (err.message.includes('429') ||
      err.message.includes('rate_limit_exceeded') ||
      err.message.includes('Rate limit reached'))
  ) {
    // Delay 15 minutes (900,000 ms) for HTTP 429 rate limit errors
    return 15 * 60 * 1000;
  }
  // Standard exponential backoff for non-429 errors (5s, 10s, 20s, 40s)
  return Math.min(Math.pow(2, attemptsMade - 1) * 5000, 60000);
}

function getQueue(name: QueueName): Queue {
  if (queues.has(name)) return queues.get(name)!;

  const defaultOptions = name === QUEUES.AI ? AI_JOB_OPTIONS : DEFAULT_JOB_OPTIONS;

  const q = new Queue(name, {
    connection: createRedisConnection(),
    defaultJobOptions: defaultOptions,
  });

  queues.set(name, q);
  return q;
}

export const QueueManager = {
  getQueue,

  async add<T extends object>(
    queueName: QueueName,
    jobName: JobName,
    data: T,
    options?: JobsOptions
  ) {
    const queue = getQueue(queueName);
    const baseOptions = queueName === QUEUES.AI ? AI_JOB_OPTIONS : DEFAULT_JOB_OPTIONS;
    const mergedOptions = { ...baseOptions, ...options };
    const job = await queue.add(jobName, data, mergedOptions);

    // Record in queue history
    try {
      await prisma.queueHistory.create({
        data: {
          queue: queueName,
          jobId: job.id!,
          jobName,
          status: JobStatus.PENDING,
          input: data as object,
        },
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to record queue history');
    }

    logger.debug({ queue: queueName, jobName, jobId: job.id }, 'Job enqueued');
    return job;
  },

  async getJobCounts(queueName: QueueName) {
    const queue = getQueue(queueName);
    return queue.getJobCounts();
  },

  async getAllJobCounts() {
    const counts: Record<string, Record<string, number>> = {};
    for (const name of Object.values(QUEUES)) {
      try {
        counts[name] = await QueueManager.getJobCounts(name);
      } catch {
        counts[name] = {};
      }
    }
    return counts;
  },

  async closeAll() {
    for (const [name, queue] of queues) {
      await queue.close();
      logger.info({ queue: name }, 'Queue closed');
    }
    queues.clear();
  },

  getQueueEvents(name: QueueName): QueueEvents {
    return new QueueEvents(name, { connection: createRedisConnection() });
  },
};

export default QueueManager;
