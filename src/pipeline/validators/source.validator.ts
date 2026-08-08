/**
 * Scholarship Source Validators
 */

import { z } from 'zod';

export const createSourceSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(200),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  baseUrl: z.string().url('Base URL must be a valid URL'),
  crawlUrl: z.string().url('Crawl URL must be a valid URL'),
  adapterClass: z.string().min(1, 'Adapter class is required'),
  crawlFrequency: z
    .string()
    .min(1, 'Crawl frequency (cron expression) is required'),
  organizationId: z.string().uuid().optional(),
  rateLimitDelay: z.number().int().min(0).optional().default(2000),
  maxRetries: z.number().int().min(0).max(10).optional().default(3),
  timeoutMs: z.number().int().min(1000).optional().default(30000),
  requiresProxy: z.boolean().optional().default(false),
  requiresJs: z.boolean().optional().default(true),
  customHeaders: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateSourceSchema = createSourceSchema.partial().omit({
  slug: true,
});

export const sourceFilterSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ERROR', 'RATE_LIMITED', 'BLOCKED']).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
export type SourceFilterInput = z.infer<typeof sourceFilterSchema>;
