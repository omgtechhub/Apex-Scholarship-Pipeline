import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';
import { parseDate } from '../../utils/date.util';

const BASE_URL = 'https://erasmus-plus.ec.europa.eu';

export class ErasmusAdapter extends BaseCrawler {
  constructor(config: Partial<CrawlerConfig> & { sourceId: string }) {
    super({
      baseUrl: BASE_URL,
      timeout: 30000,
      ...config,
    });
  }

  async extract(): Promise<ExtractedScholarship[]> {
    const scholarships: ExtractedScholarship[] = [];

    const pages = [
      `${BASE_URL}/opportunities/individuals/students/erasmus-mundus-joint-masters`,
      `${BASE_URL}/opportunities/individuals/students`,
      `${BASE_URL}/opportunities`,
    ];

    for (const pageUrl of pages) {
      try {
        const html = await this.fetchHtml(pageUrl);
        const $ = this.load(html);

        // Extract from cards/list items
        $('article, .card, .opportunity-item, .listing-item, [class*="opportunity"]').each(
          (_i, el) => {
            try {
              const $el = $(el);
              const title = $el.find('h2, h3, h4, .title, [class*="title"]').first().text().trim();
              if (!title || title.length < 5) return;

              const linkHref = $el.find('a[href]').first().attr('href') ?? '';
              const officialUrl = this.resolveUrl(linkHref) ?? pageUrl;

              const description = $el.find('p, .description, [class*="desc"]').first().text().trim();
              const deadlineText = $el.find('[class*="deadline"], time, .date').first().text().trim();
              const deadline = parseDate(deadlineText);

              scholarships.push({
                title,
                organization: 'European Commission (Erasmus+)',
                description,
                officialUrl,
                deadline: deadline ?? undefined,
                country: 'European Union',
                eligibleCountries: [],
                degreeLevel: this.detectDegree(title + ' ' + description),
                fundingType: this.detectFunding(description),
                raw: { source: 'erasmus', pageUrl },
              });
            } catch {
              // Skip bad entries
            }
          }
        );

        // Extract main page scholarship if list is empty
        if (scholarships.length === 0) {
          const mainTitle = $('h1').first().text().trim();
          const mainDesc = $('meta[name="description"]').attr('content') ??
            $('.content p').first().text().trim();
          const deadlineText = $('[class*="deadline"], time').first().text().trim();

          if (mainTitle) {
            scholarships.push({
              title: mainTitle,
              organization: 'European Commission (Erasmus+)',
              description: mainDesc,
              officialUrl: pageUrl,
              deadline: parseDate(deadlineText) ?? undefined,
              country: 'European Union',
              eligibleCountries: this.getEUCountries(),
              degreeLevel: 'MASTERS',
              fundingType: 'FULL',
              benefits: [
                'Monthly living allowance',
                'Travel costs',
                'Tuition fees',
                'Language courses',
              ],
              raw: { source: 'erasmus-main' },
            });
          }
        }

        break; // Only process first successful page
      } catch (err) {
        this.recordError((err as Error).message, pageUrl);
      }
    }

    this.logger.info({ count: scholarships.length }, 'Erasmus adapter extracted');
    return scholarships;
  }


  private detectDegree(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('master') || lower.includes('mundus')) return 'MASTERS';
    if (lower.includes('phd') || lower.includes('doctoral')) return 'PHD';
    if (lower.includes('bachelor') || lower.includes('undergraduate')) return 'UNDERGRADUATE';
    if (lower.includes('staff') || lower.includes('training')) return 'SHORT_COURSE';
    return 'ANY';
  }

  private detectFunding(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('full') || lower.includes('complete')) return 'FULL';
    if (lower.includes('partial')) return 'PARTIAL';
    return 'FULL';
  }

  private getEUCountries(): string[] {
    return [
      'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic',
      'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
      'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta',
      'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia',
      'Spain', 'Sweden',
    ];
  }

  private getKnownPrograms(): ExtractedScholarship[] {
    return [
      {
        title: 'Erasmus Mundus Joint Masters',
        organization: 'European Commission (Erasmus+)',
        description:
          'Erasmus Mundus Joint Masters (EMJM) are prestigious, integrated, international study programmes delivered by an international consortium of higher education institutions from different countries.',
        officialUrl: `${BASE_URL}/opportunities/individuals/students/erasmus-mundus-joint-masters`,
        country: 'European Union',
        eligibleCountries: [],
        degreeLevel: 'MASTERS',
        fundingType: 'FULL',
        benefits: [
          'Full tuition fee coverage',
          'Monthly living allowance',
          'Travel and installation allowance',
          'Insurance coverage',
        ],
        requirements: ["Bachelor's degree", 'Strong academic record'],
        raw: { source: 'erasmus-known' },
      },
    ];
  }
}
