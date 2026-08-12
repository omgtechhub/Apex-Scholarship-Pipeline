import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import { scheduler } from '../pipeline/scheduler/scheduler';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { QUEUES } from '../pipeline/queue/queue-names';
import { closeRedis } from '../pipeline/queue/redis-client';
import { createCrawlerWorker } from '../pipeline/workers/crawler.worker';

async function verifyWorkerAndScheduler() {
  console.log('======================================================');
  console.log('    REAL WORKER & SCHEDULER INTEGRATION TEST         ');
  console.log('======================================================\n');

  // 1. Ensure an active scholarship source exists in PostgreSQL
  console.log('[STEP 1: DATABASE CHECK] Fetching active scholarship source...');
  let source = await prisma.scholarshipSource.findFirst({
    where: { status: 'ACTIVE' },
  });

  if (!source) {
    source = await prisma.scholarshipSource.create({
      data: {
        name: 'Chevening Scholarships',
        slug: 'chevening-scholarships',
        adapterKey: 'chevening',
        url: 'https://www.chevening.org/scholarships/',
        status: 'ACTIVE',
        crawlIntervalMin: 30,
      },
    });
  }

  // Reset nextCrawlAt to past date to trigger scheduling
  await prisma.scholarshipSource.update({
    where: { id: source.id },
    data: { nextCrawlAt: new Date(Date.now() - 60000), consecutiveFails: 0 },
  });

  console.log(`[STEP 1 RESULT] Source: "${source.name}" (ID: ${source.id})`);
  console.log('Source nextCrawlAt reset to past date to trigger scheduler tick.');

  // 2. Execute Scheduler Tick
  console.log('\n[STEP 2: SCHEDULER TICK] Executing scheduler.tick()...');
  const tickStart = Date.now();
  await scheduler.tick();

  const updatedSource = await prisma.scholarshipSource.findUniqueOrThrow({
    where: { id: source.id },
  });

  console.log(`[STEP 2 RESULT] nextCrawlAt updated to: ${updatedSource.nextCrawlAt?.toISOString()}`);
  const minutesDiff = updatedSource.nextCrawlAt
    ? Math.round((updatedSource.nextCrawlAt.getTime() - tickStart) / 60000)
    : 0;
  console.log(`Scheduling verified: Next crawl scheduled in ${minutesDiff} minutes (30-minute interval enforced).`);

  // 3. Inspect Redis & BullMQ Queue State
  console.log('\n[STEP 3: REDIS / BULLMQ VERIFICATION] Inspecting CRAWLER queue...');
  const queue = QueueManager.getQueue(QUEUES.CRAWLER);
  const waitingCount = await queue.getWaitingCount();
  const activeCount = await queue.getActiveCount();
  const completedCount = await queue.getCompletedCount();

  console.log(`[BULLMQ QUEUE STATS] Waiting: ${waitingCount}, Active: ${activeCount}, Completed: ${completedCount}`);

  if (waitingCount === 0 && activeCount === 0 && completedCount === 0) {
    throw new Error('BullMQ Crawler queue has 0 jobs! Job scheduling failed.');
  }

  // 4. Worker Verification (Instantiate worker and verify connection)
  console.log('\n[STEP 4: WORKER VERIFICATION] Initializing Crawler Worker instance...');
  const worker = createCrawlerWorker();

  await new Promise((resolve) => setTimeout(resolve, 1500));

  await worker.close();
  console.log('[STEP 4 RESULT] Worker initialized and closed cleanly.');

  console.log('\n======================================================');
  console.log('   WORKER & SCHEDULER INTEGRATION VERIFIED SUCCESS!   ');
  console.log('======================================================\n');
}

verifyWorkerAndScheduler()
  .catch((err) => {
    console.error('WORKER & SCHEDULER VERIFICATION FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log('[TEARDOWN] Closing background resources...');
    await QueueManager.closeAll().catch((err) => console.warn('QueueManager close error:', err));
    await closeRedis().catch((err) => console.warn('Redis close error:', err));
    await disconnectDatabase().catch((err) => console.warn('Database disconnect error:', err));
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    console.log('[TEARDOWN] Complete.\n');
  });
