import { createLogger } from '../logger/logger';
import { formatDate } from '../utils/date.util';
import { countWords } from '../utils/string.util';
import type { QualityCheckResult } from '../types';

const logger = createLogger('quality-service');

export interface QualityInput {
  article: {
    title: string;
    content: string;
    wordCount?: number | null;
  };
  scholarship: {
    title: string;
    organization: string;
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
    benefits: string[];
    eligibility: string | null;
    requirements: string[];
    documents: string[];
  };
}

const PASS_THRESHOLD = Number(process.env.QUALITY_PASS_THRESHOLD ?? 0.7);
const REVIEW_THRESHOLD = Number(process.env.QUALITY_REVIEW_THRESHOLD ?? 0.5);

export class QualityService {
  async check(input: QualityInput): Promise<QualityCheckResult> {
    const checks: Record<string, { passed: boolean; message: string }> = {};
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const factualMismatches: Array<{ field: string; expected: string; found: string }> = [];

    const { article, scholarship } = input;
    const content = article.content.toLowerCase();

    // ── Factual verification ──────────────────────────────────────────────────

    // Title check
    const titleInContent = this.fuzzyContains(content, scholarship.title);
    checks['title_present'] = {
      passed: titleInContent,
      message: titleInContent
        ? 'Scholarship title found in article'
        : 'Scholarship title not found in article',
    };
    if (!titleInContent) {
      factualMismatches.push({
        field: 'title',
        expected: scholarship.title,
        found: 'Not found in article',
      });
      errors.push('Article does not mention the scholarship title');
    }

    // Organization check
    const orgInContent = scholarship.organization
      ? this.fuzzyContains(content, scholarship.organization)
      : true;
    checks['organization_present'] = {
      passed: orgInContent,
      message: orgInContent
        ? 'Organization mentioned in article'
        : 'Organization not mentioned in article',
    };
    if (!orgInContent && scholarship.organization) {
      warnings.push(`Organization "${scholarship.organization}" not mentioned`);
    }

    // Deadline verification
    if (scholarship.deadline) {
      const deadlineStr = formatDate(scholarship.deadline);
      const deadlineYear = scholarship.deadline.getFullYear().toString();
      const deadlineMonth = scholarship.deadline.toLocaleString('en-US', { month: 'long' });

      const deadlineApproxInContent =
        content.includes(deadlineYear) &&
        (content.includes(deadlineMonth.toLowerCase()) ||
          content.includes(deadlineStr.toLowerCase()));

      checks['deadline_accurate'] = {
        passed: deadlineApproxInContent,
        message: deadlineApproxInContent
          ? 'Deadline information appears accurate'
          : `Article deadline information may not match database: ${deadlineStr}`,
      };

      if (!deadlineApproxInContent) {
        factualMismatches.push({
          field: 'deadline',
          expected: deadlineStr,
          found: 'Not clearly stated in article or may differ',
        });
        errors.push(`Deadline mismatch: database says ${deadlineStr}`);
      }
    } else {
      checks['deadline_accurate'] = { passed: true, message: 'No deadline to verify' };
    }

    // Official URL check
    const urlDomain = this.extractDomain(scholarship.officialUrl);
    const urlInContent = urlDomain ? content.includes(urlDomain.toLowerCase()) : false;
    checks['official_url_present'] = {
      passed: urlInContent || !scholarship.officialUrl,
      message: urlInContent
        ? 'Official URL domain mentioned'
        : 'Official URL not referenced in article',
    };
    if (!urlInContent && scholarship.officialUrl) {
      warnings.push('Official URL or its domain not mentioned in article');
    }

    // Funding type check
    if (scholarship.fundingType !== 'UNKNOWN') {
      const fundingKeywords: Record<string, string[]> = {
        FULL: ['fully funded', 'full scholarship', 'covers all', 'complete funding'],
        PARTIAL: ['partial', 'partially funded', 'covers part'],
        TUITION_ONLY: ['tuition', 'tuition fee', 'tuition only'],
        LIVING_ALLOWANCE: ['living allowance', 'stipend', 'monthly allowance'],
        TRAVEL: ['travel', 'airfare', 'flight'],
      };
      const keywords = fundingKeywords[scholarship.fundingType] ?? [];
      const fundingMentioned = keywords.some((kw) => content.includes(kw));

      checks['funding_type_mentioned'] = {
        passed: fundingMentioned || keywords.length === 0,
        message: fundingMentioned
          ? 'Funding information mentioned'
          : `Funding type (${scholarship.fundingType}) not clearly mentioned`,
      };
      if (!fundingMentioned && keywords.length > 0) {
        warnings.push(`Funding type (${scholarship.fundingType}) not clearly described`);
      }
    } else {
      checks['funding_type_mentioned'] = { passed: true, message: 'Funding type unknown, skipping check' };
    }

    // Country check
    if (scholarship.country) {
      const countryInContent = content.includes(scholarship.country.toLowerCase());
      checks['country_mentioned'] = {
        passed: countryInContent,
        message: countryInContent
          ? 'Host country mentioned in article'
          : `Host country (${scholarship.country}) not mentioned`,
      };
      if (!countryInContent) {
        warnings.push(`Host country "${scholarship.country}" not mentioned`);
      }
    } else {
      checks['country_mentioned'] = { passed: true, message: 'No country to verify' };
    }

    // Degree level check
    if (scholarship.degreeLevel && scholarship.degreeLevel !== 'UNKNOWN') {
      const degreeKeywords: Record<string, string[]> = {
        MASTERS: ['master', 'masters', 'msc', 'postgraduate', 'graduate'],
        PHD: ['phd', 'doctorate', 'doctoral', 'd.phil'],
        UNDERGRADUATE: ['undergraduate', 'bachelor', 'bsc', 'ba '],
        POSTDOCTORAL: ['postdoc', 'postdoctoral'],
        SHORT_COURSE: ['short course', 'certificate', 'diploma'],
        ANY: ['all levels', 'any level', 'undergraduate', 'postgraduate'],
        ONLINE: ['online', 'distance learning', 'e-learning'],
      };
      const keywords = degreeKeywords[scholarship.degreeLevel] ?? [];
      const degreeMentioned = keywords.some((kw) => content.includes(kw));

      checks['degree_level_mentioned'] = {
        passed: degreeMentioned || keywords.length === 0,
        message: degreeMentioned
          ? 'Degree level mentioned'
          : `Degree level (${scholarship.degreeLevel}) not clearly mentioned`,
      };
      if (!degreeMentioned && keywords.length > 0) {
        warnings.push(`Degree level (${scholarship.degreeLevel}) not clearly mentioned`);
      }
    } else {
      checks['degree_level_mentioned'] = { passed: true, message: 'Degree level unknown, skipping check' };
    }

    // ── Content quality checks ────────────────────────────────────────────────

    // Word count
    const wordCount = article.wordCount ?? countWords(article.content);
    const wordCountOk = wordCount >= 400;
    checks['word_count'] = {
      passed: wordCountOk,
      message: wordCountOk
        ? `Article has ${wordCount} words (minimum 400)`
        : `Article too short: ${wordCount} words (minimum 400)`,
    };
    if (!wordCountOk) {
      errors.push(`Article is too short (${wordCount} words, minimum 400)`);
      recommendations.push('Expand the article with more details about the scholarship');
    }

    // Has clear sections
    const hasSections = content.includes('#') || content.includes('##');
    checks['has_sections'] = {
      passed: hasSections,
      message: hasSections ? 'Article has structured sections' : 'Article lacks structured sections',
    };
    if (!hasSections) {
      warnings.push('Article lacks structured headings/sections');
      recommendations.push('Add clear section headings to improve readability');
    }

    // No placeholder text
    const placeholders = ['[placeholder]', 'lorem ipsum', 'todo', 'tbd', 'insert here'];
    const hasPlaceholder = placeholders.some((p) => content.includes(p));
    checks['no_placeholder'] = {
      passed: !hasPlaceholder,
      message: !hasPlaceholder ? 'No placeholder text found' : 'Article contains placeholder text',
    };
    if (hasPlaceholder) {
      errors.push('Article contains placeholder text');
    }

    // Application link present
    const hasLink =
      content.includes('http') ||
      content.includes('apply') ||
      content.includes('application');
    checks['has_application_info'] = {
      passed: hasLink,
      message: hasLink
        ? 'Application information present'
        : 'Article lacks application information',
    };
    if (!hasLink) {
      warnings.push('Article should include application link or instructions');
    }

    // ── Score calculation ──────────────────────────────────────────────────────

    const allChecks = Object.values(checks);
    const passedCount = allChecks.filter((c) => c.passed).length;
    const score = allChecks.length > 0 ? passedCount / allChecks.length : 0;

    let status: 'PASS' | 'REVIEW' | 'REJECT';
    if (score >= PASS_THRESHOLD && errors.length === 0) {
      status = 'PASS';
    } else if (score >= REVIEW_THRESHOLD || (errors.length > 0 && factualMismatches.length <= 1)) {
      status = 'REVIEW';
    } else {
      status = 'REJECT';
    }

    // Critical factual mismatches always escalate to REVIEW at minimum
    if (factualMismatches.length > 0 && status === 'PASS') {
      status = 'REVIEW';
    }

    // Multiple errors → REJECT
    if (errors.length > 2) {
      status = 'REJECT';
    }

    logger.info(
      { score, status, errors: errors.length, warnings: warnings.length, mismatches: factualMismatches.length },
      'Quality check complete'
    );

    return {
      score: Math.round(score * 100) / 100,
      status,
      checks,
      errors,
      warnings,
      recommendations,
      factualMismatches,
    };
  }

  private fuzzyContains(haystack: string, needle: string): boolean {
    if (!needle) return true;
    const normalized = needle.toLowerCase().trim();
    if (haystack.includes(normalized)) return true;
    // Check significant words (> 4 chars)
    const words = normalized.split(/\s+/).filter((w) => w.length > 4);
    if (words.length === 0) return haystack.includes(normalized);
    const matchCount = words.filter((w) => haystack.includes(w)).length;
    return matchCount / words.length >= 0.6;
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}

export const qualityService = new QualityService();
export default qualityService;
