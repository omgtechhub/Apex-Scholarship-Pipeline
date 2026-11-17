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
    /*
     * Reads GROQ_MODEL, then AI_MODEL, then falls back.
     *
     * AI_MODEL is here because that is the name the deployed `.env` has always
     * used, while this line only ever read GROQ_MODEL - so the configured model
     * was silently ignored and the hardcoded default below was what actually
     * ran. Setting AI_MODEL to a working model would have had no effect, which
     * is a bad way to find out your config is dead.
     *
     * The old default, 'llama-3.3-70b-versatile', has since been retired by
     * Groq and now returns HTTP 404 model_not_found, so a stale default was not
     * a harmless one. Verified against the live API: qwen3.8-27b completes a
     * ~1,900-word article in 2,653 tokens with finish_reason 'stop', where
     * gpt-oss-120b spends budget on a reasoning channel and hits the 4,000
     * token cap mid-article (finish_reason 'length').
     *
     * The binding constraint on the free tier turned out not to be tokens-per-
     * DAY but output-tokens-per-MINUTE, enforced per model. qwen3.8-27b caps
     * OTPM at 1000 while the generator asks for 4000, so every request is
     * rejected 429 "Request too large" before it starts - it passes a small
     * ad-hoc test and fails every real one. gpt-oss-20b clears that limit and
     * finishes: 2,114 words in 3,401 tokens, finish_reason 'stop'.
     */
    this.model =
      process.env.GROQ_MODEL ?? process.env.AI_MODEL ?? 'openai/gpt-oss-20b';
  }

  isAvailable(): boolean {
    return Boolean(process.env.GROQ_API_KEY ?? this.apiKey);
  }

  private getClient(): Groq {
    const apiKey = process.env.GROQ_API_KEY ?? this.apiKey;
    if (!this.client) {
      if (!apiKey) {
        throw new AIError('GROQ_API_KEY is not configured', {}, false);
      }
      this.client = new Groq({ apiKey });
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
