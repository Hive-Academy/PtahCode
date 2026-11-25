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
  type EffortSupport,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import {
  MODEL_EFFORTS,
  PROVENANCE,
  type ModelEffort,
  type ScoreParts,
} from '../contracts/route-decide-result.schema';
import {
  CLOSENESS_BAND,
  EXPLORATION_BONUS,
  EXPLORATION_MIN_SAMPLES,
  EXPLORATION_PERIOD,
  LEARNED_DELTA_CAP,
  LIMIT_ADJUST,
  NEUTRAL_SCORE,
  PREFERENCE_BOOST,
  SCORE_MAX,
  SCORE_MIN,
} from '../routing-constants';
import { ANY_EFFORT, type ChoiceEvidence, type ChoiceKey } from '../matrix/choice-evidence';
import { AUTOMATIC_MATRIX_MODEL } from '../matrix/local-derivation';
import type { ScoreLayers } from '../matrix/capability-matrix.store';
import { FAMILY_PROFILE_MODEL, type MatrixCell } from '../matrix/matrix.types';
import { isSystemCliLane, type RoutingCandidate } from './candidate.types';
import type { ChoiceInput, EvidenceSource } from './choice.types';

export type ModelProvenance = (typeof PROVENANCE)[number];

/** Provenance a live or shipped listing can carry. `lane-default` is not listed. */
export type ListedProvenance = Exclude<ModelProvenance, 'lane-default'>;

/** One listed model. `auto` entries select a model by themselves (Req 11.3). */
export interface ListedModel {
  readonly id: string;
  readonly provenance: ListedProvenance;
  readonly auto?: boolean;
  readonly efforts?: EffortSupport;
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
  resolvePair?(family: string, model: string, taskKind: OutcomeTaskKind, effort: ModelEffort): ScoreCell;
}

export interface ScoreInput {
  readonly candidate: RoutingCandidate;
  /** Caller order. Empty when the row has no list. */
  readonly models?: readonly ListedModel[];
  readonly configuredModel?: FallbackModel;
  readonly preferenceRank?: number;
  readonly choice?: ChoiceInput;
}

