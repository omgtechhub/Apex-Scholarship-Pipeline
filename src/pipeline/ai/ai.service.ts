import { createLogger } from '../logger/logger';
import { AIError } from '../errors/base.error';
import { withRetry } from '../utils/retry.util';
import prisma from '../database/prisma-client';
import type { AIProvider, AIMessage, AICompletionOptions, AICompletionResult } from './ai-provider.interface';
import groqProvider from './groq.provider';

const logger = createLogger('ai-service');

export class AIService {
  private providers: AIProvider[];

  constructor(providers: AIProvider[] = [groqProvider]) {
    this.providers = providers;
  }

  private getActiveProvider(): AIProvider {
    const active = this.providers.find((p) => p.isAvailable());
    if (!active) {
      throw new AIError('No AI provider is available (check API keys)', {}, false);
    }
    return active;
  }

  async complete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    const provider = this.getActiveProvider();

    const result = await withRetry(
      () => provider.complete(messages, options),
      {
        attempts: 3,
        baseDelayMs: 5000,
        maxDelayMs: 30000,
        retryIf: (err) => (err instanceof AIError ? err.retryable : true),
      },
      `ai-complete:${provider.name}`
    );

    // Track usage metrics
    try {
      await prisma.metric.create({
        data: {
          name: 'ai_tokens_used',
          value: result.tokensUsed,
          labels: { provider: provider.name, model: result.model },
        },
      });
    } catch {
      // Non-critical
    }

    return result;
  }

  async completeWithStructuredOutput<T>(
    messages: AIMessage[],
    parser: (content: string) => T,
    options: AICompletionOptions = {}
  ): Promise<T> {
    const result = await this.complete(messages, options);

    try {
      return parser(result.content);
    } catch (err) {
      logger.warn({ err, content: result.content.substring(0, 200) }, 'Failed to parse AI output');
      throw new AIError('Failed to parse AI structured output', {
        parserError: (err as Error).message,
        contentPreview: result.content.substring(0, 200),
      }, false);
    }
  }
}

export const aiService = new AIService();
export default aiService;
