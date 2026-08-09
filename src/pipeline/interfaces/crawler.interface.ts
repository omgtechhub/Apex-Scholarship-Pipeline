/**
 * Crawler Interfaces
 *
 * Contracts for crawlers, adapters, and browser management.
 */

import type { Page, Browser, BrowserContext } from 'playwright';
import type {
  RawScholarshipData,
  CrawlerResult,
  CrawlerOptions,
  PageExtractionResult,
  UUID,
} from '../types';

// ---------------------------------------------------------------------------
// BASE CRAWLER CONTRACT
// ---------------------------------------------------------------------------

export interface ICrawler {
  readonly adapterClass: string;
  readonly sourceId: UUID;

  initialize(): Promise<void>;
  crawl(options: CrawlerOptions): Promise<CrawlerResult>;
  extractFromPage(page: Page, url: string): Promise<RawScholarshipData>;
  getScholarshipLinks(page: Page): Promise<string[]>;
  cleanup(): Promise<void>;
}

// ---------------------------------------------------------------------------
// BROWSER POOL CONTRACT
// ---------------------------------------------------------------------------

export interface IBrowserPool {
  acquire(): Promise<BrowserContext>;
  release(context: BrowserContext): Promise<void>;
  close(): Promise<void>;
  getStats(): BrowserPoolStats;
}

export interface BrowserPoolStats {
  totalBrowsers: number;
  activeBrowsers: number;
  idleBrowsers: number;
  totalContexts: number;
  activeContexts: number;
}

// ---------------------------------------------------------------------------
// PROXY MANAGER CONTRACT
// ---------------------------------------------------------------------------

export interface IProxyManager {
  getProxy(): ProxyConfig | null;
  rotateProxy(): void;
  markProxyFailed(proxy: ProxyConfig): void;
  getHealthyProxies(): ProxyConfig[];
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
  protocol: 'http' | 'https' | 'socks5';
}

// ---------------------------------------------------------------------------
// USER AGENT MANAGER CONTRACT
// ---------------------------------------------------------------------------

export interface IUserAgentManager {
  getNext(): string;
  getRandom(): string;
  getAll(): string[];
}

// ---------------------------------------------------------------------------
// RATE LIMITER CONTRACT
// ---------------------------------------------------------------------------

export interface IRateLimiter {
  waitForSlot(domain: string): Promise<void>;
  setDomainDelay(domain: string, delayMs: number): void;
  getDomainDelay(domain: string): number;
  reset(domain: string): void;
}

// ---------------------------------------------------------------------------
// CRAWLER MANAGER CONTRACT
// ---------------------------------------------------------------------------

export interface ICrawlerManager {
  registerAdapter(
    adapterClass: string,
    factory: () => ICrawler,
  ): void;
  getAdapter(adapterClass: string): ICrawler | null;
  runCrawler(options: CrawlerOptions): Promise<CrawlerResult>;
  stopCrawler(crawlerJobId: UUID): Promise<void>;
  getRunningJobs(): UUID[];
}

// ---------------------------------------------------------------------------
// EXTRACTION RESULT
// ---------------------------------------------------------------------------

export interface ExtractionContext {
  page: Page;
  browser: Browser;
  url: string;
  sourceId: UUID;
  crawlerJobId: UUID;
  retryCount: number;
  startTime: number;
}

export interface BatchExtractionResult {
  results: PageExtractionResult[];
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  durationMs: number;
}
