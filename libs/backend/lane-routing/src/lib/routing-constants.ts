import type { LaneLimitState } from '@ptah-extension/shared';

/**
 * Routing values (part A, "Routing constants"). One place for later specs
 * to import. Letters in the source plan: S scale, B band, T tie-break,
 * K rotation key, L rotation lifetime, P options per phase, Q questions.
 *
 * Comparisons that the numbers do not state by themselves:
 * - inside the closeness band when `top - score <= CLOSENESS_BAND`
 * - confidence falls back when `confidence < CONFIDENCE_THRESHOLD`
 * - a cell is stale when `now - asOf > STALENESS_AGE_MS`
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** S. Integer score scale, higher is better. */
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/** Midpoint. A missing profile neither attracts nor repels. */
export const NEUTRAL_SCORE = 50;

/** Maximum magnitude of the learned adjustment before exploration. */
export const LEARNED_DELTA_CAP = 15;

/** Extra points for a cell with too few local runs. */
export const EXPLORATION_BONUS = 5;

/** Local run count at which the exploration bonus ends. */
export const EXPLORATION_MIN_SAMPLES = 3;

/** Points for preference ranks 1, 2, 3, and 4 or later. */
export const PREFERENCE_BOOST = [12, 8, 4, 2] as const;

/** Accepted identifier syntax for routing rules and their exclusion tokens. */
export const ROUTING_RULE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** Score adjustments for eligible limit states. */
export const LIMIT_ADJUST = {
  'confirmed-room': 0,
  unknown: -5,
  'near-limit': -10,
} as const;

/** End-to-end routing budget in milliseconds for each stage. */
export const ROUTE_DEADLINE_MS = { 'gate-0.1': 8000, 'pre-flight': 4000 } as const;

/** Milliseconds reserved for assembling and returning the routing result. */
export const ROUTE_RETURN_RESERVE_MS = 250;

/** Maximum number of questions sent in a single decision-model call. */
export const DECISION_QUESTIONS_PER_CALL = 2;

/** Seed label map. Gaps are 15 and 30, both larger than `CLOSENESS_BAND`. */
export const SEED_LABEL_SCORE = {
  strong: 80,
  good: 65,
  weak: 35,
} as const;

export type SeedLabel = keyof typeof SEED_LABEL_SCORE;

/**
 * B. A difference equal to the band is inside it
 * (`top - score <= CLOSENESS_BAND`).
 */
export const CLOSENESS_BAND = 5;

/**
 * Limit order inside the band, best first. `at-limit` is excluded before
 * this order runs. Spellings match `LaneLimitState`
 * (`libs/shared/src/lib/utils/plan-limits/lane-state.ts`).
 */
export const INSIDE_BAND_LIMIT_ORDER = [
  'confirmed-room',
  'unknown',
  'near-limit',
] as const satisfies readonly LaneLimitState[];

export type InsideBandLimitState = (typeof INSIDE_BAND_LIMIT_ORDER)[number];

export const EXCLUDED_LIMIT_STATE = 'at-limit' satisfies LaneLimitState;

/**
 * T. Ranking order before band rotation, starting with descending additive total.
 * Equal totals use ascending selected preference rank (unranked last), limit class,
 * executor kind, and ordinal candidate id.
 */
export const TIE_BREAK_STEPS = [
  'total',
  'preferenceRank',
  'limitClass',
  'executorKind',
  'candidateId',
] as const;

export type TieBreakStep = (typeof TIE_BREAK_STEPS)[number];

export const PREFERRED_RANK_MIN_RANKED = 1;
export const PREFERRED_RANK_UNRANKED = 0;

export const TIE_BREAK_EXECUTOR_KIND_ORDER = ['lane', 'subagent', 'child-session'] as const;

export type TieBreakExecutorKind =
  (typeof TIE_BREAK_EXECUTOR_KIND_ORDER)[number];

/**
 * K. Rotation key is `${phaseId}${ROTATION_KEY_SEPARATOR}${taskKind}`
 * with `taskKind` an `OutcomeTaskKind` (`OUTCOME_TASK_KINDS` in
 * `@ptah-extension/shared`, the single task-kind union, plan R4j).
 * Phase ids belong to the caller.
 */
export const ROTATION_KEY_SEPARATOR = '|';

/** L. Global `IStateStorage` key. Map of rotation key to last chosen id. */
export const ROTATION_STORAGE_KEY = 'laneRouting.rotation.v1';

/** L. Oldest keys are dropped past this cap. */
export const ROTATION_MAX_KEYS = 200;

/**
 * P. Options per phase are `min(OPTIONS_PER_PHASE_CAP, provider limit)`.
 * Shrinking stops at `MIN_OPTIONS_PER_PHASE`; below that the request is
 * `payload-too-large`.
 */
export const OPTIONS_PER_PHASE_CAP = 4;
export const MIN_OPTIONS_PER_PHASE = 2;
export const LANE_MODEL_ALTERNATES_CAP = 2;

export const PROVIDER_OPTION_LIMIT = {
  ollama: 26,
  jev: 255,
  structuredOutput: 8,
} as const;

export type DecisionOptionProvider = keyof typeof PROVIDER_OPTION_LIMIT;

/** Q. Questions in one decision-model request. */
export const QUESTIONS_PER_REQUEST = 32;

