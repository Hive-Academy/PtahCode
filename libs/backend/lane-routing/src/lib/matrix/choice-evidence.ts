import {
  LANE_DEFAULT_MODEL,
  LANE_USER_STOP_CLASS,
  type AgentRoutingDecisionModelEvidence,
  type AgentRoutingFunnel,
  type AgentRoutingLaneFunnel,
  type LaneOutcomeSummary,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import { ModelEffortSchema, type ModelEffort } from '../contracts/route-decide-result.schema';
import { OUTCOME_WINDOW_MS } from '../routing-constants';
import {
  assertFiniteNow,
  AUTOMATIC_MATRIX_MODEL,
  dedupeByRun,
  deriveLocalCell,
  isCapacityFailure,
  isExcludedFromRates,
} from './local-derivation';
import { FAMILY_PROFILE_MODEL, type MatrixProfile, type ValueMatrixCell } from './matrix.types';
import { buildSeedMatrix } from './seed-matrix';

export const ANY_EFFORT = '*';
export type EffortBucket = ModelEffort | typeof ANY_EFFORT;

export interface ChoiceKey {
  readonly family: string;
  readonly model: string;
  readonly effort: EffortBucket;
  readonly taskKind: OutcomeTaskKind;
}

/** Each stage is a subset of the preceding stage. */
export type FunnelCounts = AgentRoutingFunnel;

interface Aggregate {
  readonly total: number;
  readonly count: number;
}

export interface FunnelAggregates {
  readonly durationMs: Aggregate;
  readonly inputTokens: Aggregate;
  readonly outputTokens: Aggregate;
  readonly costUsd: Aggregate;
}

export interface ChoiceCell {
  readonly key: ChoiceKey;
  readonly funnel: FunnelCounts;
  readonly aggregates: FunnelAggregates;
  readonly local?: ValueMatrixCell;
  /** Runs whose requested effort was outside the native list or refused by the lane. */
  readonly effortNotSent: number;
}

export type DecisionModelEvidence = AgentRoutingDecisionModelEvidence;

export interface ChoiceEvidence {
  cell(key: ChoiceKey): ChoiceCell | undefined;
  cells(): readonly ChoiceCell[];
  routedRuns(laneId: string, taskKind: OutcomeTaskKind): number;
  laneFunnels(): readonly AgentRoutingLaneFunnel[];
  decisionModels(): readonly DecisionModelEvidence[];
}

export function sentEffortBucket(effort: LaneOutcomeSummary['effort']): EffortBucket {
  const parsed = ModelEffortSchema.safeParse(effort);
  return parsed.success ? parsed.data : ANY_EFFORT;
}

export function choiceModelOf(summary: LaneOutcomeSummary): string {
  if (summary.model === LANE_DEFAULT_MODEL) {
    if (summary.resolvedModelProvenance === 'native' && summary.resolvedModel?.trim()) {
      return summary.resolvedModel;
    }
    return FAMILY_PROFILE_MODEL;
  }
  return summary.model === AUTOMATIC_MATRIX_MODEL ? FAMILY_PROFILE_MODEL : summary.model;
}

type FunnelDraft = { -readonly [Key in keyof FunnelCounts]: FunnelCounts[Key] };
type AggregateDraft = { -readonly [Key in keyof Aggregate]: Aggregate[Key] };

interface ChoiceDraft {
  readonly key: ChoiceKey;
  readonly funnel: FunnelDraft;
  readonly aggregates: Record<keyof FunnelAggregates, AggregateDraft>;
  readonly scoringRuns: LaneOutcomeSummary[];
  effortNotSent: number;
}

interface DecisionDraft {
  readonly decisionModel: string;
  readonly funnel: FunnelDraft;
  accepted: number;
  readonly confidence: AggregateDraft;
}

const AGGREGATE_FIELDS = ['durationMs', 'inputTokens', 'outputTokens', 'costUsd'] as const;

function emptyFunnel(): FunnelDraft {
  return {
    spawned: 0,
    completed: 0,
    delivered: 0,
    reviewed: 0,
    approved: 0,
    capacityDropped: 0,
    unverified: 0,
    noDeliverable: 0,
    failed: 0,
    rejected: 0,
    unresolvedRevise: 0,
    reviseRounds: 0,
  };
}

function addToFunnel(funnel: FunnelDraft, row: LaneOutcomeSummary, capacity: boolean): void {
  funnel.spawned += 1;
  funnel.reviseRounds += row.reviseRounds;
  if (capacity) {
    funnel.capacityDropped += 1;
    return;
  }

  funnel.completed += 1;
  if (row.failureClass === LANE_USER_STOP_CLASS) {
    // The stored failed verdict records how the run ended, with no verified outcome.
    funnel.unverified += 1;
    return;
  }
  switch (row.verdict) {
    case 'unverified':
      funnel.unverified += 1;
      return;
    case 'no-deliverable':
      funnel.noDeliverable += 1;
      return;
    case 'failed':
      funnel.failed += 1;
      return;
    case 'delivered':
      funnel.delivered += 1;
      break;
  }

  if (row.finalReview === null && row.reviseRounds === 0) return;
  funnel.reviewed += 1;
  if (row.finalReview === 'approved') {
    funnel.approved += 1;
  } else if (row.finalReview === 'rejected') {
    funnel.rejected += 1;
  } else {
    funnel.unresolvedRevise += 1;
  }
}

function addMeasuredValue(aggregate: AggregateDraft, value: number | null | undefined): void {
  if (value == null || !Number.isFinite(value)) return;
  aggregate.total += value;
  aggregate.count += 1;
}

function choiceId({ family, model, effort, taskKind }: ChoiceKey): string {
  return JSON.stringify([family, model, effort, taskKind]);
}

function laneTaskId(laneId: string, taskKind: OutcomeTaskKind): string {
  return JSON.stringify([laneId, taskKind]);
}

function addChoiceRun(
  drafts: Map<string, ChoiceDraft>,
  key: ChoiceKey,
  row: LaneOutcomeSummary,
  capacity: boolean,
): void {
  const id = choiceId(key);
  let draft = drafts.get(id);
  if (draft === undefined) {
    draft = {
      key,
      funnel: emptyFunnel(),
      aggregates: {
        durationMs: { total: 0, count: 0 },
        inputTokens: { total: 0, count: 0 },
        outputTokens: { total: 0, count: 0 },
        costUsd: { total: 0, count: 0 },
      },
      scoringRuns: [],
      effortNotSent: 0,
    };
    drafts.set(id, draft);
  }

  addToFunnel(draft.funnel, row, capacity);
  for (const field of AGGREGATE_FIELDS) addMeasuredValue(draft.aggregates[field], row[field]);
  if (!isExcludedFromRates(row.failureClass)) draft.scoringRuns.push(row);
  if (row.effortDisposition === 'not-in-native-list' || row.effortDisposition === 'lane-refused') {
    draft.effortNotSent += 1;
  }
}

function addDecisionRun(
  decisions: Map<string, DecisionDraft>,
  row: LaneOutcomeSummary,
  capacity: boolean,
): void {
  const { decisionModel } = row;
  if (!decisionModel?.trim()) return;
  let draft = decisions.get(decisionModel);
  if (draft === undefined) {
    draft = {
      decisionModel,
      funnel: emptyFunnel(),
      accepted: 0,
      confidence: { total: 0, count: 0 },
    };
    decisions.set(decisionModel, draft);
  }

  addToFunnel(draft.funnel, row, capacity);
  if (row.routingSource === 'model') draft.accepted += 1;
  addMeasuredValue(draft.confidence, row.proposalConfidence);
}

export function deriveChoiceEvidence(
  summaries: readonly LaneOutcomeSummary[],
  nowMs: number,
  seedProfiles?: readonly MatrixProfile[],
): ChoiceEvidence {
  assertFiniteNow(nowMs);
  const sinceMs = nowMs - OUTCOME_WINDOW_MS;
  const drafts = new Map<string, ChoiceDraft>();
  const routed = new Map<string, number>();
  const decisions = new Map<string, DecisionDraft>();
  const laneFunnels = new Map<string, AgentRoutingLaneFunnel & { funnel: FunnelDraft }>();

  for (const row of dedupeByRun(summaries)) {
    const { family, taskKind } = row;
    if (taskKind === null || !Number.isFinite(row.endedAt) || row.endedAt < sinceMs) continue;
    if (!family.trim() || !row.model.trim()) continue;

    const capacity = isCapacityFailure(row.failureClass);
    const laneKey = JSON.stringify([row.laneId, family]);
    let lane = laneFunnels.get(laneKey);
    if (lane === undefined) {
      lane = { laneId: row.laneId, family, funnel: emptyFunnel() };
      laneFunnels.set(laneKey, lane);
    }
    addToFunnel(lane.funnel, row, capacity);

    const model = choiceModelOf(row);
    const effort = sentEffortBucket(row.effort);
    const models = row.model === LANE_DEFAULT_MODEL && model !== FAMILY_PROFILE_MODEL
      ? [model, FAMILY_PROFILE_MODEL]
      : [model];
    for (const model of models) {
      addChoiceRun(drafts, { family, model, effort, taskKind }, row, capacity);
      if (effort !== ANY_EFFORT) {
        addChoiceRun(drafts, { family, model, effort: ANY_EFFORT, taskKind }, row, capacity);
      }
    }

    if (row.routingSource !== 'not-routed' && row.laneId.trim()) {
      const id = laneTaskId(row.laneId, taskKind);
      routed.set(id, (routed.get(id) ?? 0) + 1);
    }
    addDecisionRun(decisions, row, capacity);
  }

  const profiles = seedProfiles ?? buildSeedMatrix(nowMs).profiles;
  const byKey = new Map<string, ChoiceCell>();
  for (const [id, draft] of drafts) {
    const { key, funnel, aggregates, effortNotSent, scoringRuns } = draft;
    const local = deriveLocalCell(
      { ...key, effort: key.effort === ANY_EFFORT ? undefined : key.effort },
      scoringRuns,
      nowMs,
      profiles,
    );
    byKey.set(id, {
      key,
      funnel,
      aggregates,
      effortNotSent,
      ...(local === undefined ? {} : { local }),
    });
  }

  const cells = [...byKey.values()];
  const lanes = [...laneFunnels.values()];
  const decisionModels = [...decisions.values()].map(({ decisionModel, funnel, accepted, confidence }) => ({
    decisionModel,
    proposals: funnel.spawned,
    accepted,
    meanConfidence: confidence.count === 0 ? null : confidence.total / confidence.count,
    funnel,
  }));
  return {
    cell: (key) => byKey.get(choiceId(key)),
    cells: () => cells,
    routedRuns: (laneId, taskKind) => routed.get(laneTaskId(laneId, taskKind)) ?? 0,
    laneFunnels: () => lanes,
    decisionModels: () => decisionModels,
  };
}
