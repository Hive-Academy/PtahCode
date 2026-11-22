import type { PhaseKind } from '@ptah-extension/shared';

export type UsageExecutorType = 'sdk-subagent' | 'session' | 'lane';

export type UsageScope = 'message' | 'turn' | 'cumulative';

export type UsageMissingReason =
  | 'no-usage-event'
  | 'partial-usage'
  | 'invalid-usage'
  | 'aborted-before-result'
  | 'failed-before-result'
  | 'sink-unavailable'
  | 'unmatched-provider-event'
  | 'source-unavailable';

/** One model's accepted turn delta. Unknown counters remain null. */
export interface SessionUsageModelDelta {
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  /** One-hour subset of cache creation; absent means the TTL split is unknown. */
  cacheCreation1hTokens?: number | null;
  knownCostMicroUsd: number | null;
  costAuthority: 'provider-reported' | 'model-priced' | 'unpriced';
}

/** Stable identity and accepted usage from one producer event. */
export interface SessionUsageContribution {
  /** Captured at run start; never infer an owner from current ambient login. */
  ownerKey?: string | null;
  billingMode?: 'subscription' | 'api-key' | 'unknown';
  phaseKind?: PhaseKind | null;
  executorType?: UsageExecutorType | null;
  sessionId: string;
  producer:
    | 'sdk-owner'
    | 'codex-checkpoint'
    | 'cli-lane'
    | 'provider-session'
    | 'transcript-replay';
  runId: string;
  /** Defaults to null for existing live producers. */
  nativeThreadId?: string | null;
  turnId: string | null;
  eventKey: string;
  parentSessionId: string | null;
  subagentId: string | null;
  providerId: string | null;
  occurredAtMs: number;
  revision: number;
  models: SessionUsageModelDelta[];
  totalCostMicroUsd: number | null;
  totalCostAuthority: 'provider-reported' | 'model-priced' | 'unpriced';
  pricingVersion: string | null;
  /** Reprice this run from its accepted absolute cost snapshot. */
  runCostSnapshot?: boolean;
  /** Normalized workspace identity for events without a sessions row. */
  workspaceKey?: string | null;
  repositoryId?: string | null;
  worktreePath?: string | null;
  host?: string | null;
  /** Defaults to live at the sink boundary. */
  source?: 'live' | 'replay' | 'estimated';
  /** Defaults to null at the sink boundary. */
  missingReason?: UsageMissingReason | null;
  /** Defaults to true at the sink boundary. */
  billable?: boolean;
  /** Both interval bounds default to null at the sink boundary. */
  coverageStartMs?: number | null;
  coverageEndMs?: number | null;
}

/** One model's persisted totals of one producer in one session. */
export interface SessionUsageModelTotals {
  /** `null` for usage that was recorded without a model. */
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Sum of the priced events of this model, in micro-USD; null when none. */
  knownCostMicroUsd: number | null;
  /** Distinct accepted events of this model. */
  events: number;
  /** Events of this model without a known price. */
  unpricedEvents: number;
  /** Distinct cost authorities of this model's events. */
  costAuthorities: Array<'provider-reported' | 'model-priced' | 'unpriced'>;
}

/** Everything one producer persisted for one session, for a resumed owner. */
export interface SessionUsageTotals {
  /** Distinct accepted events. */
  events: number;
  /** Highest producer revision persisted. */
  maxRevision: number;
  /** Sum of the persisted event spans (`coverageEndMs - coverageStartMs`). */
  durationMs: number;
  models: SessionUsageModelTotals[];
}

/** Host-neutral write boundary; callers handle rejection without interrupting a stream. */
export interface SessionUsageSink {
  recordUsage(event: SessionUsageContribution): Promise<void> | void;
  /**
   * Read back what `producer` persisted for `sessionId`, after every write
   * this sink already accepted. `null` when nothing was persisted.
   */
  readSessionUsage?(
    sessionId: string,
    producer: SessionUsageContribution['producer'],
  ): Promise<SessionUsageTotals | null>;
  /** Queue a true session end after accepted usage writes. */
  requestFinalization?(sessionId: string): Promise<void> | void;
  /** Reopen a ledger row when a session is deliberately resumed. */
  resumeSession?(sessionId: string): Promise<void> | void;
  /** Supply live ids before the one-time startup idle scan. */
  setLiveSessionIdsProvider?(provider: () => readonly string[]): void;
  /** Wait for contributions already accepted by this sink before shutdown. */
  flush?(): Promise<void>;
}

/** Optional notification boundary for reconciliation after usage settles. */
export interface UsageReconciliationTrigger {
  enqueue(event: {
    kind: 'turn-settled' | 'session-closed' | 'lane-completed';
    sessionId: string;
    providerId: string;
    occurredAtMs: number;
  }): void;
}

/** Resolve a worktree to its stable repository identity. */
export interface RepositoryIdentityResolver {
  resolve(worktreePath: string): Promise<{
    repositoryId: string;
    worktreePath: string;
  } | null>;
}
