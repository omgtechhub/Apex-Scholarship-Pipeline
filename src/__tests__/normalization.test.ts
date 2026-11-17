import { describe, it, expect } from 'vitest';
import {
  normalizeDegreeLevel,
  normalizeFundingType,
} from '../pipeline/utils/normalization.util';

/*
 * These normalisers sit between every adapter and the database, and they used
 * to understand only prose. Adapters emit canonical enum values, so most of
 * what they produced was silently replaced with UNKNOWN - which is how all 27
 * live scholarships came to read `fundingType: UNKNOWN` while the DAAD adapter
 * that produced them had explicitly said FULL.
 *
 * The canonical-value cases below are the regression guard. The prose cases
 * are here so that fixing the first did not break the second.
 */
describe('normalizeFundingType', () => {
  it('preserves the canonical values adapters actually emit', () => {
    for (const v of ['FULL', 'PARTIAL', 'TUITION_ONLY', 'LIVING_ALLOWANCE', 'TRAVEL', 'UNKNOWN']) {
      expect(normalizeFundingType(v)).toBe(v);
    }
  });

  it('is idempotent, because rows are re-normalised on every re-crawl', () => {
    for (const v of ['FULL', 'LIVING_ALLOWANCE', 'fully funded', 'stipend']) {
      const once = normalizeFundingType(v);
      expect(normalizeFundingType(once)).toBe(once);
    }
  });

  it('still reads prose from sources that do not use the enum', () => {
    expect(normalizeFundingType('Fully funded scholarship')).toBe('FULL');
    expect(normalizeFundingType('partially funded')).toBe('PARTIAL');
    expect(normalizeFundingType('Tuition fees only')).toBe('TUITION_ONLY');
    expect(normalizeFundingType('monthly stipend')).toBe('LIVING_ALLOWANCE');
    expect(normalizeFundingType('return flights')).toBe('TRAVEL');
  });

  it('accepts enum spelling variants', () => {
    expect(normalizeFundingType('tuition only')).toBe('TUITION_ONLY');
    expect(normalizeFundingType('living-allowance')).toBe('LIVING_ALLOWANCE');
    expect(normalizeFundingType('  full  ')).toBe('FULL');
  });

  it('falls back to UNKNOWN on genuinely unrecognisable input', () => {
    expect(normalizeFundingType('')).toBe('UNKNOWN');
    expect(normalizeFundingType('see website')).toBe('UNKNOWN');
  });
});

describe('normalizeDegreeLevel', () => {
  it('preserves the canonical values adapters actually emit', () => {
    for (const v of ['UNDERGRADUATE', 'MASTERS', 'PHD', 'POSTDOCTORAL', 'SHORT_COURSE', 'ONLINE', 'ANY', 'UNKNOWN']) {
      expect(normalizeDegreeLevel(v)).toBe(v);
    }
  });

  it('does not mistake postdoctoral for PHD', () => {
    // 'postdoctoral'.includes('doctoral') is true, so branch order decides this.
    expect(normalizeDegreeLevel('POSTDOCTORAL')).toBe('POSTDOCTORAL');
    expect(normalizeDegreeLevel('Postdoctoral researchers')).toBe('POSTDOCTORAL');
    expect(normalizeDegreeLevel('post-doc fellowship')).toBe('POSTDOCTORAL');
  });

  it('is idempotent, because rows are re-normalised on every re-crawl', () => {
    for (const v of ['POSTDOCTORAL', 'SHORT_COURSE', 'Doctoral candidates', 'bachelor degree']) {
      const once = normalizeDegreeLevel(v);
      expect(normalizeDegreeLevel(once)).toBe(once);
    }
  });

  it('still reads prose from sources that do not use the enum', () => {
    expect(normalizeDegreeLevel("bachelor's degree")).toBe('UNDERGRADUATE');
    expect(normalizeDegreeLevel('Doctoral candidates/PhD students')).toBe('PHD');
    expect(normalizeDegreeLevel('MBA programme')).toBe('MASTERS');
    expect(normalizeDegreeLevel('Short course')).toBe('SHORT_COURSE');
    expect(normalizeDegreeLevel('all levels')).toBe('ANY');
  });

  it('does not guess MASTERS from the bare word "graduate"', () => {
    // DAAD means master's by "Graduates"; other sources mean any post-bachelor
    // level. Adapters that know their source map it and pass the enum instead.
    expect(normalizeDegreeLevel('graduate')).toBe('UNKNOWN');
  });

  it('falls back to UNKNOWN on genuinely unrecognisable input', () => {
    expect(normalizeDegreeLevel('')).toBe('UNKNOWN');
    expect(normalizeDegreeLevel('open to everyone')).toBe('UNKNOWN');
  });
});

describe('normalizeDegreeLevel — abbreviation word boundaries', () => {
  /*
   * The original checks were naive substring tests, so short abbreviations
   * matched inside longer words: 'mba programme'.includes('ba ') is true, and
   * the bachelor branch ran first, labelling every MBA as UNDERGRADUATE.
   */
  it('does not read MBA as a bachelor degree', () => {
    expect(normalizeDegreeLevel('MBA programme')).toBe('MASTERS');
    expect(normalizeDegreeLevel('mba')).toBe('MASTERS');
  });

  it('does not read "diploma" as a master of arts', () => {
    expect(normalizeDegreeLevel('diploma course')).toBe('SHORT_COURSE');
  });

  it('still recognises the abbreviations standing alone', () => {
    expect(normalizeDegreeLevel('BA degree')).toBe('UNDERGRADUATE');
    expect(normalizeDegreeLevel('BSc Hons')).toBe('UNDERGRADUATE');
    expect(normalizeDegreeLevel('MSc in Engineering')).toBe('MASTERS');
  });
});
