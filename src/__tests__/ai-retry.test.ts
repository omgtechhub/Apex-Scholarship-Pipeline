import { describe, it, expect } from 'vitest';
import { rateLimitBackoffStrategy, AI_JOB_OPTIONS, DEFAULT_JOB_OPTIONS } from '../pipeline/queue/queue-manager';

describe('AI Worker 429 Rate Limit Delayed Retry', () => {
  it('should return 15-minute delay (900000ms) for HTTP 429 rate limit errors', () => {
    const groq429Error = new Error(
      '429 {"error":{"message":"Rate limit reached for model llama-3.3-70b-versatile on tokens per day (TPD): Limit 100000","type":"tokens","code":"rate_limit_exceeded"}}'
    );
    const delay = rateLimitBackoffStrategy(1, 'rateLimitBackoff', groq429Error);
    expect(delay).toBe(15 * 60 * 1000); // Exactly 900,000 ms (15 minutes)
  });

  it('should return 15-minute delay for rate_limit_exceeded string error', () => {
    const error = new Error('rate_limit_exceeded');
    const delay = rateLimitBackoffStrategy(2, 'rateLimitBackoff', error);
    expect(delay).toBe(15 * 60 * 1000);
  });

  it('should return standard exponential backoff for non-429 errors', () => {
    const networkError = new Error('Network timeout connecting to server');
    const delayAttempt1 = rateLimitBackoffStrategy(1, 'rateLimitBackoff', networkError);
    const delayAttempt2 = rateLimitBackoffStrategy(2, 'rateLimitBackoff', networkError);

    expect(delayAttempt1).toBe(5000); // 5 seconds
    expect(delayAttempt2).toBe(10000); // 10 seconds
  });

  it('should configure AI_JOB_OPTIONS with 10 attempts and rateLimitBackoff strategy', () => {
    expect(AI_JOB_OPTIONS.attempts).toBe(10);
    expect(AI_JOB_OPTIONS.backoff).toEqual({ type: 'rateLimitBackoff' });
  });

  it('should keep DEFAULT_JOB_OPTIONS unchanged for non-AI jobs', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });
});
