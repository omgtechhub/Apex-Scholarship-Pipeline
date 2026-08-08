import aiService from './ai.service';
import { PromptManager, PROMPT_NAMES } from '../prompts/prompt-manager';
import { createLogger } from '../logger/logger';
import { AIError } from '../errors/base.error';
import { formatDate } from '../utils/date.util';
import { countWords, estimateReadingTime } from '../utils/string.util';
import type { ArticleContent } from '../types';

const logger = createLogger('article-generator');

export interface ScholarshipDataForAI {
  title: string;
  organization: string;
  description: string;
  officialUrl: string;
  applicationUrl: string | null;
  deadline: Date | null;
  startDate: Date | null;
  country: string | null;
  eligibleCountries: string[];
  degreeLevel: string;
  fieldsOfStudy: string[];
  fundingType: string;
  fundingAmount: number | null;
  currency: string | null;
  benefits: string[];
  eligibility: string;
  requirements: string[];
  documents: string[];
  applicationInstructions: string;
}

function formatScholarshipData(data: ScholarshipDataForAI): string {
  return JSON.stringify({
    title: data.title,
    organization: data.organization,
    description: data.description,
    officialUrl: data.officialUrl,
    applicationUrl: data.applicationUrl ?? 'Not specified',
    deadline: data.deadline ? formatDate(data.deadline) : 'Not specified',
    startDate: data.startDate ? formatDate(data.startDate) : 'Not specified',
    country: data.country ?? 'Not specified',
    eligibleCountries: data.eligibleCountries.length > 0 ? data.eligibleCountries : ['Not specified'],
    degreeLevel: data.degreeLevel,
    fieldsOfStudy: data.fieldsOfStudy.length > 0 ? data.fieldsOfStudy : ['Not specified'],
    fundingType: data.fundingType,
    fundingAmount: data.fundingAmount ? `${data.fundingAmount} ${data.currency ?? 'USD'}` : 'Not specified',
    benefits: data.benefits.length > 0 ? data.benefits : ['Not specified'],
    eligibility: data.eligibility || 'See official website',
    requirements: data.requirements.length > 0 ? data.requirements : ['See official website'],
    documents: data.documents.length > 0 ? data.documents : ['See official website'],
    applicationInstructions: data.applicationInstructions || 'See official website',
  }, null, 2);
}

function parseArticleContent(raw: string): ArticleContent {
  // Try to extract JSON from the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.title || !parsed.introduction) {
    throw new Error('AI response missing required fields (title, introduction)');
  }

  const article: ArticleContent = {
    title: String(parsed.title ?? ''),
    introduction: String(parsed.introduction ?? ''),
    overview: String(parsed.overview ?? ''),
    provider: String(parsed.provider ?? ''),
    studyLevel: String(parsed.studyLevel ?? ''),
    eligibleCountries: String(parsed.eligibleCountries ?? ''),
    eligibleFields: String(parsed.eligibleFields ?? ''),
    funding: String(parsed.funding ?? ''),
    eligibility: String(parsed.eligibility ?? ''),
    requirements: String(parsed.requirements ?? ''),
    documents: String(parsed.documents ?? ''),
    applicationProcess: String(parsed.applicationProcess ?? ''),
    deadline: String(parsed.deadline ?? ''),
    officialLink: String(parsed.officialLink ?? ''),
    faqs: Array.isArray(parsed.faqs)
      ? parsed.faqs.map((f: { question?: string; answer?: string }) => ({
          question: String(f.question ?? ''),
          answer: String(f.answer ?? ''),
        }))
      : [],
    callToAction: String(parsed.callToAction ?? ''),
    fullContent: '',
  };

  // Compose full content
  article.fullContent = composeFullContent(article);

  return article;
}

function composeFullContent(article: ArticleContent): string {
  const sections: string[] = [];

  sections.push(`# ${article.title}\n`);
  sections.push(article.introduction);

  if (article.overview) {
    sections.push(`\n## Scholarship Overview\n\n${article.overview}`);
  }

  if (article.provider) {
    sections.push(`\n## About the Provider\n\n${article.provider}`);
  }

  if (article.studyLevel) {
    sections.push(`\n## Study Level\n\n${article.studyLevel}`);
  }

  if (article.eligibleCountries) {
    sections.push(`\n## Eligible Countries\n\n${article.eligibleCountries}`);
  }

  if (article.eligibleFields) {
    sections.push(`\n## Eligible Fields of Study\n\n${article.eligibleFields}`);
  }

  if (article.funding) {
    sections.push(`\n## Funding and Benefits\n\n${article.funding}`);
  }

  if (article.eligibility) {
    sections.push(`\n## Eligibility Criteria\n\n${article.eligibility}`);
  }

  if (article.requirements) {
    sections.push(`\n## Requirements\n\n${article.requirements}`);
  }

  if (article.documents) {
    sections.push(`\n## Required Documents\n\n${article.documents}`);
  }

  if (article.applicationProcess) {
    sections.push(`\n## Application Process\n\n${article.applicationProcess}`);
  }

  if (article.deadline) {
    sections.push(`\n## Application Deadline\n\n${article.deadline}`);
  }

  if (article.officialLink) {
    sections.push(`\n## Official Application Link\n\n${article.officialLink}`);
  }

  if (article.faqs.length > 0) {
    sections.push(`\n## Frequently Asked Questions\n`);
    for (const faq of article.faqs) {
      sections.push(`\n**${faq.question}**\n\n${faq.answer}`);
    }
  }

  if (article.callToAction) {
    sections.push(`\n## Ready to Apply?\n\n${article.callToAction}`);
  }

  return sections.join('\n');
}

export class ArticleGenerator {
  async generate(data: ScholarshipDataForAI): Promise<{
    article: ArticleContent;
    promptVersionId: string | null;
    wordCount: number;
    readingTime: number;
    tokensUsed: number;
  }> {
    const prompt = await PromptManager.getActivePrompt(PROMPT_NAMES.ARTICLE_GENERATION);

    const scholarshipDataStr = formatScholarshipData(data);
    const renderedPrompt = PromptManager.render(prompt.content, {
      scholarshipData: scholarshipDataStr,
    });

    logger.info({ title: data.title, promptVersion: prompt.version }, 'Generating article');

    const result = await aiService.complete([
      {
        role: 'user',
        content: renderedPrompt,
      },
    ], {
      temperature: 0.3,
      maxTokens: 4000,
    });

    let article: ArticleContent;
    try {
      article = parseArticleContent(result.content);
    } catch (err) {
      logger.error({ err, rawContent: result.content.substring(0, 500) }, 'Failed to parse article');
      throw new AIError(`Failed to parse article content: ${(err as Error).message}`, {}, false);
    }

    const wordCount = countWords(article.fullContent);
    const readingTime = estimateReadingTime(article.fullContent);

    logger.info({ title: data.title, wordCount, readingTime }, 'Article generated');

    return {
      article,
      promptVersionId: prompt.id,
      wordCount,
      readingTime,
      tokensUsed: result.tokensUsed,
    };
  }
}

export const articleGenerator = new ArticleGenerator();
export default articleGenerator;