export interface CandidateScore {
  readonly parts?: ScoreParts;
  readonly total?: number;
  readonly candidate: RoutingCandidate;
  readonly model: string;
  readonly provenance: ModelProvenance;
  readonly effort?: ModelEffort;
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
  if (input.choice !== undefined) return scoreChoice(input, taskKind, matrix, input.choice);
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

interface ChoiceModel {
  readonly id: string;
  readonly provenance: ModelProvenance;
  readonly efforts?: EffortSupport;
}

interface ScoredPair {
  readonly model: ChoiceModel;
  readonly effort: ModelEffort;
  readonly resolved: ScoredCell;
}

function scoreChoice(
  input: ScoreInput,
  taskKind: OutcomeTaskKind,
  matrix: ScoreMatrix,
  choice: ChoiceInput,
): AdditiveCandidateScore {
  const { candidate, configuredModel } = input;
  const { policyEffort, evidence } = choice;
  const listed = input.models ?? [];
  const defaultModel = configuredModel !== undefined && isOwnModelId(configuredModel.id)
    ? configuredModel
    : { id: LANE_DEFAULT_MODEL, provenance: 'lane-default' } as const;
  const fallback: ChoiceModel = {
    ...defaultModel,
    efforts: listed.find((model) => model.id === defaultModel.id)?.efforts,
  };
  const models = listed.filter(isPromotable)
    .map((model) => model.id === fallback.id ? fallback : model);
  if (!models.includes(fallback)) models.push(fallback);

  const keyFor = (model: ChoiceModel, effort: ChoiceKey['effort']): ChoiceKey => ({
    family: candidate.family,
    model: model.id === LANE_DEFAULT_MODEL ? FAMILY_PROFILE_MODEL : model.id,
    effort,
    taskKind,
  });
  const resolve = (model: ChoiceModel, effort: ModelEffort): ScoredPair => {
    const key = keyFor(model, effort);
    const base = matrix.resolvePair?.(key.family, model.id, taskKind, effort)
      ?? matrix.resolve(key.family, model.id, taskKind);
    assertCell(base, key.family, model.id, taskKind);
    const pair = choiceScoreCell(base, key, evidence, model.id === fallback.id);
    const resolved = scoreResolvedCell(candidate, pair.cell, input.preferenceRank, undefined, {
      priorMode: 'blended',
    });
    return {
      model,
      effort,
      resolved: { ...resolved, parts: { ...resolved.parts, effort, evidence: pair.evidence } },
    };
  };

  const baseline = resolve(fallback, policyEffort);
  let exploit = baseline;
  let hasEvidence = baseline.resolved.parts.evidence !== 'prior';
  for (const model of models) {
    for (const effort of MODEL_EFFORTS) {
      if (model === fallback && effort === policyEffort) continue;
      if (effort !== policyEffort && (choice.effortFixed || !supportsEffort(model, effort))) continue;
      const pair = resolve(model, effort);
      const explicitUserOverride = pair.resolved.parts.priorSource === 'user'
        && (model === fallback || pair.resolved.profileModel === model.id);
      if (pair.resolved.parts.evidence === 'prior' && !explicitUserOverride) continue;
      hasEvidence ||= pair.resolved.parts.evidence !== 'prior';
      if (pair.resolved.total - baseline.resolved.total <= CLOSENESS_BAND) continue;
      if (pair.resolved.total > exploit.resolved.total) exploit = pair;
    }
  }

  if (!hasEvidence && exploit === baseline && !isSystemCliLane(candidate)) {
    // Preserve a prior-only promotion that already won in the old model ranking.
    const legacy = score({ ...input, choice: undefined }, taskKind, matrix);
    if (legacy.model !== fallback.id || legacy.provenance !== fallback.provenance) {
      exploit = resolve({
        id: legacy.model,
        provenance: legacy.provenance,
        efforts: listed.find((model) => model.id === legacy.model)?.efforts,
      }, policyEffort);
    }
  }

  let selected = exploit;
  let parts = exploit.resolved.parts;
  if (
    choice.exploreTurn
    && !choice.effortFixed
    && taskKind !== 'review'
    && candidate.kind === 'lane'
    && (candidate.limitState === 'confirmed-room' || candidate.limitState === 'unknown')
    && (baseline.resolved.parts.sampleCount ?? 0) >= EXPLORATION_MIN_SAMPLES
    && evidence.routedRuns(candidate.id, taskKind) % EXPLORATION_PERIOD === EXPLORATION_PERIOD - 1
  ) {
    const samples = (model: ChoiceModel, effort: ChoiceKey['effort']) =>
      evidence.cell(keyFor(model, effort))?.funnel.spawned ?? 0;
    const exploration = explorationPair(models, fallback, exploit, policyEffort, samples);
    if (exploration !== undefined) {
      selected = resolve(exploration.model, exploration.effort);
      parts = { ...selected.resolved.parts, sampleCount: exploration.sampleCount, explore: true };
    }
  }

  return {
    candidate,
    model: selected.model.id,
    provenance: selected.model.provenance,
    effort: selected.effort,
    score: selected.resolved.score,
    total: exploit.resolved.total,
    parts,
    cell: selected.resolved.cell,
    profileModel: selected.resolved.profileModel,
    noProfile: selected.resolved.noProfile,
  };
}

function choiceScoreCell(
  base: ScoreCell,
  key: ChoiceKey,
  evidence: ChoiceEvidence,
  useFamily: boolean,
): { cell: ScoreCell; evidence: EvidenceSource } {
  const { user, seed } = scoreLayers(base);
  const buckets: { model: string; effort: ChoiceKey['effort']; source: EvidenceSource }[] = [];
  if (key.model !== FAMILY_PROFILE_MODEL) {
    buckets.push(
      { model: key.model, effort: key.effort, source: 'pair' },
      { model: key.model, effort: ANY_EFFORT, source: 'model' },
    );
  }
  if (useFamily) {
    buckets.push(
      { model: FAMILY_PROFILE_MODEL, effort: key.effort, source: 'family' },
      { model: FAMILY_PROFILE_MODEL, effort: ANY_EFFORT, source: 'family' },
    );
  }
  let local;
  let source: EvidenceSource = 'prior';
  let profileModel = base.profileModel;
  for (const bucket of buckets) {
    local = evidence.cell({ ...key, model: bucket.model, effort: bucket.effort })?.local;
    if (local === undefined) continue;
    source = bucket.source;
    if (user === undefined) profileModel = bucket.model;
    break;
  }
  const value = user ?? local ?? seed;
  return {
    cell: {
      cell: value ?? { kind: 'unknown' },
      layers: { user, seed, local },
      score: value?.score ?? NEUTRAL_SCORE,
      profileModel,
      noProfile: value === undefined,
    },
    evidence: source,
  };
}

function supportsEffort(model: ChoiceModel, effort: ModelEffort): boolean {
  return model.efforts?.provenance === 'native' && model.efforts.supported.includes(effort);
}

function explorationPair(
  models: readonly ChoiceModel[],
  fallback: ChoiceModel,
  exploit: ScoredPair,
  policyEffort: ModelEffort,
  samples: (model: ChoiceModel, effort: ChoiceKey['effort']) => number,
): { model: ChoiceModel; effort: ModelEffort; sampleCount: number } | undefined {
  let leastSampled: ChoiceModel | undefined;
  let minSamples = EXPLORATION_MIN_SAMPLES;
  for (const model of models) {
    if (model === fallback) continue;
    const count = samples(model, ANY_EFFORT);
    if (count >= minSamples) continue;
    leastSampled = model;
    minSamples = count;
  }
  if (leastSampled !== undefined) {
    return { model: leastSampled, effort: policyEffort, sampleCount: minSamples };
  }

  const policyIndex = MODEL_EFFORTS.indexOf(policyEffort);
  for (const index of [policyIndex - 1, policyIndex + 1]) {
    const effort = MODEL_EFFORTS[index];
    if (effort === undefined || !supportsEffort(exploit.model, effort)) continue;
    const sampleCount = samples(exploit.model, effort);
    if (sampleCount < EXPLORATION_MIN_SAMPLES) {
      return { model: exploit.model, effort, sampleCount };
    }
  }
  return undefined;
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
  options?: { readonly priorMode: 'capped' | 'blended' },
): ScoredCell {
  const { user, seed, local } = scoreLayers(cell);
  const blended = options?.priorMode === 'blended';
  const prior = user?.score ?? (blended ? local?.score : undefined) ?? seed?.score ?? NEUTRAL_SCORE;
  const sampleCount = local?.sampleCount ?? 0;
  const exploration = user === undefined && sampleCount < EXPLORATION_MIN_SAMPLES
    ? EXPLORATION_BONUS
    : 0;
  const delta = user === undefined ? (local?.score ?? prior) - prior : 0;
  const learned = blended
    ? 0
    : Math.max(-LEARNED_DELTA_CAP, Math.min(LEARNED_DELTA_CAP, delta)) + exploration;
  const limitState = candidate.kind === 'lane' ? candidate.limitState : 'unknown';
  if (limitState === 'at-limit') throw new Error('at-limit candidates must be excluded before scoring');
  if (!Object.hasOwn(LIMIT_ADJUST, limitState)) {
    throw new Error(`invalid limit state for candidate ${candidate.id}`);
  }
  if (override !== undefined && !Number.isFinite(override)) {
    throw new Error('score override must be finite');
  }
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
  const total = prior + learned + (blended ? exploration : 0)
    + parts.preference + parts.limit + (override ?? 0);
  return { ...cell, parts, total };
}

function scoreLayers({ cell, layers }: ScoreCell): ScoreLayers {
  return layers ?? (cell.kind === 'value' ? { [cell.source]: cell } : {});
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
