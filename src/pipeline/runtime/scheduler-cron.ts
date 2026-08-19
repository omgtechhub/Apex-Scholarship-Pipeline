import { scheduler } from '../scheduler/scheduler';
import QueueManager from '../queue/queue-manager';
import { closeRedis } from '../queue/redis-client';
import { disconnectDatabase } from '../database/prisma-client';
import { createLogger } from '../logger/logger';

const logger = createLogger('scheduler-cron');

export async function runSchedulerCron(): Promise<void> {
  const startedAt = Date.now();
  logger.info('Starting one-shot cron tick...');

  try {
    // 1. Execute single crawl scheduling tick
    await scheduler.tick();

    // 2. Check if daily cleanup window is active (02:00 UTC window)
    const now = new Date();
    if (now.getUTCHours() === 2 && now.getUTCMinutes() < 30) {
      logger.info('Executing daily cleanup enqueue...');
      await scheduler.enqueueCleanup();
    }

    logger.info({ durationMs: Date.now() - startedAt }, 'One-shot cron tick completed successfully');
  } catch (err) {
    logger.error({ err }, 'One-shot cron tick failed');
    throw err;
  } finally {
    // 3. Cleanly close all connections and open queue resources
    try {
      await QueueManager.closeAll();
      await closeRedis();
      await disconnectDatabase();
    } catch (cleanupErr) {
      logger.error({ cleanupErr }, 'Error during resource teardown');
    }
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runSchedulerCron()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Fatal cron execution failure');
      process.exit(1);
    });
}
