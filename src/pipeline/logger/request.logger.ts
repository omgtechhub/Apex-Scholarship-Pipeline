/**
 * Request Logger Middleware
 *
 * Logs incoming API requests and outgoing responses with timing,
 * request ID injection, and structured metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { apiLogger } from './logger';

export interface RequestLogData {
  requestId: string;
  method: string;
  path: string;
  userAgent?: string;
  ip?: string;
  statusCode?: number;
  durationMs?: number;
  contentLength?: number;
}

/**
 * Extract client IP from Next.js request headers.
 */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Next.js App Router request logging wrapper.
 * Wraps route handlers to inject request ID and log requests/responses.
 */
export function withRequestLogging<T extends unknown[]>(
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>,
): (req: NextRequest, ...args: T) => Promise<NextResponse> {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    const requestId = uuidv4();
    const startTime = Date.now();

    const logData: RequestLogData = {
      requestId,
      method: req.method,
      path: req.nextUrl.pathname,
      userAgent: req.headers.get('user-agent') ?? undefined,
      ip: getClientIp(req),
    };

    apiLogger.info('Incoming request', logData as unknown as Record<string, unknown>);

    try {
      // Inject requestId into request headers so handlers can access it
      const modifiedReq = new NextRequest(req, {
        headers: {
          ...Object.fromEntries(req.headers.entries()),
          'x-request-id': requestId,
        },
      });

      const response = await handler(modifiedReq, ...args);

      const durationMs = Date.now() - startTime;

      apiLogger.info('Request completed', {
        ...logData,
        statusCode: response.status,
        durationMs,
        contentLength: parseInt(
          response.headers.get('content-length') ?? '0',
          10,
        ),
      } as Record<string, unknown>);

      // Add request ID to response headers
      response.headers.set('x-request-id', requestId);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      apiLogger.error('Request failed', error, {
        ...logData,
        durationMs,
      });

      throw error;
    }
  };
}

/**
 * Extract request ID from Next.js request headers.
 */
export function getRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id') ?? uuidv4();
}
