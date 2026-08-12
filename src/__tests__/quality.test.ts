import { describe, it, expect } from 'vitest';
import { qualityService } from '../pipeline/quality/quality-service';

describe('Factual Quality Control', () => {
  it('should pass an article matching canonical scholarship data', async () => {
    const deadline = new Date('2026-10-15');
    const result = await qualityService.check({
      article: {
        title: 'Global Excellence Scholarship 2026 at University of Oxford',
        content: `The Global Excellence Scholarship 2026 is offered by University of Oxford for international students pursuing MASTERS studies in United Kingdom. The application deadline is October 15, 2026. This fully funded scholarship provides financial support including tuition waiver and stipend. Apply through https://example.com/apply. Official URL: https://example.com/scholarship. Eligibility: Bachelor degree with 1st class. Requirements: CV, Statement of Purpose, 2 recommendation letters. ` + 'Word '.repeat(400),
        wordCount: 450,
      },
      scholarship: {
        title: 'Global Excellence Scholarship 2026',
        organization: 'University of Oxford',
        officialUrl: 'https://example.com/scholarship',
        applicationUrl: 'https://example.com/apply',
        deadline,
        country: 'United Kingdom',
        eligibleCountries: ['Global'],
        degreeLevel: 'MASTERS',
        fieldsOfStudy: ['Computer Science'],
        fundingType: 'FULL',
        fundingAmount: 25000,
        currency: 'GBP',
        benefits: ['Tuition waiver', 'Stipend'],
        eligibility: 'Bachelor degree with 1st class',
        requirements: ['CV', 'Statement of Purpose', '2 recommendation letters'],
        documents: ['CV', 'SOP'],
      },
    });

    expect(result.status).toBe('PASS');
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.factualMismatches.length).toBe(0);
  });

  it('should reject or review an article with factual deadline contradictions', async () => {
    const canonicalDeadline = new Date('2026-10-15');
    const result = await qualityService.check({
      article: {
        title: 'Global Excellence Scholarship 2026',
        content: `The Global Excellence Scholarship 2026 deadline is December 1, 2026. Offered by University of Oxford. Apply at https://example.com/apply. ` + 'Word '.repeat(400),
        wordCount: 420,
      },
      scholarship: {
        title: 'Global Excellence Scholarship 2026',
        organization: 'University of Oxford',
        officialUrl: 'https://example.com/scholarship',
        applicationUrl: 'https://example.com/apply',
        deadline: canonicalDeadline,
        country: 'United Kingdom',
        eligibleCountries: ['Global'],
        degreeLevel: 'MASTERS',
        fieldsOfStudy: ['Computer Science'],
        fundingType: 'FULL',
        fundingAmount: 25000,
        currency: 'GBP',
        benefits: [],
        eligibility: '',
        requirements: [],
        documents: [],
      },
    });

    expect(result.status).not.toBe('PASS');
    expect(result.factualMismatches.length).toBeGreaterThan(0);
  });
});
