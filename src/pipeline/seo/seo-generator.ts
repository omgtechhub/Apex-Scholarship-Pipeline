import aiService from '../ai/ai.service';
import { PromptManager, PROMPT_NAMES } from '../prompts/prompt-manager';
import { createLogger } from '../logger/logger';
import { toSlug } from '../utils/string.util';
import { formatDate } from '../utils/date.util';
import type { SEOData } from '../types';

const logger = createLogger('seo-generator');

interface ScholarshipSEOInput {
  id: string;
  title: string;
  organization: string;
  description: string;
  officialUrl: string;
  applicationUrl: string | null;
  deadline: Date | null;
  country: string | null;
  eligibleCountries: string[];
  degreeLevel: string;
  fieldsOfStudy: string[];
  fundingType: string;
  fundingAmount: number | null;
  currency: string | null;
}

export class SEOGenerator {
  async generate(article: {
    id: string;
    title: string;
    content: string;
    slug: string;
  }, scholarship: ScholarshipSEOInput): Promise<SEOData> {
    const currentYear = new Date().getFullYear();

    try {
      const prompt = await PromptManager.getActivePrompt(PROMPT_NAMES.SEO_GENERATION);
      const scholarshipDataStr = JSON.stringify({
        title: scholarship.title,
        organization: scholarship.organization,
        description: scholarship.description.substring(0, 300),
        deadline: scholarship.deadline ? formatDate(scholarship.deadline) : 'Not specified',
        country: scholarship.country,
        eligibleCountries: scholarship.eligibleCountries.slice(0, 10),
        degreeLevel: scholarship.degreeLevel,
        fieldsOfStudy: scholarship.fieldsOfStudy.slice(0, 5),
        fundingType: scholarship.fundingType,
        currentYear,
      });

      const rendered = PromptManager.render(prompt.content, {
        title: article.title,
        scholarshipData: scholarshipDataStr,
      });

      const result = await aiService.complete([{ role: 'user', content: rendered }], {
        temperature: 0.2,
        maxTokens: 1000,
      });

      const seoData = this.parseSEOResponse(result.content, article, scholarship, currentYear);
      logger.info({ articleId: article.id }, 'SEO generated');
      return seoData;
    } catch (err) {
      logger.warn({ err, articleId: article.id }, 'AI SEO generation failed, using fallback');
      return this.generateFallback(article, scholarship, currentYear);
    }
  }

  private parseSEOResponse(
    raw: string,
    article: { id: string; title: string; slug: string },
    scholarship: ScholarshipSEOInput,
    currentYear: number
  ): SEOData {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in SEO response');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      seoTitle: this.truncate(parsed.seoTitle ?? article.title, 60),
      metaDescription: this.truncate(parsed.metaDescription ?? scholarship.description, 160),
      slug: article.slug,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 20) : this.buildKeywords(scholarship),
      canonicalUrl: null,
      ogTitle: this.truncate(parsed.ogTitle ?? article.title, 95),
      ogDescription: this.truncate(parsed.ogDescription ?? scholarship.description, 200),
      ogImage: null,
      twitterTitle: this.truncate(parsed.ogTitle ?? article.title, 70),
      twitterDescription: this.truncate(parsed.metaDescription ?? scholarship.description, 200),
      jsonLd: this.buildJsonLd(article, scholarship, currentYear),
      faqSchema: Array.isArray(parsed.faqs) && parsed.faqs.length > 0
        ? this.buildFaqSchema(parsed.faqs)
        : null,
      breadcrumbSchema: this.buildBreadcrumbSchema(article.title, article.slug),
    };
  }

  private generateFallback(
    article: { id: string; title: string; slug: string },
    scholarship: ScholarshipSEOInput,
    currentYear: number
  ): SEOData {
    const seoTitle = `${scholarship.title} ${currentYear} | Apply Now`;
    const metaDesc = scholarship.description
      ? this.truncate(scholarship.description, 160)
      : `Apply for the ${scholarship.title} scholarship. ${scholarship.fundingType === 'FULL' ? 'Fully funded.' : ''} Deadline: ${scholarship.deadline ? formatDate(scholarship.deadline) : 'TBA'}.`;

    return {
      seoTitle: this.truncate(seoTitle, 60),
      metaDescription: metaDesc,
      slug: article.slug,
      keywords: this.buildKeywords(scholarship),
      canonicalUrl: null,
      ogTitle: this.truncate(article.title, 95),
      ogDescription: metaDesc,
      ogImage: null,
      twitterTitle: this.truncate(article.title, 70),
      twitterDescription: metaDesc,
      jsonLd: this.buildJsonLd(article, scholarship, currentYear),
      faqSchema: null,
      breadcrumbSchema: this.buildBreadcrumbSchema(article.title, article.slug),
    };
  }

  private buildKeywords(scholarship: ScholarshipSEOInput): string[] {
    const currentYear = new Date().getFullYear();
    const keywords = [
      scholarship.title.toLowerCase(),
      `${scholarship.title.toLowerCase()} ${currentYear}`,
      `${scholarship.organization.toLowerCase()} scholarship`,
      'scholarship application',
      'study abroad scholarship',
    ];

    if (scholarship.country) {
      keywords.push(`study in ${scholarship.country.toLowerCase()}`);
      keywords.push(`${scholarship.country.toLowerCase()} scholarship`);
    }

    if (scholarship.degreeLevel && scholarship.degreeLevel !== 'UNKNOWN') {
      keywords.push(`${scholarship.degreeLevel.toLowerCase()} scholarship`);
    }

    if (scholarship.fundingType === 'FULL') {
      keywords.push('fully funded scholarship');
    }

    scholarship.eligibleCountries.slice(0, 5).forEach((c) => {
      keywords.push(`${c.toLowerCase()} students scholarship`);
    });

    return [...new Set(keywords)].slice(0, 20);
  }

  private buildJsonLd(
    article: { title: string; slug: string },
    scholarship: ScholarshipSEOInput,
    currentYear: number
  ): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: scholarship.description,
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      author: {
        '@type': 'Organization',
        name: 'Scholarship Pipeline',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Scholarship Pipeline',
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': scholarship.officialUrl,
      },
      about: {
        '@type': 'EducationEvent',
        name: scholarship.title,
        organizer: { '@type': 'Organization', name: scholarship.organization },
        ...(scholarship.deadline ? { endDate: scholarship.deadline.toISOString() } : {}),
        location: scholarship.country ?? 'International',
      },
    };
  }

  private buildFaqSchema(faqs: Array<{ question: string; answer: string }>): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    };
  }

  private buildBreadcrumbSchema(title: string, slug: string): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
        { '@type': 'ListItem', position: 2, name: 'Scholarships', item: '/scholarships' },
        { '@type': 'ListItem', position: 3, name: title, item: `/scholarships/${slug}` },
      ],
    };
  }

  private truncate(s: string, max: number): string {
    if (!s) return '';
    if (s.length <= max) return s;
    return s.substring(0, max - 3) + '...';
  }

  private buildSlug(base: string): string {
    return toSlug(base);
  }
}

export const seoGenerator = new SEOGenerator();
export default seoGenerator;
