/**
 * Crawler Job Validators
 */

import { z } from 'zod';

export const createJobSchema = z.object({
  sourceId: z.string().uuid('Source ID must be a valid UUID'),
  options: z
    .object({
      forceRecrawl: z.boolean().optional().default(false),
      maxPages: z.number().int().min(1).max(1000).optional(),
      startUrl: z.string().url().optional(),
    })
    .optional(),
});

export const jobFilterSchema = z.object({
  sourceId: z.string().uuid().optional(),
  status: z
    .enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING', 'PAUSED'])
    .optional(),
  triggeredBy: z.enum(['SCHEDULER', 'MANUAL', 'API']).optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const queueJobFilterSchema = z.object({
  queueName: z.string().optional(),
  jobName: z.string().optional(),
  status: z
    .enum(['WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'PAUSED', 'DEAD_LETTERED'])
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const settingUpdateSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().max(500).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type JobFilterInput = z.infer<typeof jobFilterSchema>;
export type QueueJobFilterInput = z.infer<typeof queueJobFilterSchema>;
export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;
