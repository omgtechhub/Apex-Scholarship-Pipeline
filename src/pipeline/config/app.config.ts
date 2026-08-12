/**
 * Application Configuration Service
 *
 * Provides typed configuration objects derived from environment variables.
 * Single source of truth for all runtime configuration.
 */

import { getEnv } from './env';

export interface DatabaseConfig {
  url: string;
  poolMin: number;
  poolMax: number;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
  algorithm: 'HS256' | 'HS384' | 'HS512';
  issuer: string;
  audience: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
  connectTimeout: number;
  keyPrefix: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface CrawlerConfig {
  concurrency: number;
  defaultTimeoutMs: number;
  defaultDelayMs: number;
  maxRetries: number;
  headless: boolean;
  userAgentRotation: boolean;
  proxyEnabled: boolean;
  screenshotOnError: boolean;
  viewport: {
    width: number;
    height: number;
  };
}

export interface QueueConfig {
  crawlerConcurrency: number;
  processingConcurrency: number;
  validationConcurrency: number;
  publishConcurrency: number;
  notificationConcurrency: number;
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete: {
      count: number;
      age: number;
    };
    removeOnFail: {
      count: number;
    };
  };
}

export interface SchedulerConfig {
  enabled: boolean;
  timezone: string;
  defaultCrawlCron: string;
}

export interface SecurityConfig {
  bcryptRounds: number;
  apiKey: string;
  maxLoginAttempts: number;
  lockoutDurationMs: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSpecialChars: boolean;
}

export interface AppConfig {
  env: 'development' | 'staging' | 'production' | 'test';
  port: number;
  logLevel: string;
  database: DatabaseConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
  rateLimit: RateLimitConfig;
  crawler: CrawlerConfig;
  queue: QueueConfig;
  scheduler: SchedulerConfig;
  security: SecurityConfig;
}

let _config: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (_config) return _config;

  const e = getEnv();

  const config: AppConfig = {

    env: e.PIPELINE_ENV,
    port: e.PIPELINE_PORT,
    logLevel: e.PIPELINE_LOG_LEVEL,

    database: {
      url: e.DATABASE_URL,
      poolMin: 2,
      poolMax: 10,
      connectionTimeoutMs: 10000,
      queryTimeoutMs: 30000,
    },

    jwt: {
      secret: e.PIPELINE_JWT_SECRET,
      expiresIn: e.PIPELINE_JWT_EXPIRES_IN,
      refreshSecret: e.PIPELINE_REFRESH_TOKEN_SECRET,
      refreshExpiresIn: e.PIPELINE_REFRESH_TOKEN_EXPIRES_IN,
      algorithm: 'HS256',
      issuer: 'scholarship-pipeline',
      audience: 'scholarship-pipeline-api',
    },

    redis: {
      host: e.REDIS_HOST,
      port: e.REDIS_PORT,
      password: e.REDIS_PASSWORD,
      db: e.REDIS_DB,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10000,
      keyPrefix: 'pipeline:',
    },

    rateLimit: {
      windowMs: e.RATE_LIMIT_WINDOW_MS,
      maxRequests: e.RATE_LIMIT_MAX_REQUESTS,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    },

    crawler: {
      concurrency: e.CRAWLER_CONCURRENCY,
      defaultTimeoutMs: e.CRAWLER_DEFAULT_TIMEOUT_MS,
      defaultDelayMs: e.CRAWLER_DEFAULT_DELAY_MS,
      maxRetries: e.CRAWLER_MAX_RETRIES,
      headless: e.CRAWLER_HEADLESS,
      userAgentRotation: true,
      proxyEnabled: false,
      screenshotOnError: e.PIPELINE_ENV !== 'production',
      viewport: {
        width: 1280,
        height: 900,
      },
    },

    queue: {
      crawlerConcurrency: e.QUEUE_CRAWLER_CONCURRENCY,
      processingConcurrency: e.QUEUE_PROCESSING_CONCURRENCY,
      validationConcurrency: e.QUEUE_VALIDATION_CONCURRENCY,
      publishConcurrency: e.QUEUE_PUBLISH_CONCURRENCY,
      notificationConcurrency: e.QUEUE_NOTIFICATION_CONCURRENCY,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 1000,
          age: 86400, // 24 hours in seconds
        },
        removeOnFail: {
          count: 500,
        },
      },
    },

    scheduler: {
      enabled: e.PIPELINE_ENV !== 'test',
      timezone: 'UTC',
      defaultCrawlCron: '0 */6 * * *', // Every 6 hours
    },

    security: {
      bcryptRounds: 12,
      apiKey: e.PIPELINE_API_KEY ?? '',
      maxLoginAttempts: 5,
      lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecialChars: false,
    },
  };

  _config = config;
  return config;
}


// Export singleton
export const appConfig = new Proxy({} as AppConfig, {
  get(_target, key: string) {
    return getAppConfig()[key as keyof AppConfig];
  },
});
