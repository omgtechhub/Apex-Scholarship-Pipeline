export const QUEUES = {
  CRAWLER: 'crawler',
  PROCESSING: 'processing',
  VALIDATION: 'validation',
  AI: 'ai',
  SEO: 'seo',
  QUALITY: 'quality',
  PUBLISHING: 'publishing',
  NOTIFICATION: 'notification',
  CLEANUP: 'cleanup',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOB_NAMES = {
  CRAWL_SOURCE: 'crawl-source',
  PROCESS_SCHOLARSHIP: 'process-scholarship',
  VALIDATE_SCHOLARSHIP: 'validate-scholarship',
  GENERATE_ARTICLE: 'generate-article',
  GENERATE_SEO: 'generate-seo',
  QUALITY_CHECK: 'quality-check',
  PUBLISH_ARTICLE: 'publish-article',
  SEND_NOTIFICATION: 'send-notification',
  CLEANUP_EXPIRED: 'cleanup-expired',
  CLEANUP_LOGS: 'cleanup-logs',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
