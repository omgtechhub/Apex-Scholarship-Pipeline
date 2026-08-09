import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }
    : {}),
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'secret',
      'apiKey',
      'GROQ_API_KEY',
      'JWT_SECRET',
    ],
    censor: '[REDACTED]',
  },
});

export function createLogger(name: string) {
  return logger.child({ module: name });
}

export default logger;

export const apiLogger = {
  info: (message: string, data?: Record<string, unknown>) => logger.info(data ?? {}, message),
  warn: (message: string, data?: Record<string, unknown>) => logger.warn(data ?? {}, message),
  error: (message: string, error?: unknown, data?: Record<string, unknown>) => logger.error({ ...(data ?? {}), error }, message),
};
export const authLogger = apiLogger;
export const dbLogger = apiLogger;
