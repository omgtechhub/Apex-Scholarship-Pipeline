import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import QueueManager from '../queue/queue-manager';
import { seoGenerator } from '../seo/seo-generator';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';
import { JobStatus } from '@prisma/client';



const logger = createLogger('seo-worker');

export function createSEOWorker() {
  const worker = new Worker(
    QUEUES.SEO,
    async (job: Job) => {
      const { articleId, scholarshipId } = job.data as { articleId: string; scholarshipId: string };
      const startedAt = new Date();

      logger.info({ jobId: job.id, articleId }, 'SEO job started');

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.SEO },
        data: { status: JobStatus.ACTIVE, startedAt },
      }).catch(() => {});

      const article = await prisma.article.findUnique({ where: { id: articleId } });
      if (!article) throw new Error(`Article not found: ${articleId}`);

      const scholarship = await prisma.scholarship.findUnique({
        where: { id: scholarshipId },
        include: { organization: true },
      });
      if (!scholarship) throw new Error(`Scholarship not found: ${scholarshipId}`);

      // Generate SEO data
      const seoData = await seoGenerator.generate(
        { id: article.id, title: article.title, content: article.content, slug: article.slug },
        {
          id: scholarship.id,
          title: scholarship.title,
          organization: scholarship.organization?.name ?? 'Unknown',
          description: scholarship.description ?? '',
          officialUrl: scholarship.officialUrl,
          applicationUrl: scholarship.applicationUrl,
          deadline: scholarship.deadline,
          country: scholarship.country,
          eligibleCountries: scholarship.eligibleCountries,
          degreeLevel: scholarship.degreeLevel,
          fieldsOfStudy: scholarship.fieldsOfStudy,
          fundingType: scholarship.fundingType,
          fundingAmount: scholarship.fundingAmount,
          currency: scholarship.currency,
        }
      );

      // Upsert article SEO
      await prisma.articleSEO.upsert({
        where: { articleId },
        update: {
          seoTitle: seoData.seoTitle,
          metaDescription: seoData.metaDescription,
          slug: seoData.slug,
          keywords: seoData.keywords,
          canonicalUrl: seoData.canonicalUrl,
          ogTitle: seoData.ogTitle,
          ogDescription: seoData.ogDescription,
          twitterTitle: seoData.twitterTitle,
          twitterDescription: seoData.twitterDescription,
          jsonLd: seoData.jsonLd as object,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          faqSchema: (seoData.faqSchema ?? undefined) as any,
          breadcrumbSchema: seoData.breadcrumbSchema as object,
          updatedAt: new Date(),
        },
        create: {
          articleId,
          seoTitle: seoData.seoTitle,
          metaDescription: seoData.metaDescription,
          slug: seoData.slug,
          keywords: seoData.keywords,
          canonicalUrl: seoData.canonicalUrl,
          ogTitle: seoData.ogTitle,
          ogDescription: seoData.ogDescription,
          twitterTitle: seoData.twitterTitle,
          twitterDescription: seoData.twitterDescription,
          jsonLd: seoData.jsonLd as object,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          faqSchema: (seoData.faqSchema ?? undefined) as any,
          breadcrumbSchema: seoData.breadcrumbSchema as object,
        },
      });

      // Enqueue quality check
      await QueueManager.add(QUEUES.QUALITY, JOB_NAMES.QUALITY_CHECK, {
        articleId,
        scholarshipId,
      });

      const duration = Date.now() - startedAt.getTime();

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.SEO },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          duration,
          output: { articleId, seoTitle: seoData.seoTitle },
        },
      }).catch(() => {});

      await prisma.metric.create({
        data: { name: 'seo_generated', value: 1, labels: { articleId } },
      }).catch(() => {});

      logger.info({ articleId }, 'SEO job done');
      return { articleId, seoTitle: seoData.seoTitle };
    },
    {
      connection: createRedisConnection(),
      concurrency: 3,
    }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'SEO job failed');
    if (job?.id) {
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id, queue: QUEUES.SEO },
        data: { status: JobStatus.FAILED, error: err.message },
      }).catch(() => {});
    }
  });

  worker.on('error', (err) => logger.error({ err }, 'SEO worker error'));

  logger.info('SEO worker started');
  return worker;
}
