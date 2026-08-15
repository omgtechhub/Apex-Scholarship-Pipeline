import { NextRequest } from 'next/server';
import prisma from '../../../../pipeline/database/prisma-client';
import { requireAdmin, handleApiError, apiResponse } from '../../../../pipeline/middleware/auth.middleware';
import { scheduler } from '../../../../pipeline/scheduler/scheduler';
import QueueManager from '../../../../pipeline/queue/queue-manager';
import { QUEUES } from '../../../../pipeline/queue/queue-names';
import { CrawlStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    let body: { sourceId?: string; sourceSlug?: string } = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object') {
        body = parsed;
      }
    } catch {
      // Empty or non-JSON body defaults to triggering all active sources
    }

    const { sourceId, sourceSlug } = body;

    const sources = await prisma.scholarshipSource.findMany({
      where: {
        status: 'ACTIVE',
        ...(sourceId ? { id: sourceId } : {}),
        ...(sourceSlug ? { slug: sourceSlug } : {}),
      },
      orderBy: { name: 'asc' },
    });

    if (sources.length === 0) {
      return apiResponse(
        {
          message: 'No active scholarship sources found matching the criteria.',
          totalSources: 0,
          queued: 0,
          alreadyRunning: 0,
          results: [],
        },
        200
      );
    }

    // Check active/waiting jobs in BullMQ crawler queue
    const crawlerQueue = QueueManager.getQueue(QUEUES.CRAWLER);
    const existingJobs = await crawlerQueue.getJobs(['active', 'waiting', 'delayed']);
    const activeSourceIdsInQueue = new Set(
      existingJobs
        .map((j) => (j.data as { sourceId?: string })?.sourceId)
        .filter(Boolean) as string[]
    );

    // Also check database for running jobs in last 30 minutes
    const recentRunningJobs = await prisma.crawlerJob.findMany({
      where: {
        status: CrawlStatus.RUNNING,
        startedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      select: { sourceId: true },
    });
    const activeSourceIdsInDb = new Set(recentRunningJobs.map((j) => j.sourceId));

    const results: Array<{
      sourceId: string;
      sourceName: string;
      slug: string;
      status: 'queued' | 'already_running';
      jobId?: string;
      message: string;
    }> = [];

    let queuedCount = 0;
    let alreadyRunningCount = 0;

    for (const source of sources) {
      if (activeSourceIdsInQueue.has(source.id) || activeSourceIdsInDb.has(source.id)) {
        alreadyRunningCount++;
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          slug: source.slug,
          status: 'already_running',
          message: 'Crawl job is already queued or currently running.',
        });
        continue;
      }

      const jobId = await scheduler.triggerSource(source.id);
      queuedCount++;
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        slug: source.slug,
        status: 'queued',
        jobId,
        message: 'Crawl job successfully queued.',
      });
    }

    return apiResponse(
      {
        totalSources: sources.length,
        queued: queuedCount,
        alreadyRunning: alreadyRunningCount,
        results,
      },
      202
    );
  } catch (error) {
    return handleApiError(error);
  }
}
