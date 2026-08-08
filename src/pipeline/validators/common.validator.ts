/**
 * Common Validators
 *
 * Shared Zod schemas used across multiple API endpoints.
 */

import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export const searchSchema = z.object({
  q: z.string().min(1).max(200).optional(),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.from && data.to) return data.from <= data.to;
    return true;
  },
  { message: "'from' must be before 'to'", path: ['from'] },
);

export type PaginationInput = z.infer<typeof paginationSchema>;
export type UuidParamInput = z.infer<typeof uuidParamSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
