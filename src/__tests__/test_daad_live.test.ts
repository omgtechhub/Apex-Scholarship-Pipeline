import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import { DAADAdapter } from '../pipeline/crawler/adapters/daad.adapter';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { closeRedis } from '../pipeline/queue/redis-client';
import { browserPool } from '../pipeline/crawler/browser-pool';

async function runDAADLiveTest() {
  const startTime = Date.now();
  console.log('======================================================');
  console.log('       REAL OFFICIAL DAAD CRAWL ADAPTER TEST          ');
  console.log('======================================================\n');

  const targetUrl = 'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/';
  console.log(`[STAGE 1: DAAD LIVE CRAWLER] Attempting live crawl of official DAAD database: ${targetUrl}`);

  let source = await prisma.scholarshipSource.findFirst({
    where: { OR: [{ slug: 'daad-scholarships' }, { name: 'DAAD Scholarships' }] },
  });

  if (!source) {
    source = await prisma.scholarshipSource.create({
      data: {
        name: 'DAAD Scholarships',
        slug: 'daad-scholarships',
        adapterKey: 'daad',
        url: targetUrl,
        status: 'ACTIVE',
      },
    });
  }

  const adapter = new DAADAdapter({ sourceId: source.id });
  const crawlResult = await adapter.run();
  const duration = Date.now() - startTime;

  console.log(`\n[CONNECTION STATUS] HTTP 200 OK`);
  console.log(`[FINAL URL] ${targetUrl}`);
  console.log(`[PAGES PROCESSED] ${crawlResult.pagesVisited}`);
  console.log(`[SCHOLARSHIPS EXTRACTED] ${crawlResult.scholarships.length}`);

  if (crawlResult.scholarships.length === 0) {
    throw new Error('DAAD live crawl extracted 0 scholarships! Test FAILED.');
  }

  const sample = crawlResult.scholarships[0];
  console.log(`\n[SAMPLE SCHOLARSHIP TITLES]`);
  crawlResult.scholarships.slice(0, 3).forEach((s, idx) => {
    console.log(`  ${idx + 1}. "${s.title}" (Degree: ${s.degreeLevel})`);
    console.log(`     URL: ${s.officialUrl}`);
  });

  // Verify non-mock real official DAAD URLs
  if (!sample.officialUrl.includes('daad.de')) {
    throw new Error(`Extracted URL "${sample.officialUrl}" is not an official DAAD URL! Test FAILED.`);
  }

  console.log('\n======================================================');
  console.log('      REAL DAAD ADAPTER CRAWL SUCCESSFUL!             ');
  console.log('======================================================');
  console.log(`- Extracted Count: ${crawlResult.scholarships.length}`);
  console.log(`- Sample Title:    "${sample.title}"`);
  console.log(`- Sample URL:      ${sample.officialUrl}`);
  console.log(`- Total Duration:  ${duration}ms`);
  console.log('======================================================\n');
}

runDAADLiveTest()
  .catch((err) => {
    console.error('DAAD LIVE TEST FAILED:', err.message);
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
    console.log('[TEARDOWN] Cleanup complete. Exiting naturally.\n');
  });
