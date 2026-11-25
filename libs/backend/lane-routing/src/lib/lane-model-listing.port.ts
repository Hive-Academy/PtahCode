import type { CliDetectionResult, EffortSupport } from '@ptah-extension/shared';

export interface LaneModelEntry {
  readonly id: string;
  readonly provenance: 'reported' | 'fallback' | 'configured' | 'tier';
  readonly auto?: boolean;
  /** An absent value is stored as explicit unknown in the catalog snapshot. */
  readonly efforts?: EffortSupport;
}

/** Lists models for one lane within the routing call's deadline. */
export interface LaneModelListing {
  list(
    row: CliDetectionResult,
    signal: AbortSignal,
  ): Promise<readonly LaneModelEntry[]>;
}
