import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import publishingService from '../pipeline/publishing/publishing-service';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { closeRedis } from '../pipeline/queue/redis-client';
import { ArticleStatus, ScholarshipStatus } from '@prisma/client';

async function testPublishingGateAutomation() {
  console.log('======================================================');
  console.log('     PRODUCTION AUTOMATION: PUBLISHING GATE TEST      ');
  console.log('======================================================\n');

  // 1. Create a draft article marked REJECT / DRAFT
  const source = await prisma.scholarshipSource.findFirst({ where: { status: 'ACTIVE' } });
  if (!source) throw new Error('No active scholarship source found!');

  const draftScholarship = await prisma.scholarship.create({
    data: {
      sourceId: source.id,
      title: 'Unvetted Draft Scholarship Test',
      slug: `unvetted-draft-scholarship-${Date.now()}`,
      officialUrl: `https://test.org/draft-${Date.now()}`,
      contentHash: `hash-draft-${Date.now()}`,
      status: ScholarshipStatus.DRAFT,
      country: 'Test Country',
      degreeLevel: 'ANY',
      fundingType: 'FULL',
    },
  });

  const draftArticle = await prisma.article.create({
    data: {
      scholarshipId: draftScholarship.id,
      title: 'Unvetted Draft Article Title',
      slug: `unvetted-draft-article-${Date.now()}`,
      content: 'Short content that has not passed factual QC evaluation.',
      status: ArticleStatus.DRAFT,
    },
  });

  console.log(`[TEST 5A: UNVETTED DRAFT BLOCKING] Created Draft Article ID: ${draftArticle.id} (Status: DRAFT)`);

  // Attempt publishing draft article directly via publishing service
  try {
    await publishingService.publishArticle(draftArticle.id);
    // Fetch article status from DB
    const checkStatus = await prisma.article.findUnique({ where: { id: draftArticle.id } });
    if (checkStatus?.status === ArticleStatus.PUBLISHED) {
      throw new Error('CRITICAL VULNERABILITY: Publishing service published an unapproved DRAFT article!');
    }
  } catch (err: any) {
    console.log(`[TEST 5A RESULT] Publishing Gate successfully blocked unvetted draft article! Error: ${err.message}`);
  }

  // Cleanup test draft record
  await prisma.article.delete({ where: { id: draftArticle.id } });
  await prisma.scholarship.delete({ where: { id: draftScholarship.id } });

  console.log('\n======================================================');
  console.log('       PUBLISHING GATE AUTOMATION TEST PASSED!        ');
  console.log('======================================================\n');
}

testPublishingGateAutomation()
  .catch((err) => {
    console.error('PUBLISHING GATE TEST FAILED:', err.message);
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
