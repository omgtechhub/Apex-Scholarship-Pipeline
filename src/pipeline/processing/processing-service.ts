import prisma from '../database/prisma-client';
import { normalizeScholarship } from './normalizer';
import { validateScholarship } from './validator';
import { deduplicateScholarship } from './deduplicator';
import QueueManager from '../queue/queue-manager';
import { QUEUES, JOB_NAMES } from '../queue/queue-names';
import { createLogger } from '../logger/logger';
import { toSlug, makeUniqueSlug } from '../utils/string.util';
import type { ExtractedScholarship } from '../types';
import { DegreeLevel, FundingType, ScholarshipStatus } from '../../../generated/prisma';



const logger = createLogger('processing-service');

export interface ProcessingResult {
  scholarshipId?: string;
  status: 'created' | 'updated' | 'duplicate' | 'rejected' | 'invalid';
  validationErrors: string[];
  validationWarnings: string[];
  changedFields?: string[];
}

export async function processScholarship(
  raw: ExtractedScholarship,
  sourceId: string
): Promise<ProcessingResult> {
  // 1. Normalize
  let normalized;
  try {
    normalized = normalizeScholarship(raw, sourceId);
  } catch (err) {
    logger.warn({ err }, 'Normalization failed');
    return {
      status: 'invalid',
      validationErrors: [(err as Error).message],
      validationWarnings: [],
    };
  }

  // 2. Validate
  const validation = validateScholarship(normalized);
  if (!validation.valid) {
    logger.info({ errors: validation.errors }, 'Scholarship failed validation');
    return {
      status: 'invalid',
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
    };
  }

  // 3. Deduplicate
  const dedupe = await deduplicateScholarship(normalized);

  if (dedupe.status === 'DUPLICATE') {
    return {
      scholarshipId: dedupe.scholarshipId,
      status: 'duplicate',
      validationErrors: [],
      validationWarnings: validation.warnings,
    };
  }

  if (dedupe.status === 'REJECTED') {
    return {
      status: 'rejected',
      validationErrors: [],
      validationWarnings: validation.warnings,
    };
  }

  // Resolve or create organization
  const org = normalized.organization && normalized.organization !== 'Unknown'
    ? await prisma.organization.upsert({
        where: { name: normalized.organization },
        update: { updatedAt: new Date() },
        create: {
          name: normalized.organization,
          country: normalized.country ?? undefined,
        },
      })
    : null;

  if (dedupe.status === 'UPDATED' && dedupe.scholarshipId) {
    // 4a. Update existing scholarship
    const existingId = dedupe.scholarshipId;
    const existing = await prisma.scholarship.findUnique({ where: { id: existingId } });
    if (!existing) {
      return { status: 'invalid', validationErrors: ['Existing scholarship not found'], validationWarnings: [] };
    }

    // Capture before/after for version
    const before = JSON.parse(JSON.stringify(existing));

    const updated = await prisma.scholarship.update({
      where: { id: existingId },
      data: {
        title: normalized.title,
        description: normalized.description || undefined,
        officialUrl: normalized.officialUrl,
        applicationUrl: normalized.applicationUrl,
        deadline: normalized.deadline,
        startDate: normalized.startDate,
        country: normalized.country,
        eligibleCountries: normalized.eligibleCountries,
        degreeLevel: normalized.degreeLevel as DegreeLevel,
        fieldsOfStudy: normalized.fieldsOfStudy,
        fundingType: normalized.fundingType as FundingType,
        fundingAmount: normalized.fundingAmount,
        currency: normalized.currency,
        benefits: normalized.benefits,
        eligibility: normalized.eligibility || undefined,
        requirements: normalized.requirements,
        documents: normalized.documents,
        applicationInstructions: normalized.applicationInstructions || undefined,
        contentHash: normalized.contentHash,
        status: ScholarshipStatus.ACTIVE,
        organizationId: org?.id,
        raw: normalized.raw as object,
      },
    });

    // Create version record
    const versionCount = await prisma.scholarshipVersion.count({ where: { scholarshipId: existingId } });
    await prisma.scholarshipVersion.create({
      data: {
        scholarshipId: existingId,
        version: versionCount + 1,
        changedFields: dedupe.changedFields ?? [],
        before,
        after: JSON.parse(JSON.stringify(updated)),
      },
    });

    // Enqueue for article regeneration if content changed significantly
    await QueueManager.add(QUEUES.VALIDATION, JOB_NAMES.VALIDATE_SCHOLARSHIP, {
      scholarshipId: existingId,
    });

    logger.info({ id: existingId, changedFields: dedupe.changedFields }, 'Scholarship updated');
    return {
      scholarshipId: existingId,
      status: 'updated',
      validationErrors: [],
      validationWarnings: validation.warnings,
      changedFields: dedupe.changedFields,
    };
  }

  // 4b. Create new scholarship
  // Ensure unique slug
  let slug = toSlug(`${normalized.title} ${normalized.organization}`);
  const existing = await prisma.scholarship.findUnique({ where: { slug } });
  if (existing) slug = makeUniqueSlug(slug);

  const created = await prisma.scholarship.create({
    data: {
      sourceId,
      organizationId: org?.id,
      title: normalized.title,
      slug,
      description: normalized.description || undefined,
      officialUrl: normalized.officialUrl,
      applicationUrl: normalized.applicationUrl,
      deadline: normalized.deadline,
      startDate: normalized.startDate,
      country: normalized.country,
      eligibleCountries: normalized.eligibleCountries,
      degreeLevel: normalized.degreeLevel as DegreeLevel,
      fieldsOfStudy: normalized.fieldsOfStudy,
      fundingType: normalized.fundingType as FundingType,
      fundingAmount: normalized.fundingAmount,
      currency: normalized.currency,
      benefits: normalized.benefits,
      eligibility: normalized.eligibility || undefined,
      requirements: normalized.requirements,
      documents: normalized.documents,
      applicationInstructions: normalized.applicationInstructions || undefined,
      contentHash: normalized.contentHash,
      status: ScholarshipStatus.ACTIVE,
      raw: normalized.raw as object,
    },
  });

  // Enqueue for validation -> AI -> SEO -> quality -> publishing
  await QueueManager.add(QUEUES.VALIDATION, JOB_NAMES.VALIDATE_SCHOLARSHIP, {
    scholarshipId: created.id,
  });

  logger.info({ id: created.id, title: created.title }, 'Scholarship created');
  return {
    scholarshipId: created.id,
    status: 'created',
    validationErrors: [],
    validationWarnings: validation.warnings,
  };
}
