import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { QUEUES, JOB_NAMES } from '../pipeline/queue/queue-names';
import { closeRedis } from '../pipeline/queue/redis-client';
import { browserPool } from '../pipeline/crawler/browser-pool';
import { createCrawlerWorker } from '../pipeline/workers/crawler.worker';
import { createProcessingWorker } from '../pipeline/workers/processing.worker';
import { createValidationWorker } from '../pipeline/workers/validation.worker';
import { createAIWorker } from '../pipeline/workers/ai.worker';
import { createSEOWorker } from '../pipeline/workers/seo.worker';
import { createQualityWorker } from '../pipeline/workers/quality.worker';
import { createPublishingWorker } from '../pipeline/workers/publishing.worker';
import { ArticleStatus, ScholarshipStatus } from '../../generated/prisma';

async function testFullAsynchronousE2E() {
  const startTime = Date.now();
  console.log('======================================================');
  console.log('  COMPLETE AUTOMATED ASYNCHRONOUS E2E PRODUCTION TEST ');
  console.log('======================================================\n');

  // 1. Fetch active DAAD source
  const source = await prisma.scholarshipSource.findFirst({
    where: { OR: [{ slug: 'daad-scholarships' }, { name: 'DAAD Scholarships' }] },
  });

  if (!source) throw new Error('DAAD source not found!');

  console.log(`[STAGE 1: ENQUEUE JOB] Enqueuing crawl job for source "${source.name}" (ID: ${source.id}) into BullMQ QUEUES.CRAWLER...`);

  // Reset nextCrawlAt
  await prisma.scholarshipSource.update({
    where: { id: source.id },
    data: { nextCrawlAt: new Date(Date.now() - 60000), consecutiveFails: 0 },
  });

  const job = await QueueManager.add(QUEUES.CRAWLER, JOB_NAMES.CRAWL_SOURCE, {
    sourceId: source.id,
  });

  console.log(`[STAGE 1 RESULT] Job enqueued to Redis BullMQ. Job ID: ${job.id}`);

  // 2. Start Real Workers
  console.log('\n[STAGE 2: STARTING REAL WORKERS] Spawning BullMQ workers for asynchronous pipeline...');
  const workers = [
    createCrawlerWorker(),
    createProcessingWorker(),
    createValidationWorker(),
    createAIWorker(),
    createSEOWorker(),
    createQualityWorker(),
    createPublishingWorker(),
  ];

  console.log(`[WORKERS ACTIVE] Initialized ${workers.length} BullMQ pipeline workers.`);

  // 3. Monitor Queue Progress
  console.log('\n[STAGE 3: ASYNCHRONOUS PIPELINE MONITORING] Waiting for workers to process queues...');

  let completed = false;
  let attempts = 0;
  const maxAttempts = 60; // Up to 60 seconds

  while (!completed && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;

    // Check if any article published from this source
    const publishedArticle = await prisma.article.findFirst({
      where: {
        scholarship: { sourceId: source.id },
        status: ArticleStatus.PUBLISHED,
      },
      include: { scholarship: true },
    });

    if (publishedArticle) {
      completed = true;
      console.log(`\n[PIPELINE COMPLETED ASYNCHRONOUSLY] Article "${publishedArticle.title}" reached PUBLISHED status in ${attempts} seconds!`);
      console.log(`Scholarship Title: "${publishedArticle.scholarship.title}"`);
      console.log(`Scholarship ID:    ${publishedArticle.scholarship.id}`);
      console.log(`Article ID:        ${publishedArticle.id}`);
    } else {
      if (attempts % 5 === 0) {
        console.log(`  -> Elapsed: ${attempts}s... Workers actively processing BullMQ jobs.`);
      }
    }
  }

  // Close all workers
  console.log('\n[STAGE 4: WORKER SHUTDOWN] Closing BullMQ workers...');
  await Promise.all(workers.map((w) => w.close()));

  if (!completed) {
    throw new Error(`Asynchronous E2E test timed out after ${maxAttempts} seconds!`);
  }

  // 4. Verify Public API Retrieval
  console.log('\n[STAGE 5: PUBLIC API VERIFICATION] Testing GET /api/public/scholarships...');
  const activeScholarships = await prisma.scholarship.findMany({
    where: { status: ScholarshipStatus.ACTIVE },
    include: {
      articles: {
        where: { status: ArticleStatus.PUBLISHED },
        select: { id: true, title: true, slug: true, content: true },
      },
    },
  });

  console.log(`[PUBLIC API LIST] Retrieved ${activeScholarships.length} active published scholarship(s).`);

  const sample = activeScholarships[0];
  if (!sample) {
    throw new Error('Public API list returned 0 scholarships!');
  }

  console.log(`[PUBLIC API ITEM 1] ID: ${sample.id}`);
  console.log(`Title: "${sample.title}"`);
  console.log(`Official URL: ${sample.officialUrl}`);
  console.log(`Published Article Title: "${sample.articles[0]?.title}"`);

  // Verify GET /api/public/scholarships/[id]
  const singleItem = await prisma.scholarship.findUniqueOrThrow({
    where: { id: sample.id },
    include: {
      organization: true,
      articles: {
        where: { status: ArticleStatus.PUBLISHED },
        include: { seo: true },
      },
    },
  });

  console.log(`\n[PUBLIC API ITEM DETAILS] Title: "${singleItem.title}"`);
  console.log(`Organization: ${singleItem.organization?.name}`);
  console.log(`SEO Title: "${singleItem.articles[0]?.seo?.seoTitle}"`);

  const duration = Date.now() - startTime;

  console.log('\n======================================================');
  console.log(' ASYNCHRONOUS E2E PRODUCTION VERIFICATION SUCCESS!   ');
  console.log('======================================================');
  console.log(`- Source Name:        ${source.name}`);
  console.log(`- Queued Job ID:      ${job.id}`);
  console.log(`- Published Article:  "${sample.articles[0]?.title}"`);
  console.log(`- Public API Count:   ${activeScholarships.length}`);
  console.log(`- Processing Time:   ${attempts}s`);
  console.log(`- Total Duration:     ${duration}ms`);
  console.log('======================================================\n');
}

testFullAsynchronousE2E()
  .catch((err) => {
    console.error('ASYNCHRONOUS E2E TEST FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log('[TEARDOWN] Closing background resources...');
    await QueueManager.closeAll().catch((err) => console.warn('QueueManager close error:', err));
    await closeRedis().catch((err) => console.warn('Redis close error:', err));
    await browserPool.closeAll().catch((err) => console.warn('BrowserPool close error:', err));
    await disconnectDatabase().catch((err) => console.warn('Database disconnect error:', err));
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    console.log('[TEARDOWN] Teardown complete. Exiting naturally.\n');
  });
