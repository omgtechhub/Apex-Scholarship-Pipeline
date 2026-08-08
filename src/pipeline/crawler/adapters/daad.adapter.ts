import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';
import { parseDate } from '../../utils/date.util';

const BASE_URL = 'https://www.daad.de';
const LISTING_URL = 'https://www.daad.de/en/find-a-programme/scholarship-database/';

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
      // DAAD has a complex JS-rendered interface; use their public API endpoint
      // fallback to static page parsing
      const html = await this.fetchHtml(LISTING_URL).catch(() => null);

      if (html) {
        const $ = this.load(html);

        // Extract from the scholarship database listing
        $('[data-scholarship], .scholarship-item, .c-teaser--scholarship, article.c-teaser').each(
          (_i, el) => {
            try {
              const $el = $(el);

              const titleEl = $el.find('h2, h3, .c-teaser__headline, [class*="title"]').first();
              const title = titleEl.text().trim();
              if (!title) return;

              const linkEl = $el.find('a[href]').first();
              const relativeUrl = linkEl.attr('href') ?? '';
              const officialUrl = this.resolveUrl(relativeUrl) ?? LISTING_URL;

              const deadlineEl = $el.find('[class*="deadline"], [class*="date"], time').first();
              const deadlineText = deadlineEl.text().trim() || deadlineEl.attr('datetime');
              const deadline = parseDate(deadlineText);

              const descEl = $el.find('p, .c-teaser__text, [class*="description"]').first();
              const description = descEl.text().trim();

              const fundingEl = $el.find('[class*="funding"], [class*="amount"]').first();
              const fundingText = fundingEl.text().trim();

              scholarships.push({
                title,
                organization: 'DAAD - German Academic Exchange Service',
                description,
                officialUrl,
                deadline: deadline ?? undefined,
                country: 'Germany',
                fundingType: this.detectFundingType(fundingText + ' ' + description),
                eligibleCountries: [],
                degreeLevel: this.detectDegreeLevel(title + ' ' + description),
                raw: { source: 'daad', fundingText },
              });
            } catch (err) {
              this.recordError((err as Error).message);
            }
          }
        );
      }

      // If no scholarships found from HTML, try the search API
      if (scholarships.length === 0) {
        const apiScholarships = await this.fetchFromApi();
        scholarships.push(...apiScholarships);
      }
    } catch (err) {
      this.recordError((err as Error).message, LISTING_URL);
    }

    this.logger.info({ count: scholarships.length }, 'DAAD adapter extracted scholarships');
    return scholarships;
  }

  private async fetchFromApi(): Promise<ExtractedScholarship[]> {
    const scholarships: ExtractedScholarship[] = [];

    try {
      // DAAD public search endpoint
      const searchUrl =
        'https://www.daad.de/en/find-a-programme/scholarship-database/?origin=25&subjectGrp=&subject=&grad=&stipe=&ins=&sort=4&q=&page=1';

      const html = await this.fetchHtml(searchUrl);
      const $ = this.load(html);

      $('article, .scholarship-result, [data-id]').each((_i, el) => {
        try {
          const $el = $(el);
          const title = $el.find('h2, h3, .title').first().text().trim();
          if (!title || title.length < 5) return;

          const linkHref = $el.find('a[href*="daad.de"]').first().attr('href') ?? '';
          const officialUrl = this.resolveUrl(linkHref) ?? LISTING_URL;

          const description = $el.find('p').first().text().trim();
          const deadlineText = $el.find('[class*="deadline"], time').first().text().trim();

          scholarships.push({
            title,
            organization: 'DAAD - German Academic Exchange Service',
            description,
            officialUrl,
            deadline: parseDate(deadlineText) ?? undefined,
            country: 'Germany',
            eligibleCountries: [],
            degreeLevel: this.detectDegreeLevel(title + ' ' + description),
            fundingType: 'FULL',
            raw: { source: 'daad-api' },
          });
        } catch {
          // Skip malformed entries
        }
      });
    } catch (err) {
      this.recordError((err as Error).message, 'daad-api');
    }

    return scholarships;
  }

  private detectFundingType(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('fully funded') || lower.includes('full scholarship')) return 'FULL';
    if (lower.includes('partial')) return 'PARTIAL';
    if (lower.includes('tuition')) return 'TUITION_ONLY';
    return 'FULL'; // DAAD scholarships are generally fully funded
  }

  private detectDegreeLevel(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('phd') || lower.includes('doctoral')) return 'PHD';
    if (lower.includes('master') || lower.includes('postgraduate')) return 'MASTERS';
    if (lower.includes('undergraduate') || lower.includes('bachelor')) return 'UNDERGRADUATE';
    if (lower.includes('postdoc')) return 'POSTDOCTORAL';
    if (lower.includes('short course') || lower.includes('summer')) return 'SHORT_COURSE';
    return 'ANY';
  }
}
