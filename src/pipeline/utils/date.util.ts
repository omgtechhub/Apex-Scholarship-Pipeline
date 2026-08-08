/**
 * Parse a date string into a Date object, returning null if invalid.
 * Handles common scholarship deadline formats.
 */
export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'string') return null;

  const s = value.trim();
  if (!s) return null;

  // ISO format
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  // Common patterns: "January 15, 2026", "15 Jan 2026", "15/01/2026"
  const patterns = [
    // "15 January 2026" or "January 15, 2026"
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
    // "15/01/2026" or "01/15/2026"
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // "2026-01-15"
    /(\d{4})-(\d{2})-(\d{2})/,
  ];

  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  const m1 = s.match(patterns[0]);
  if (m1) {
    const d = new Date(parseInt(m1[3]), months[m1[2].toLowerCase()], parseInt(m1[1]));
    if (!isNaN(d.getTime())) return d;
  }

  const m2 = s.match(patterns[1]);
  if (m2) {
    const d = new Date(parseInt(m2[3]), months[m2[1].toLowerCase()], parseInt(m2[2]));
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Check whether a deadline has passed.
 */
export function isDeadlinePassed(deadline: Date | null | undefined, graceMs = 0): boolean {
  if (!deadline) return false;
  return deadline.getTime() + graceMs < Date.now();
}

/**
 * Format a date for display.
 */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return 'Not specified';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Add days to a date.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
