import { describe, it, expect } from 'vitest';
import { normalizeScholarship } from '../pipeline/processing/normalizer';
import { validateScholarship } from '../pipeline/processing/validator';
import type { ExtractedScholarship } from '../pipeline/types';

describe('Pipeline Processing & Normalization', () => {
  it('should normalize raw scholarship data correctly', () => {
    const raw: ExtractedScholarship = {
      title: '  Global Excellence Scholarship 2026  ',
      organization: 'University of Oxford',
      description: 'A fully funded scholarship for international students.',
      officialUrl: 'https://example.com/scholarship',
      applicationUrl: 'https://example.com/apply',
      deadline: '2026-10-15',
      country: 'United Kingdom',
      eligibleCountries: ['Global'],
      degreeLevel: 'MASTERS',
      fieldsOfStudy: ['Computer Science'],
      fundingType: 'fully funded',
      fundingAmount: 25000,
      currency: 'GBP',
      benefits: ['Tuition waiver', 'Stipend'],
      eligibility: 'Bachelor degree with 1st class',
      requirements: ['CV', 'Statement of Purpose', '2 recommendation letters'],
      documents: ['CV', 'SOP'],
    };

    const normalized = normalizeScholarship(raw, 'source-123');
    expect(normalized.title).toBe('Global Excellence Scholarship 2026');
    expect(normalized.organization).toBe('University of Oxford');
    expect(normalized.fundingType).toBe('FULL');
    expect(normalized.currency).toBe('GBP');
  });

  it('should validate normalized scholarship correctly', () => {
    const normalizedValid = {
      title: 'Valid Scholarship',
      organization: 'Test Org',
      description: 'Test description with enough length to pass validation checks successfully.',
      officialUrl: 'https://example.com/scholarship',
      applicationUrl: 'https://example.com/apply',
      deadline: new Date('2026-10-15'),
      startDate: null,
      country: 'United Kingdom',
      eligibleCountries: ['United Kingdom'],
      degreeLevel: 'MASTERS' as const,
      fieldsOfStudy: ['Computer Science'],
      fundingType: 'FULL' as const,
      fundingAmount: 10000,
      currency: 'GBP',
      benefits: ['Tuition'],
      requirements: ['CV'],
      documents: ['CV'],
      eligibility: 'All students',
      applicationInstructions: 'Apply online',
      contentHash: 'hash123',
      slug: 'valid-scholarship',
      sourceId: 'source-123',
    };

    const validResult = validateScholarship(normalizedValid);
    expect(validResult.errors.length).toBe(0);

    const invalidNormalized = {
      ...normalizedValid,
      title: 'Ab',
      officialUrl: 'not-a-url',
      sourceId: '',
    };

    const invalidResult = validateScholarship(invalidNormalized);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });
});
