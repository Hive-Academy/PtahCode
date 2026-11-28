/**
 * Centralized environment defaults for the Ptah platform (log level and
 * console logging for production and development builds).
 */

/** Log severity levels (shared across all layers) */
export type PtahLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Production environment defaults */
export const PtahProdDefaults = {
  /** Minimum log level in production — suppresses debug noise */
  LOG_LEVEL: 'info' as PtahLogLevel,
  /** Whether to log to console in addition to output channel */
  LOG_TO_CONSOLE: false,
} as const;

/** Development environment defaults */
export const PtahDevDefaults = {
  /** Minimum log level in development — show everything */
  LOG_LEVEL: 'debug' as PtahLogLevel,
  /** Whether to log to console in addition to output channel */
  LOG_TO_CONSOLE: true,
} as const;
