import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().default('change-me-in-production-min-32-chars!!'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  PIPELINE_JWT_SECRET: z.string().default('change-me-in-production-min-32-chars!!'),
  PIPELINE_JWT_EXPIRES_IN: z.string().default('24h'),
  PIPELINE_REFRESH_TOKEN_SECRET: z.string().default('change-me-refresh-secret-min-32-chars!!'),
  PIPELINE_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  PIPELINE_ENV: z.enum(['development','staging','production','test']).default('development'),
  PIPELINE_PORT: z.coerce.number().default(3001),
  PIPELINE_LOG_LEVEL: z.string().default('info'),

  // Groq AI
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

  // Scheduler
  CRAWL_CRON: z.string().default('*/30 * * * *'),
  CLEANUP_CRON: z.string().default('0 2 * * *'),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // API
  PORT: z.coerce.number().default(3001),
  API_SECRET: z.string().optional(),

  // Publishing
  PUBLISHING_WEBHOOK_URL: z.string().optional(),
  PUBLISHING_WEBHOOK_SECRET: z.string().optional(),

  // Notification channels
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  NOTIFICATION_WEBHOOK_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  NOTIFICATION_EMAIL_FROM: z.string().optional(),
  NOTIFICATION_EMAIL_TO: z.string().optional(),

  // Channel ingestion
  CHANNEL_WEBHOOK_SECRET: z.string().default('channel-webhook-secret'),

  // Rate limiting
  CRAWLER_RATE_LIMIT_MS: z.coerce.number().default(2000),

  // Browser pool
  BROWSER_POOL_SIZE: z.coerce.number().default(2),

  // Quality thresholds
  QUALITY_PASS_THRESHOLD: z.coerce.number().default(0.7),
  QUALITY_REVIEW_THRESHOLD: z.coerce.number().default(0.5),

  // Cleanup
  LOG_RETENTION_DAYS: z.coerce.number().default(30),
  EXPIRED_SCHOLARSHIP_GRACE_DAYS: z.coerce.number().default(30),

  // Compatibility configuration retained from the earlier foundation
  PIPELINE_API_KEY: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  CRAWLER_CONCURRENCY: z.coerce.number().default(3),
  CRAWLER_DEFAULT_TIMEOUT_MS: z.coerce.number().default(30000),
  CRAWLER_DEFAULT_DELAY_MS: z.coerce.number().default(2000),
  CRAWLER_MAX_RETRIES: z.coerce.number().default(3),
  CRAWLER_HEADLESS: z.string().optional().transform(v => v === undefined ? true : v === 'true'),
  QUEUE_CRAWLER_CONCURRENCY: z.coerce.number().default(2),
  QUEUE_PROCESSING_CONCURRENCY: z.coerce.number().default(5),
  QUEUE_VALIDATION_CONCURRENCY: z.coerce.number().default(5),
  QUEUE_PUBLISH_CONCURRENCY: z.coerce.number().default(2),
  QUEUE_NOTIFICATION_CONCURRENCY: z.coerce.number().default(3),
  FEATURE_DUPLICATE_DETECTION: z.string().optional().transform(v => v === undefined ? true : v === 'true'),
  FEATURE_URL_VALIDATION: z.string().optional().transform(v => v === undefined ? true : v === 'true'),
  FEATURE_AUTO_PUBLISH: z.string().optional().transform(v => v === 'true'),
  FEATURE_NOTIFICATIONS: z.string().optional().transform(v => v === 'true'),
  FEATURE_AI_WRITER: z.string().optional().transform(v => v === 'true'),
  FEATURE_SEO_GENERATOR: z.string().optional().transform(v => v === 'true'),
  FEATURE_ANALYTICS: z.string().optional().transform(v => v === 'true'),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([k, v]) => `  ${k}: ${v?.join(', ')}`)
      .join('\n');
    // Only throw on truly missing required fields
    const missingRequired = result.error.issues.filter(
      (i) => i.message === 'Required' && !i.path[0]?.toString().includes('optional')
    );
    if (missingRequired.length > 0) {
      throw new Error(`Environment validation failed:\n${messages}`);
    }
  }

  const parsed = result.data ?? (process.env as unknown as z.infer<typeof envSchema>);

  // Production security guard: reject default placeholder PIPELINE_JWT_SECRET in production
  if (
    (process.env.NODE_ENV === 'production' || parsed.PIPELINE_ENV === 'production') &&
    (parsed.PIPELINE_JWT_SECRET?.includes('change-me') || parsed.JWT_SECRET?.includes('change-me'))
  ) {
    throw new Error('FATAL PRODUCTION SECURITY ERROR: PIPELINE_JWT_SECRET must be updated from default placeholder in production!');
  }

  return parsed;
}

export function getEnv() { return validateEnv(); }

export const env = validateEnv();
export type Env = typeof env;
