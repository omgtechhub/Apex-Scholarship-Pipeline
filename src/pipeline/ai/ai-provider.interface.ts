export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AICompletionResult {
  content: string;
  tokensUsed: number;
  model: string;
  provider: string;
  finishReason?: string;
}

export interface AIProvider {
  readonly name: string;
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult>;
  isAvailable(): boolean;
}
