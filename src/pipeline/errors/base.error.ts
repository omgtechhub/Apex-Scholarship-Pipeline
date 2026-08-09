export class PipelineError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>,
    retryable = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.retryable = retryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class CrawlerError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>, retryable = true) {
    super(message, 'CRAWLER_ERROR', context, retryable);
  }
}

export class ValidationError extends PipelineError {
  public readonly fields: string[];

  constructor(message: string, fields: string[] = [], context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context, false);
    this.fields = fields;
  }
}

export class DeduplicationError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DEDUPLICATION_ERROR', context, true);
  }
}

export class AIError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>, retryable = true) {
    super(message, 'AI_ERROR', context, retryable);
  }
}

export class QualityError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QUALITY_ERROR', context, false);
  }
}

export class PublishingError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>, retryable = true) {
    super(message, 'PUBLISHING_ERROR', context, retryable);
  }
}

export class NotificationError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>, retryable = true) {
    super(message, 'NOTIFICATION_ERROR', context, retryable);
  }
}

export class AuthError extends PipelineError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', context, false);
  }
}

export class NotFoundError extends PipelineError {
  constructor(entity: string, id?: string) {
    super(
      id ? `${entity} with id '${id}' not found` : `${entity} not found`,
      'NOT_FOUND',
      { entity, id },
      false
    );
  }
}

export class SSRFError extends PipelineError {
  constructor(url: string) {
    super(`SSRF protection: blocked URL ${url}`, 'SSRF_BLOCKED', { url }, false);
  }
}
