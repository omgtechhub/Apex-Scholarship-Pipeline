import stringSimilarity from 'string-similarity';

/**
 * Calculate similarity between two strings (0-1).
 */
export function stringSim(a: string, b: string): number {
  if (!a || !b) return 0;
  return stringSimilarity.compareTwoStrings(
    a.toLowerCase().trim(),
    b.toLowerCase().trim()
  );
}

/**
 * Calculate overall similarity between two scholarships based on multiple fields.
 */
export function scholarshipSimilarity(
  a: {
    title: string;
    organization?: string | null;
    officialUrl: string;
    deadline?: Date | null;
  },
  b: {
    title: string;
    organization?: string | null;
    officialUrl: string;
    deadline?: Date | null;
  }
): number {
  const weights = {
    title: 0.35,
    organization: 0.25,
    url: 0.25,
    deadline: 0.15,
  };

  const titleSim = stringSim(a.title, b.title);
  const orgSim = stringSim(a.organization ?? '', b.organization ?? '');
  const urlSim = urlSimilarity(a.officialUrl, b.officialUrl);
  const deadlineSim = dateSimilarity(a.deadline, b.deadline);

  return (
    titleSim * weights.title +
    orgSim * weights.organization +
    urlSim * weights.url +
    deadlineSim * weights.deadline
  );
}

function urlSimilarity(a: string, b: string): number {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (ua.hostname === ub.hostname && ua.pathname === ub.pathname) return 1.0;
    if (ua.hostname === ub.hostname) return 0.7;
    return stringSim(a, b);
  } catch {
    return stringSim(a, b);
  }
}

function dateSimilarity(a: Date | null | undefined, b: Date | null | undefined): number {
  if (!a && !b) return 0.5; // Both null — neutral
  if (!a || !b) return 0.0; // One has deadline, other doesn't
  const diffMs = Math.abs(a.getTime() - b.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays === 0) return 1.0;
  if (diffDays <= 7) return 0.8;
  if (diffDays <= 30) return 0.5;
  return 0.0;
}
