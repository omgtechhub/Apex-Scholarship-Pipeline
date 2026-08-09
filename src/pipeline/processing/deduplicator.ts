import prisma from '../database/prisma-client';
import { scholarshipSimilarity } from '../utils/similarity.util';
import { createLogger } from '../logger/logger';
import type { NormalizedScholarship, DeduplicationResult } from '../types';
import { ScholarshipStatus } from '../../../generated/prisma';

const logger = createLogger('deduplicator');

const SIMILARITY_THRESHOLD = 0.85;
const DUPLICATE_THRESHOLD = 0.95;

/**
 * The set of fields we compare when checking for updates.
 */
const TRACKED_FIELDS = [
  'title', 'description', 'officialUrl', 'applicationUrl', 'deadline',
  'startDate', 'country', 'eligibleCountries', 'degreeLevel', 'fieldsOfStudy',
  'fundingType', 'fundingAmount', 'currency', 'benefits', 'eligibility',
  'requirements', 'documents', 'applicationInstructions', 'contentHash', 'status',
] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

export async function deduplicateScholarship(
  scholarship: NormalizedScholarship
): Promise<DeduplicationResult & { existingId?: string; changedFields?: string[] }> {
  // 1. Exact URL match
  const urlMatch = await prisma.scholarship.findFirst({
    where: {
      OR: [
        { officialUrl: scholarship.officialUrl },
        scholarship.applicationUrl
          ? { applicationUrl: scholarship.applicationUrl }
          : {},
      ],
      status: { not: ScholarshipStatus.REJECTED },
    },
  });

  if (urlMatch) {
    const changedFields = detectChangedFields(urlMatch, scholarship);
    if (changedFields.length > 0) {
      logger.info({ id: urlMatch.id, changedFields }, 'Scholarship updated (URL match)');
      return { status: 'UPDATED', scholarshipId: urlMatch.id, changedFields, matchedFields: ['officialUrl'] };
    }
    logger.debug({ id: urlMatch.id }, 'Exact duplicate (URL match)');
    return { status: 'DUPLICATE', scholarshipId: urlMatch.id, similarity: 1.0, matchedFields: ['officialUrl'] };
  }

  // 2. Content hash match
  const hashMatch = await prisma.scholarship.findFirst({
    where: {
      contentHash: scholarship.contentHash,
      status: { not: ScholarshipStatus.REJECTED },
    },
  });

  if (hashMatch) {
    logger.debug({ id: hashMatch.id }, 'Exact duplicate (content hash)');
    return { status: 'DUPLICATE', scholarshipId: hashMatch.id, similarity: 1.0, matchedFields: ['contentHash'] };
  }

  // 3. Candidate query — similar title + same source or organization
  const candidates = await prisma.scholarship.findMany({
    where: {
      sourceId: scholarship.sourceId,
      status: { not: ScholarshipStatus.REJECTED },
    },
    select: {
      id: true,
      title: true,
      organization: { select: { name: true } },
      officialUrl: true,
      deadline: true,
      contentHash: true,
    },
    take: 100,
    orderBy: { updatedAt: 'desc' },
  });

  // Also search across sources for high-similarity matches
  const crossSourceCandidates = await prisma.scholarship.findMany({
    where: {
      status: { not: ScholarshipStatus.REJECTED },
      OR: [
        { title: { contains: scholarship.title.split(' ').slice(0, 3).join(' '), mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      title: true,
      organization: { select: { name: true } },
      officialUrl: true,
      deadline: true,
      contentHash: true,
    },
    take: 50,
  });

  const allCandidates = [...candidates, ...crossSourceCandidates];
  const seen = new Set<string>();
  const uniqueCandidates = allCandidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  let bestMatch: { id: string; similarity: number } | null = null;

  for (const candidate of uniqueCandidates) {
    const sim = scholarshipSimilarity(
      {
        title: scholarship.title,
        organization: scholarship.organization,
        officialUrl: scholarship.officialUrl,
        deadline: scholarship.deadline,
      },
      {
        title: candidate.title,
        organization: candidate.organization?.name,
        officialUrl: candidate.officialUrl,
        deadline: candidate.deadline,
      }
    );

    if (sim > DUPLICATE_THRESHOLD) {
      const full = await prisma.scholarship.findUnique({ where: { id: candidate.id } });
      if (full) {
        const changedFields = detectChangedFields(full, scholarship);
        if (changedFields.length > 0) {
          return { status: 'UPDATED', scholarshipId: candidate.id, similarity: sim, changedFields, matchedFields: ['similarity'] };
        }
        return { status: 'DUPLICATE', scholarshipId: candidate.id, similarity: sim, matchedFields: ['similarity'] };
      }
    }

    if (sim > SIMILARITY_THRESHOLD && (!bestMatch || sim > bestMatch.similarity)) {
      bestMatch = { id: candidate.id, similarity: sim };
    }
  }

  if (bestMatch) {
    logger.info({ similarity: bestMatch.similarity }, 'Possible duplicate detected (similarity)');
    // Still NEW but with a note
    return { status: 'NEW', similarity: bestMatch.similarity };
  }

  return { status: 'NEW' };
}

function detectChangedFields(
  existing: Record<string, unknown>,
  incoming: NormalizedScholarship
): string[] {
  const changed: string[] = [];

  for (const field of TRACKED_FIELDS) {
    const existingVal = serializeField(existing[field]);
    const incomingVal = serializeField(incoming[field as keyof NormalizedScholarship]);
    if (existingVal !== incomingVal) {
      changed.push(field);
    }
  }

  return changed;
}

function serializeField(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return JSON.stringify([...val].sort());
  return String(val);
}
