import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import { scheduler } from '../pipeline/scheduler/scheduler';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { QUEUES } from '../pipeline/queue/queue-names';
import { closeRedis } from '../pipeline/queue/redis-client';

async function testSchedulerAutomation() {
  console.log('======================================================');
  console.log('       PRODUCTION AUTOMATION: SCHEDULER TEST          ');
  console.log('======================================================\n');

  // 1. Fetch active source in DB
  const source = await prisma.scholarshipSource.findFirst({
    where: { status: 'ACTIVE' },
  });

  if (!source) {
    throw new Error('No active scholarship source found in DB for scheduler test!');
  }

  // Reset nextCrawlAt to past date to trigger scheduling
  await prisma.scholarshipSource.update({
    where: { id: source.id },
    data: { nextCrawlAt: new Date(Date.now() - 60000), consecutiveFails: 0 },
  });

  console.log(`[TEST 1A: ACTIVE SOURCE SCHEDULING] Reset source "${source.name}" nextCrawlAt to past date.`);

  const startTick = Date.now();
  await scheduler.tick();

  // Verify nextCrawlAt updated to ~30 minutes in the future
  const updatedSource = await prisma.scholarshipSource.findUniqueOrThrow({
    where: { id: source.id },
  });

  if (!updatedSource.nextCrawlAt) {
    throw new Error('Source nextCrawlAt was not set by scheduler tick!');
  }

  const minutesDiff = Math.round((updatedSource.nextCrawlAt.getTime() - startTick) / 60000);
  console.log(`[TEST 1A RESULT] nextCrawlAt updated to ${updatedSource.nextCrawlAt.toISOString()} (${minutesDiff} min interval enforced).`);

  if (minutesDiff < 25 || minutesDiff > 35) {
    throw new Error(`Expected ~30 min crawl interval, got ${minutesDiff} mins!`);
  }

  // 2. Verify BullMQ Queue & Persistence
  const crawlerQueue = QueueManager.getQueue(QUEUES.CRAWLER);
  const waitingCount = await crawlerQueue.getWaitingCount();
  const delayedCount = await crawlerQueue.getDelayedCount();
  console.log(`[TEST 1B: REDIS PERSISTENCE] Crawler Queue Waiting: ${waitingCount}, Delayed: ${delayedCount}`);

  if (waitingCount === 0 && delayedCount === 0) {
    throw new Error('Scheduler failed to enqueue job into BullMQ Crawler queue on Redis!');
  }

  // 3. Verify Scheduler Restart & Recovery (Deduplication)
  console.log('\n[TEST 1C: SCHEDULER RESTART & DEDUPLICATION] Simulating scheduler restart and immediate second tick...');
  const countBefore = await crawlerQueue.getWaitingCount();

  await scheduler.tick(); // Immediate second tick within the same minute

  const countAfter = await crawlerQueue.getWaitingCount();
  console.log(`[TEST 1C RESULT] Queue count before: ${countBefore}, Queue count after second tick: ${countAfter}`);

  if (countAfter !== countBefore) {
    throw new Error('Scheduler created duplicate crawl job on second tick within the same minute!');
  }

  console.log('\n======================================================');
  console.log('         SCHEDULER AUTOMATION TEST PASSED!            ');
  console.log('======================================================\n');
}

testSchedulerAutomation()
  .catch((err) => {
    console.error('SCHEDULER TEST FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log('[TEARDOWN] Closing background resources...');
    await QueueManager.closeAll().catch((err) => console.warn('QueueManager close error:', err));
    await closeRedis().catch((err) => console.warn('Redis close error:', err));
    await disconnectDatabase().catch((err) => console.warn('Database disconnect error:', err));
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    console.log('[TEARDOWN] Teardown complete. Exiting naturally.\n');
  });
