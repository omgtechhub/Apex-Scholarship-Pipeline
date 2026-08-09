import Groq from 'groq-sdk';
import { createLogger } from '../logger/logger';
import { AIError } from '../errors/base.error';
import type { AIProvider, AIMessage, AICompletionOptions, AICompletionResult } from './ai-provider.interface';

const logger = createLogger('groq-provider');

export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private client: Groq | null = null;
  private readonly model: string;
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private getClient(): Groq {
    if (!this.client) {
      if (!this.apiKey) {
        throw new AIError('GROQ_API_KEY is not configured', {}, false);
      }
      this.client = new Groq({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async complete(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    const client = this.getClient();
    const model = options.model ?? this.model;

    logger.debug({ model, messageCount: messages.length }, 'Sending completion request');

    const response = await client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4000,
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new AIError('Groq returned empty response', { model }, true);
    }

    const tokensUsed =
      (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

    logger.debug({ model, tokensUsed, finishReason: choice.finish_reason }, 'Completion received');

    return {
      content: choice.message.content,
      tokensUsed,
      model,
      provider: this.name,
      finishReason: choice.finish_reason ?? undefined,
    };
  }
}

export default new GroqProvider();
