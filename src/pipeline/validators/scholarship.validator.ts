/**
 * Scholarship Validators
 */

import { z } from 'zod';

export const scholarshipFilterSchema = z.object({
  status: z
    .enum(['ACTIVE', 'EXPIRED', 'DRAFT', 'UNDER_REVIEW', 'REJECTED', 'PUBLISHED', 'ARCHIVED'])
    .optional(),
  fundingType: z
    .enum([
      'FULL', 'PARTIAL', 'TUITION_ONLY', 'LIVING_ALLOWANCE_ONLY',
      'TRAVEL_ONLY', 'RESEARCH_GRANT', 'FELLOWSHIP', 'BURSARY', 'LOAN', 'UNKNOWN',
    ])
    .optional(),
  studyLevel: z
    .enum([
      'UNDERGRADUATE', 'POSTGRADUATE', 'MASTERS', 'PHD', 'POSTDOCTORAL',
      'SHORT_COURSE', 'PROFESSIONAL', 'VOCATIONAL', 'ANY', 'UNKNOWN',
    ])
    .optional(),
  sourceId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  hostCountryId: z.string().uuid().optional(),
  isDuplicate: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isOpenDeadline: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  deadlineAfter: z.coerce.date().optional(),
  deadlineBefore: z.coerce.date().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const updateScholarshipStatusSchema = z.object({
  status: z.enum([
    'ACTIVE', 'EXPIRED', 'DRAFT', 'UNDER_REVIEW', 'REJECTED', 'PUBLISHED', 'ARCHIVED',
  ]),
  reason: z.string().max(500).optional(),
});

export type ScholarshipFilterInput = z.infer<typeof scholarshipFilterSchema>;
export type UpdateScholarshipStatusInput = z.infer<typeof updateScholarshipStatusSchema>;
