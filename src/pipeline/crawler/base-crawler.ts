import axios, { AxiosInstance } from 'axios';
import { load as cheerioLoad } from 'cheerio';
import { createLogger } from '../logger/logger';
import { rateLimiter } from './rate-limiter';
import { robotsService } from './robots.service';
import { userAgentManager } from './user-agent-manager';
import { browserPool } from './browser-pool';
import { withRetry } from '../utils/retry.util';
import { normalizeUrl, assertSafeUrl } from '../utils/url.util';
import type { ExtractedScholarship, CrawlResult } from '../types';

export interface CrawlerConfig {
  sourceId: string;
  baseUrl: string;
  timeout?: number;
  maxPages?: number;
  usePlaywright?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioRoot = ReturnType<typeof cheerioLoad>;

export abstract class BaseCrawler {
  protected readonly logger;
  protected readonly http: AxiosInstance;
  protected pagesVisited = 0;
  protected errors: string[] = [];

  constructor(protected readonly config: CrawlerConfig) {
    this.logger = createLogger(`crawler:${this.constructor.name}`);
    this.http = axios.create({
      timeout: config.timeout ?? 30000,
      headers: { 'User-Agent': userAgentManager.getRandom() },
      maxRedirects: 5,
    });
  }

  abstract extract(): Promise<ExtractedScholarship[]>;

  async run(): Promise<CrawlResult> {
    const start = Date.now();
    this.pagesVisited = 0;
    this.errors = [];

    this.logger.info({ source: this.config.sourceId }, 'Starting crawl');

    let scholarships: ExtractedScholarship[] = [];

    try {
      scholarships = await this.extract();
    } catch (err) {
      const msg = (err as Error).message;
      this.errors.push(msg);
      this.logger.error({ err }, 'Crawl failed');
    }

    const duration = Date.now() - start;
    this.logger.info(
      { source: this.config.sourceId, count: scholarships.length, duration },
      'Crawl complete'
    );

    return {
      sourceId: this.config.sourceId,
      scholarships,
      pagesVisited: this.pagesVisited,
      errors: this.errors,
      duration,
    };
  }

  protected async fetchHtml(url: string): Promise<string> {
    const normalized = normalizeUrl(url);
    if (!normalized) throw new Error(`Invalid URL: ${url}`);
    assertSafeUrl(normalized);

    const domain = new URL(normalized).hostname;
    await rateLimiter.throttle(domain);

    const allowed = await robotsService.isAllowed(normalized, 'ScholarshipBot');
    if (!allowed) throw new Error(`Robots.txt disallows: ${normalized}`);

    this.http.defaults.headers['User-Agent'] = userAgentManager.getNext();

    const response = await withRetry(
      () => this.http.get<string>(normalized),
      { attempts: 3, baseDelayMs: 2000 },
      `fetchHtml:${normalized}`
    );

    this.pagesVisited++;
    return response.data as string;
  }

  protected async fetchWithPlaywright(url: string): Promise<string> {
    const normalized = normalizeUrl(url);
    if (!normalized) throw new Error(`Invalid URL: ${url}`);
    assertSafeUrl(normalized);

    const domain = new URL(normalized).hostname;
    await rateLimiter.throttle(domain);

    const allowed = await robotsService.isAllowed(normalized, 'ScholarshipBot');
    if (!allowed) throw new Error(`Robots.txt disallows: ${normalized}`);

    const html = await browserPool.withPage(async (page) => {
      await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);
      return page.content();
    });

    this.pagesVisited++;
    return html;
  }

  protected load(html: string): CheerioRoot {
    return cheerioLoad(html);
  }

  protected resolveUrl(url: string, base?: string): string | null {
    return normalizeUrl(url, base ?? this.config.baseUrl);
  }

  protected recordError(message: string, url?: string): void {
    const err = url ? `[${url}] ${message}` : message;
    this.errors.push(err);
    this.logger.warn({ url }, message);
  }
}
