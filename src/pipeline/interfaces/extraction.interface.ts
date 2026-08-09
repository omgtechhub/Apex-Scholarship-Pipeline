/**
 * Extraction & Processing Pipeline Interfaces
 *
 * Contracts for the extraction, normalization, cleaning, and validation steps.
 */

import type {
  RawScholarshipData,
  NormalizedScholarshipData,
  ValidationResult,
  DuplicateCheckResult,
  UUID,
} from '../types';

// ---------------------------------------------------------------------------
// EXTRACTOR
// ---------------------------------------------------------------------------

export interface IExtractor {
  extract(html: string, url: string, sourceId: UUID): Promise<RawScholarshipData>;
  extractMultiple(
    pages: Array<{ html: string; url: string }>,
    sourceId: UUID,
  ): Promise<RawScholarshipData[]>;
}

// ---------------------------------------------------------------------------
// NORMALIZER
// ---------------------------------------------------------------------------

export interface INormalizer {
  normalize(raw: RawScholarshipData): NormalizedScholarshipData;
  normalizeDate(dateStr: string | undefined): Date | undefined;
  normalizeCountry(country: string): string;
  normalizeFundingType(str: string | undefined): string;
  normalizeStudyLevel(str: string | undefined): string;
  normalizeCurrency(str: string | undefined): string;
  normalizeUrl(url: string | undefined, baseUrl?: string): string | undefined;
}

// ---------------------------------------------------------------------------
// CLEANER
// ---------------------------------------------------------------------------

export interface ICleaner {
  clean(raw: RawScholarshipData): RawScholarshipData;
  cleanString(str: string | undefined): string | undefined;
  cleanHtml(html: string): string;
  cleanUrl(url: string | undefined): string | undefined;
  cleanArray(arr: unknown): string[];
}

// ---------------------------------------------------------------------------
// SCHOLARSHIP VALIDATOR
// ---------------------------------------------------------------------------

export interface IScholarshipValidator {
  validate(data: NormalizedScholarshipData): ValidationResult;
  validateUrl(url: string): Promise<{ reachable: boolean; statusCode?: number }>;
  checkCompleteness(data: NormalizedScholarshipData): number; // 0-100 score
}

// ---------------------------------------------------------------------------
// DUPLICATE DETECTOR
// ---------------------------------------------------------------------------

export interface IDuplicateDetector {
  check(
    data: NormalizedScholarshipData,
    existingScholarshipId?: UUID,
  ): Promise<DuplicateCheckResult>;

  checkByUrl(url: string): Promise<DuplicateCheckResult>;
  checkBySimilarity(data: NormalizedScholarshipData): Promise<DuplicateCheckResult>;
  computeContentHash(data: NormalizedScholarshipData): string;
  computeUrlHash(url: string): string;
}

// ---------------------------------------------------------------------------
// PROCESSING PIPELINE
// ---------------------------------------------------------------------------

export interface IProcessingPipeline {
  process(
    raw: RawScholarshipData,
    context: ProcessingContext,
  ): Promise<ProcessingResult>;
}

export interface ProcessingContext {
  sourceId: UUID;
  crawlerJobId: UUID;
  adapterClass: string;
  existingScholarshipId?: UUID;
}

export interface ProcessingResult {
  success: boolean;
  scholarshipId?: UUID;
  action: 'created' | 'updated' | 'skipped' | 'rejected';
  normalized?: NormalizedScholarshipData;
  validation?: ValidationResult;
  duplicate?: DuplicateCheckResult;
  error?: string;
  durationMs: number;
}
