import axios from 'axios';
import { createLogger } from '../logger/logger';
import { PublishingError } from '../errors/base.error';
import type { PublishingProvider, PublishArticleInput } from './publishing-provider.interface';
import type { PublishResult } from '../types';

const logger = createLogger('http-publishing-provider');

export class HttpPublishingProvider implements PublishingProvider {
  readonly name = 'http';
  private readonly webhookUrl: string | undefined;
  private readonly secret: string | undefined;

  constructor() {
    this.webhookUrl = process.env.PUBLISHING_WEBHOOK_URL;
    this.secret = process.env.PUBLISHING_WEBHOOK_SECRET;
  }

  isAvailable(): boolean {
    return Boolean(this.webhookUrl);
  }

  async publish(input: PublishArticleInput): Promise<PublishResult> {
    if (!this.webhookUrl) {
      logger.warn('HTTP publishing provider: no PUBLISHING_WEBHOOK_URL configured, skipping');
      return {
        provider: this.name,
        status: 'DRAFT',
        metadata: { reason: 'No webhook URL configured — article saved as draft' },
      };
    }

    try {
      const payload = {
        action: 'publish',
        article: {
          id: input.articleId,
          title: input.title,
          content: input.content,
          slug: input.slug,
          scholarship: input.scholarship,
          seo: input.seo,
          scheduledAt: input.scheduledAt,
        },
        timestamp: new Date().toISOString(),
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.secret) {
        // HMAC authentication
        const { createHmac } = await import('crypto');
        const body = JSON.stringify(payload);
        const signature = createHmac('sha256', this.secret).update(body).digest('hex');
        headers['X-Signature-SHA256'] = signature;
      }

      const response = await axios.post(this.webhookUrl, payload, {
        headers,
        timeout: 30000,
      });

      const externalId = response.data?.id ?? input.articleId;
      const externalUrl = response.data?.url ?? undefined;

      logger.info({ articleId: input.articleId, externalId }, 'Article published via HTTP');

      return {
        provider: this.name,
        externalId,
        externalUrl,
        status: 'PUBLISHED',
        metadata: { webhookResponse: response.status },
      };
    } catch (err) {
      const message = (err as Error).message;
      logger.error({ err, articleId: input.articleId }, 'HTTP publishing failed');
      throw new PublishingError(`HTTP publishing failed: ${message}`, { articleId: input.articleId }, true);
    }
  }

  async unpublish(externalId: string): Promise<void> {
    if (!this.webhookUrl) return;

    await axios.post(this.webhookUrl, {
      action: 'unpublish',
      externalId,
      timestamp: new Date().toISOString(),
    }, { timeout: 10000 }).catch((err) => {
      logger.warn({ err, externalId }, 'HTTP unpublish failed');
    });
  }

  async update(externalId: string, input: PublishArticleInput): Promise<PublishResult> {
    if (!this.webhookUrl) {
      return { provider: this.name, status: 'DRAFT', externalId };
    }

    try {
      const response = await axios.put(`${this.webhookUrl}/${externalId}`, {
        action: 'update',
        article: input,
        timestamp: new Date().toISOString(),
      }, { timeout: 30000 });

      return {
        provider: this.name,
        externalId,
        externalUrl: response.data?.url,
        status: 'PUBLISHED',
      };
    } catch (err) {
      throw new PublishingError(`HTTP update failed: ${(err as Error).message}`, {}, true);
    }
  }
}

export default new HttpPublishingProvider();
