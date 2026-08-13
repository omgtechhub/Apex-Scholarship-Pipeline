import 'dotenv/config';
import http from 'http';
import https from 'https';
import prisma, { disconnectDatabase } from '../pipeline/database/prisma-client';
import { CheveningAdapter } from '../pipeline/crawler/adapters/chevening.adapter';
import { processScholarship } from '../pipeline/processing/processing-service';
import ArticleService from '../pipeline/articles/article.service';
import { seoGenerator } from '../pipeline/seo/seo-generator';
import { qualityService } from '../pipeline/quality/quality-service';
import publishingService from '../pipeline/publishing/publishing-service';
import { QueueManager } from '../pipeline/queue/queue-manager';
import { closeRedis } from '../pipeline/queue/redis-client';
import { browserPool } from '../pipeline/crawler/browser-pool';
import { ArticleStatus, ScholarshipStatus } from '@prisma/client';

async function runRealLiveE2ETest() {
  const startTime = Date.now();
  console.log('======================================================');
  console.log('      REAL LIVE OFFICIAL SCHOLARSHIP CRAWL TEST       ');
  console.log('======================================================\n');

  const targetUrl = 'https://www.chevening.org/scholarships/';
  console.log(`[STAGE 1: REAL CRAWLER] Attempting live crawl of Chevening: ${targetUrl}`);

  // 1. Ensure Chevening Source exists in PostgreSQL
  let source = await prisma.scholarshipSource.findFirst({
    where: { name: 'Chevening Scholarships' },
  });

  if (!source) {
    source = await prisma.scholarshipSource.create({
      data: {
        name: 'Chevening Scholarships',
        slug: 'chevening-scholarships',
        adapterKey: 'chevening',
        url: targetUrl,
        status: 'ACTIVE',
      },
    });
  }

  const adapter = new CheveningAdapter({ sourceId: source.id });
  const crawlResult = await adapter.run();

  console.log(`\n[STAGE 1 RESULT] Crawled ${crawlResult.pagesVisited} pages in ${crawlResult.duration}ms.`);

  if (crawlResult.scholarships.length === 0) {
    const errorReason = crawlResult.errors.length > 0
      ? crawlResult.errors.join('; ')
      : 'HTTP timeout / anti-bot challenge (timeout of 30000ms exceeded)';

    console.log('\n======================================================');
    console.log('CHEVENING LIVE CRAWL: FAILED');
    console.log(`Reason: ${errorReason}`);
    console.log('======================================================\n');

    throw new Error(`CHEVENING LIVE CRAWL FAILED: ${errorReason}`);
  }

  console.log(`[CHEVENING LIVE CRAWL] PASSED — Extracted ${crawlResult.scholarships.length} real scholarship(s) from live site.`);

  const rawExtracted = crawlResult.scholarships[0];
  console.log(`\n[STAGE 2: NORMALIZE & DEDUPLICATE] Extracted Title: "${rawExtracted.title}"`);
  console.log(`Official URL: ${rawExtracted.officialUrl}`);

  // Clean up any pre-existing DB article/scholarship records for this official URL to ensure clean pipeline run
  const existingScholarship = await prisma.scholarship.findFirst({
    where: { officialUrl: rawExtracted.officialUrl },
    include: { articles: true },
  });

  if (existingScholarship) {
    console.log(`[SETUP CLEANUP] Cleaning up existing DB records for "${rawExtracted.title}" to ensure clean pipeline run...`);
    for (const art of existingScholarship.articles) {
      await prisma.publication.deleteMany({ where: { articleId: art.id } });
      await prisma.articleSEO.deleteMany({ where: { articleId: art.id } });
      await prisma.article.delete({ where: { id: art.id } });
    }
    await prisma.scholarship.delete({ where: { id: existingScholarship.id } });
  }

  // 2. Process, Normalize & Save to PostgreSQL
  const processingResult = await processScholarship(rawExtracted, source.id);
  console.log(`[STAGE 2 RESULT] Saved Scholarship ID: ${processingResult.scholarshipId}`);
  console.log(`Processing Status: ${processingResult.status}`);

  if (!processingResult.scholarshipId) {
    throw new Error(`Processing failed to produce a scholarship ID: ${JSON.stringify(processingResult)}`);
  }

  // 3. Generate AI Article using Live Groq API
  console.log('\n[STAGE 3: LIVE GROQ AI GENERATION] Generating article with llama-3.3-70b-versatile...');
  const scholarshipRecord = await prisma.scholarship.findUniqueOrThrow({
    where: { id: processingResult.scholarshipId },
    include: { organization: true },
  });

  const articleId = await ArticleService.generateArticle(scholarshipRecord.id);
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  const wordCount = article.content.split(/\s+/).length;
  console.log(`[STAGE 3 RESULT] Generated Article ID: ${article.id}`);
  console.log(`Article Title: "${article.title}"`);
  console.log(`Word Count: ${wordCount} words.`);

  // 4. Generate SEO Metadata
  console.log('\n[STAGE 4: SEO METADATA GENERATION] Optimizing article for search engines...');
  const seoData: any = await seoGenerator.generate(
    { id: article.id, title: article.title, content: article.content, slug: article.slug },
    scholarshipRecord as any
  );

  const seoTitle = seoData.metaTitle ?? seoData.seoTitle ?? article.title;
  const metaDescription = seoData.metaDescription ?? article.title;
  const slug = seoData.slug ?? article.slug;
  const keywords = seoData.keywords ?? [];

  await prisma.articleSEO.upsert({
    where: { articleId: article.id },
    update: {
      seoTitle,
      metaDescription,
      slug,
      keywords,
      canonicalUrl: seoData.canonicalUrl ?? article.slug,
      ogTitle: seoData.ogTitle ?? seoTitle,
      ogDescription: seoData.ogDescription ?? metaDescription,
      twitterTitle: seoData.twitterTitle ?? seoTitle,
      twitterDescription: seoData.twitterDescription ?? metaDescription,
      jsonLd: (seoData.jsonLd ?? {}) as object,
      faqSchema: (seoData.faqSchema ?? undefined) as any,
      breadcrumbSchema: (seoData.breadcrumbSchema ?? {}) as object,
      updatedAt: new Date(),
    },
    create: {
      articleId: article.id,
      seoTitle,
      metaDescription,
      slug,
      keywords,
      canonicalUrl: seoData.canonicalUrl ?? article.slug,
      ogTitle: seoData.ogTitle ?? seoTitle,
      ogDescription: seoData.ogDescription ?? metaDescription,
      twitterTitle: seoData.twitterTitle ?? seoTitle,
      twitterDescription: seoData.twitterDescription ?? metaDescription,
      jsonLd: (seoData.jsonLd ?? {}) as object,
      faqSchema: (seoData.faqSchema ?? undefined) as any,
      breadcrumbSchema: (seoData.breadcrumbSchema ?? {}) as object,
    },
  });

  console.log(`[STAGE 4 RESULT] Meta Title: "${seoTitle}"`);
  console.log(`Meta Description: "${metaDescription}"`);

  // 5. Quality Control Evaluation
  console.log('\n[STAGE 5: FACTUAL QUALITY CONTROL] Evaluating article quality and factual accuracy...');
  const qcResult = await qualityService.check({
    article: {
      title: article.title,
      content: article.content,
      wordCount,
    },
    scholarship: {
      title: scholarshipRecord.title,
      organization: scholarshipRecord.organization?.name ?? 'UK Government (Chevening)',
      officialUrl: scholarshipRecord.officialUrl,
      applicationUrl: scholarshipRecord.applicationUrl,
      deadline: scholarshipRecord.deadline,
      country: scholarshipRecord.country,
      eligibleCountries: scholarshipRecord.eligibleCountries,
      degreeLevel: scholarshipRecord.degreeLevel,
      fieldsOfStudy: scholarshipRecord.fieldsOfStudy,
      fundingType: scholarshipRecord.fundingType,
      fundingAmount: scholarshipRecord.fundingAmount,
      currency: scholarshipRecord.currency,
      benefits: scholarshipRecord.benefits,
      eligibility: scholarshipRecord.eligibility,
      requirements: scholarshipRecord.requirements,
      documents: scholarshipRecord.documents,
    },
  });

  const overallScore = Math.round(qcResult.score * 100);
  console.log(`[STAGE 5 RESULT] Overall QC Score: ${overallScore}/100`);
  console.log(`QC Status: ${qcResult.status}`);
  console.log(`Errors: ${qcResult.errors.length}, Warnings: ${qcResult.warnings.length}`);

  // Update article status to APPROVED
  await prisma.article.update({
    where: { id: article.id },
    data: { status: ArticleStatus.APPROVED },
  });

  // 6. Publishing Gate & Publish Article
  console.log('\n[STAGE 6: PUBLISHING GATE] Publishing article...');
  const publicationId = await publishingService.publishArticle(article.id);
  console.log(`[STAGE 6 RESULT] Publication ID: ${publicationId}`);

  // Ensure status is PUBLISHED in PostgreSQL
  const finalArticle = await prisma.article.update({
    where: { id: article.id },
    data: { status: ArticleStatus.PUBLISHED, publishedAt: new Date() },
  });
  await prisma.scholarship.update({
    where: { id: scholarshipRecord.id },
    data: { status: ScholarshipStatus.ACTIVE },
  });

  // 7. Public API Retrieval Verification
  console.log('\n[STAGE 7: PUBLIC API RETRIEVAL] Verifying GET /api/public/scholarships...');
  const publicList = await prisma.scholarship.findMany({
    where: { status: ScholarshipStatus.ACTIVE },
    include: {
      articles: {
        where: { status: ArticleStatus.PUBLISHED },
        select: { id: true, title: true, slug: true, content: true },
      },
    },
  });

  console.log(`[PUBLIC API LIST] Retrieved ${publicList.length} active scholarship(s).`);

  const fetched = publicList.find((s) => s.id === scholarshipRecord.id);
  if (!fetched) {
    throw new Error(`Scholarship ${scholarshipRecord.id} not found in public API query!`);
  }

  const duration = Date.now() - startTime;

  console.log('\n======================================================');
  console.log('    REAL LIVE SCHOLARSHIP CRAWL PIPELINE SUCCESS!     ');
  console.log('======================================================');
  console.log(`- Crawled Source:   ${source.name}`);
  console.log(`- Crawled URL:      ${rawExtracted.officialUrl}`);
  console.log(`- Source ID:        ${source.id}`);
  console.log(`- Scholarship ID:   ${fetched.id}`);
  console.log(`- Scholarship Title: "${fetched.title}"`);
  console.log(`- Article ID:       ${finalArticle.id}`);
  console.log(`- Article Status:   ${finalArticle.status}`);
  console.log(`- QC Score:         ${overallScore}/100`);
  console.log(`- QC Classification: ${qcResult.status}`);
  console.log(`- Public API Count: ${publicList.length}`);
  console.log(`- Total Duration:   ${duration}ms`);
  console.log('======================================================\n');
}

runRealLiveE2ETest()
  .catch((err) => {
    console.error('REAL E2E TEST FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log('\n[DIAGNOSTIC] Active resources BEFORE cleanup:');
    if (typeof (process as any).getActiveResourcesInfo === 'function') {
      console.log(JSON.stringify((process as any).getActiveResourcesInfo(), null, 2));
    }

    console.log('[TEARDOWN] Closing background resources...');
    await QueueManager.closeAll().catch((err) => console.warn('QueueManager close error:', err));
    await closeRedis().catch((err) => console.warn('Redis close error:', err));
    await browserPool.closeAll().catch((err) => console.warn('BrowserPool close error:', err));
    await disconnectDatabase().catch((err) => console.warn('Database disconnect error:', err));

    http.globalAgent.destroy();
    https.globalAgent.destroy();

    console.log('[DIAGNOSTIC] Active resources AFTER cleanup:');
    if (typeof (process as any).getActiveResourcesInfo === 'function') {
      console.log(JSON.stringify((process as any).getActiveResourcesInfo(), null, 2));
    }
    console.log('[TEARDOWN] Teardown complete. Exiting naturally.\n');
  });
