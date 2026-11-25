/**
 * Reason compiler (Requirements 13.1-13.4) and one-sentence trace explanations.
 *
 * Pure: no clock, no I/O, no randomness. The same facts return the same
 * text. Legacy clauses are joined with `'; '` in fixed order. A value that
 * must stay inside one clause cannot contain a semicolon or a newline.
 */
import type { LaneLimitState } from '@ptah-extension/shared';
import {
  EXCLUSION_RULES,
  FALLBACK_CAUSES,
  type ChosenEntry,
  type LimitEvidence,
  type ModelEffort,
  type ModelTier,
  type PreferenceSource,
  type ScoreParts,
  type UserRuleExclusion,
} from '../contracts/route-decide-result.schema';
import type { MatrixCell, ValueMatrixCell } from '../matrix/matrix.types';
import type { PreferenceDiagnostic } from '../ranking/preference-match';
import {
  AGGREGATE_DIAGNOSTIC_MAX_CHARS,
  DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP,
  DIAGNOSTIC_LINE_MAX_CHARS,
  DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS,
  EXPLANATION_PREFERENCE_DIAGNOSTICS_CAP,
  EXPLORATION_MIN_SAMPLES,
  EXPLORATION_PERIOD,
  SCORE_MAX,
  SCORE_MIN,
} from '../routing-constants';
import { formatConfidence } from './confidence';

export const ROSTER_EXCLUSION_REASONS = [
  'no-eligible-candidate',
  'reviewer-family',
  'pin-unavailable',
  'missing-capability',
] as const;

export type RosterExclusionReason = (typeof ROSTER_EXCLUSION_REASONS)[number];

export type FallbackCause = (typeof FALLBACK_CAUSES)[number];

/** A built-in exclusion rule, or `user-rule:<id>` from a matched routing rule. */
export type ExclusionRule =
  | (typeof EXCLUSION_RULES)[number]
  | UserRuleExclusion;

export type ChoiceSource = 'model' | 'ranking' | 'pin';

export type DecidingFactor =
  | 'score'
  | 'pin'
  | 'rotation'
  | 'tie-break'
  | 'model refinement'
  | 'call preference'
  | 'configured preference'
  | `rule ${string}`;

export const NO_CONFIDENCE_REPORTED = 'no confidence reported';

export const MISSING_INPUTS = [
  'agent-list',
  'limits',
  'roles',
  'model-lists',
  'matrix-file',
  'outcome-history',
  'rotation-store',
] as const;

export type MissingInput = (typeof MISSING_INPUTS)[number];

/**
 * Phrases Requirement 4.5 / the failure table name in `reasons`.
 * `agent-list-unavailable` is F10. `models unknown` is the model-list
 * failure in data-flow step 4. `no outcome history` is SC-2
 * (`isPersistent() === false`). The others are F11.
 */
export const MISSING_INPUT_REASON: Readonly<Record<MissingInput, string>> = {
  'agent-list': 'agent-list-unavailable',
  limits: 'limits unavailable',
  roles: 'roles unavailable',
  'model-lists': 'models unknown',
  'matrix-file': 'matrix file unreadable',
  'outcome-history': 'no outcome history',
  'rotation-store': 'rotation store unavailable',
};

const PER_LANE_MODEL_UNKNOWN_PREFIX = 'models unknown for ';

export interface ChosenExecutor {
  readonly kind: 'lane' | 'subagent' | 'child-session';
  readonly id: string;
  readonly family: string;
  readonly cli?: string;
  readonly ptahCliId?: string;
  readonly role?: string;
}

export interface ChosenReasonFacts {
  readonly phaseId: string;
  readonly executor: ChosenExecutor;
  readonly model: string;
  readonly score: number;
  readonly parts?: ScoreParts;
  readonly effortCheck?: ChosenEntry['effortCheck'];
  readonly source: ChoiceSource;
  readonly cell: MatrixCell;
  readonly limitState: LaneLimitState;
  readonly rotationChangedChoice: boolean;
  readonly preferenceChangedChoice: boolean;
  readonly preferenceSource?: string;
  /** Provider confidence for the chosen option. Null means none reported. */
  readonly reportedConfidence: number | null;
  readonly fallbackCause: FallbackCause | null;
  /** Free text from a structured-output model. Never copied. */
  readonly discardedModelText?: string;
  /** Model proposal label. Kept on the result object, not in the reason. */
  readonly modelProposalOption?: string;
}

