import type {
  ReviewLaneCatalog,
  ReviewLaneEntry,
  ReviewLaneFallback,
  ReviewLaneFallbackReason,
  ReviewLaneRole,
  ReviewLaneSettings,
} from '@ptah-extension/review-contracts';
import type { ReviewLaneCandidate } from './review-lane-list';

/** What an attempt needs from the host to choose lanes. The gateway implements it. */
export interface ReviewLaneSource {
  list(): Promise<{ lanes: ReviewLaneCandidate[]; maxConcurrentAgents: number }>;
  /** Never rejects for one lane; a lane missing from the result was not read. */
  listModels(laneIds: readonly string[], signal: AbortSignal): Promise<Record<string, ReviewLaneCatalog>>;
  modelBlocked(model: string): boolean;
}

export type ReviewLaneCatalogs = Readonly<Record<string, ReviewLaneCatalog>>;

export interface ReviewLaneSelectionInput {
  kind: ReviewLaneRole;
  lanes: readonly ReviewLaneCandidate[];
  settings: ReviewLaneSettings;
  catalog: ReviewLaneCatalogs;
  blocked(model: string): boolean;
  /** Lens diversity: families already used in the attempt, plus available pins of later lenses. */
  avoidFamilies: ReadonlySet<string>;
  /** Verifier: merged candidates per author family. */
  authorFamilyCounts?: ReadonlyMap<string, number>;
}

export interface ReviewLaneChoice {
  lane: ReviewLaneCandidate;
  /** `null` sends no model, so the lane's own model setting or CLI default applies. */
  model: string | null;
}

export interface ReviewLaneSelection {
  choice: ReviewLaneChoice | null;
  /** Pin and pool entries skipped before the choice, in the order they were met. */
  fallback: ReviewLaneFallback[];
}

export type ReviewLaneEntryAvailability =
  | { available: true; lane: ReviewLaneCandidate }
  | { available: false; reason: ReviewLaneFallbackReason; lane: ReviewLaneCandidate | null };

/**
 * Only a catalog that was read, not truncated, and holds a live-reported entry can say a model is
 * not offered (plan A5). The producer sets `verifiable`; status and truncation are checked again here.
 */
export function isVerifiableCatalog(catalog: ReviewLaneCatalog | undefined): boolean {
  return catalog !== undefined && catalog.verifiable && catalog.status === 'read' && !catalog.truncated;
}

export function catalogFor(catalogs: ReviewLaneCatalogs, laneId: string): ReviewLaneCatalog | undefined {
  return Object.prototype.hasOwnProperty.call(catalogs, laneId) ? catalogs[laneId] : undefined;
}

/**
 * Requirement 4.1, checked in this order: not listed, at limit, model blocked, model not offered.
 * An entry without a model is blocked when the lane's own default model is (M3).
 */
export function reviewLaneEntryAvailability(
  entry: ReviewLaneEntry,
  lanes: readonly ReviewLaneCandidate[],
  catalogs: ReviewLaneCatalogs,
  blocked: (model: string) => boolean,
): ReviewLaneEntryAvailability {
  const lane = lanes.find((candidate) => candidate.id === entry.lane);
  if (!lane) return { available: false, reason: 'lane-not-listed', lane: null };
  if (lane.limitState === 'at-limit') return { available: false, reason: 'at-limit', lane };
  if (entry.model === null ? lane.defaultModelBlocked === true : blocked(entry.model))
    return { available: false, reason: 'model-blocked', lane };
  const catalog = catalogFor(catalogs, entry.lane);
  if (entry.model !== null && isVerifiableCatalog(catalog) && !catalog?.models.includes(entry.model))
    return { available: false, reason: 'model-not-offered', lane };
  return { available: true, lane };
}

interface Preference {
  entry: ReviewLaneEntry;
  /** Pool entries are operator choices and are reported when skipped; global-order lanes are not. */
  fromPool: boolean;
  /** Known only for listed lanes. An unlisted entry ranks as an unused family. */
  family: string | null;
  index: number;
}

function rank(kind: ReviewLaneRole, preference: Preference, input: ReviewLaneSelectionInput): number {
  if (kind === 'triage' || preference.family === null) return 0;
  if (kind === 'verifier') return input.authorFamilyCounts?.get(preference.family) ?? 0;
  return input.avoidFamilies.has(preference.family) ? 1 : 0;
}

/**
 * Chooses one role's lane (requirements 2-4, decisions.md D6/D7).
 * - An available pin wins outright; an unavailable pin is recorded and the role continues unpinned.
 * - Unpinned roles use the pool in pool order, or with no pool every listed lane in gateway order
 *   without a model. A set pool never falls back to lanes outside it (plan A11).
 * - Lenses prefer families outside `avoidFamilies`; the verifier prefers the family that authored the
 *   fewest merged candidates. Ties keep preference order.
 * - Unavailable pool entries met before the choice are recorded; global-order lanes are skipped
 *   unrecorded (at limit, or default model blocked), as before. No available entry gives no choice.
 */
export function selectReviewLane(input: ReviewLaneSelectionInput): ReviewLaneSelection {
  const fallback: ReviewLaneFallback[] = [];
  const pin = input.settings.pins[input.kind];
  if (pin) {
    const availability = reviewLaneEntryAvailability(pin, input.lanes, input.catalog, input.blocked);
    if (availability.available) return { choice: { lane: availability.lane, model: pin.model }, fallback };
    fallback.push({ source: 'pin', lane: pin.lane, model: pin.model, reason: availability.reason });
  }
  const fromPool = input.settings.pool.length > 0;
  const preferences: Preference[] = fromPool
    ? input.settings.pool.map((entry, index) => ({
        entry, fromPool, index,
        family: input.lanes.find((lane) => lane.id === entry.lane)?.family ?? null,
      }))
    : input.lanes.map((lane, index) => ({ entry: { lane: lane.id, model: null }, fromPool, index, family: lane.family }));
  const ranked = preferences
    .map((preference) => ({ preference, rank: rank(input.kind, preference, input) }))
    .sort((a, b) => a.rank - b.rank || a.preference.index - b.preference.index)
    .map(({ preference }) => preference);
  for (const preference of ranked) {
    const availability = reviewLaneEntryAvailability(preference.entry, input.lanes, input.catalog, input.blocked);
    if (availability.available) return { choice: { lane: availability.lane, model: preference.entry.model }, fallback };
    if (preference.fromPool)
      fallback.push({ source: 'pool', lane: preference.entry.lane, model: preference.entry.model, reason: availability.reason });
  }
  return { choice: null, fallback };
}
