import { createLogger } from '../logger/logger';

const logger = createLogger('retry');

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  factor?: number;
  retryIf?: (error: unknown) => boolean;
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  context?: string
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs = 30000, factor = 2, retryIf } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const shouldRetry = retryIf ? retryIf(err) : true;
      if (!shouldRetry || attempt === attempts) {
        throw err;
      }
      const delay = Math.min(baseDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      logger.warn(
        { context, attempt, attempts, delay, error: (err as Error).message },
        'Retrying after failure'
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
