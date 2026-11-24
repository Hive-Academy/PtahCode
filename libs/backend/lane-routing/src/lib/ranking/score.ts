/**
 * Candidate score (part A §4, Requirement 7 scale).
 *
 * Pure: no clock, no I/O, no randomness. The matrix argument is the
 * capability-matrix snapshot's `resolve` (Requirement 11.3): `lane-default`
 * and `auto` read the family profile.
 *
 * Per lane row the model is chosen first. A listed model is used only when
 * its own cell beats the family-level cell by more than B
 * (`total - familyTotal > CLOSENESS_BAND`). Otherwise the configured model
 * (Ptah CLI `selectedModel`, or a subagent tier the caller already chose)
 * is used. Otherwise the model is `lane-default`.
 */
import {
  LANE_DEFAULT_MODEL,
  OUTCOME_TASK_KINDS,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import { PROVENANCE, type ScoreParts } from '../contracts/route-decide-result.schema';
import {
  CLOSENESS_BAND,
  EXPLORATION_BONUS,
  EXPLORATION_MIN_SAMPLES,
  LEARNED_DELTA_CAP,
  LIMIT_ADJUST,
  NEUTRAL_SCORE,
  PREFERENCE_BOOST,
  SCORE_MAX,
  SCORE_MIN,
} from '../routing-constants';
import { AUTOMATIC_MATRIX_MODEL } from '../matrix/local-derivation';
import type { ScoreLayers } from '../matrix/capability-matrix.store';
import type { MatrixCell } from '../matrix/matrix.types';
import { isSystemCliLane, type RoutingCandidate } from './candidate.types';

export type ModelProvenance = (typeof PROVENANCE)[number];

/** Provenance a live or shipped listing can carry. `lane-default` is not listed. */
export type ListedProvenance = Exclude<ModelProvenance, 'lane-default'>;

/** One listed model. `auto` entries select a model by themselves (Req 11.3). */
export interface ListedModel {
  readonly id: string;
  readonly provenance: ListedProvenance;
  readonly auto?: boolean;
}

/**
 * Model used when no listed model clears the band over the family cell.
 * `configured` is a Ptah CLI `selectedModel`. `tier` is a subagent tier
 * the caller chose from the phase kind (data-flow step 5).
 */
export interface FallbackModel {
  readonly id: string;
  readonly provenance: 'configured' | 'tier';
}

/** What `CapabilityMatrixSnapshot.resolve` returns, minus store bookkeeping. */
export interface ScoreCell {
  readonly layers?: ScoreLayers;
  readonly score: number;
  readonly cell: MatrixCell;
  readonly profileModel: string;
  readonly noProfile: boolean;
}

/**
 * Matrix lookup for one routing call. `resolve(family, lane-default | auto)`
 * must return the family profile, matching `profileModelFor` in
 * `capability-matrix.store.ts`.
 */
export interface ScoreMatrix {
  resolve(family: string, model: string, taskKind: OutcomeTaskKind): ScoreCell;
}

export interface ScoreInput {
  readonly candidate: RoutingCandidate;
  /** Caller order. Empty when the row has no list. */
  readonly models?: readonly ListedModel[];
  readonly configuredModel?: FallbackModel;
  readonly preferenceRank?: number;
}

export interface CandidateScore {
  readonly parts?: ScoreParts;
  readonly total?: number;
  readonly candidate: RoutingCandidate;
  readonly model: string;
  readonly provenance: ModelProvenance;
  readonly score: number;
  readonly cell: MatrixCell;
  readonly profileModel: string;
  readonly noProfile: boolean;
}

/** Score produced by the additive calculator. Legacy fixtures may omit the breakdown. */
export interface AdditiveCandidateScore extends CandidateScore {
  readonly parts: ScoreParts;
  readonly total: number;
}

type ScoredCell = ScoreCell & Pick<AdditiveCandidateScore, 'parts' | 'total'>;

interface ChosenModel {
  readonly model: string;
  readonly provenance: ModelProvenance;
  readonly resolved: ScoredCell;
}

export function score(
  input: ScoreInput,
  taskKind: OutcomeTaskKind,
  matrix: ScoreMatrix,
): AdditiveCandidateScore {
  assertTaskKind(taskKind);
  const family = input.candidate.family;
  const cells = new Map<string, ScoredCell>();
  const resolve = (model: string) => {
    const cached = cells.get(model);
    if (cached !== undefined) return cached;
    const cell = matrix.resolve(family, model, taskKind);
    assertCell(cell, family, model, taskKind);
    const resolved = scoreResolvedCell(input.candidate, cell, input.preferenceRank);
    cells.set(model, resolved);
    return resolved;
  };
  const baseline = resolve(LANE_DEFAULT_MODEL);
  const chosen =
    (isSystemCliLane(input.candidate)
      ? null
      : promotedModel(input.models ?? [], resolve, baseline.total))
    ?? fallbackModel(input.configuredModel, resolve, baseline);
  return {
    candidate: input.candidate,
    model: chosen.model,
    provenance: chosen.provenance,
    score: chosen.resolved.score,
    total: chosen.resolved.total,
    parts: chosen.resolved.parts,
    cell: chosen.resolved.cell,
    profileModel: chosen.resolved.profileModel,
    noProfile: chosen.resolved.noProfile,
  };
}

function promotedModel(
  models: readonly ListedModel[],
  resolve: (model: string) => ScoredCell,
  baseline: number,
): ChosenModel | null {
  let best: ChosenModel | null = null;
  for (const listed of models) {
    if (!isPromotable(listed)) continue;
    const resolved = resolve(listed.id);
    if (resolved.profileModel !== listed.id) continue;
    if (resolved.total - baseline <= CLOSENESS_BAND) continue;
    if (best !== null && resolved.total <= best.resolved.total) continue;
    best = {
      model: listed.id,
      provenance: listed.provenance,
      resolved,
    };
  }
  return best;
}

function fallbackModel(
  configured: FallbackModel | undefined,
  resolve: (model: string) => ScoredCell,
  baseline: ScoredCell,
): ChosenModel {
  if (configured !== undefined && isOwnModelId(configured.id)) {
    return {
      model: configured.id,
      provenance: configured.provenance,
      resolved: resolve(configured.id),
    };
  }
  return {
    model: LANE_DEFAULT_MODEL,
    provenance: 'lane-default',
    resolved: baseline,
  };
}

function isPromotable(listed: ListedModel): boolean {
  if (listed.auto === true) return false;
  return isOwnModelId(listed.id);
}

/** A model id that can have a profile of its own. */
function isOwnModelId(id: string): boolean {
  return (
    id.length > 0 && id !== LANE_DEFAULT_MODEL && id !== AUTOMATIC_MATRIX_MODEL
  );
}

/** Apply the same additive score to a resolved baseline, model, pin or alternate. */
export function scoreResolvedCell(
  candidate: RoutingCandidate,
  cell: ScoreCell,
  preferenceRank?: number,
  override?: number,
): ScoredCell {
  const effective = cell.cell;
  const layers: ScoreLayers = cell.layers ??
    (effective.kind === 'value' ? { [effective.source]: effective } : {});
  const { user, seed, local } = layers;
  const prior = user?.score ?? seed?.score ?? NEUTRAL_SCORE;
  const sampleCount = local?.sampleCount ?? 0;
  const exploration = user === undefined && sampleCount < EXPLORATION_MIN_SAMPLES
    ? EXPLORATION_BONUS
    : 0;
  const delta = user === undefined ? (local?.score ?? prior) - prior : 0;
  const learned = Math.max(-LEARNED_DELTA_CAP, Math.min(LEARNED_DELTA_CAP, delta)) + exploration;
  const limitState = candidate.kind === 'lane' ? candidate.limitState : 'unknown';
  if (limitState === 'at-limit') throw new Error('at-limit candidates must be excluded before scoring');
  const parts: ScoreParts = {
    prior,
    priorSource: user !== undefined ? 'user' : seed !== undefined ? 'seed' : 'neutral',
    learned,
    exploration,
    sampleCount,
    preference: preferenceBoost(preferenceRank),
    limit: LIMIT_ADJUST[limitState],
    ...(override === undefined ? {} : { override }),
  };
  const total = prior + learned + parts.preference + parts.limit + (override ?? 0);
  return { ...cell, parts, total };
}

export function preferenceBoost(rank: number | undefined): number {
  if (rank === undefined || !Number.isInteger(rank) || rank < 1) return 0;
  return PREFERENCE_BOOST[Math.min(rank - 1, PREFERENCE_BOOST.length - 1)];
}

function assertCell(
  resolved: ScoreCell,
  family: string,
  model: string,
  taskKind: OutcomeTaskKind,
): void {
  const value = resolved.score;
  if (!Number.isInteger(value) || value < SCORE_MIN || value > SCORE_MAX) {
    throw new Error(
      `matrix score for ${family}/${model}/${taskKind} must be an integer from ${SCORE_MIN} to ${SCORE_MAX}`,
    );
  }
  if (resolved.cell.kind === 'value') {
    if (resolved.cell.score !== value || resolved.noProfile) {
      throw new Error(
        `matrix value for ${family}/${model}/${taskKind} disagrees with its score`,
      );
    }
    return;
  }
  if (value !== NEUTRAL_SCORE || !resolved.noProfile) {
    throw new Error(
      `unknown matrix cell for ${family}/${model}/${taskKind} must score ${NEUTRAL_SCORE}`,
    );
  }
}

function assertTaskKind(taskKind: OutcomeTaskKind): void {
  for (const kind of OUTCOME_TASK_KINDS) {
    if (kind === taskKind) return;
  }
  throw new Error('taskKind must be an OutcomeTaskKind');
}
