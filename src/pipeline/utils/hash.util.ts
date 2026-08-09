import { createHash } from 'crypto';

/**
 * Create a deterministic SHA-256 hash of an object.
 */
export function hashObject(obj: unknown): string {
  const normalized = JSON.stringify(obj, Object.keys(obj as object).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Hash a string.
 */
export function hashString(s: string): string {
  return createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
}

/**
 * Create a content hash from scholarship fields.
 */
export function createContentHash(data: {
  title: string;
  officialUrl: string;
  deadline?: Date | null;
  description?: string;
  organization?: string;
}): string {
  const content = [
    data.title.trim().toLowerCase(),
    data.officialUrl.trim().toLowerCase(),
    data.deadline?.toISOString() ?? '',
    (data.description ?? '').trim().toLowerCase().substring(0, 500),
    (data.organization ?? '').trim().toLowerCase(),
  ].join('|');
  return createHash('sha256').update(content).digest('hex');
}
