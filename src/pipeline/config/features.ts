/**
 * Feature Flag Service
 *
 * Runtime feature flag evaluation. Flags can be read from environment,
 * database (SystemSetting), or overridden programmatically.
 * Future AI/SEO/Publishing modules check these before activating.
 */

import { getEnv } from './env';

export interface FeatureFlags {
  // Core processing
  DUPLICATE_DETECTION: boolean;
  URL_VALIDATION: boolean;

  // Automation
  AUTO_PUBLISH: boolean;
  NOTIFICATIONS: boolean;

  // Future modules (extension points — do NOT enable yet)
  AI_WRITER: boolean;
  SEO_GENERATOR: boolean;
  ANALYTICS: boolean;

  // Future modules not yet designed
  AI_QUALITY_VALIDATION: boolean;
  PUBLISHING_WORKFLOW: boolean;
  MONITORING_DASHBOARD: boolean;
  DOCUMENTATION_GENERATION: boolean;
}

// Runtime overrides — used in tests or admin operations
const runtimeOverrides: Partial<FeatureFlags> = {};

export function getFeatureFlags(): FeatureFlags {
  const e = getEnv();

  return {
    // Environment-sourced flags
    DUPLICATE_DETECTION:
      runtimeOverrides.DUPLICATE_DETECTION ?? e.FEATURE_DUPLICATE_DETECTION,
    URL_VALIDATION: runtimeOverrides.URL_VALIDATION ?? e.FEATURE_URL_VALIDATION,
    AUTO_PUBLISH: runtimeOverrides.AUTO_PUBLISH ?? e.FEATURE_AUTO_PUBLISH,
    NOTIFICATIONS: runtimeOverrides.NOTIFICATIONS ?? e.FEATURE_NOTIFICATIONS,
    AI_WRITER: runtimeOverrides.AI_WRITER ?? e.FEATURE_AI_WRITER,
    SEO_GENERATOR:
      runtimeOverrides.SEO_GENERATOR ?? e.FEATURE_SEO_GENERATOR,
    ANALYTICS: runtimeOverrides.ANALYTICS ?? e.FEATURE_ANALYTICS,

    // Future modules — always false until implemented
    AI_QUALITY_VALIDATION: false,
    PUBLISHING_WORKFLOW: false,
    MONITORING_DASHBOARD: false,
    DOCUMENTATION_GENERATION: false,
  };
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag];
}

/**
 * Override a feature flag at runtime (e.g., from admin API or tests).
 * Does NOT persist to database — use SystemSettings for persistence.
 */
export function setFeatureOverride(
  flag: keyof FeatureFlags,
  value: boolean,
): void {
  (runtimeOverrides as Record<string, boolean>)[flag] = value;
}

/**
 * Reset all runtime overrides (useful in tests).
 */
export function resetFeatureOverrides(): void {
  for (const key of Object.keys(runtimeOverrides)) {
    delete (runtimeOverrides as Record<string, boolean>)[key];
  }
}

export const features = new Proxy({} as FeatureFlags, {
  get(_target, key: string) {
    return getFeatureFlags()[key as keyof FeatureFlags];
  },
});
