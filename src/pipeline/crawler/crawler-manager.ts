import { CrawlerRegistry } from './crawler-registry';
import prisma from '../database/prisma-client';
import { createLogger } from '../logger/logger';
import type { CrawlResult } from '../types';
import { CrawlStatus } from '../../../generated/prisma';



const logger = createLogger('crawler-manager');

export const CrawlerManager = {
  async crawlSource(sourceId: string): Promise<CrawlResult> {
    const source = await prisma.scholarshipSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    if (source.status !== 'ACTIVE') {
      throw new Error(`Source is not active: ${source.name} (${source.status})`);
    }

    // Create crawler job record
    const job = await prisma.crawlerJob.create({
      data: {
        sourceId,
        status: CrawlStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    logger.info({ sourceId, jobId: job.id, adapter: source.adapterKey }, 'Starting crawl job');

    let result: CrawlResult;

    try {
      const crawler = CrawlerRegistry.create(source.adapterKey, {
        sourceId,
        baseUrl: source.url,
        config: source.config as Record<string, unknown>,
      } as Parameters<typeof CrawlerRegistry.create>[1]);

      result = await crawler.run();

      // Update job status
      await prisma.crawlerJob.update({
        where: { id: job.id },
        data: {
          status: CrawlStatus.COMPLETED,
          completedAt: new Date(),
          scholarships: result.scholarships.length,
          errors: result.errors,
          metadata: {
            pagesVisited: result.pagesVisited,
            duration: result.duration,
          },
        },
      });

      // Update source last crawled time
      await prisma.scholarshipSource.update({
        where: { id: sourceId },
        data: {
          lastCrawledAt: new Date(),
          consecutiveFails: 0,
        },
      });

      // Log to crawler logs
      await prisma.crawlerLog.create({
        data: {
          jobId: job.id,
          sourceId,
          level: 'info',
          message: `Crawl completed: ${result.scholarships.length} scholarships found`,
          metadata: { pagesVisited: result.pagesVisited, duration: result.duration },
        },
      });

      logger.info(
        { sourceId, count: result.scholarships.length, duration: result.duration },
        'Crawl job completed'
      );
    } catch (err) {
      const message = (err as Error).message;

      await prisma.crawlerJob.update({
        where: { id: job.id },
        data: {
          status: CrawlStatus.FAILED,
          completedAt: new Date(),
          errors: [message],
        },
      });

      await prisma.scholarshipSource.update({
        where: { id: sourceId },
        data: {
          consecutiveFails: { increment: 1 },
        },
      });

      await prisma.crawlerLog.create({
        data: {
          jobId: job.id,
          sourceId,
          level: 'error',
          message: `Crawl failed: ${message}`,
        },
      });

      logger.error({ err, sourceId }, 'Crawl job failed');
      throw err;
    }

    return result;
  },
};

export default CrawlerManager;
