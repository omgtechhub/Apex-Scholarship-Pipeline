import { BaseCrawler, type CrawlerConfig } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';
import { parseDate } from '../../utils/date.util';

const BASE_URL = 'https://opportunitiesforafricans.com';

/*
 * WordPress archive pages are not scholarships.
 *
 * The listing selector below includes `[class*="scholarship"]`, which on an
 * archive page also matches the page's own section wrapper — and
 * `.find('a[href]').first()` then picks up the category link rather than a post
 * permalink. The result was a "scholarship" titled "Scholarships" whose
 * officialUrl was https://opportunitiesforafricans.com/category/scholarships/,
 * which reached the live site as a card, got an AI article written about it, and
 * was published.
 *
 * It was rejected by hand on 17 Nov 2026, and the very next crawl recreated it —
 * which is the point: rejecting the row treats the symptom, and only a guard
 * here stops it coming back every 30 minutes.
 */
const TAXONOMY_PATH = /\/(category|tag|author|page|search|feed)(\/|$)/i;

/**
 * Titles that are a section name rather than the name of an award.
 *
 * An archive wrapper's heading is the section it lists ("Scholarships",
 * "Fully Funded Scholarships"), so a title that is nothing but those words
 * describes a page, not an opportunity. Real entries on this site read like
 * "Chevening Scholarships 2027 for Developing Countries" — they always carry a
 * programme or sponsor name alongside the category word.
 */
const SECTION_TITLES = new Set([
  'scholarship',
  'scholarships',
  'fully funded scholarships',
  'fully funded scholarship',
  'opportunity',
  'opportunities',
  'fellowship',
  'fellowships',
  'grants',
  'latest scholarships',
  'all scholarships',
]);

/** True when a candidate link is an archive/taxonomy page rather than a post. */
export function isListingUrl(url: string, listingUrls: readonly string[] = []): boolean {
  let path: string;
  try {
    path = new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return true; // unparseable: not a usable permalink either way
  }

  // The pages we deliberately started from can never themselves be entries.
  const normalized = (u: string) => u.replace(/\/+$/, '').toLowerCase();
  if (listingUrls.some((l) => normalized(l) === normalized(url))) return true;

  if (TAXONOMY_PATH.test(path + '/')) return true;

  // A bare section path like /scholarships has one segment; real posts on this
  // site are /some-programme-name-2027 or deeper.
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  if (segments.length === 1 && SECTION_TITLES.has(segments[0].replace(/-/g, ' '))) return true;

  return false;
}

/** True when a title names a section rather than an award. */
export function isSectionTitle(title: string): boolean {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length === 0 || SECTION_TITLES.has(cleaned);
}

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

          // Prefer the link inside the heading: on an archive page the first
          // <a> in a wrapper can be navigation, while the title's own link is
          // the post permalink.
          const href = titleEl.find('a[href]').attr('href') ?? $el.find('a[href]').first().attr('href') ?? '';
          const url = this.resolveUrl(href);
          if (!url) return;

          // Drop archive/taxonomy pages and section headings. Without this the
          // category index itself becomes a published scholarship — see
          // isListingUrl for the full story.
          if (isListingUrl(url, listingUrls) || isSectionTitle(title)) {
            this.logger.debug({ url, title }, 'Skipping listing page masquerading as a scholarship');
            return;
          }

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
