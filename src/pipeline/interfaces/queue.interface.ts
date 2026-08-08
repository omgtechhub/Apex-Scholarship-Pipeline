/**
 * Queue Interfaces
 *
 * Contracts for job queues, workers, and queue management.
 */

import type { UUID, QueueName } from '../types';

// ---------------------------------------------------------------------------
// QUEUE CLIENT CONTRACT
// ---------------------------------------------------------------------------

export interface IQueueClient {
  enqueue<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: EnqueueOptions,
  ): Promise<string>;

  enqueueBulk<T>(
    queueName: QueueName,
    jobs: Array<{ name: string; data: T; options?: EnqueueOptions }>,
  ): Promise<string[]>;

  getJob(queueName: QueueName, jobId: string): Promise<QueueJobInfo | null>;
  getQueueStats(queueName: QueueName): Promise<QueueStats>;
  pauseQueue(queueName: QueueName): Promise<void>;
  resumeQueue(queueName: QueueName): Promise<void>;
  drainQueue(queueName: QueueName): Promise<void>;
  retryJob(queueName: QueueName, jobId: string): Promise<void>;
  removeJob(queueName: QueueName, jobId: string): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// WORKER CONTRACT
// ---------------------------------------------------------------------------

export interface IWorker {
  readonly queueName: QueueName;
  readonly concurrency: number;

  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getStats(): WorkerStats;
}

// ---------------------------------------------------------------------------
// JOB OPTIONS
// ---------------------------------------------------------------------------

export interface EnqueueOptions {
  priority?: number;        // Higher = processed first
  delay?: number;           // ms to delay processing
  attempts?: number;        // Max retry attempts
  backoff?: BackoffOptions;
  jobId?: string;           // Custom job ID (for deduplication)
  removeOnComplete?: boolean | { count?: number; age?: number };
  removeOnFail?: boolean | { count?: number };
  timeout?: number;         // ms before job times out
}

export interface BackoffOptions {
  type: 'exponential' | 'fixed';
  delay: number;
}

// ---------------------------------------------------------------------------
// JOB INFO & STATS
// ---------------------------------------------------------------------------

export interface QueueJobInfo {
  id: string;
  name: string;
  data: unknown;
  status: string;
  progress: number;
  attempts: number;
  maxAttempts: number;
  priority: number;
  enqueuedAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
  failedReason?: string;
  stacktrace?: string[];
  returnValue?: unknown;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  isPaused: boolean;
}

export interface WorkerStats {
  queueName: string;
  concurrency: number;
  isRunning: boolean;
  processedCount: number;
  failedCount: number;
  completedCount: number;
  lastProcessedAt?: Date;
}

// ---------------------------------------------------------------------------
// JOB PROCESSOR FUNCTION TYPE
// ---------------------------------------------------------------------------

export type JobProcessor<T = unknown, R = unknown> = (
  data: T,
  jobId: string,
  attempt: number,
) => Promise<R>;

// ---------------------------------------------------------------------------
// DEAD LETTER QUEUE ENTRY
// ---------------------------------------------------------------------------

export interface DeadLetterEntry {
  originalQueue: QueueName;
  jobId: string;
  jobName: string;
  data: unknown;
  failedReason: string;
  attempts: number;
  failedAt: Date;
  jobId_original?: string;
}

// ---------------------------------------------------------------------------
// SCHEDULER ENTRY
// ---------------------------------------------------------------------------

export interface ScheduledJob {
  id: string;
  name: string;
  cron: string;
  queueName: QueueName;
  jobName: string;
  data: unknown;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount: number;
  failCount: number;
}

export interface IScheduler {
  registerJob(job: Omit<ScheduledJob, 'runCount' | 'failCount'>): void;
  unregisterJob(id: string): void;
  enableJob(id: string): void;
  disableJob(id: string): void;
  getJob(id: string): ScheduledJob | null;
  getAllJobs(): ScheduledJob[];
  start(): void;
  stop(): void;
}
