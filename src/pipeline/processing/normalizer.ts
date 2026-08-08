import { createContentHash } from '../utils/hash.util';
import { toSlug, makeUniqueSlug, cleanWhitespace, stripHtml } from '../utils/string.util';
import { parseDate } from '../utils/date.util';
import { normalizeCountry, normalizeDegreeLevel, normalizeFundingType, normalizeStringArray } from '../utils/normalization.util';
import { normalizeUrl, canonicalUrl } from '../utils/url.util';
import type { ExtractedScholarship, NormalizedScholarship } from '../types';

export function normalizeScholarship(
  raw: ExtractedScholarship,
  sourceId: string
): NormalizedScholarship {
  // Title
  const title = cleanWhitespace(stripHtml(raw.title ?? '')).substring(0, 500);
  if (!title) throw new Error('Scholarship title is required');

  // Organization
  const organization = cleanWhitespace(stripHtml(raw.organization ?? 'Unknown')).substring(0, 200);

  // Description
  const description = cleanWhitespace(stripHtml(raw.description ?? '')).substring(0, 5000);

  // URLs
  const officialUrlNorm = normalizeUrl(raw.officialUrl ?? '');
  if (!officialUrlNorm) throw new Error(`Invalid official URL: ${raw.officialUrl}`);
  const officialUrl = canonicalUrl(officialUrlNorm);

  const applicationUrlNorm = raw.applicationUrl ? normalizeUrl(raw.applicationUrl) : null;
  const applicationUrl = applicationUrlNorm ? canonicalUrl(applicationUrlNorm) : null;

  // Dates
  const deadline = raw.deadline ? parseDate(raw.deadline) : null;
  const startDate = raw.startDate ? parseDate(raw.startDate) : null;

  // Country
  const country = raw.country ? normalizeCountry(cleanWhitespace(raw.country)) : null;

  // Eligible countries
  const eligibleCountries = normalizeStringArray(
    (raw.eligibleCountries ?? []).map((c) => normalizeCountry(c))
  );

  // Degree level
  const degreeLevel = normalizeDegreeLevel(raw.degreeLevel ?? '');

  // Fields of study
  const fieldsOfStudy = normalizeStringArray(raw.fieldsOfStudy ?? []);

  // Funding
  const fundingType = normalizeFundingType(raw.fundingType ?? '');
  const fundingAmount = typeof raw.fundingAmount === 'number' && !isNaN(raw.fundingAmount)
    ? raw.fundingAmount
    : null;
  const currency = raw.currency ? raw.currency.toUpperCase().trim() : null;

  // Arrays
  const benefits = normalizeStringArray(
    (raw.benefits ?? []).map((b) => cleanWhitespace(stripHtml(b)))
  );
  const requirements = normalizeStringArray(
    (raw.requirements ?? []).map((r) => cleanWhitespace(stripHtml(r)))
  );
  const documents = normalizeStringArray(
    (raw.documents ?? []).map((d) => cleanWhitespace(stripHtml(d)))
  );

  // Text fields
  const eligibility = cleanWhitespace(stripHtml(raw.eligibility ?? '')).substring(0, 2000);
  const applicationInstructions = cleanWhitespace(
    stripHtml(raw.applicationInstructions ?? '')
  ).substring(0, 2000);

  // Content hash
  const contentHash = createContentHash({
    title,
    officialUrl,
    deadline,
    description: description.substring(0, 500),
    organization,
  });

  // Slug
  const baseSlug = toSlug(`${title} ${organization}`);
  const slug = makeUniqueSlug(baseSlug);

  return {
    title,
    organization,
    description,
    officialUrl,
    applicationUrl,
    deadline,
    startDate,
    country,
    eligibleCountries,
    degreeLevel,
    fieldsOfStudy,
    fundingType,
    fundingAmount,
    currency,
    benefits,
    eligibility,
    requirements,
    documents,
    applicationInstructions,
    contentHash,
    sourceId,
    slug,
    raw: raw.raw,
  };
}
