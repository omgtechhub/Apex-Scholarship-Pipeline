import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import QueueManager from '../queue/queue-manager';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';
import { JobStatus, ArticleStatus } from '@prisma/client';


import { qualityService } from '../quality/quality-service';

const logger = createLogger('quality-worker');

export function createQualityWorker() {
  const worker = new Worker(
    QUEUES.QUALITY,
    async (job: Job) => {
      const { articleId, scholarshipId } = job.data as { articleId: string; scholarshipId: string };
      const startedAt = new Date();

      logger.info({ jobId: job.id, articleId }, 'Quality job started');

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.QUALITY },
        data: { status: JobStatus.ACTIVE, startedAt },
      }).catch(() => {});

      const article = await prisma.article.findUnique({ where: { id: articleId } });
      if (!article) throw new Error(`Article not found: ${articleId}`);

      const scholarship = await prisma.scholarship.findUnique({
        where: { id: scholarshipId ?? article.scholarshipId },
        include: { organization: true },
      });
      if (!scholarship) throw new Error(`Scholarship not found: ${scholarshipId ?? article.scholarshipId}`);

      const result = await qualityService.check({
        article: {
          title: article.title,
          content: article.content,
          wordCount: article.wordCount,
        },
        scholarship: {
          title: scholarship.title,
          organization: scholarship.organization?.name ?? 'Unknown',
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
          benefits: scholarship.benefits,
          eligibility: scholarship.eligibility,
          requirements: scholarship.requirements,
          documents: scholarship.documents,
        },
      });

      await prisma.qualityCheck.create({
        data: {
          articleId,
          score: result.score,
          status: result.status,
          checks: result.checks,
          errors: result.errors,
          warnings: result.warnings,
          recommendations: result.recommendations,
          factualMismatches: result.factualMismatches,
        },
      });

      if (result.status === 'PASS') {
        await prisma.article.update({ where: { id: articleId }, data: { status: ArticleStatus.APPROVED } });

        /*
         * Hand off to publishing — the step that was missing.
         *
         * Every other stage chains to the next one (crawler -> processing ->
         * validation -> ai -> seo -> quality), but this branch stopped at
         * APPROVED and enqueued nothing, so the automated pipeline could never
         * reach PUBLISHED. The PUBLISHING queue had exactly one producer: the
         * manual, auth-gated POST /api/articles/[id]/publish endpoint.
         *
         * That is why a crawl could run end to end, generate good articles, and
         * still leave the public API returning zero scholarships — the gate it
         * enforces (ACTIVE scholarship + at least one PUBLISHED article) was
         * unreachable without someone calling the endpoint by hand.
         *
         * Only PASS auto-publishes. REVIEW still parks at QUALITY_REVIEW and
         * REJECT at REJECTED, so the quality gate keeps its veto; this restores
         * the chain without removing the check.
         */
        await QueueManager.add(QUEUES.PUBLISHING, JOB_NAMES.PUBLISH_ARTICLE, { articleId });
      } else if (result.status === 'REJECT') {
        await prisma.article.update({
          where: { id: articleId },
          data: { status: ArticleStatus.REJECTED, rejectionReason: result.errors.join('; ') || 'Quality gate rejected article' },
        });
      } else {
        await prisma.article.update({ where: { id: articleId }, data: { status: ArticleStatus.QUALITY_REVIEW } });
      }

      await prisma.queueHistory.updateMany({
        where: { jobId: job.id!, queue: QUEUES.QUALITY },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          duration: Date.now() - startedAt.getTime(),
          output: { articleId, status: result.status, score: result.score },
        },
      }).catch(() => {});

      return { articleId, status: result.status, score: result.score };
    },
    { connection: createRedisConnection(), concurrency: 3 }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Quality worker failed');
    if (job?.id) {
      await prisma.queueHistory.updateMany({
        where: { jobId: job.id, queue: QUEUES.QUALITY },
        data: { status: JobStatus.FAILED, error: err.message },
      }).catch(() => {});
    }
  });

  worker.on('error', (err) => logger.error({ err }, 'Quality worker error'));
  return worker;
}
