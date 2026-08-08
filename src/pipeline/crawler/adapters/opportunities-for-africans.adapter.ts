import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';
import { parseDate } from '../../utils/date.util';

const BASE_URL = 'https://opportunitiesforafricans.com';

export class OpportunitiesForAfricansAdapter extends BaseCrawler {
  constructor(config: Partial<CrawlerConfig> & { sourceId: string }) {
    super({
      baseUrl: BASE_URL,
      timeout: 30000,
      ...config,
    });
  }

  async extract(): Promise<ExtractedScholarship[]> {
    const scholarships: ExtractedScholarship[] = [];

    const listingUrls = [
      `${BASE_URL}/scholarships/`,
      `${BASE_URL}/scholarships/fully-funded-scholarships/`,
      `${BASE_URL}/category/scholarships/`,
    ];

    for (const listUrl of listingUrls) {
      try {
        const html = await this.fetchHtml(listUrl);
        const $ = this.load(html);

        // Standard WordPress/blog post listing selectors
        const articleLinks: Array<{ url: string; title: string; description: string }> = [];

        $('article, .post, .entry, [class*="scholarship"]').each((_i, el) => {
          const $el = $(el);
          const titleEl = $el.find('h2, h3, .entry-title, .post-title').first();
          const title = titleEl.text().trim();
          if (!title) return;

          const linkEl = $el.find('a[href]').first();
          const href = linkEl.attr('href') ?? titleEl.find('a').attr('href') ?? '';
          const url = this.resolveUrl(href);
          if (!url) return;

          const description = $el
            .find('.entry-summary, .post-excerpt, p')
            .first()
            .text()
            .trim();

          articleLinks.push({ url, title, description });
        });

        // Process the first 10 articles to avoid overloading
        const toProcess = articleLinks.slice(0, 10);

        for (const link of toProcess) {
          try {
            const scholarship = await this.extractScholarshipDetail(link);
            if (scholarship) {
              scholarships.push(scholarship);
            }
          } catch (err) {
            this.recordError((err as Error).message, link.url);
          }
        }

        if (scholarships.length > 0) break;
      } catch (err) {
        this.recordError((err as Error).message, listUrl);
      }
    }

    this.logger.info({ count: scholarships.length }, 'OpportunitiesForAfricans extracted');
    return scholarships;
  }

  private async extractScholarshipDetail(link: {
    url: string;
    title: string;
    description: string;
  }): Promise<ExtractedScholarship | null> {
    try {
      const html = await this.fetchHtml(link.url);
      const $ = this.load(html);

      const title =
        $('h1.entry-title, h1.post-title, h1').first().text().trim() || link.title;
      if (!title) return null;

      const content = $('.entry-content, .post-content, article').first().text();

      // Extract deadline
      const deadlineMatch = content.match(
        /deadline[:\s]+([a-zA-Z]+ \d{1,2},?\s+\d{4}|\d{1,2}\s+[a-zA-Z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/i
      );
      const deadline = deadlineMatch ? parseDate(deadlineMatch[1]) : null;

      // Extract organization/host
      const orgMatch = content.match(
        /(?:offered by|hosted by|provided by|sponsor(?:ed)? by|by)\s+([^.]+)/i
      );
      const organization = orgMatch ? orgMatch[1].trim().substring(0, 100) : undefined;

      // Extract application link
      const appLinkHref =
        $('a[href*="apply"], a[href*="application"], a:contains("Apply")').first().attr('href') ?? '';
      const applicationUrl = appLinkHref ? this.resolveUrl(appLinkHref) ?? undefined : undefined;

      // Extract countries
      const countryMatch = content.match(
        /(?:open to|available to|eligible countries?|for students from)\s+([^.]+)/i
      );
      const eligibleCountries = countryMatch
        ? countryMatch[1]
            .split(/,|and/)
            .map((c) => c.trim())
            .filter((c) => c.length > 2 && c.length < 50)
        : [];

      // Extract degree level
      const degreeLevel = this.detectDegree(title + ' ' + content);
      const fundingType = this.detectFunding(title + ' ' + content);

      // Extract benefits
      const benefits: string[] = [];
      $('ul li').each((_i, el) => {
        const text = $(el).text().trim();
        if (
          text.length > 5 &&
          text.length < 200 &&
          (text.toLowerCase().includes('stipend') ||
            text.toLowerCase().includes('tuition') ||
            text.toLowerCase().includes('allowance') ||
            text.toLowerCase().includes('flight') ||
            text.toLowerCase().includes('travel') ||
            text.toLowerCase().includes('funded'))
        ) {
          benefits.push(text);
        }
      });

      return {
        title,
        organization: organization || 'Various Organizations',
        description: link.description || $('meta[name="description"]').attr('content') || '',
        officialUrl: link.url,
        applicationUrl,
        deadline: deadline ?? undefined,
        country: this.extractHostCountry(content),
        eligibleCountries,
        degreeLevel,
        fundingType,
        benefits: benefits.slice(0, 10),
        eligibility: this.extractEligibility(content),
        raw: { source: 'opportunities-for-africans', sourceUrl: link.url },
      };
    } catch {
      return null;
    }
  }

  private detectDegree(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('phd') || lower.includes('doctoral')) return 'PHD';
    if (lower.includes('master') || lower.includes('postgraduate')) return 'MASTERS';
    if (lower.includes('undergraduate') || lower.includes('bachelor')) return 'UNDERGRADUATE';
    if (lower.includes('postdoc')) return 'POSTDOCTORAL';
    if (lower.includes('short course') || lower.includes('certificate')) return 'SHORT_COURSE';
    return 'ANY';
  }

  private detectFunding(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('fully funded') || lower.includes('full scholarship')) return 'FULL';
    if (lower.includes('partial')) return 'PARTIAL';
    if (lower.includes('tuition')) return 'TUITION_ONLY';
    return 'UNKNOWN';
  }

  private extractHostCountry(text: string): string | undefined {
    const match = text.match(
      /(?:held in|study in|located in|at .+? in)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|\n)/
    );
    return match ? match[1].trim() : undefined;
  }

  private extractEligibility(text: string): string {
    const match = text.match(
      /(?:eligib[^.]+\.)(?:[^.]+\.)?/i
    );
    return match ? match[0].trim() : '';
  }
}
