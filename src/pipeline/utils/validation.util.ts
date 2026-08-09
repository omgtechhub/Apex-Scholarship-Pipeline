/**
 * Validation Utilities
 *
 * Common validation helpers used across services and middleware.
 */

import { z, type ZodSchema, type ZodError } from 'zod';
import type { ValidationIssue } from '../types';

// ---------------------------------------------------------------------------
// ZOD HELPERS
// ---------------------------------------------------------------------------

/**
 * Safely parse a Zod schema, returning typed result or null + issues.
 */
export function safeParse<T>(
  schema: ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; issues: ValidationIssue[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    issues: formatZodIssues(result.error),
  };
}

/**
 * Format Zod validation errors into standard ValidationIssue format.
 */
export function formatZodIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    code: issue.code,
    message: issue.message,
    severity: 'error' as const,
  }));
}

// ---------------------------------------------------------------------------
// FIELD VALIDATORS
// ---------------------------------------------------------------------------

/**
 * Validate an email address.
 */
export function isValidEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

/**
 * Validate a URL.
 */
export function isValidUrl(url: string): boolean {
  return z.string().url().safeParse(url).success;
}

/**
 * Validate a UUID.
 */
export function isValidUuid(id: string): boolean {
  return z.string().uuid().safeParse(id).success;
}

/**
 * Validate a cron expression (basic validation).
 */
export function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const patterns = [
    /^(\*|[0-5]?\d(-[0-5]?\d)?(,[0-5]?\d(-[0-5]?\d)?)*|\*\/\d+)$/, // minute
    /^(\*|([01]?\d|2[0-3])(-([01]?\d|2[0-3]))?(,([01]?\d|2[0-3])(-([01]?\d|2[0-3]))?)*|\*\/\d+)$/, // hour
    /^(\*|([1-9]|[12]\d|3[01])(-([1-9]|[12]\d|3[01]))?(,([1-9]|[12]\d|3[01])(-([1-9]|[12]\d|3[01]))?)*|\*\/\d+)$/, // day of month
    /^(\*|([1-9]|1[0-2])(-([1-9]|1[0-2]))?(,([1-9]|1[0-2])(-([1-9]|1[0-2]))?)*|\*\/\d+)$/, // month
    /^(\*|[0-6](-[0-6])?(,[0-6](-[0-6])?)*|\*\/\d+)$/, // day of week
  ];

  return parts.every((part, i) => patterns[i].test(part));
}

/**
 * Validate a password against requirements.
 */
export function validatePassword(
  password: string,
  options: {
    minLength?: number;
    requireUppercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
  } = {},
): { valid: boolean; issues: string[] } {
  const {
    minLength = 8,
    requireUppercase = true,
    requireNumbers = true,
    requireSpecialChars = false,
  } = options;

  const issues: string[] = [];

  if (password.length < minLength) {
    issues.push(`Password must be at least ${minLength} characters`);
  }
  if (requireUppercase && !/[A-Z]/.test(password)) {
    issues.push('Password must contain at least one uppercase letter');
  }
  if (requireNumbers && !/[0-9]/.test(password)) {
    issues.push('Password must contain at least one number');
  }
  if (requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    issues.push('Password must contain at least one special character');
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Validate an ISO country code (2-letter).
 */
export function isValidIsoCode2(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}

/**
 * Sanitize a string to prevent XSS.
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Common Zod schemas for reuse.
 */
export const commonSchemas = {
  uuid: z.string().uuid(),
  email: z.string().email().toLowerCase(),
  url: z.string().url(),
  nonEmptyString: z.string().min(1).trim(),
  positiveInt: z.number().int().positive(),
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
};
