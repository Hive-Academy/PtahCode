import type { OutcomeTaskKind } from '@ptah-extension/shared';
import type { PreferenceSource, ScoreParts } from '../contracts/route-decide-result.schema';
import {
  EXCLUDED_LIMIT_STATE,
  INSIDE_BAND_LIMIT_ORDER,
  LIMIT_ADJUST,
  SCORE_MAX,
  SCORE_MIN,
  TIE_BREAK_EXECUTOR_KIND_ORDER,
} from '../routing-constants';
import type { RoutingCandidate } from './candidate.types';
import { insideClosenessBand } from './closeness-band';
import { selectPreferences, type PreferenceDiagnostic } from './preference-match';
import {
  lastCandidateId,
  rotationKey,
  withPick,
  type RotationState,
} from './rotation.store';
import { preferenceBoost } from './score';

export interface RankedCandidate {
  readonly candidate: RoutingCandidate;
  /** Legacy effective matrix score on the 0–100 scale. */
  readonly score: number;
  /** Additive score from the calculator, before preference if no parts are supplied. */
  readonly total?: number;
  readonly parts?: ScoreParts;
  /**
   * Optional target total override applied after the preference part is known
   * (including in the unboosted counterfactual), preserving the parts sum.
   */
  readonly totalOverride?: {
    readonly target: number;
    readonly label: string;
  };
}

interface RankedTotal extends RankedCandidate {
  readonly total: number;
  readonly preferenceRank?: number;
}

export interface SpreadPreferences {
  /** Call selectors in preference order. */
  readonly prefer?: readonly string[];
}

export interface SpreadInput {
  readonly phaseId: string;
  readonly taskKind: OutcomeTaskKind;
  readonly candidates: readonly RankedCandidate[];
  /** Full phase inventory, including hard exclusions, for preference matching. */
  readonly inventory?: readonly RoutingCandidate[];
  readonly preferences?: SpreadPreferences;
  readonly rulePrefer?: readonly string[];
  readonly rotation: RotationState;
  readonly rotate?: boolean;
}

export interface SpreadResult {
  readonly key: string;
  readonly pick: RankedTotal | null;
  /** Offer order, with the closeness band starting at the rotated pick. */
  readonly ranking: readonly RankedTotal[];
  /** Descending additive totals with deterministic tie-breaks. */
  readonly rankingByTotal: readonly RankedTotal[];
  readonly rotation: RotationState;
  readonly rotationChangedChoice: boolean;
  readonly preferenceChangedChoice: boolean;
  readonly preferenceSource?: PreferenceSource;
  readonly overriddenPreferenceSources: readonly PreferenceSource[];
  readonly preferenceMatches: readonly PreferenceDiagnostic[];
}

/** Rank by additive total and rotate only within the band of the maximum. */
export function spread(input: SpreadInput): SpreadResult {
  assertCandidates(input.candidates);
  const key = rotationKey(input.phaseId, input.taskKind);
  const eligible = input.candidates.filter(({ candidate }) =>
    candidate.kind !== 'lane' || candidate.limitState !== EXCLUDED_LIMIT_STATE,
  );
  const preference = selectPreferences(
    input.rulePrefer,
    input.preferences?.prefer,
    input.inventory ?? input.candidates.map(({ candidate }) => candidate),
    new Set(eligible.map(({ candidate }) => candidate.id)),
  );
  const lastId = input.rotate === false ? null : lastCandidateId(input.rotation, key);
  const rankingByTotal = rankCandidates(eligible, preference.ranks);
  const pick = select(rankingByTotal, lastId);
  const pickIndex = pick === null ? -1 : rankingByTotal.indexOf(pick);
  let ranking = rankingByTotal;
  if (pickIndex > 0) {
    const top = rankingByTotal[0].total;
    const outsideBand = rankingByTotal.findIndex((entry) => !insideClosenessBand(top, entry.total));
    const bandEnd = outsideBand === -1 ? rankingByTotal.length : outsideBand;
    ranking = [
      ...rankingByTotal.slice(pickIndex, bandEnd),
      ...rankingByTotal.slice(0, pickIndex),
      ...rankingByTotal.slice(bandEnd),
    ];
  }
  const barePick = preference.ranks.size === 0
    ? pick
    : select(rankCandidates(eligible), lastId);
  return {
    key,
    pick,
    ranking,
    rankingByTotal,
    rotation: pick === null || input.rotate === false
      ? input.rotation
      : withPick(input.rotation, key, pick.candidate.id),
    rotationChangedChoice: pickIndex > 0,
    preferenceChangedChoice: pick?.candidate.id !== barePick?.candidate.id,
    ...(preference.source === undefined ? {} : { preferenceSource: preference.source }),
    overriddenPreferenceSources: preference.overridden,
    preferenceMatches: preference.matches,
  };
}

