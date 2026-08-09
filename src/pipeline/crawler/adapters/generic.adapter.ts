import { BaseCrawler } from '../base-crawler';
import type { ExtractedScholarship } from '../../types';
import { stripHtml, cleanWhitespace } from '../../utils/string.util';
import { parseDate } from '../../utils/date.util';

export class GenericAdapter extends BaseCrawler {
  async extract(): Promise<ExtractedScholarship[]> {
    try {
      const html = await this.fetchHtml(this.config.baseUrl);
      const $ = this.load(html);
      const scholarships: ExtractedScholarship[] = [];

      // Generic extraction: look for scholarship-like content
      $('article, .scholarship, .grant, .opportunity, .listing, .item').each((_, el) => {
        const $el = $(el);
        const title =
          $el.find('h1, h2, h3, h4, .title, .name').first().text().trim() ||
          $el.find('a').first().text().trim();

        if (!title || title.length < 5) return;

        const link =
          $el.find('a[href]').first().attr('href') || this.config.baseUrl;
        const officialUrl = this.resolveUrl(link) ?? this.config.baseUrl;
        const description = cleanWhitespace(
          stripHtml($el.find('p, .description, .summary').first().text())
        );

        const deadlineText = $el
          .find('.deadline, [class*="deadline"], [class*="date"]')
          .first()
          .text();
        const deadline = parseDate(deadlineText);

        scholarships.push({
          title,
          officialUrl,
          description,
          deadline: deadline ?? undefined,
          raw: { html: $el.html() },
        });
      });

      return scholarships;
    } catch (err) {
      this.recordError((err as Error).message);
      return [];
    }
  }
}

export default GenericAdapter;