/**
 * Per decision-model request, then the margin kept for the return path.
 * A System One call uses its target's `timeoutMs` instead: the
 * `agentOrchestration.decisionModelTimeoutMs` setting when set, else this
 * value (local) or `DECISION_REQUEST_TIMEOUT_REMOTE_MS` (remote). A
 * structured-output call always uses this value.
 */
export const DECISION_REQUEST_TIMEOUT_MS = 3000;
export const DECISION_RETURN_MARGIN_MS = 250;

/**
 * Per decision-model request to a `remote` target (DC8); `local` targets
 * keep `DECISION_REQUEST_TIMEOUT_MS`. Calibrated by plan Component 16 from
 * the keyed live run (TASK_2026_684, clef:27b-cloud): first inference call
 * 1518 ms (the suite's first call, not proof the remote worker was cold),
 * warm p50 665 ms, p95 977 ms. Both are <= 3000 ms (margins 1482 ms and
 * 2023 ms), so the value stays 3000.
 *
 * This number is an inference budget. When no decision-model timeout is
 * saved, a local Ollama cold load uses `SYSTEM_ONE_LOAD_TIMEOUT_MS` until
 * `GET /api/ps` shows the model loaded, and the request sends `keep_alive`
 * so the next call stays warm. A saved timeout bounds every request,
 * including that cold load. A warm call that exceeds its budget still
 * falls back.
 */
export const DECISION_REQUEST_TIMEOUT_REMOTE_MS = 3000;

/** Model lists for every row, each row raced on its own. */
export const MODEL_LISTING_BUDGET_MS = 2000;

/** Gather budget inside the overall call budget. Separate from listing. */
export const GATHER_BUDGET_MS = 2000;

export const MAX_DECISION_REQUESTS = 2;

/**
 * `GATHER_BUDGET_MS + MAX_DECISION_REQUESTS * (timeout + margin)`, with the
 * larger of the local and remote request timeouts. Documents the default
 * only; no code enforces it. A System One target's `timeoutMs` comes from
 * the `agentOrchestration.decisionModelTimeoutMs` setting when it is set
 * (`decision-model.target.ts`), and the budget grows with it.
 */
export const OVERALL_CALL_BUDGET_MS =
  GATHER_BUDGET_MS +
  MAX_DECISION_REQUESTS *
    (Math.max(DECISION_REQUEST_TIMEOUT_MS, DECISION_REQUEST_TIMEOUT_REMOTE_MS) +
      DECISION_RETURN_MARGIN_MS);

/** Falls back when `confidence < CONFIDENCE_THRESHOLD`. */
export const CONFIDENCE_THRESHOLD = 0.5;

/** Request body cap for every decision-model kind. */
export const REQUEST_SIZE_LIMIT_BYTES = 64 * 1024;

/** Maximum characters kept from one selector string in diagnostic text. */
export const DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS = 48;

/** Maximum matched candidate IDs shown in an ambiguous-selector diagnostic before "and K more". */
export const DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP = 3;

/** Maximum characters kept from any single aggregate diagnostic line. */
export const DIAGNOSTIC_LINE_MAX_CHARS = 240;

/** Maximum aggregate diagnostic characters emitted into top-level `reasons` (including omitted marker). */
export const AGGREGATE_DIAGNOSTIC_MAX_CHARS = 4000;

/** Maximum preference diagnostics listed in one phase explanation before "and K more". */
export const EXPLANATION_PREFERENCE_DIAGNOSTICS_CAP = 8;

/** Stale when `now - asOf > STALENESS_AGE_MS`. */
export const STALENESS_AGE_DAYS = 180;
export const STALENESS_AGE_MS = STALENESS_AGE_DAYS * MS_PER_DAY;

/**
 * Prior weight `k` in the local-cell blend (Requirement 8):
 * `round(100 * (s + k * prior / 100) / (n + k))` per available rate. The
 * prior is the exact seed cell for the same family, model and task kind,
 * else `NEUTRAL_SCORE`.
 */
export const BLEND_PRIOR_WEIGHT = 10;

/** `sinceMs = now - OUTCOME_WINDOW_MS` for routing rates. */
export const OUTCOME_WINDOW_DAYS = 90;
export const OUTCOME_WINDOW_MS = OUTCOME_WINDOW_DAYS * MS_PER_DAY;

function assertRoutingConstantInvariants(): void {
  const strongToGood = SEED_LABEL_SCORE.strong - SEED_LABEL_SCORE.good;
  const goodToWeak = SEED_LABEL_SCORE.good - SEED_LABEL_SCORE.weak;
  if (CLOSENESS_BAND >= strongToGood || CLOSENESS_BAND >= goodToWeak) {
    throw new Error('CLOSENESS_BAND must be smaller than every seed-label gap');
  }
  if (OPTIONS_PER_PHASE_CAP < MIN_OPTIONS_PER_PHASE) {
    throw new Error(
      'OPTIONS_PER_PHASE_CAP must be at least MIN_OPTIONS_PER_PHASE',
    );
  }
  if (LANE_MODEL_ALTERNATES_CAP < 0 || LANE_MODEL_ALTERNATES_CAP >= OPTIONS_PER_PHASE_CAP) {
    throw new Error('LANE_MODEL_ALTERNATES_CAP must fit below OPTIONS_PER_PHASE_CAP');
  }
}

assertRoutingConstantInvariants();
