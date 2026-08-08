import { createLogger } from '../logger/logger';

const logger = createLogger('rate-limiter');

export class RateLimiter {
  private lastRequestTime: Map<string, number> = new Map();
  private minDelayMs: number;

  constructor(minDelayMs: number = 2000) {
    this.minDelayMs = minDelayMs;
  }

  async throttle(domain: string): Promise<void> {
    const now = Date.now();
    const last = this.lastRequestTime.get(domain) ?? 0;
    const elapsed = now - last;
    if (elapsed < this.minDelayMs) {
      const wait = this.minDelayMs - elapsed;
      logger.debug({ domain, wait }, 'Rate limiting');
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestTime.set(domain, Date.now());
  }

  setDelay(ms: number): void {
    this.minDelayMs = ms;
  }
}

export const rateLimiter = new RateLimiter(
  Number(process.env.CRAWLER_RATE_LIMIT_MS ?? 2000)
);
export default rateLimiter;
