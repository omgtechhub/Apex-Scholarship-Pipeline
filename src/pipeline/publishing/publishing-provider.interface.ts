import type { PublishResult } from '../types';

export interface PublishArticleInput {
  articleId: string;
  title: string;
  content: string;
  slug: string;
  scholarship: {
    title: string;
    officialUrl: string;
    deadline: Date | null;
    country: string | null;
  };
  seo?: {
    seoTitle: string;
    metaDescription: string;
    keywords: string[];
    jsonLd: Record<string, unknown>;
  } | null;
  scheduledAt?: Date | null;
}

export interface PublishingProvider {
  readonly name: string;
  publish(input: PublishArticleInput): Promise<PublishResult>;
  unpublish(externalId: string): Promise<void>;
  update(externalId: string, input: PublishArticleInput): Promise<PublishResult>;
  isAvailable(): boolean;
}
