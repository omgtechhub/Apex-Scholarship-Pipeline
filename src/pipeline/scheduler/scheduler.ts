import cron, { ScheduledTask } from 'node-cron';
import prisma from '../database/prisma-client';
import QueueManager from '../queue/queue-manager';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import { createLogger } from '../logger/logger';

const logger = createLogger('scheduler');

export class Scheduler {
  private task: ScheduledTask | null = null;
  private cleanupTask: ScheduledTask | null = null;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    const cronExpression = process.env.CRAWL_CRON ?? '*/30 * * * *';
    this.task = cron.schedule(cronExpression, () => void this.tick());
    this.cleanupTask = cron.schedule(process.env.CLEANUP_CRON ?? '0 2 * * *', () => {
      void this.enqueueCleanup();
    });
    logger.info({ cronExpression }, 'Scheduler started');
    void this.tick();
  }

  stop(): void {
    this.task?.stop();
    this.cleanupTask?.stop();
    this.task = null;
    this.cleanupTask = null;
    this.running = false;
    logger.info('Scheduler stopped');
  }

  async tick(): Promise<void> {
    const now = new Date();
    const sources = await prisma.scholarshipSource.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ nextCrawlAt: null }, { nextCrawlAt: { lte: now } }],
      },
      orderBy: [{ consecutiveFails: 'asc' }, { nextCrawlAt: 'asc' }],
    });

    for (const source of sources) {
      if (source.consecutiveFails >= 5) continue;
      const jobId = `crawl-${source.id}-${Math.floor(now.getTime() / 60000)}`;
      try {
        await QueueManager.add(QUEUES.CRAWLER, JOB_NAMES.CRAWL_SOURCE, { sourceId: source.id }, { jobId });
        const next = new Date(now.getTime() + source.crawlIntervalMin * 60_000);
        await prisma.scholarshipSource.update({ where: { id: source.id }, data: { nextCrawlAt: next } });
      } catch (error) {
        logger.error({ error, sourceId: source.id }, 'Failed to schedule crawl');
      }
    }
  }

  async triggerSource(sourceId: string): Promise<string> {
    const source = await prisma.scholarshipSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new Error(`Source ${sourceId} not found`);
    const job = await QueueManager.add(QUEUES.CRAWLER, JOB_NAMES.CRAWL_SOURCE, { sourceId }, {
      jobId: `manual-crawl-${sourceId}-${Date.now()}`,
      priority: 1,
    });
    return job.id!;
  }

  async enqueueCleanup(): Promise<void> {
    await QueueManager.add(QUEUES.CLEANUP, JOB_NAMES.CLEANUP_EXPIRED, { task: 'cleanup-expired' });
    await QueueManager.add(QUEUES.CLEANUP, JOB_NAMES.CLEANUP_LOGS, { task: 'cleanup-logs' });
  }
}

export const scheduler = new Scheduler();
