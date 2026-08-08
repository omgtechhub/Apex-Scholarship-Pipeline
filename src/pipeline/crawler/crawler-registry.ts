import type { BaseCrawler, CrawlerConfig } from './base-crawler';
import { DAADAdapter } from './adapters/daad.adapter';
import { CheveningAdapter } from './adapters/chevening.adapter';
import { CommonwealthAdapter } from './adapters/commonwealth.adapter';
import { ErasmusAdapter } from './adapters/erasmus.adapter';
import { OpportunitiesForAfricansAdapter } from './adapters/opportunities-for-africans.adapter';

type CrawlerConstructor = new (config: Partial<CrawlerConfig> & { sourceId: string }) => BaseCrawler;

const registry = new Map<string, CrawlerConstructor>([
  ['daad', DAADAdapter],
  ['chevening', CheveningAdapter],
  ['commonwealth', CommonwealthAdapter],
  ['erasmus', ErasmusAdapter],
  ['opportunities-for-africans', OpportunitiesForAfricansAdapter],
]);

export const CrawlerRegistry = {
  get(adapterKey: string): CrawlerConstructor | undefined {
    return registry.get(adapterKey);
  },

  create(
    adapterKey: string,
    config: Partial<CrawlerConfig> & { sourceId: string }
  ): BaseCrawler {
    const Crawler = registry.get(adapterKey);
    if (!Crawler) {
      throw new Error(`Unknown crawler adapter: ${adapterKey}`);
    }
    return new Crawler(config);
  },

  list(): string[] {
    return [...registry.keys()];
  },

  register(key: string, Crawler: CrawlerConstructor): void {
    registry.set(key, Crawler);
  },
};

export default CrawlerRegistry;
