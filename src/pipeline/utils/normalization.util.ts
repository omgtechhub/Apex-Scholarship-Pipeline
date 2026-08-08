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
 * Normalize a degree level string to a canonical enum value.
 */
export function normalizeDegreeLevel(value: string): string {
  const lower = value.toLowerCase().trim();
  if (lower.includes('undergraduate') || lower.includes('bachelor') || lower.includes('bsc') || lower.includes('ba ')) {
    return 'UNDERGRADUATE';
  }
  if (lower.includes('master') || lower.includes('msc') || lower.includes('ma ') || lower.includes('mba') || lower.includes('postgraduate')) {
    return 'MASTERS';
  }
  if (lower.includes('phd') || lower.includes('doctorate') || lower.includes('doctoral') || lower.includes('d.phil')) {
    return 'PHD';
  }
  if (lower.includes('postdoc') || lower.includes('post-doc') || lower.includes('postdoctoral')) {
    return 'POSTDOCTORAL';
  }
  if (lower.includes('short course') || lower.includes('certificate') || lower.includes('diploma')) {
    return 'SHORT_COURSE';
  }
  if (lower.includes('online')) {
    return 'ONLINE';
  }
  if (lower.includes('all') || lower.includes('any') || lower.includes('all levels')) {
    return 'ANY';
  }
  return 'UNKNOWN';
}

/**
 * Normalize funding type string to canonical enum value.
 */
export function normalizeFundingType(value: string): string {
  const lower = value.toLowerCase().trim();
  if (lower.includes('fully funded') || lower.includes('full scholarship') || lower.includes('full funding')) {
    return 'FULL';
  }
  if (lower.includes('partial') || lower.includes('partially funded')) {
    return 'PARTIAL';
  }
  if (lower.includes('tuition') && !lower.includes('living')) {
    return 'TUITION_ONLY';
  }
  if (lower.includes('living allowance') || lower.includes('stipend')) {
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