export interface ChosenReasonInput extends ChosenReasonFacts {
  readonly inputRowIds: readonly string[];
}

export interface CandidateRuleFact {
  readonly candidate: string;
  readonly rule: ExclusionRule;
}

export interface UnavailableReasonFacts {
  readonly phaseId: string;
  readonly exclusionReason: RosterExclusionReason;
  readonly excludedBy: readonly CandidateRuleFact[];
  readonly pinRule: ExclusionRule | null;
  readonly needsDisclosedFallback: boolean;
  readonly source: 'pin' | 'ranking';
  readonly discardedModelText?: string;
  readonly modelProposalOption?: string;
}

export interface UnavailableReasonInput extends UnavailableReasonFacts {
  readonly inputRowIds: readonly string[];
}

export interface ExcludedCandidateFact {
  readonly phaseId: string;
  readonly candidate: string;
  readonly rule: ExclusionRule;
}

export interface PreflightAnswerFacts {
  readonly name: 'taskType' | 'depth';
  readonly source: 'model' | 'skill-table';
  readonly reportedConfidence: number | null;
  readonly fallbackCause: FallbackCause | null;
  readonly discardedModelText?: string;
  readonly modelProposalOption?: string;
}

export interface AggregateDiagnostic {
  readonly identity: string;
  readonly display: string;
}

export type AggregateDiagnosticInput = string | AggregateDiagnostic;

export interface GateReasonInput {
  readonly chosen: readonly ChosenReasonFacts[];
  readonly unavailable: readonly UnavailableReasonFacts[];
  readonly excluded: readonly ExcludedCandidateFact[];
  readonly missingInputs: readonly MissingInput[];
  readonly inputRowIds: readonly string[];
  /** Deduplicated aggregate diagnostics (matrix notes, per-lane model status, routing rules, gather timeouts). */
  readonly extraReasons?: readonly AggregateDiagnosticInput[];
}

export interface GateReasonOutput {
  readonly chosenReasons: readonly string[];
  readonly unavailableReasons: readonly string[];
  readonly reasons: readonly string[];
}

export interface ExplanationAlternative {
  readonly id: string;
  readonly displayName: string;
  readonly total: number;
  readonly parts?: ScoreParts;
}

export interface PreferenceLossNote {
  readonly candidateDisplayName: string;
  readonly candidateTotal: number;
  readonly boost: number;
}

export interface ChosenExplanationInput {
  readonly candidateId: string;
  readonly displayName: string;
  readonly model: string;
  readonly total: number;
  readonly parts?: ScoreParts;
  readonly strongestAlternative?: ExplanationAlternative;
  readonly decidingFactor: DecidingFactor;
  readonly preferenceSource?: PreferenceSource;
  readonly overriddenPreferenceSources?: readonly PreferenceSource[];
  readonly preferenceMatches?: readonly PreferenceDiagnostic[];
  readonly preferenceLoss?: PreferenceLossNote;
  readonly callerPreferenceNote?: string;
  readonly policyCondition: string;
  readonly tier: ModelTier;
  readonly effort: ModelEffort;
  readonly matchedRuleId?: string;
  readonly policyRuleNote?: string | null;
  readonly limitState: LaneLimitState;
  readonly limitEvidence?: LimitEvidence;
  readonly nowMs?: number;
}

export interface UnavailableExplanationInput {
  readonly phaseId: string;
  readonly exclusionReason: RosterExclusionReason;
  readonly pinRule: ExclusionRule | null;
  readonly needsDisclosedFallback: boolean;
  readonly excludedBy: readonly CandidateRuleFact[];
  readonly policyCondition: string;
  readonly tier: ModelTier;
  readonly effort: ModelEffort;
  readonly matchedRuleId?: string;
  readonly policyRuleNote?: string | null;
}

