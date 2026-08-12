import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import { CheveningAdapter } from '../pipeline/crawler/adapters/chevening.adapter';
import { CommonwealthAdapter } from '../pipeline/crawler/adapters/commonwealth.adapter';
import { DAADAdapter } from '../pipeline/crawler/adapters/daad.adapter';
import { ErasmusAdapter } from '../pipeline/crawler/adapters/erasmus.adapter';
import { OpportunitiesForAfricansAdapter } from '../pipeline/crawler/adapters/opportunities-for-africans.adapter';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { closeRedis } from '../pipeline/queue/redis-client';
import { browserPool } from '../pipeline/crawler/browser-pool';

interface AdapterTestResult {
  name: string;
  url: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  extractedCount: number;
  durationMs: number;
  sampleTitle?: string;
  sampleDeadline?: string;
  reason?: string;
}

async function testAllAdaptersLive() {
  console.log('======================================================');
  console.log('   REAL SCHOLARSHIP SOURCE ADAPTERS EVALUATION       ');
  console.log('======================================================\n');

  const results: AdapterTestResult[] = [];

  const sourcesToTest = [
    { name: 'Chevening Scholarships', slug: 'chevening-scholarships', adapterClass: CheveningAdapter, defaultUrl: 'https://www.chevening.org/scholarships/' },
    { name: 'Commonwealth Scholarships', slug: 'commonwealth-scholarships', adapterClass: CommonwealthAdapter, defaultUrl: 'https://cscuk.fcdo.gov.uk/scholarships/' },
    { name: 'DAAD Scholarships', slug: 'daad-scholarships', adapterClass: DAADAdapter, defaultUrl: 'https://www.daad.de/en/find-a-programme/scholarship-database/' },
    { name: 'Erasmus+ Scholarships', slug: 'erasmus-scholarships', adapterClass: ErasmusAdapter, defaultUrl: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters' },
    { name: 'Opportunities for Africans', slug: 'opportunities-for-africans', adapterClass: OpportunitiesForAfricansAdapter, defaultUrl: 'https://opportunitiesforafricans.com/scholarships/' },
  ];

  for (const srcDef of sourcesToTest) {
    console.log(`\n[TESTING ADAPTER] Source: ${srcDef.name} (${srcDef.defaultUrl})...`);
    const start = Date.now();

    // Fetch or create source record in DB safely using exact slug
    let sourceRecord = await prisma.scholarshipSource.findFirst({
      where: { OR: [{ slug: srcDef.slug }, { name: srcDef.name }] },
    });

    if (!sourceRecord) {
      sourceRecord = await prisma.scholarshipSource.create({
        data: {
          name: srcDef.name,
          slug: srcDef.slug,
          adapterKey: srcDef.slug,
          url: srcDef.defaultUrl,
          status: 'ACTIVE',
        },
      });
    }

    const adapterInstance = new (srcDef.adapterClass as any)({ sourceId: sourceRecord.id });

    try {
      const crawlResult = await adapterInstance.run();
      const durationMs = Date.now() - start;

      if (crawlResult.scholarships.length > 0) {
        const sample = crawlResult.scholarships[0];
        console.log(`  -> RESULT: PASSED (${crawlResult.scholarships.length} scholarships extracted in ${durationMs}ms)`);
        console.log(`     Sample Title: "${sample.title}"`);
        console.log(`     Sample Deadline: ${sample.deadline ? sample.deadline.toISOString() : 'N/A (Rolling/Unspecified)'}`);

        results.push({
          name: srcDef.name,
          url: srcDef.defaultUrl,
          status: 'PASS',
          extractedCount: crawlResult.scholarships.length,
          durationMs,
          sampleTitle: sample.title,
          sampleDeadline: sample.deadline ? sample.deadline.toISOString() : 'N/A',
        });
      } else {
        const errorReason = crawlResult.errors.length > 0
          ? crawlResult.errors.join('; ')
          : 'Returned 0 extracted scholarships';

        const status = errorReason.toLowerCase().includes('timeout') || errorReason.toLowerCase().includes('403') || errorReason.toLowerCase().includes('cloudflare') || errorReason.toLowerCase().includes('econnreset')
          ? 'BLOCKED'
          : 'FAIL';

        console.log(`  -> RESULT: ${status} (${errorReason})`);
        results.push({
          name: srcDef.name,
          url: srcDef.defaultUrl,
          status,
          extractedCount: 0,
          durationMs,
          reason: errorReason,
        });
      }
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const errorReason = err.message || String(err);
      console.log(`  -> RESULT: FAIL (${errorReason})`);
      results.push({
        name: srcDef.name,
        url: srcDef.defaultUrl,
        status: 'FAIL',
        extractedCount: 0,
        durationMs,
        reason: errorReason,
      });
    }
  }

  console.log('\n======================================================');
  console.log('       SOURCE ADAPTERS EVALUATION SUMMARY             ');
  console.log('======================================================');
  for (const r of results) {
    console.log(`- ${r.name.padEnd(28)}: ${r.status.padEnd(8)} (Extracted: ${r.extractedCount}, ${r.durationMs}ms)${r.reason ? ` - ${r.reason}` : ''}`);
  }
  console.log('======================================================\n');
}

testAllAdaptersLive()
  .catch((err) => {
    console.error('ADAPTER EVALUATION FAILED:', err);
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
    console.log('[TEARDOWN] Complete.\n');
  });
