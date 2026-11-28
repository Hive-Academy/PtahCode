import type { EffortSupport } from '../lane-native-values.types';
import type { OutcomeTaskKind } from '../lane-outcome.types';

export type AgentGetRoutingEvidenceParams = Record<string, never>;
export interface AgentRoutingFunnel {
  readonly spawned: number;          // unique runs in the window
  readonly completed: number;        // spawned minus capacity drop-outs
  readonly delivered: number;
  readonly reviewed: number;         // finalReview set, or reviseRounds > 0
  readonly approved: number;
  // drop-outs (not stages)
  readonly capacityDropped: number;  // failureClass in CAPACITY_FAILURE_CLASSES
  readonly unverified: number;
  readonly noDeliverable: number;    // non-capacity
  readonly failed: number;           // non-capacity
  readonly rejected: number;
  readonly unresolvedRevise: number;
  readonly reviseRounds: number;     // sum (FA3.2)
}
export interface AgentRoutingAggregate {
  readonly total: number;
  readonly count: number;
}

export interface AgentRoutingEvidenceKey {
  readonly taskKind: OutcomeTaskKind;
  readonly effort: string;              // ModelEffort value or '*'
  readonly funnel: AgentRoutingFunnel;
  readonly effortNotSent: number;
  readonly durationMs: AgentRoutingAggregate;
  readonly inputTokens: AgentRoutingAggregate;
  readonly outputTokens: AgentRoutingAggregate;
  readonly costUsd: AgentRoutingAggregate;
  readonly score: number | null;        // null: "no samples" (FA6.4)
  readonly sampleCount: number;
  readonly asOf: string | null;
  readonly stale: boolean;
}

export interface AgentRoutingEvidenceModel {
  readonly model: string;               // own id, or '*' for the family
  readonly inCatalog: boolean;
  readonly efforts: EffortSupport;      // unchanged from the snapshot; the page labels provenance
  readonly keys: readonly AgentRoutingEvidenceKey[];
}

export interface AgentRoutingEvidenceLane {
  readonly laneId: string;
  readonly family: string;
  readonly catalog: {
    readonly status: 'ok' | 'timeout' | 'error' | 'empty' | 'never';
    readonly fetchedAt: number | null;
    readonly lastOkAt: number | null;
    readonly modelCount: number;
  };
  readonly models: readonly AgentRoutingEvidenceModel[];
}

export interface AgentRoutingDecisionModelEvidence {
  readonly decisionModel: string;
  readonly proposals: number;
  readonly accepted: number;
  readonly meanConfidence: number | null;
  readonly funnel: AgentRoutingFunnel;
}

/** Deduplicated workspace runs for a recorded lane and provider family. */
export interface AgentRoutingLaneFunnel {
  readonly laneId: string;
  readonly family: string;
  readonly funnel: AgentRoutingFunnel;
}

export interface AgentGetRoutingEvidenceResult {
  readonly windowDays: number;
  readonly performanceRouting: boolean;
  readonly lanes: readonly AgentRoutingEvidenceLane[];
  /** Includes historical lanes with runs in the window, even without a current catalog. */
  readonly laneFunnels: readonly AgentRoutingLaneFunnel[];
  readonly decisionModels: readonly AgentRoutingDecisionModelEvidence[];
}
