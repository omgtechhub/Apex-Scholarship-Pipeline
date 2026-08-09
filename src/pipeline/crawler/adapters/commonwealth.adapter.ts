import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';
import { parseDate } from '../../utils/date.util';

const BASE_URL = 'https://cscuk.fcdo.gov.uk';

export class CommonwealthAdapter extends BaseCrawler {
  constructor(config: Partial<CrawlerConfig> & { sourceId: string }) {
    super({
      baseUrl: BASE_URL,
      timeout: 30000,
      ...config,
    });
  }

  async extract(): Promise<ExtractedScholarship[]> {
    const scholarships: ExtractedScholarship[] = [];

    const schemeUrls = [
      { url: `${BASE_URL}/scholarships/commonwealth-masters-scholarships/`, degree: 'MASTERS' },
      { url: `${BASE_URL}/scholarships/commonwealth-phd-scholarships/`, degree: 'PHD' },
      { url: `${BASE_URL}/scholarships/commonwealth-distance-learning-scholarships/`, degree: 'ONLINE' },
      { url: `${BASE_URL}/scholarships/`, degree: 'ANY' },
    ];

    for (const scheme of schemeUrls) {
      try {
        const html = await this.fetchHtml(scheme.url);
        const $ = this.load(html);

        const title =
          $('h1, .page-title, .hero-title').first().text().trim() ||
          `Commonwealth ${scheme.degree} Scholarships`;

        const description =
          $('meta[name="description"]').attr('content') ??
          $('.content-body p, .entry-content p').first().text().trim();

        const deadlineText = $('[class*="deadline"], .key-date, time').first().text().trim() ||
          $('strong:contains("deadline"), strong:contains("Deadline")').next().text().trim();
        const deadline = parseDate(deadlineText);

        const applicationLinkHref =
          $('a[href*="apply"], a[href*="application"], a[href*="csc.mygov"]').first().attr('href') ??
          '';
        const applicationUrl = this.resolveUrl(applicationLinkHref) ?? undefined;

        const eligibility = $('.eligibility, [class*="eligib"] p, #eligibility + p')
          .first()
          .text()
          .trim();

        const requirementsList: string[] = [];
        $('.requirements li, [class*="criteria"] li, #requirements + ul li').each((_i, el) => {
          const text = $(el).text().trim();
          if (text) requirementsList.push(text);
        });

        const benefits: string[] = [];
        $('[class*="benefit"] li, .award-details li, .what-scholarship-offers li').each((_i, el) => {
          const text = $(el).text().trim();
          if (text) benefits.push(text);
        });

        scholarships.push({
          title,
          organization: 'Commonwealth Scholarship Commission (CSC)',
          description: description || 'Commonwealth scholarships for talented and motivated individuals from Commonwealth countries.',
          officialUrl: scheme.url,
          applicationUrl,
          deadline: deadline ?? undefined,
          country: 'United Kingdom',
          eligibleCountries: this.extractCommonwealthCountries($),
          degreeLevel: scheme.degree,
          fundingType: 'FULL',
          benefits: benefits.length > 0 ? benefits : [
            'Tuition fees',
            'Monthly stipend',
            'Airfare',
            'Thesis grant',
          ],
          eligibility: eligibility || 'Citizens of eligible Commonwealth countries',
          requirements: requirementsList.length > 0 ? requirementsList : [
            "Bachelor's degree in relevant field",
            'Commonwealth citizenship',
            'English language proficiency',
          ],
          raw: { source: 'commonwealth', degree: scheme.degree },
        });
      } catch (err) {
        this.recordError((err as Error).message, scheme.url);
      }
    }

    this.logger.info({ count: scholarships.length }, 'Commonwealth adapter extracted');
    return scholarships;
  }

  private extractCommonwealthCountries($: ReturnType<typeof this.load>): string[] {
    const countries: string[] = [];
    $('.eligible-countries li, [class*="country"] li, .eligible li').each((_i, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 60) {
        countries.push(text);
      }
    });
    return countries;
  }
}
