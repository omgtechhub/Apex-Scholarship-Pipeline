/**
 * Normalize country name to a canonical form.
 */
export function normalizeCountry(value: string): string {
  const map: Record<string, string> = {
    'uk': 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'great britain': 'United Kingdom',
    'britain': 'United Kingdom',
    'england': 'United Kingdom',
    'us': 'United States',
    'usa': 'United States',
    'united states': 'United States',
    'united states of america': 'United States',
    'germany': 'Germany',
    'deutschland': 'Germany',
    'france': 'France',
    'australia': 'Australia',
    'canada': 'Canada',
    'china': 'China',
    'india': 'India',
    'japan': 'Japan',
    'nigeria': 'Nigeria',
    'kenya': 'Kenya',
    'ghana': 'Ghana',
    'south africa': 'South Africa',
  };
  const lower = value.toLowerCase().trim();
  return map[lower] ?? value.trim();
}

/**
 * Canonical values, so an already-canonical input survives normalisation.
 *
 * These two normalisers only ever understood prose. Every adapter, however,
 * emits the canonical enum value directly - the DAAD adapter sets
 * `fundingType: 'FULL'`, `degreeLevel: 'PHD'` - and the prose matchers then
 * threw most of those on the floor:
 *
 *   'FULL'             -> UNKNOWN   (no prose branch contains the word alone)
 *   'LIVING_ALLOWANCE' -> UNKNOWN   (branch looks for 'living allowance')
 *   'SHORT_COURSE'     -> UNKNOWN   (branch looks for 'short course')
 *   'POSTDOCTORAL'     -> PHD       ('postdoctoral'.includes('doctoral'))
 *
 * That single line is why all 27 live scholarships read `fundingType: UNKNOWN`
 * on the public site while the adapter that produced them had said FULL. The
 * value was never missing; it was discarded in transit.
 *
 * Matching the canonical form first also makes these functions idempotent,
 * which matters because normalised rows get re-normalised on every re-crawl.
 */
const DEGREE_LEVELS = [
  'UNDERGRADUATE',
  'MASTERS',
  'PHD',
  'POSTDOCTORAL',
  'SHORT_COURSE',
  'ONLINE',
  'ANY',
  'UNKNOWN',
] as const;

const FUNDING_TYPES = [
  'FULL',
  'PARTIAL',
  'TUITION_ONLY',
  'LIVING_ALLOWANCE',
  'TRAVEL',
  'UNKNOWN',
] as const;

/**
 * `short course` / `SHORT_COURSE` / `short-course` all reduce to the same key,
 * so a caller may pass either the enum or the human phrasing.
 */
function canonicalKey(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/**
 * Normalize a degree level string to a canonical enum value.
 */
export function normalizeDegreeLevel(value: string): string {
  const exact = canonicalKey(value);
  if ((DEGREE_LEVELS as readonly string[]).includes(exact)) return exact;

  const lower = value.toLowerCase().trim();

  /*
   * Postdoc is tested before PHD on purpose. 'postdoctoral' contains
   * 'doctoral', so the old ordering classified every postdoctoral award as a
   * PHD one - silently, and in the direction that matters most to an applicant.
   */
  if (/post[\s-]?doc/.test(lower)) {
    return 'POSTDOCTORAL';
  }
  /*
   * Word boundaries, not `includes`, for the short abbreviations.
   *
   * The old check tested `lower.includes('ba ')`, and 'mba programme' contains
   * 'ba ' - so every MBA award was classified as UNDERGRADUATE. The same trap
   * sits in 'ma ' ('diploma ') and 'bsc'. \b anchors each abbreviation so
   * 'mba' no longer satisfies the bachelor branch and falls through to the
   * master's one below.
   */
  if (/\b(undergraduate|bachelors?|bsc|b\.?a\.?)\b/.test(lower)) {
    return 'UNDERGRADUATE';
  }
  if (/\b(phd|ph\.d|doctorate|doctoral|d\.phil)\b/.test(lower)) {
    return 'PHD';
  }
  /*
   * 'Graduate' is deliberately absent here. DAAD uses "Graduates" for what the
   * rest of the world calls master's candidates, but plenty of sources use
   * "graduate" to mean any post-bachelor level, so inferring MASTERS from the
   * bare word guesses wrong often enough to matter. Adapters that know their
   * source's meaning map it themselves and pass the canonical value, which the
   * exact match above now preserves.
   */
  if (/\b(masters?|master's|msc|mba|m\.?a\.?|postgraduate)\b/.test(lower)) {
    return 'MASTERS';
  }
  if (lower.includes('short course') || lower.includes('certificate') || lower.includes('diploma')) {
    return 'SHORT_COURSE';
  }
  if (lower.includes('online')) {
    return 'ONLINE';
  }
  if (lower.includes('all level') || lower.includes('any level') || lower === 'all' || lower === 'any') {
    return 'ANY';
  }
  return 'UNKNOWN';
}

/**
 * Normalize funding type string to canonical enum value.
 */
export function normalizeFundingType(value: string): string {
  const exact = canonicalKey(value);
  if ((FUNDING_TYPES as readonly string[]).includes(exact)) return exact;

  const lower = value.toLowerCase().trim();
  if (lower.includes('fully funded') || lower.includes('full scholarship') || lower.includes('full funding') || lower.includes('full ride')) {
    return 'FULL';
  }
  if (lower.includes('partial')) {
    return 'PARTIAL';
  }
  if (lower.includes('tuition') && !lower.includes('living')) {
    return 'TUITION_ONLY';
  }
  if (lower.includes('living allowance') || lower.includes('stipend') || lower.includes('monthly allowance')) {
    return 'LIVING_ALLOWANCE';
  }
  if (lower.includes('travel') || lower.includes('flight')) {
    return 'TRAVEL';
  }
  return 'UNKNOWN';
}

/**
 * Parse a funding amount from text like "$50,000" or "€30,000".
 */
export function parseFundingAmount(value: string): { amount: number | null; currency: string | null } {
  const match = value.match(/([£$€¥₦₹]|USD|EUR|GBP|JPY|NGN|INR)?\s*([\d,]+(?:\.\d{2})?)/i);
  if (!match) return { amount: null, currency: null };

  const amount = parseFloat(match[2].replace(/,/g, ''));
  const currencySymbol = match[1];
  const currencyMap: Record<string, string> = {
    '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₦': 'NGN', '₹': 'INR',
    'USD': 'USD', 'EUR': 'EUR', 'GBP': 'GBP', 'JPY': 'JPY', 'NGN': 'NGN', 'INR': 'INR',
  };

  return {
    amount: isNaN(amount) ? null : amount,
    currency: currencySymbol ? currencyMap[currencySymbol] ?? currencySymbol : null,
  };
}

/**
 * Normalize an array of strings — trim, deduplicate, remove empties.
 */
export function normalizeStringArray(arr: unknown[]): string[] {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter((s) => typeof s === 'string' && s.trim()).map((s) => (s as string).trim()))];
}
