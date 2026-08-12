import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import { DAADAdapter } from '../pipeline/crawler/adapters/daad.adapter';
import { processScholarship } from '../pipeline/processing/processing-service';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { closeRedis } from '../pipeline/queue/redis-client';
import { browserPool } from '../pipeline/crawler/browser-pool';

async function testDeduplicationAutomation() {
  console.log('======================================================');
  console.log('       PRODUCTION AUTOMATION: DEDUPLICATION TEST      ');
  console.log('======================================================\n');

  let source = await prisma.scholarshipSource.findFirst({
    where: { OR: [{ slug: 'daad-scholarships' }, { name: 'DAAD Scholarships' }] },
  });

  if (!source) {
    source = await prisma.scholarshipSource.create({
      data: {
        name: 'DAAD Scholarships',
        slug: 'daad-scholarships',
        adapterKey: 'daad',
        url: 'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/',
        status: 'ACTIVE',
      },
    });
  }

  const adapter = new DAADAdapter({ sourceId: source.id });

  // 1. First Crawl
  console.log('[STAGE 1: FIRST CRAWL & PROCESS] Running 1st DAAD extraction...');
  const res1 = await adapter.run();
  if (res1.scholarships.length === 0) {
    throw new Error('First crawl extracted 0 scholarships! Deduplication test failed.');
  }

  const targetRecord = res1.scholarships[0];
  console.log(`Target Scholarship Title: "${targetRecord.title}"`);
  console.log(`Target Official URL:      ${targetRecord.officialUrl}`);

  const process1 = await processScholarship(targetRecord, source.id);
  console.log(`[STAGE 1 RESULT] Process 1 Status: ${process1.status}, ID: ${process1.scholarshipId}`);

  const totalCountBefore = await prisma.scholarship.count({
    where: { officialUrl: targetRecord.officialUrl },
  });

  // 2. Second Crawl (Deduplication Check)
  console.log('\n[STAGE 2: SECOND CRAWL & PROCESS] Running 2nd DAAD extraction on exact same record...');
  const process2 = await processScholarship(targetRecord, source.id);
  console.log(`[STAGE 2 RESULT] Process 2 Status: ${process2.status}, ID: ${process2.scholarshipId}`);

  const totalCountAfter = await prisma.scholarship.count({
    where: { officialUrl: targetRecord.officialUrl },
  });

  console.log(`DB Count Before: ${totalCountBefore}, DB Count After 2nd Crawl: ${totalCountAfter}`);

  if (process2.status !== 'duplicate' && process2.status !== 'updated') {
    throw new Error(`Expected deduplication status 'duplicate' or 'updated', got '${process2.status}'!`);
  }

  if (totalCountAfter !== totalCountBefore) {
    throw new Error(`Deduplication FAILED! DB count increased from ${totalCountBefore} to ${totalCountAfter}. Duplicate created!`);
  }

  console.log('\n======================================================');
  console.log('        DEDUPLICATION AUTOMATION TEST PASSED!         ');
  console.log('======================================================\n');
}

testDeduplicationAutomation()
  .catch((err) => {
    console.error('DEDUPLICATION TEST FAILED:', err.message);
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
