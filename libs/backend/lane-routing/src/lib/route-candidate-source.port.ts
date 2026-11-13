import type { CliDetectionResult, LaneLimitState } from '@ptah-extension/shared';
import type { RoutingCandidate } from './ranking/candidate.types';

/** Host adapter that reads the current candidate rows, limits, and subagent roles. */
export interface RouteCandidateSource {
  rows(): Promise<readonly CliDetectionResult[]>;
  limits(
    rows: readonly CliDetectionResult[],
  ): Promise<ReadonlyMap<string, LaneLimitState> | null>;
  roles(): Promise<readonly string[]>;
  /** Null means the effective list cannot be read. Called only at gate stage. */
  tools?(candidate: RoutingCandidate, phase: {
    readonly kind: string;
    readonly toolProfile?: { readonly disallowedTools: readonly string[] };
  }): Promise<readonly string[] | null>;
}
