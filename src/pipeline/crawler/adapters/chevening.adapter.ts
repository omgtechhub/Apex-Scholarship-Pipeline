import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';
import { parseDate } from '../../utils/date.util';

const BASE_URL = 'https://www.chevening.org';

export class CheveningAdapter extends BaseCrawler {
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
      const html = await this.fetchWithPlaywright(`${BASE_URL}/scholarships/`);
      const $ = this.load(html);


      // Main Chevening scholarship
      const mainTitle =
        $('h1, .hero-title, .page-title').first().text().trim() ||
        'Chevening Scholarships';

      const mainDescription = $('meta[name="description"]').attr('content') ??
        $('p').first().text().trim();

      // Extract deadline information
      const deadlineText = $('[class*="deadline"], [class*="date"], .deadline-date')
        .first()
        .text()
        .trim();
      const deadline = parseDate(deadlineText);

      // Extract eligibility info
      const eligibility = $('[class*="eligib"], .eligibility-section p')
        .first()
        .text()
        .trim();

      // Extract application link
      const appLink =
        $('a[href*="apply"], a[href*="application"]').first().attr('href') ?? '';
      const applicationUrl = this.resolveUrl(appLink) ?? undefined;

      scholarships.push({
        title: 'Chevening Scholarships',
        organization: 'UK Government (Chevening)',
        description: mainDescription || 'Chevening is the UK government\'s international awards programme, aimed at developing global leaders.',
        officialUrl: `${BASE_URL}/scholarships/`,
        applicationUrl,
        deadline: deadline ?? undefined,
        country: 'United Kingdom',
        eligibleCountries: this.extractEligibleCountries($),
        degreeLevel: 'MASTERS',
        fundingType: 'FULL',
        benefits: [
          'University tuition fees',
          'Monthly stipend',
          'Travel to and from the UK',
          'Arrival allowance',
          'Departure allowance',
          'Thesis or dissertation grant',
        ],
        eligibility: eligibility || 'Open to eligible nationalities with at least 2 years of work experience',
        requirements: [
          'Bachelor\'s degree equivalent',
          'At least 2 years of work experience',
          'English language proficiency',
          'Return to home country for at least 2 years after scholarship',
        ],
        raw: { source: 'chevening', mainTitle },
      });

      // Try to extract individual country-specific scholarship pages
      $('a[href*="/scholarships/"]').each((_i, el) => {
        const href = $(el).attr('href') ?? '';
        const url = this.resolveUrl(href);
        if (url && url !== `${BASE_URL}/scholarships/`) {
          // Record sub-pages but don't crawl all of them to avoid excessive requests
        }
      });
    } catch (err) {
      this.recordError((err as Error).message, `${BASE_URL}/scholarships/`);
    }

    this.logger.info({ count: scholarships.length }, 'Chevening adapter extracted');
    return scholarships;
  }

  private extractEligibleCountries($: ReturnType<typeof this.load>): string[] {
    const countries: string[] = [];
    // Chevening is open to most countries; extract from the page if possible
    $('[class*="countr"], .country-list li, .eligible-countries li').each((_i, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 50) {
        countries.push(text);
      }
    });
    return countries.length > 0 ? countries : [];
  }
}
