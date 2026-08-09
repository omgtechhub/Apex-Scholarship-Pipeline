/**
 * Convert a string to a URL-safe slug.
 */
export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 */
export function truncate(s: string, maxLength: number): string {
  if (s.length <= maxLength) return s;
  return s.substring(0, maxLength - 3) + '...';
}

/**
 * Clean whitespace from a string.
 */
export function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Count words in a string.
 */
export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Estimate reading time in minutes.
 */
export function estimateReadingTime(s: string, wpm = 200): number {
  return Math.ceil(countWords(s) / wpm);
}

/**
 * Capitalize the first letter.
 */
export function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate a unique slug by appending a random suffix.
 */
export function makeUniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}