function rankCandidates(
  eligible: readonly RankedCandidate[],
  ranks?: ReadonlyMap<string, number>,
): RankedTotal[] {
  return eligible.map((entry): RankedTotal => {
    const preferenceRank = ranks?.get(entry.candidate.id);
    const preference = preferenceBoost(preferenceRank);
    const parts = entry.parts;
    if (entry.totalOverride !== undefined) {
      const target = entry.totalOverride.target;
      const preOverrideBase = entry.total === undefined
        ? parts === undefined
          ? entry.score + legacyLimitAdjustment(entry.candidate)
          : parts.prior + parts.learned + parts.limit
        : entry.total - (parts?.preference ?? 0) - (parts?.override ?? 0);
      if (!Number.isFinite(preOverrideBase)) {
        throw new Error(`base total must be finite for candidate ${entry.candidate.id}`);
      }
      const override = target - (preOverrideBase + preference);
      return {
        ...entry,
        total: target,
        ...(parts === undefined
          ? {}
          : {
              parts: {
                ...parts,
                preference,
                override,
                overrideLabel: entry.totalOverride.label,
              },
            }),
        ...(preferenceRank === undefined ? {} : { preferenceRank }),
      };
    }
    const base = entry.total === undefined
      ? parts === undefined
        ? entry.score + legacyLimitAdjustment(entry.candidate)
        : parts.prior + parts.learned + parts.limit + (parts.override ?? 0)
      : entry.total - (parts?.preference ?? 0);
    if (!Number.isFinite(base)) {
      throw new Error(`base total must be finite for candidate ${entry.candidate.id}`);
    }
    return {
      ...entry,
      total: base + preference,
      ...(parts === undefined ? {} : { parts: { ...parts, preference } }),
      ...(preferenceRank === undefined ? {} : { preferenceRank }),
    };
  }).sort(compare);
}

function legacyLimitAdjustment(candidate: RoutingCandidate): number {
  const state = candidate.kind === 'lane' ? candidate.limitState : 'unknown';
  return state === EXCLUDED_LIMIT_STATE ? 0 : LIMIT_ADJUST[state];
}

function select(ranking: readonly RankedTotal[], lastId: string | null): RankedTotal | null {
  const first = ranking[0];
  if (first === undefined) return null;
  if (lastId === null) return first;

  const band = ranking.filter((entry) => insideClosenessBand(first.total, entry.total));
  if (band.length === 1) return first;
  const index = band.findIndex((entry) => entry.candidate.id === lastId);
  if (index >= 0) return band[(index + 1) % band.length];

  // An eligible candidate below the band follows every band member in score order.
  if (ranking.some((entry) => entry.candidate.id === lastId)) return first;
  // The rotation store retains only the id once a candidate is ineligible or absent.
  const byId = band.sort((left, right) => compareOrdinal(left.candidate.id, right.candidate.id));
  return byId.find((entry) => entry.candidate.id > lastId) ?? first;
}

function compare(left: RankedTotal, right: RankedTotal): number {
  return right.total - left.total
    || (left.preferenceRank ?? Infinity) - (right.preferenceRank ?? Infinity)
    || limitRank(left.candidate) - limitRank(right.candidate)
    || TIE_BREAK_EXECUTOR_KIND_ORDER.indexOf(left.candidate.kind)
      - TIE_BREAK_EXECUTOR_KIND_ORDER.indexOf(right.candidate.kind)
    || compareOrdinal(left.candidate.id, right.candidate.id);
}

function limitRank(candidate: RoutingCandidate): number {
  const state = candidate.kind === 'lane' ? candidate.limitState : 'unknown';
  return INSIDE_BAND_LIMIT_ORDER.findIndex((limit) => limit === state);
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertCandidates(candidates: readonly RankedCandidate[]): void {
  const seen = new Set<string>();
  for (const entry of candidates) {
    const { candidate } = entry;
    const id = candidate.id;
    if (seen.has(id)) throw new Error(`candidate id must be unique: ${id}`);
    seen.add(id);
    if (!Number.isInteger(entry.score) || entry.score < SCORE_MIN || entry.score > SCORE_MAX) {
      throw new Error(`score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}`);
    }
    if (entry.total !== undefined && !Number.isFinite(entry.total)) {
      throw new Error('total must be finite');
    }
    if (entry.totalOverride !== undefined && !Number.isFinite(entry.totalOverride.target)) {
      throw new Error(`total override must be finite for candidate ${id}`);
    }
    if (candidate.kind === 'lane' && candidate.limitState !== EXCLUDED_LIMIT_STATE
        && !Object.hasOwn(LIMIT_ADJUST, candidate.limitState)) {
      throw new Error(`invalid limit state for candidate ${id}`);
    }
  }
}