function assertToken(label: string, value: string): void {
  if (!/^\S+$/.test(value) || value.includes(';')) {
    throw new Error(`${label} must be a single token without a semicolon`);
  }
}

function assertClause(label: string, value: string): void {
  if (value.length === 0 || /[;\r\n]/.test(value)) {
    throw new Error(`${label} must not contain a semicolon or a newline`);
  }
}

function assertScore(score: number): void {
  if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) {
    throw new Error(
      `score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}`,
    );
  }
}

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function sanitizeText(value: string): string {
  return value.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function joinClauses(clauses: readonly string[]): string {
  return clauses.join('; ');
}

function changedPhrase(changed: boolean): string {
  return changed ? 'changed the choice' : 'did not change the choice';
}

function unexpectedMatrixSource(source: never): never {
  throw new Error(`unexpected matrix source ${String(source)}`);
}

function localSampleCount(cell: ValueMatrixCell): number {
  if (cell.sampleCount === undefined) {
    throw new Error('a local matrix cell must carry sampleCount');
  }
  if (!Number.isInteger(cell.sampleCount) || cell.sampleCount < 1) {
    throw new Error(
      'a local matrix cell sampleCount must be an integer of at least 1',
    );
  }
  return cell.sampleCount;
}

function provenanceClause(cell: MatrixCell): string {
  if (cell.kind === 'unknown') return 'no profile';
  switch (cell.source) {
    case 'seed':
      assertToken('asOf', cell.asOf);
      return `provenance seed, asOf ${cell.asOf}, stale ${cell.stale}`;
    case 'user':
      return 'provenance user';
    case 'local':
      return `provenance local, sample count ${localSampleCount(cell)}`;
    default:
      return unexpectedMatrixSource(cell.source);
  }
}

function assertKnownCandidate(
  candidate: string,
  rule: ExclusionRule,
  inputRowIds: readonly string[],
): void {
  assertToken('candidate', candidate);
  if (rule !== 'not-listed' && !inputRowIds.includes(candidate)) {
    throw new Error(`excluded candidate ${candidate} is not an input row`);
  }
}

function modelProbabilityClause(
  source: ChoiceSource | 'skill-table',
  reportedConfidence: number | null,
): string {
  if (source !== 'model') {
    return source === 'skill-table'
      ? 'confidence not applicable'
      : 'model probability not applicable';
  }
  if (reportedConfidence === null) return NO_CONFIDENCE_REPORTED;
  return `model probability ${formatConfidence(reportedConfidence)}`;
}

function fallbackClause(cause: FallbackCause | null): string {
  return `fallback cause ${cause ?? 'none'}`;
}

function preferenceClause(
  changed: boolean,
  preferenceSource: string | undefined,
): string {
  const change = `preference ${changedPhrase(changed)}`;
  const source = blankToUndefined(preferenceSource);
  if (source === undefined) return change;
  assertClause('preference source', source);
  return `${change}, preference source ${source}`;
}

function executorClause(executor: ChosenExecutor): string {
  assertToken('executor id', executor.id);
  return `executor ${executor.kind} ${executor.id}`;
}

function assertCellScore(facts: ChosenReasonFacts): void {
  if (facts.cell.kind === 'value' && facts.cell.score !== facts.score) {
    throw new Error('chosen score must equal the matrix cell score');
  }
}

function assertDisclosedFallback(facts: UnavailableReasonFacts): void {
  const expected = facts.exclusionReason === 'reviewer-family';
  if (facts.needsDisclosedFallback !== expected) {
    throw new Error(
      'disclosed fallback is set only for exclusion reason reviewer-family',
    );
  }
}

function assertPinRule(facts: UnavailableReasonFacts): void {
  if (facts.exclusionReason === 'pin-unavailable') {
    if (facts.pinRule === null) {
      throw new Error('pin-unavailable requires a pin rule');
    }
    return;
  }
  if (facts.pinRule !== null) {
    throw new Error('pin rule is set only for pin-unavailable');
  }
}

function uniqueMissing(inputs: readonly MissingInput[]): MissingInput[] {
  const seen = new Set<MissingInput>();
  const unique: MissingInput[] = [];
  for (const input of inputs) {
    if (seen.has(input)) continue;
    seen.add(input);
    unique.push(input);
  }
  return unique;
}

/** Format score parts compactly for the single-sentence explanation. */
export function formatScoreParts(parts: ScoreParts): string {
  const pieces: string[] = [
    `prior ${parts.prior} (${parts.priorSource ?? 'neutral'})`,
    parts.exploration !== undefined || parts.sampleCount !== undefined
      ? `learned ${signed(parts.learned)} (exploration ${signed(parts.exploration ?? 0)}, n=${parts.sampleCount ?? 0})`
      : `learned ${signed(parts.learned)}`,
    `preference ${signed(parts.preference)}`,
    `limit ${signed(parts.limit)}`,
  ];
  if (parts.override !== undefined) {
    const label = parts.overrideLabel
      ? `override: ${sanitizeText(parts.overrideLabel)}`
      : 'override';
    pieces.push(`${label} (${signed(parts.override)})`);
  }
  return `[${pieces.join(', ')}]`;
}

/** Render limit evidence freshness from wall-clock `nowMs`, or `age unknown`. */
export function formatLimitAge(
  readAt: number | null | undefined,
  nowMs: number | undefined,
): string {
  if (
    readAt === null ||
    readAt === undefined ||
    nowMs === undefined ||
    !Number.isFinite(readAt) ||
    !Number.isFinite(nowMs)
  ) {
    return 'age unknown';
  }
  const ageMs = Math.max(0, nowMs - readAt);
  if (ageMs < 1000) return `age ${Math.round(ageMs)}ms`;
  if (ageMs < 60_000) return `age ${Math.round(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `age ${Math.round(ageMs / 60_000)}m`;
  return `age ${Math.round(ageMs / 3_600_000)}h`;
}

function formatCandidateLabel(displayName: string, id: string): string {
  const cleanName = sanitizeText(displayName);
  return cleanName === id ? id : `${cleanName} (${id})`;
}

function truncateSnippet(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 3)}...`;
}

function formatAmbiguousMatchIds(ids: readonly string[]): string {
  if (ids.length <= DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP) {
    return ids.join('/');
  }
  const shown = ids.slice(0, DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP).join('/');
  const remaining = ids.length - DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP;
  return `${shown} and ${remaining} more`;
}

/** Stable deduplication key for one preference diagnostic entry and match set. */
export function preferenceDiagnosticKey(entry: PreferenceDiagnostic): string {
  if ('source' in entry) {
    return `empty\u0000${entry.source}\u0000${entry.status}`;
  }
  const rankKey = entry.status === 'matched' ? String(entry.rank) : '';
  return [
    'match',
    sanitizeText(entry.entry),
    entry.status,
    entry.ids.join('\u0001'),
    entry.via ?? '',
    rankKey,
    entry.detail ?? '',
  ].join('\u0000');
}

function formatPreferenceDiagnostic(entry: PreferenceDiagnostic): string {
  if ('source' in entry) {
    return `${entry.source} list empty (ignored)`;
  }
  const selector = truncateSnippet(
    sanitizeText(entry.entry),
    DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS,
  );
  switch (entry.status) {
    case 'matched':
      return `${selector}->${entry.ids[0]} via ${entry.via ?? 'id'} (#${entry.rank})`;
    case 'unknown':
      return entry.detail
        ? `${selector}: unknown (${entry.detail})`
        : `${selector}: unknown`;
    case 'ambiguous':
      return `${selector}: ambiguous (${formatAmbiguousMatchIds(entry.ids)})`;
    case 'duplicate':
      return `${selector}: duplicate`;
    case 'ineligible':
      return `${selector}->${entry.ids[0]}: ineligible`;
  }
}

function formatPreferenceClause(input: ChosenExplanationInput): string {
  const details: string[] = [];
  if (
    input.overriddenPreferenceSources !== undefined &&
    input.overriddenPreferenceSources.length > 0
  ) {
    details.push(`overridden: ${input.overriddenPreferenceSources.join(', ')}`);
  }
  if (input.preferenceMatches !== undefined) {
    const unique: PreferenceDiagnostic[] = [];
    const seen = new Set<string>();
    for (const match of input.preferenceMatches) {
      const key = preferenceDiagnosticKey(match);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(match);
    }
    const shown = unique.slice(0, EXPLANATION_PREFERENCE_DIAGNOSTICS_CAP);
    for (const match of shown) {
      details.push(formatPreferenceDiagnostic(match));
    }
    if (unique.length > shown.length) {
      details.push(`and ${unique.length - shown.length} more`);
    }
  }
  if (input.preferenceLoss !== undefined) {
    const loss = input.preferenceLoss;
    const deficit = loss.candidateTotal - input.total;
    const why =
      input.decidingFactor === 'pin' ||
      input.decidingFactor === 'rotation' ||
      deficit >= 0
        ? `boost ${signed(loss.boost)} on ${sanitizeText(loss.candidateDisplayName)} total ${loss.candidateTotal} lost under ${input.decidingFactor}`
        : `boost ${signed(loss.boost)} on ${sanitizeText(loss.candidateDisplayName)} total ${loss.candidateTotal} lost to total ${input.total} (gap ${signed(deficit)})`;
    details.push(why);
  }
  const note = blankToUndefined(input.callerPreferenceNote);
  if (note !== undefined) {
    details.push(`note: ${sanitizeText(note)}`);
  }
  if (input.preferenceSource === undefined) {
    return details.length === 0
      ? 'no preferences active'
      : `no preferences active (${details.join(', ')})`;
  }
  return details.length === 0
    ? `preferences from ${input.preferenceSource}`
    : `preferences from ${input.preferenceSource} (${details.join(', ')})`;
}

function formatPolicyClause(input: {
  readonly policyCondition: string;
  readonly tier: ModelTier;
  readonly effort: ModelEffort;
  readonly matchedRuleId?: string;
  readonly policyRuleNote?: string | null;
}): string {
  const base = `policy ${sanitizeText(input.policyCondition)}, ${input.tier}/${input.effort}`;
  if (input.policyRuleNote) {
    return `${base} after ${sanitizeText(input.policyRuleNote)}`;
  }
  if (input.matchedRuleId !== undefined) {
    return `${base} (rule ${input.matchedRuleId})`;
  }
  return base;
}

function formatLimitClause(
  limitState: LaneLimitState,
  evidence: LimitEvidence | undefined,
  nowMs: number | undefined,
): string {
  const age = formatLimitAge(evidence?.readAt, nowMs);
  if (evidence?.lookup !== undefined && evidence.lookup !== 'ok') {
    return `limit ${limitState} (lookup ${evidence.lookup}, ${age})`;
  }
  return `limit ${limitState} (${age})`;
}

/** One-sentence explanation for a chosen roster row. */
export function compileChosenExplanation(
  input: ChosenExplanationInput,
): string {
  const chosenLabel = formatCandidateLabel(input.displayName, input.candidateId);
  const chosenParts = input.parts ? ` ${formatScoreParts(input.parts)}` : '';
  const lead = `Selected ${chosenLabel} (model ${sanitizeText(input.model)}) with total ${input.total}${chosenParts}`;
  const comparison =
    input.strongestAlternative === undefined
      ? 'with no eligible alternative'
      : `over runner-up ${formatCandidateLabel(input.strongestAlternative.displayName, input.strongestAlternative.id)} at total ${input.strongestAlternative.total}${input.strongestAlternative.parts ? ` ${formatScoreParts(input.strongestAlternative.parts)}` : ''} (gap ${signed(input.total - input.strongestAlternative.total)})`;
  return `${lead} ${comparison}, decided by ${input.decidingFactor}, ${formatPreferenceClause(input)}, ${formatPolicyClause(input)}, ${formatLimitClause(input.limitState, input.limitEvidence, input.nowMs)}.`;
}

/** One-sentence explanation for an unavailable roster row naming its blocking constraint. */
export function compileUnavailableExplanation(
  input: UnavailableExplanationInput,
): string {
  const details: string[] = [];
  if (input.pinRule !== null) {
    details.push(`pin rule ${input.pinRule}`);
  }
  if (input.needsDisclosedFallback) {
    details.push('disclosed fallback required');
  }
  if (input.excludedBy.length > 0) {
    details.push(
      `excluded: ${input.excludedBy.map((entry) => `${entry.candidate} by ${entry.rule}`).join(', ')}`,
    );
  }
  const detailText = details.length === 0 ? '' : ` (${details.join(', ')})`;
  return `Phase ${sanitizeText(input.phaseId)} is unavailable due to blocking constraint ${input.exclusionReason}${detailText}, ${formatPolicyClause(input)}.`;
}

export function compileChosenReason(input: ChosenReasonInput): string {
  assertToken('phase id', input.phaseId);
  assertClause('model', input.model);
  assertScore(input.score);
  assertCellScore(input);
  if (!input.inputRowIds.includes(input.executor.id)) {
    throw new Error(`chosen executor ${input.executor.id} is not an input row`);
  }
  const { effort, evidence, explore, sampleCount = 0 } = input.parts ?? {};
  const scoredPair =
    input.executor.kind === 'lane' &&
    effort !== undefined &&
    evidence !== undefined;
  const clauses = [
    `phase ${input.phaseId}`,
    executorClause(input.executor),
    scoredPair
      ? `model ${input.model} effort ${effort} (${evidence}, ${sampleCount} samples)`
      : `model ${input.model}`,
    `score ${input.score}`,
    provenanceClause(input.cell),
    `limit state ${input.limitState}`,
    `rotation ${changedPhrase(input.rotationChangedChoice)}`,
    preferenceClause(input.preferenceChangedChoice, input.preferenceSource),
    modelProbabilityClause(input.source, input.reportedConfidence),
    fallbackClause(input.fallbackCause),
  ];
  if (scoredPair && explore === true) {
    clauses.push(
      `explore ${input.model}/${effort}: ${sampleCount}/${EXPLORATION_MIN_SAMPLES} samples, 1 of every ${EXPLORATION_PERIOD} routed runs`,
    );
  }
  if (input.executor.kind === 'lane' && input.effortCheck?.inList === false) {
    clauses.push(
      `effort ${input.effortCheck.requested} not in ${input.executor.id} native list; spawn sends no effort at this step`,
    );
  }
  return joinClauses(clauses);
}

export function compileUnavailableReason(
  input: UnavailableReasonInput,
): string {
  assertToken('phase id', input.phaseId);
  assertPinRule(input);
  assertDisclosedFallback(input);
  const candidateClauses =
    input.excludedBy.length === 0
      ? ['no candidate excluded']
      : input.excludedBy.map((fact) => {
          assertKnownCandidate(fact.candidate, fact.rule, input.inputRowIds);
          return `candidate ${fact.candidate} excluded by ${fact.rule}`;
        });
  return joinClauses([
    `phase ${input.phaseId}`,
    `exclusion reason ${input.exclusionReason}`,
    `pin rule ${input.pinRule ?? 'none'}`,
    `disclosed fallback ${input.needsDisclosedFallback}`,
    ...candidateClauses,
  ]);
}

export function compileResultReasons(input: {
  readonly excluded: readonly ExcludedCandidateFact[];
  readonly missingInputs: readonly MissingInput[];
  readonly inputRowIds: readonly string[];
}): readonly string[] {
  const reasons: string[] = [];
  for (const fact of input.excluded) {
    assertToken('phase id', fact.phaseId);
    assertKnownCandidate(fact.candidate, fact.rule, input.inputRowIds);
    reasons.push(
      `phase ${fact.phaseId} candidate ${fact.candidate} excluded by ${fact.rule}`,
    );
  }
  for (const missing of uniqueMissing(input.missingInputs)) {
    reasons.push(MISSING_INPUT_REASON[missing]);
  }
  return reasons;
}

export function compilePreflightReasons(input: {
  readonly answers: readonly PreflightAnswerFacts[];
  readonly missingInputs: readonly MissingInput[];
}): readonly string[] {
  const reasons: string[] = [];
  for (const answer of input.answers) {
    assertToken('answer name', answer.name);
    reasons.push(
      joinClauses([
        `${answer.name} source ${answer.source}`,
        modelProbabilityClause(answer.source, answer.reportedConfidence),
        fallbackClause(answer.fallbackCause),
      ]),
    );
  }
  for (const missing of uniqueMissing(input.missingInputs)) {
    reasons.push(MISSING_INPUT_REASON[missing]);
  }
  return reasons;
}

function excludedKey(fact: ExcludedCandidateFact): string {
  return `${fact.phaseId}\u0000${fact.candidate}\u0000${fact.rule}`;
}

/**
 * Top-level lines list `excluded` first, then any unavailable `excludedBy`
 * pair that is not already there, then one pin-unavailable line per such
 * entry, then missing inputs (omitting generic `models unknown` when per-lane
 * detail is present in `extraReasons`), then deduplicated `extraReasons`.
 */
export function compileGateReasons(input: GateReasonInput): GateReasonOutput {
  const chosenReasons = input.chosen.map((facts) =>
    compileChosenReason({ ...facts, inputRowIds: input.inputRowIds }),
  );
  const unavailableReasons = input.unavailable.map((facts) =>
    compileUnavailableReason({ ...facts, inputRowIds: input.inputRowIds }),
  );
  const excluded: ExcludedCandidateFact[] = [];
  const seen = new Set<string>();
  const pushExcluded = (fact: ExcludedCandidateFact): void => {
    const key = excludedKey(fact);
    if (seen.has(key)) return;
    seen.add(key);
    excluded.push(fact);
  };
  for (const fact of input.excluded) {
    pushExcluded(fact);
  }
  for (const entry of input.unavailable) {
    for (const fact of entry.excludedBy) {
      pushExcluded({
        phaseId: entry.phaseId,
        candidate: fact.candidate,
        rule: fact.rule,
      });
    }
  }
  const reasons: string[] = [];
  const seenReasons = new Set<string>();
  const pushReason = (line: string): void => {
    if (line.length === 0 || seenReasons.has(line)) return;
    seenReasons.add(line);
    reasons.push(line);
  };

  for (const line of compileResultReasons({
    excluded,
    missingInputs: [],
    inputRowIds: input.inputRowIds,
  })) {
    pushReason(line);
  }
  for (const entry of input.unavailable) {
    if (entry.exclusionReason === 'pin-unavailable' && entry.pinRule !== null) {
      assertToken('phase id', entry.phaseId);
      pushReason(
        `phase ${entry.phaseId} pin unavailable, pin rule ${entry.pinRule}`,
      );
    }
  }
  const extraReasons = input.extraReasons ?? [];
  const boundedExtra = boundAggregateDiagnostics(extraReasons, seenReasons);
  const hasPerLaneModelStatus = boundedExtra.some((line) =>
    line.startsWith(PER_LANE_MODEL_UNKNOWN_PREFIX),
  );
  for (const missing of uniqueMissing(input.missingInputs)) {
    if (missing === 'model-lists' && hasPerLaneModelStatus) continue;
    pushReason(MISSING_INPUT_REASON[missing]);
  }
  for (const extra of boundedExtra) {
    pushReason(extra);
  }
  return { chosenReasons, unavailableReasons, reasons };
}

const RULE_EXCLUDE_PREFIX_START = 'routing rule ';
const RULE_EXCLUDE_SELECTOR_MARKER = ': exclude selector "';
const RULE_EXCLUDE_UNKNOWN_SUFFIX = '" matched no candidate';
const RULE_EXCLUDE_AMBIGUOUS_MARKER = '" is ambiguous (';

function formatAggregateDiagnosticDisplay(raw: string): string {
  if (raw.startsWith(RULE_EXCLUDE_PREFIX_START)) {
    const markerIndex = raw.indexOf(
      RULE_EXCLUDE_SELECTOR_MARKER,
      RULE_EXCLUDE_PREFIX_START.length,
    );
    if (markerIndex !== -1) {
      const selectorStart = markerIndex + RULE_EXCLUDE_SELECTOR_MARKER.length;
      let selectorEnd = -1;
      if (raw.endsWith(RULE_EXCLUDE_UNKNOWN_SUFFIX)) {
        selectorEnd = raw.length - RULE_EXCLUDE_UNKNOWN_SUFFIX.length;
      } else if (raw.endsWith(')')) {
        const ambiguousIndex = raw.lastIndexOf(RULE_EXCLUDE_AMBIGUOUS_MARKER);
        if (ambiguousIndex >= selectorStart) {
          selectorEnd = ambiguousIndex;
        }
      }
      if (selectorEnd >= selectorStart) {
        const prefix = raw.slice(0, selectorStart);
        const selector = raw.slice(selectorStart, selectorEnd);
        const suffix = raw.slice(selectorEnd);
        const boundedSelector = truncateSnippet(
          selector,
          DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS,
        );
        return truncateSnippet(
          `${prefix}${boundedSelector}${suffix}`,
          DIAGNOSTIC_LINE_MAX_CHARS,
        );
      }
    }
  }
  return truncateSnippet(raw, DIAGNOSTIC_LINE_MAX_CHARS);
}

function toAggregateDiagnostic(
  entry: AggregateDiagnosticInput,
): AggregateDiagnostic {
  if (typeof entry === 'string') {
    return {
      identity: entry,
      display: formatAggregateDiagnosticDisplay(entry),
    };
  }
  return {
    identity: entry.identity,
    display: formatAggregateDiagnosticDisplay(entry.display),
  };
}

function omittedDiagnosticsLine(omitted: number): string {
  return omitted === 1
    ? 'and 1 more diagnostic entry omitted'
    : `and ${omitted} more diagnostic entries omitted`;
}

function boundAggregateDiagnostics(
  rawEntries: readonly AggregateDiagnosticInput[],
  alreadySeen: ReadonlySet<string>,
): readonly string[] {
  const distinct: AggregateDiagnostic[] = [];
  const seenIdentities = new Set<string>(alreadySeen);
  for (const rawEntry of rawEntries) {
    const entry = toAggregateDiagnostic(rawEntry);
    if (entry.display.length === 0 || seenIdentities.has(entry.identity)) {
      continue;
    }
    seenIdentities.add(entry.identity);
    distinct.push(entry);
  }

  const uniqueDisplays: string[] = [];
  const seenDisplays = new Set<string>(alreadySeen);
  let displayCollisions = 0;
  for (const entry of distinct) {
    if (seenDisplays.has(entry.display)) {
      displayCollisions += 1;
      continue;
    }
    seenDisplays.add(entry.display);
    uniqueDisplays.push(entry.display);
  }

  const emitted: string[] = [];
  let usedChars = 0;
  for (const line of uniqueDisplays) {
    if (usedChars + line.length > AGGREGATE_DIAGNOSTIC_MAX_CHARS) break;
    emitted.push(line);
    usedChars += line.length;
  }

  let omitted = displayCollisions + uniqueDisplays.length - emitted.length;
  if (omitted > 0) {
    let marker = omittedDiagnosticsLine(omitted);
    while (usedChars + marker.length > AGGREGATE_DIAGNOSTIC_MAX_CHARS) {
      const removed = emitted.pop();
      if (removed === undefined) break;
      usedChars -= removed.length;
      marker = omittedDiagnosticsLine(++omitted);
    }
    emitted.push(marker);
  }
  return emitted;
}
