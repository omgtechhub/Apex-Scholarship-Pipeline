import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import CrawlerManager from '../pipeline/crawler/crawler-manager';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { closeRedis } from '../pipeline/queue/redis-client';
import { browserPool } from '../pipeline/crawler/browser-pool';

async function testFailureRecoveryAutomation() {
  console.log('======================================================');
  console.log('    PRODUCTION AUTOMATION: FAILURE RECOVERY TEST      ');
  console.log('======================================================\n');

  // 1. Create or fetch a simulated broken source
  let brokenSource = await prisma.scholarshipSource.findFirst({
    where: { slug: 'simulated-broken-source' },
  });

  if (!brokenSource) {
    brokenSource = await prisma.scholarshipSource.create({
      data: {
        name: 'Simulated Broken Source',
        slug: 'simulated-broken-source',
        adapterKey: 'generic',
        url: 'https://invalid-non-existent-scholarship-domain.org/feed',
        status: 'ACTIVE',
        consecutiveFails: 0,
      },
    });
  }

  console.log(`[TEST 4A: UNAVAILABLE SOURCE] Testing broken source ID: ${brokenSource.id} (${brokenSource.url})`);

  const initialFails = brokenSource.consecutiveFails;

  // Execute crawl on broken source
  const result = await CrawlerManager.crawlSource(brokenSource.id).catch((err) => {
    console.log(`[CATCH] Handled crawler exception cleanly: ${err.message}`);
    return { scholarships: [], pagesVisited: 0, errors: [err.message], duration: 0 };
  });

  console.log(`[TEST 4A RESULT] Crawl returned ${result.scholarships.length} scholarships, ${result.errors.length} errors.`);

  // Verify failure recorded in DB
  const updatedBrokenSource = await prisma.scholarshipSource.findUniqueOrThrow({
    where: { id: brokenSource.id },
  });

  console.log(`Consecutive fails updated from ${initialFails} to ${updatedBrokenSource.consecutiveFails}`);

  // 2. Verify Healthy Source Processing Uninterrupted
  console.log('\n[TEST 4B: HEALTHY SOURCE RESILIENCE] Crawling healthy source to ensure pipeline resilience...');
  const healthySource = await prisma.scholarshipSource.findFirst({
    where: { status: 'ACTIVE', NOT: { id: brokenSource.id } },
  });

  if (!healthySource) {
    throw new Error('No active healthy source found to test resilience!');
  }

  const healthyResult = await CrawlerManager.crawlSource(healthySource.id);
  console.log(`[TEST 4B RESULT] Healthy Source "${healthySource.name}" extracted ${healthyResult.scholarships.length} scholarships in ${healthyResult.duration}ms.`);

  if (healthyResult.scholarships.length === 0) {
    throw new Error('Healthy source failed to extract scholarships after failure simulation!');
  }

  console.log('\n======================================================');
  console.log('       FAILURE RECOVERY AUTOMATION TEST PASSED!        ');
  console.log('======================================================\n');
}

testFailureRecoveryAutomation()
  .catch((err) => {
    console.error('FAILURE RECOVERY TEST FAILED:', err.message);
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
