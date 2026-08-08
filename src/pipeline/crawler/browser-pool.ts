import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createLogger } from '../logger/logger';

const logger = createLogger('browser-pool');

interface PoolEntry {
  browser: Browser;
  inUse: boolean;
}

export class BrowserPool {
  private pool: PoolEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 2) {
    this.maxSize = maxSize;
  }

  async acquire(): Promise<Browser> {
    // Find idle browser
    const idle = this.pool.find((e) => !e.inUse);
    if (idle) {
      idle.inUse = true;
      return idle.browser;
    }

    // Spawn new if under limit
    if (this.pool.length < this.maxSize) {
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      const entry: PoolEntry = { browser, inUse: true };
      this.pool.push(entry);
      logger.debug({ poolSize: this.pool.length }, 'Browser spawned');
      return browser;
    }

    // Wait for a browser to become available
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const idle = this.pool.find((e) => !e.inUse);
        if (idle) {
          clearInterval(interval);
          idle.inUse = true;
          resolve(idle.browser);
        }
      }, 500);
    });
  }

  release(browser: Browser): void {
    const entry = this.pool.find((e) => e.browser === browser);
    if (entry) {
      entry.inUse = false;
    }
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled(this.pool.map((e) => e.browser.close()));
    this.pool = [];
    logger.info('All browsers closed');
  }

  async withPage<T>(
    fn: (page: Page, context: BrowserContext) => Promise<T>
  ): Promise<T> {
    const browser = await this.acquire();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    // Block unnecessary resources
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,ico,mp4,webm}', (route) =>
      route.abort()
    );

    try {
      const result = await fn(page, context);
      return result;
    } finally {
      await context.close().catch(() => {});
      this.release(browser);
    }
  }
}

export const browserPool = new BrowserPool(
  Number(process.env.BROWSER_POOL_SIZE ?? 2)
);
export default browserPool;
