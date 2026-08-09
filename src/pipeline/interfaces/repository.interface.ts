/**
 * Repository Interfaces
 *
 * Defines the contract for all data access repositories.
 * Implementations are decoupled from the database layer.
 */

import type { PaginationParams, PaginatedResult, UUID } from '../types';

// ---------------------------------------------------------------------------
// BASE REPOSITORY
// ---------------------------------------------------------------------------

export interface IRepository<T, TCreate, TUpdate> {
  findById(id: UUID): Promise<T | null>;
  findMany(params?: PaginationParams): Promise<PaginatedResult<T>>;
  create(data: TCreate): Promise<T>;
  update(id: UUID, data: TUpdate): Promise<T>;
  delete(id: UUID): Promise<void>;
  exists(id: UUID): Promise<boolean>;
  count(filter?: Record<string, unknown>): Promise<number>;
}

// ---------------------------------------------------------------------------
// FILTER TYPES
// ---------------------------------------------------------------------------

export interface ScholarshipFilter {
  status?: string | string[];
  fundingType?: string | string[];
  studyLevel?: string | string[];
  sourceId?: UUID;
  organizationId?: UUID;
  hostCountryId?: UUID;
  isDuplicate?: boolean;
  deadlineAfter?: Date;
  deadlineBefore?: Date;
  search?: string;
  isOpenDeadline?: boolean;
}

export interface CrawlerJobFilter {
  sourceId?: UUID;
  status?: string | string[];
  triggeredBy?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface CrawlerLogFilter {
  crawlerJobId?: UUID;
  level?: string | string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface UserFilter {
  role?: string | string[];
  isActive?: boolean;
  search?: string;
}

export interface ExecutionLogFilter {
  service?: string;
  operation?: string;
  status?: string;
  userId?: UUID;
  requestId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface QueueHistoryFilter {
  queueName?: string;
  jobName?: string;
  status?: string | string[];
  enqueuedAfter?: Date;
  enqueuedBefore?: Date;
}
