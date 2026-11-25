import type { PreferenceSource } from '../contracts/route-decide-result.schema';
import { PREFERRED_RANK_MIN_RANKED } from '../routing-constants';
import { candidateDisplayName, type RoutingCandidate } from './candidate.types';

type MatchTier = 'id' | 'displayName' | 'family' | 'cli';

export interface PreferenceMatch {
  readonly entry: string;
  readonly rank: number;
  readonly ids: readonly string[];
  readonly via?: MatchTier;
  readonly status: 'matched' | 'unknown' | 'ambiguous' | 'duplicate' | 'ineligible';
  readonly detail?: 'blank selector, ignored';
}

export type PreferenceDiagnostic = PreferenceMatch | {
  readonly source: 'rule' | 'call';
  readonly status: 'empty, ignored';
};

interface PreferenceSelection {
  readonly source?: PreferenceSource;
  readonly overridden: readonly PreferenceSource[];
  readonly matches: readonly PreferenceDiagnostic[];
  readonly ranks: ReadonlyMap<string, number>;
}

/** Resolve against the full inventory before checking the phase's eligibility. */
export function resolvePreferences(
  entries: readonly string[],
  candidates: readonly RoutingCandidate[],
  eligibleIds?: ReadonlySet<string>,
): readonly PreferenceMatch[] {
  const tiers: readonly [MatchTier, (candidate: RoutingCandidate) => string | undefined][] = [
    ['id', (candidate) => candidate.id],
    ['displayName', (candidate) => candidateDisplayName(candidate).toLowerCase()],
    ['family', (candidate) => candidate.family.toLowerCase()],
    ['cli', (candidate) => candidate.kind === 'lane' ? candidate.cli.toLowerCase() : undefined],
  ];
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const selector = entry.trim();
    const rank = index + 1;
    if (selector === '') {
      return { entry, rank, ids: [], status: 'unknown', detail: 'blank selector, ignored' };
    }
    for (const [via, alias] of tiers) {
      const key = via === 'id' ? selector : selector.toLowerCase();
      const ids = candidates
        .filter((candidate) => alias(candidate) === key)
        .map((candidate) => candidate.id)
        .sort();
      if (ids.length === 0) continue;
      if (ids.length > 1) return { entry, rank, ids, via, status: 'ambiguous' };
      const id = ids[0];
      if (seen.has(id)) return { entry, rank, ids, via, status: 'duplicate' };
      seen.add(id);
      const status = eligibleIds?.has(id) === false ? 'ineligible' : 'matched';
      return { entry, rank, ids, via, status };
    }
    return { entry, rank, ids: [], status: 'unknown' };
  });
}

/** Use the highest-precedence nonempty list, even if its entries give no boost. */
export function selectPreferences(
  rulePrefer: readonly string[] | undefined,
  callPrefer: readonly string[] | undefined,
  inventory: readonly RoutingCandidate[],
  eligibleIds: ReadonlySet<string>,
): PreferenceSelection {
  const configured: PreferenceMatch[] = [];
  for (const candidate of inventory) {
    if (candidate.kind !== 'lane') continue;
    const rank = candidate.preferredRank;
    if (rank === undefined || !Number.isInteger(rank) || rank < PREFERRED_RANK_MIN_RANKED) continue;
    configured.push({
      entry: candidate.id,
      rank,
      ids: [candidate.id],
      via: 'id',
      status: eligibleIds.has(candidate.id) ? 'matched' : 'ineligible',
    });
  }
  configured.sort((left, right) => left.rank - right.rank
    || (left.entry < right.entry ? -1 : left.entry > right.entry ? 1 : 0));
  const sources: PreferenceSource[] = [];
  const ignored: PreferenceDiagnostic[] = [];
  if (rulePrefer?.length === 0) ignored.push({ source: 'rule', status: 'empty, ignored' });
  if (callPrefer?.length === 0) ignored.push({ source: 'call', status: 'empty, ignored' });
  if (rulePrefer?.length) sources.push('rule');
  if (callPrefer?.length) sources.push('call');
  if (configured.length > 0) sources.push('configured');

  const [source, ...overridden] = sources;
  const explicit = source === 'rule' ? rulePrefer : source === 'call' ? callPrefer : undefined;
  const matches = explicit === undefined
    ? configured
    : resolvePreferences(explicit, inventory, eligibleIds);
  const ranks = new Map<string, number>();
  for (const match of matches) {
    if (match.status === 'matched') ranks.set(match.ids[0], match.rank);
  }
  return {
    ...(source === undefined ? {} : { source }),
    overridden,
    matches: [...ignored, ...matches],
    ranks,
  };
}
