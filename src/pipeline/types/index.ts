// Core pipeline types

export type UUID = string;
export type QueueName = string;

export interface ExtractedScholarship {
  title: string;
  organization?: string;
  description?: string;
  officialUrl: string;
  applicationUrl?: string;
  deadline?: string | Date;
  startDate?: string | Date;
  country?: string;
  eligibleCountries?: string[];
  degreeLevel?: string;
  fieldsOfStudy?: string[];
  fundingType?: string;
  fundingAmount?: number;
  currency?: string;
  benefits?: string[];
  eligibility?: string;
  requirements?: string[];
  documents?: string[];
  applicationInstructions?: string;
  raw?: Record<string, unknown>;
}

export type RawScholarshipData = ExtractedScholarship;
export type PageExtractionResult = ExtractedScholarship;

export interface NormalizedScholarship {
  title: string;
  organization: string;
  description: string;
  officialUrl: string;
  applicationUrl: string | null;
  deadline: Date | null;
  startDate: Date | null;
  country: string | null;
  eligibleCountries: string[];
  degreeLevel: string;
  fieldsOfStudy: string[];
  fundingType: string;
  fundingAmount: number | null;
  currency: string | null;
  benefits: string[];
  eligibility: string;
  requirements: string[];
  documents: string[];
  applicationInstructions: string;
  contentHash: string;
  sourceId: string;
  slug: string;
  raw?: Record<string, unknown>;
}

export type NormalizedScholarshipData = NormalizedScholarship;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DeduplicationResult {
  status: 'NEW' | 'UPDATED' | 'DUPLICATE' | 'REJECTED';
  scholarshipId?: string;
  similarity?: number;
  matchedFields?: string[];
  changedFields?: string[];
}

export type DuplicateCheckResult = DeduplicationResult;

export interface CrawlResult {
  sourceId: string;
  scholarships: ExtractedScholarship[];
  pagesVisited: number;
  errors: string[];
  duration: number;
}

export type CrawlerResult = CrawlResult;

export interface CrawlerOptions {
  timeout?: number;
  retries?: number;
  useBrowser?: boolean;
  [key: string]: unknown;
}

export interface ArticleContent {
  title: string;
  introduction: string;
  overview: string;
  provider: string;
  studyLevel: string;
  eligibleCountries: string;
  eligibleFields: string;
  funding: string;
  eligibility: string;
  requirements: string;
  documents: string;
  applicationProcess: string;
  deadline: string;
  officialLink: string;
  faqs: Array<{ question: string; answer: string }>;
  callToAction: string;
  fullContent: string;
}

export interface SEOData {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  keywords: string[];
  canonicalUrl: string | null;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  twitterTitle: string;
  twitterDescription: string;
  jsonLd: Record<string, unknown>;
  faqSchema: Record<string, unknown> | null;
  breadcrumbSchema: Record<string, unknown>;
}

export interface QualityCheckResult {
  score: number;
  status: 'PASS' | 'REVIEW' | 'REJECT';
  checks: Record<string, { passed: boolean; message: string }>;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  factualMismatches: Array<{
    field: string;
    expected: string;
    found: string;
  }>;
}

export interface PublishResult {
  provider: string;
  externalId?: string;
  externalUrl?: string;
  status: 'PUBLISHED' | 'DRAFT' | 'SCHEDULED' | 'FAILED';
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface NotificationPayload {
  event: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface JobData {
  sourceId?: string;
  scholarshipId?: string;
  articleId?: string;
  notificationId?: string;
  [key: string]: unknown;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export type PaginationParams = PaginationOptions;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

