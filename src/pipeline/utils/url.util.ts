import { SSRFError } from '../errors/base.error';

// Private/reserved IP ranges to block for SSRF protection
const BLOCKED_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^0\./,
  /^localhost$/i,
  /^metadata\.google\.internal$/i,
];

/**
 * Validate and normalize a URL.
 */
export function normalizeUrl(url: string, base?: string): string | null {
  try {
    const u = base ? new URL(url, base) : new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is valid (http/https only).
 */
export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/**
 * SSRF protection — throw if the URL resolves to a private/internal address.
 */
export function assertSafeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SSRFError(url);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SSRFError(url);
  }

  const hostname = parsed.hostname;
  for (const pattern of BLOCKED_RANGES) {
    if (pattern.test(hostname)) {
      throw new SSRFError(url);
    }
  }
}

/**
 * Get the canonical form of a URL (remove tracking params, etc.)
 */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(
      (p) => u.searchParams.delete(p)
    );
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

/**
 * Extract the domain from a URL.
 */
export function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
