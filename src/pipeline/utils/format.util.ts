/**
 * Format Utilities
 *
 * Formatting for numbers, bytes, durations, and currency amounts.
 */

// ---------------------------------------------------------------------------
// NUMBERS
// ---------------------------------------------------------------------------

/**
 * Format a number with thousands separators.
 */
export function formatNumber(n: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(n);
}

/**
 * Format a currency amount.
 */
export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// BYTES
// ---------------------------------------------------------------------------

/**
 * Format bytes to a human-readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
  );
}

// ---------------------------------------------------------------------------
// DURATION
// ---------------------------------------------------------------------------

/**
 * Format milliseconds to a human-readable duration string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format a duration in a short form (e.g., "1h 30m").
 */
export function formatDurationShort(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}m` : ''}`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// PERCENTAGES
// ---------------------------------------------------------------------------

/**
 * Format a decimal (0-1) as a percentage string.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// ---------------------------------------------------------------------------
// API RESPONSE HELPERS
// ---------------------------------------------------------------------------

/**
 * Format a standardized API response envelope.
 */
export function formatApiResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
): {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
} {
  return {
    success: true,
    data,
    ...(meta && { meta }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format a standardized API error response.
 */
export function formatApiError(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string,
): {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  requestId?: string;
} {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
  };
}

/**
 * Format a paginated response with metadata.
 */
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  extra?: Record<string, unknown>,
): {
  success: true;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    [key: string]: unknown;
  };
  timestamp: string;
} {
  const totalPages = Math.ceil(total / limit);
  return {
    success: true,
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      ...extra,
    },
    timestamp: new Date().toISOString(),
  };
}
