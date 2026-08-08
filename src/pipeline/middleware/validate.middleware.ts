/**
 * Request Validation Middleware
 *
 * Validates request body, query params, and path params using Zod schemas.
 * Returns standardized 422 error responses on validation failure.
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { ZodSchema, z } from 'zod';
import { formatApiError } from '../utils/format.util';
import { formatZodIssues } from '../utils/validation.util';
import { getRequestId } from '../logger/request.logger';

// ---------------------------------------------------------------------------
// PARSE HELPERS
// ---------------------------------------------------------------------------

/**
 * Parse and validate the JSON request body against a Zod schema.
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  const requestId = getRequestId(req);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        formatApiError(
          'INVALID_JSON',
          'Request body must be valid JSON',
          undefined,
          requestId,
        ),
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = formatZodIssues(result.error);
    return {
      success: false,
      response: NextResponse.json(
        formatApiError(
          'VALIDATION_ERROR',
          `Validation failed with ${issues.length} error(s)`,
          { issues },
          requestId,
        ),
        { status: 422 },
      ),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Parse and validate URL search params against a Zod schema.
 */
export function parseQuery<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
): { success: true; data: T } | { success: false; response: NextResponse } {
  const requestId = getRequestId(req);

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(params);

  if (!result.success) {
    const issues = formatZodIssues(result.error);
    return {
      success: false,
      response: NextResponse.json(
        formatApiError(
          'VALIDATION_ERROR',
          `Query parameter validation failed with ${issues.length} error(s)`,
          { issues },
          requestId,
        ),
        { status: 422 },
      ),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Parse and validate path params against a Zod schema.
 */
export function parseParams<T>(
  params: Record<string, string>,
  schema: ZodSchema<T>,
  requestId?: string,
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(params);

  if (!result.success) {
    const issues = formatZodIssues(result.error);
    return {
      success: false,
      response: NextResponse.json(
        formatApiError(
          'INVALID_PARAMS',
          'Invalid path parameters',
          { issues },
          requestId,
        ),
        { status: 400 },
      ),
    };
  }

  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// TYPE UTILITIES
// ---------------------------------------------------------------------------

export type InferSchema<T extends ZodSchema> = z.infer<T>;
