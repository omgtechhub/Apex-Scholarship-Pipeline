import axios from 'axios';
import prisma from '../database/prisma-client';
import { createLogger } from '../logger/logger';
import { isSafeUrl } from '../crawler/base-crawler';
import { ValidationError } from '../errors/base.error';
import QueueManager from '../queue/queue-manager';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';

const logger = createLogger('channel-service');
const URL_REGEX = /https?:\/\/[^\s"<>]+/gi;

export interface ChannelWebhookPayload {
  provider: string;
  channelId?: string;
  senderId?: string;
  content?: string;
  urls?: string[];
  metadata?: Record<string, unknown>;
}

export const channelService = {
  async ingest(payload: ChannelWebhookPayload): Promise<{ id: string; processed: boolean }> {
    if (!payload.provider) throw new ValidationError('provider is required');
    const content = (payload.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 10000);
    const urls = (payload.urls ?? (content.match(URL_REGEX) ?? [])).filter(isSafeUrl).slice(0, 20);

    const record = await prisma.channelMessage.create({
      data: {
        provider: payload.provider,
        channelId: payload.channelId,
        senderId: payload.senderId,
        content,
        extractedUrls: urls,
        processed: false,
        metadata: payload.metadata as object | undefined,
      },
    });

    // If a URL corresponds to an existing source, enqueue a crawl for that source.
    let processed = false;
    for (const url of urls) {
      const source = await prisma.scholarshipSource.findFirst({
        where: { status: 'ACTIVE', url: { startsWith: new URL(url).origin } },
      }).catch(() => null);

      if (source) {
        await QueueManager.add(
          QUEUES.CRAWLER,
          JOB_NAMES.CRAWL_SOURCE,
          { sourceId: source.id, channelMessageId: record.id, discoveredUrl: url },
        );
        processed = true;
        break;
      }
    }

    if (processed) {
      await prisma.channelMessage.update({
        where: { id: record.id },
        data: { processed: true, processedAt: new Date() },
      });
    }

    logger.info({ id: record.id, urls: urls.length, processed }, 'Channel message ingested');
    return { id: record.id, processed };
  },

  validateWebhookSecret(secret: string | null | undefined): boolean {
    const expected = process.env.CHANNEL_WEBHOOK_SECRET;
    return Boolean(secret && expected && secret === expected);
  },
};
