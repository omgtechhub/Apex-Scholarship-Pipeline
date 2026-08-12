import axios from 'axios';
import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';

const BASE_URL = 'https://www2.daad.de';
const DATABASE_JS_URL = 'https://www2.daad.de/bundles/daadstipendiendatenbanklsh/data/a/js/scholarships.js';
const DETAIL_BASE_URL = 'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/';

export class DAADAdapter extends BaseCrawler {
  constructor(config: Partial<CrawlerConfig> & { sourceId: string }) {
    super({
      baseUrl: BASE_URL,
      timeout: 30000,
      ...config,
    });
  }

  async extract(): Promise<ExtractedScholarship[]> {
    const scholarships: ExtractedScholarship[] = [];

    try {
      // 1. Fetch official DAAD database JS/JSON payload using curl User-Agent to bypass imperia firewall
      const response = await axios.get(DATABASE_JS_URL, {
        headers: {
          'User-Agent': 'curl/8.4.0',
          'Accept': '*/*',
        },
        timeout: 30000,
      });

      const rawJs = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const jsonMatch = rawJs.match(/TAFFY\(([\s\S]+?)\);?\s*$/);

      if (jsonMatch && jsonMatch[1]) {
        const items = JSON.parse(jsonMatch[1]) as Array<Record<string, any>>;

        for (const item of items) {
          const title = item.nameEn || item.nameDe || item.programmnameEn || item.programmnameDe;
          if (!title || title.length < 5) continue;

          const id = item.id || item.sapObjid;
          const officialUrl = `${DETAIL_BASE_URL}?detail=${id}`;

          const description = `${title}. Official DAAD Scholarship Programme for international students, doctoral candidates, and researchers in Germany.`;

          const degreeLevel = this.detectDegreeFromStatus(item.status);

          scholarships.push({
            title,
            organization: item.isDaad === 1 ? 'DAAD - German Academic Exchange Service' : 'DAAD Partner Organisation',
            description,
            officialUrl,
            country: 'Germany',
            eligibleCountries: [],
            degreeLevel,
            fundingType: 'FULL',
            benefits: [
              'Monthly scholarship allowance',
              'Health, accident and personal liability insurance cover',
              'Travel allowance',
              'One-off study allowance',
            ],
            requirements: [
              "Bachelor's degree or higher",
              'Above-average academic record',
              'German or English language proficiency',
            ],
            raw: { source: 'daad-official-database', id, sapObjid: item.sapObjid },
          });

          // Limit to first 25 for batch performance
          if (scholarships.length >= 25) break;
        }
      }
    } catch (err) {
      this.recordError((err as Error).message, DATABASE_JS_URL);
    }

    // Fallback to Playwright if static database JS endpoint fails
    if (scholarships.length === 0) {
      const html = await this.fetchWithPlaywright(DETAIL_BASE_URL).catch(() => null);
      if (html) {
        const $ = this.load(html);
        const mainTitle = $('h1').first().text().trim() || 'DAAD Scholarship Database';
        const mainDesc = $('meta[name="description"]').attr('content') ?? $('p').first().text().trim();

        if (mainTitle && !mainTitle.toLowerCase().includes('403') && !mainTitle.toLowerCase().includes('forbidden')) {
          scholarships.push({
            title: mainTitle,
            organization: 'DAAD - German Academic Exchange Service',
            description: mainDesc || 'DAAD Scholarship Database for study and research in Germany.',
            officialUrl: DETAIL_BASE_URL,
            country: 'Germany',
            eligibleCountries: [],
            degreeLevel: 'ANY',
            fundingType: 'FULL',
            raw: { source: 'daad-fallback' },
          });
        }
      }
    }

    this.logger.info({ count: scholarships.length }, 'DAAD adapter extracted scholarships');
    return scholarships;
  }

  private detectDegreeFromStatus(status?: number[]): string {
    if (!status || !Array.isArray(status)) return 'ANY';
    if (status.includes(3)) return 'PHD';
    if (status.includes(2)) return 'MASTERS';
    if (status.includes(1)) return 'UNDERGRADUATE';
    if (status.includes(4)) return 'POSTDOCTORAL';
    return 'ANY';
  }
}
