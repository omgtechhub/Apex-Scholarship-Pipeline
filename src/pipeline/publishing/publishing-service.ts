import prisma from '../database/prisma-client';
import { createLogger } from '../logger/logger';
import { NotFoundError } from '../errors/base.error';
import ArticleService from '../articles/article.service';
import type { PublishingProvider } from './publishing-provider.interface';
import httpPublishingProvider from './http-publishing.provider';
import { ArticleStatus, PublishingStatus } from '../../../generated/prisma';

const logger = createLogger('publishing-service');

export class PublishingService {
  private providers: PublishingProvider[];

  constructor(providers: PublishingProvider[] = [httpPublishingProvider]) {
    this.providers = providers;
  }

  private getProvider(): PublishingProvider {
    return this.providers.find((p) => p.isAvailable()) ?? this.providers[0];
  }

  async publishArticle(articleId: string): Promise<string> {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        scholarship: { include: { organization: true } },
        seo: true,
      },
    });

    if (!article) throw new NotFoundError('Article', articleId);

    if (!['APPROVED', 'SCHEDULED'].includes(article.status)) {
      throw new Error(`Cannot publish article in status: ${article.status}`);
    }

    const provider = this.getProvider();

    // Create publication record
    const pub = await prisma.publication.create({
      data: {
        articleId,
        provider: provider.name,
        status: PublishingStatus.DRAFT,
      },
    });

    try {
      const result = await provider.publish({
        articleId,
        title: article.title,
        content: article.content,
        slug: article.slug,
        scholarship: {
          title: article.scholarship.title,
          officialUrl: article.scholarship.officialUrl,
          deadline: article.scholarship.deadline,
          country: article.scholarship.country,
        },
        seo: article.seo
          ? {
              seoTitle: article.seo.seoTitle,
              metaDescription: article.seo.metaDescription,
              keywords: article.seo.keywords,
              jsonLd: article.seo.jsonLd as Record<string, unknown>,
            }
          : null,
      });

      // Update publication
      await prisma.publication.update({
        where: { id: pub.id },
        data: {
          status: PublishingStatus.PUBLISHED,
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          publishedAt: new Date(),
          metadata: result.metadata as object,
        },
      });

      // Transition article state
      await ArticleService.transitionStatus(articleId, ArticleStatus.PUBLISHED);

      logger.info({ articleId, provider: provider.name }, 'Article published');
      return pub.id;
    } catch (err) {
      await prisma.publication.update({
        where: { id: pub.id },
        data: {
          status: PublishingStatus.FAILED,
          error: (err as Error).message,
        },
      });
      throw err;
    }
  }

  async scheduleArticle(articleId: string, scheduledAt: Date): Promise<void> {
    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new NotFoundError('Article', articleId);

    await ArticleService.transitionStatus(articleId, ArticleStatus.SCHEDULED);
    await prisma.article.update({
      where: { id: articleId },
      data: { scheduledAt },
    });

    await prisma.publication.create({
      data: {
        articleId,
        provider: this.getProvider().name,
        status: PublishingStatus.SCHEDULED,
        scheduledAt,
      },
    });

    logger.info({ articleId, scheduledAt }, 'Article scheduled');
  }

  async archiveArticle(articleId: string): Promise<void> {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { publications: { where: { status: PublishingStatus.PUBLISHED }, take: 1 } },
    });
    if (!article) throw new NotFoundError('Article', articleId);

    // Unpublish from provider if applicable
    const pub = article.publications[0];
    if (pub?.externalId) {
      const provider = this.getProvider();
      await provider.unpublish(pub.externalId).catch((err) =>
        logger.warn({ err }, 'Failed to unpublish from provider')
      );
    }

    await ArticleService.archive(articleId);

    if (pub) {
      await prisma.publication.update({
        where: { id: pub.id },
        data: { status: PublishingStatus.ARCHIVED },
      });
    }

    logger.info({ articleId }, 'Article archived');
  }

  async rollbackArticle(articleId: string, versionNumber: number): Promise<void> {
    await ArticleService.rollback(articleId, versionNumber);
    logger.info({ articleId, versionNumber }, 'Article rolled back');
  }
}

export const publishingService = new PublishingService();
export default publishingService;
