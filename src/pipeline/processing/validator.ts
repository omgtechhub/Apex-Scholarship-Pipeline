import { isValidUrl } from '../utils/url.util';
import type { NormalizedScholarship, ValidationResult } from '../types';

const VALID_DEGREE_LEVELS = [
  'UNDERGRADUATE', 'MASTERS', 'PHD', 'POSTDOCTORAL', 'SHORT_COURSE', 'ONLINE', 'ANY', 'UNKNOWN',
];

const VALID_FUNDING_TYPES = [
  'FULL', 'PARTIAL', 'TUITION_ONLY', 'LIVING_ALLOWANCE', 'TRAVEL', 'UNKNOWN',
];

export function validateScholarship(scholarship: NormalizedScholarship): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Critical validations ──────────────────────────────────────────────────

  // Title
  if (!scholarship.title || scholarship.title.trim().length < 3) {
    errors.push('Title is missing or too short (minimum 3 characters)');
  } else if (scholarship.title.length > 500) {
    errors.push('Title exceeds maximum length of 500 characters');
  }

  // Official URL
  if (!scholarship.officialUrl) {
    errors.push('Official URL is required');
  } else if (!isValidUrl(scholarship.officialUrl)) {
    errors.push(`Invalid official URL: ${scholarship.officialUrl}`);
  }

  // Application URL (if provided)
  if (scholarship.applicationUrl && !isValidUrl(scholarship.applicationUrl)) {
    errors.push(`Invalid application URL: ${scholarship.applicationUrl}`);
  }

  // Source attribution
  if (!scholarship.sourceId) {
    errors.push('Source attribution (sourceId) is required');
  }

  // ── Date validations ───────────────────────────────────────────────────────

  if (scholarship.deadline) {
    if (!(scholarship.deadline instanceof Date) || isNaN(scholarship.deadline.getTime())) {
      errors.push('Deadline is not a valid date');
    } else {
      const year = scholarship.deadline.getFullYear();
      if (year < 2020 || year > 2040) {
        errors.push(`Deadline year ${year} is outside acceptable range (2020–2040)`);
      }
    }
  }

  if (scholarship.startDate) {
    if (!(scholarship.startDate instanceof Date) || isNaN(scholarship.startDate.getTime())) {
      errors.push('Start date is not a valid date');
    } else if (scholarship.deadline && scholarship.startDate > scholarship.deadline) {
      warnings.push('Start date is after deadline — this may be incorrect');
    }
  }

  // ── Enum validations ───────────────────────────────────────────────────────

  if (scholarship.degreeLevel && !VALID_DEGREE_LEVELS.includes(scholarship.degreeLevel)) {
    errors.push(`Invalid degree level: ${scholarship.degreeLevel}`);
  }

  if (scholarship.fundingType && !VALID_FUNDING_TYPES.includes(scholarship.fundingType)) {
    errors.push(`Invalid funding type: ${scholarship.fundingType}`);
  }

  // ── Funding amount ─────────────────────────────────────────────────────────

  if (scholarship.fundingAmount !== null && scholarship.fundingAmount !== undefined) {
    if (typeof scholarship.fundingAmount !== 'number' || isNaN(scholarship.fundingAmount)) {
      errors.push('Funding amount must be a valid number');
    } else if (scholarship.fundingAmount < 0) {
      errors.push('Funding amount cannot be negative');
    } else if (scholarship.fundingAmount > 10_000_000) {
      warnings.push(`Funding amount ${scholarship.fundingAmount} seems unusually high`);
    }
  }

  // ── Warnings ───────────────────────────────────────────────────────────────

  if (!scholarship.description || scholarship.description.length < 20) {
    warnings.push('Description is missing or very short');
  }

  if (!scholarship.deadline) {
    warnings.push('Deadline is not specified');
  }

  if (!scholarship.country && scholarship.eligibleCountries.length === 0) {
    warnings.push('No country information provided');
  }

  if (scholarship.degreeLevel === 'UNKNOWN') {
    warnings.push('Degree level could not be determined');
  }

  if (scholarship.fundingType === 'UNKNOWN') {
    warnings.push('Funding type could not be determined');
  }

  if (!scholarship.organization || scholarship.organization === 'Unknown') {
    warnings.push('Organization is not specified');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
