import prisma from '../database/prisma-client';
import { articleGenerator } from '../ai/article-generator';
import { createLogger } from '../logger/logger';
import { toSlug, makeUniqueSlug } from '../utils/string.util';
import { NotFoundError } from '../errors/base.error';
import { ArticleStatus } from '../../../generated/prisma';

const logger = createLogger('article-service');

// Valid state machine transitions
const VALID_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  [ArticleStatus.DRAFT]: [ArticleStatus.GENERATING, ArticleStatus.FAILED],
  [ArticleStatus.GENERATING]: [ArticleStatus.GENERATED, ArticleStatus.FAILED],
  [ArticleStatus.GENERATED]: [ArticleStatus.QUALITY_REVIEW, ArticleStatus.FAILED],
  [ArticleStatus.QUALITY_REVIEW]: [ArticleStatus.APPROVED, ArticleStatus.REJECTED],
  [ArticleStatus.APPROVED]: [ArticleStatus.SCHEDULED, ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED],
  [ArticleStatus.REJECTED]: [ArticleStatus.GENERATING, ArticleStatus.ARCHIVED],
  [ArticleStatus.SCHEDULED]: [ArticleStatus.PUBLISHED, ArticleStatus.APPROVED],
  [ArticleStatus.PUBLISHED]: [ArticleStatus.ARCHIVED],
  [ArticleStatus.ARCHIVED]: [],
  [ArticleStatus.FAILED]: [ArticleStatus.GENERATING],
};

export const ArticleService = {
  /**
   * Generate an article for a scholarship.
   */
  async generateArticle(scholarshipId: string): Promise<string> {
    const scholarship = await prisma.scholarship.findUnique({
      where: { id: scholarshipId },
      include: { organization: true },
    });
    if (!scholarship) throw new NotFoundError('Scholarship', scholarshipId);

    // Check for existing article
    const existing = await prisma.article.findFirst({
      where: {
        scholarshipId,
        status: { notIn: [ArticleStatus.REJECTED, ArticleStatus.ARCHIVED, ArticleStatus.FAILED] },
      },
    });

    let articleId: string;

    if (existing) {
      // Transition to GENERATING
      await ArticleService.transitionStatus(existing.id, ArticleStatus.GENERATING);
      articleId = existing.id;
    } else {
      // Create new article stub
      const baseSlug = toSlug(scholarship.title);
      let slug = baseSlug;
      const existing = await prisma.article.findUnique({ where: { slug } });
      if (existing) slug = makeUniqueSlug(baseSlug);

      const article = await prisma.article.create({
        data: {
          scholarshipId,
          title: scholarship.title,
          slug,
          content: '',
          status: ArticleStatus.GENERATING,
        },
      });
      articleId = article.id;
    }

    try {
      // Generate content
      const result = await articleGenerator.generate({
        title: scholarship.title,
        organization: scholarship.organization?.name ?? 'Unknown Organization',
        description: scholarship.description ?? '',
        officialUrl: scholarship.officialUrl,
        applicationUrl: scholarship.applicationUrl,
        deadline: scholarship.deadline,
        startDate: scholarship.startDate,
        country: scholarship.country,
        eligibleCountries: scholarship.eligibleCountries,
        degreeLevel: scholarship.degreeLevel,
        fieldsOfStudy: scholarship.fieldsOfStudy,
        fundingType: scholarship.fundingType,
        fundingAmount: scholarship.fundingAmount,
        currency: scholarship.currency,
        benefits: scholarship.benefits,
        eligibility: scholarship.eligibility ?? '',
        requirements: scholarship.requirements,
        documents: scholarship.documents,
        applicationInstructions: scholarship.applicationInstructions ?? '',
      });

      // Save article content
      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          title: result.article.title,
          content: result.article.fullContent,
          status: ArticleStatus.GENERATED,
          wordCount: result.wordCount,
          readingTime: result.readingTime,
          promptVersionId: result.promptVersionId,
          metadata: { faqs: result.article.faqs, sections: Object.keys(result.article) },
        },
      });

      // Create article version
      const versionCount = await prisma.articleVersion.count({ where: { articleId } });
      await prisma.articleVersion.create({
        data: {
          articleId,
          version: versionCount + 1,
          title: updated.title,
          content: updated.content,
          status: ArticleStatus.GENERATED,
        },
      });

      // Record metric
      await prisma.metric.create({
        data: {
          name: 'article_generated',
          value: 1,
          labels: { scholarshipId, articleId, wordCount: result.wordCount },
        },
      }).catch(() => {});

      logger.info({ articleId, wordCount: result.wordCount }, 'Article generated');
      return articleId;
    } catch (err) {
      await prisma.article.update({
        where: { id: articleId },
        data: { status: ArticleStatus.FAILED },
      });

      await prisma.metric.create({
        data: { name: 'article_generation_failed', value: 1, labels: { scholarshipId } },
      }).catch(() => {});

      throw err;
    }
  },

  /**
   * Transition article to a new status, enforcing the state machine.
   */
  async transitionStatus(
    articleId: string,
    newStatus: ArticleStatus,
    reason?: string
  ): Promise<void> {
    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new NotFoundError('Article', articleId);

    const validNext = VALID_TRANSITIONS[article.status] ?? [];
    if (!validNext.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: ${article.status} → ${newStatus}. Valid transitions: ${validNext.join(', ') || 'none'}`
      );
    }

    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: newStatus,
        rejectionReason: newStatus === ArticleStatus.REJECTED ? reason : undefined,
        publishedAt: newStatus === ArticleStatus.PUBLISHED ? new Date() : undefined,
      },
    });

    logger.info({ articleId, from: article.status, to: newStatus }, 'Article status transition');
  },

  /**
   * Approve article, moving from QUALITY_REVIEW → APPROVED.
   */
  async approve(articleId: string): Promise<void> {
    await ArticleService.transitionStatus(articleId, ArticleStatus.APPROVED);
  },

  /**
   * Reject article, moving from QUALITY_REVIEW → REJECTED.
   */
  async reject(articleId: string, reason: string): Promise<void> {
    await ArticleService.transitionStatus(articleId, ArticleStatus.REJECTED, reason);
  },

  /**
   * Archive article.
   */
  async archive(articleId: string): Promise<void> {
    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new NotFoundError('Article', articleId);
    // Archive is valid from multiple states
    await prisma.article.update({
      where: { id: articleId },
      data: { status: ArticleStatus.ARCHIVED },
    });
  },

  /**
   * Rollback to a previous version.
   */
  async rollback(articleId: string, versionNumber: number): Promise<void> {
    const version = await prisma.articleVersion.findFirst({
      where: { articleId, version: versionNumber },
    });
    if (!version) throw new NotFoundError('ArticleVersion', String(versionNumber));

    await prisma.article.update({
      where: { id: articleId },
      data: {
        title: version.title,
        content: version.content,
        status: ArticleStatus.GENERATED,
        updatedAt: new Date(),
      },
    });

    // Create a new version recording the rollback
    const count = await prisma.articleVersion.count({ where: { articleId } });
    await prisma.articleVersion.create({
      data: {
        articleId,
        version: count + 1,
        title: version.title,
        content: version.content,
        status: ArticleStatus.GENERATED,
        metadata: { rolledBackFrom: versionNumber },
      },
    });

    logger.info({ articleId, toVersion: versionNumber }, 'Article rolled back');
  },

  /**
   * Get valid next statuses for an article.
   */
  getValidTransitions(status: ArticleStatus): ArticleStatus[] {
    return VALID_TRANSITIONS[status] ?? [];
  },
};

export default ArticleService;
