import {
  REVIEW_LANE_CATALOG_MAX,
  REVIEW_LANE_POOL_MAX,
  ReviewLaneRoleSchema,
  type ReviewLaneEntry,
  type ReviewLaneListing,
  type ReviewLaneListingEntry,
  type ReviewLaneRole,
} from '@ptah-extension/review-contracts';
import type { PtahSelectOption } from '@ptah-extension/ui';

/** Load state of the lane listing, kept apart from the drawer's own settings load state. */
export type ReviewLaneListState = 'idle' | 'loading' | 'ready' | 'error';

/** Select value for "Lane default" and "Follow the pool". Lane and model ids never are empty. */
export const NO_CHOICE = '';

/** Where an entry is used: a pool row skips it, a pin falls back to the pool order. */
export type ReviewLaneEntryPlace = 'pool' | 'pin';

export interface ReviewLaneMark {
  readonly status: 'warning' | 'pending';
  readonly label: string;
}

/** What a pool or pin row shows about one saved entry. */
export interface ReviewLaneEntryState {
  /** Tints the row and means reviews skip the entry. */
  readonly unavailable: boolean;
  readonly marks: readonly ReviewLaneMark[];
  /** Full reason sentence, or `null` when the entry is usable or its state is unknown. */
  readonly reason: string | null;
  /** Row hints about the lane's model list. */
  readonly hints: readonly string[];
}

export const REVIEW_LANE_ROLES: readonly ReviewLaneRole[] = ReviewLaneRoleSchema.options;

export const LANE_HINTS = {
  catalogEmpty: 'This lane lists no models.',
  catalogFailed: 'Models for this lane could not be read. The saved model is kept.',
  catalogTruncated: `Only the first ${REVIEW_LANE_CATALOG_MAX} models are listed.`,
  allCatalogsFailed:
    'Model list unreadable. Saved models are kept and sent as they are. You can still choose Lane default.',
  listError: 'Lanes could not be read. Saved entries are shown as they are.',
  empty: 'No lanes chosen. Reviews follow the global agent order.',
  poolFull: `The pool holds up to ${REVIEW_LANE_POOL_MAX} entries.`,
  duplicate: 'Already in the pool with this model.',
} as const;

const REASONS = {
  laneMissing: 'Lane not listed. It may be uninstalled or disabled in global settings.',
  atLimit: 'At its usage limit.',
  modelBlocked: 'Model blocked for review lanes.',
  modelNotOffered: 'Model not offered by this lane.',
} as const;

const REASON_ENDINGS: Readonly<Record<ReviewLaneEntryPlace, string>> = {
  pool: 'Reviews skip it and say so.',
  pin: 'Reviews use the pool order and say so.',
};

const UNAVAILABLE: ReviewLaneMark = { status: 'warning', label: 'Unavailable' };
const AT_LIMIT: ReviewLaneMark = { status: 'warning', label: 'At limit' };
const LIMIT_UNKNOWN: ReviewLaneMark = { status: 'pending', label: 'Limit unknown' };
const STATUS_UNKNOWN: ReviewLaneMark = { status: 'pending', label: 'Status unknown' };

/** The listing the rows may trust: none while it is missing or failed. */
export function usableListing(
  listing: ReviewLaneListing | null,
  listState: ReviewLaneListState,
): ReviewLaneListing | null {
  return listState === 'error' ? null : listing;
}

export function findLane(listing: ReviewLaneListing | null, id: string): ReviewLaneListingEntry | null {
  return listing?.lanes.find((lane) => lane.id === id) ?? null;
}

/** The lane's label, or its raw id when the listing does not hold it. */
export function laneLabel(listing: ReviewLaneListing | null, id: string): string {
  return findLane(listing, id)?.label ?? id;
}

export function roleLabel(role: ReviewLaneRole): string {
  if (role === 'triage') return 'Triage';
  if (role === 'verifier') return 'Verifier';
  return role;
}

export function limitText(lane: ReviewLaneListingEntry): string {
  if (lane.limitState === 'at-limit') return 'at limit';
  if (lane.limitState === 'unknown') return 'limit unknown';
  return 'room available';
}

/** One option per runnable lane, with family and limit state in the description. */
export function laneOptions(listing: ReviewLaneListing | null): PtahSelectOption<string>[] {
  return (listing?.lanes ?? []).map((lane) => ({
    value: lane.id,
    label: lane.label,
    description: `${lane.family} · ${limitText(lane)}`,
    keywords: [lane.id],
  }));
}

/** Pin lane choices: "Follow the pool", every lane, and a saved lane the listing no longer holds. */
export function pinLaneOptions(
  listing: ReviewLaneListing | null,
  pinnedLane: string | null,
): PtahSelectOption<string>[] {
  const options: PtahSelectOption<string>[] = [
    { value: NO_CHOICE, label: 'Follow the pool', description: 'No pin' },
    ...laneOptions(listing),
  ];
  if (pinnedLane !== null && !findLane(listing, pinnedLane)) {
    options.push({ value: pinnedLane, label: listing ? `${pinnedLane} (unavailable)` : pinnedLane });
  }
  return options;
}

function isBlocked(listing: ReviewLaneListing | null, model: string | null): boolean {
  return model !== null && (listing?.blockedModels.includes(model) ?? false);
}

/**
 * Model choices for one lane: "Lane default", the catalog without blocked models, and the saved
 * model when the catalog does not offer it. Only a verifiable catalog can call it "not offered".
 */
export function modelOptions(
  listing: ReviewLaneListing | null,
  laneId: string | null,
  savedModel: string | null,
): PtahSelectOption<string>[] {
  const options: PtahSelectOption<string>[] = [
    { value: NO_CHOICE, label: 'Lane default', description: 'No model is sent' },
  ];
  const lane = laneId === null ? null : findLane(listing, laneId);
  if (lane && lane.catalog.status === 'read') {
    for (const model of lane.catalog.models) {
      if (!isBlocked(listing, model)) options.push({ value: model, label: model });
    }
  }
  if (savedModel !== null && !options.some((option) => option.value === savedModel)) {
    options.push(savedModelOption(listing, lane, savedModel));
  }
  return options;
}

function savedModelOption(
  listing: ReviewLaneListing | null,
  lane: ReviewLaneListingEntry | null,
  model: string,
): PtahSelectOption<string> {
  if (isBlocked(listing, model)) {
    return { value: model, label: `${model} (blocked)`, description: 'Kept until you change it.' };
  }
  if (lane?.catalog.verifiable) {
    return { value: model, label: `${model} (not offered)`, description: 'Kept until you change it.' };
  }
  return { value: model, label: model, description: 'Saved. Not checked.' };
}

/** True when the listing has lanes and every lane's model read failed. */
export function allCatalogsFailed(listing: ReviewLaneListing | null): boolean {
  return !!listing && listing.lanes.length > 0 && listing.lanes.every((lane) => lane.catalog.status === 'failed');
}

function catalogHints(listing: ReviewLaneListing, lane: ReviewLaneListingEntry): string[] {
  if (lane.catalog.status === 'failed') return allCatalogsFailed(listing) ? [] : [LANE_HINTS.catalogFailed];
  if (lane.catalog.status === 'empty' || lane.catalog.models.length === 0) return [LANE_HINTS.catalogEmpty];
  return lane.catalog.truncated ? [LANE_HINTS.catalogTruncated] : [];
}

function unavailableReason(
  listing: ReviewLaneListing,
  lane: ReviewLaneListingEntry | null,
  entry: ReviewLaneEntry,
): string | null {
  if (!lane) return REASONS.laneMissing;
  if (lane.limitState === 'at-limit') return REASONS.atLimit;
  if (isBlocked(listing, entry.model)) return REASONS.modelBlocked;
  const catalog = lane.catalog;
  if (entry.model !== null && catalog.verifiable && !catalog.truncated && !catalog.models.includes(entry.model)) {
    return REASONS.modelNotOffered;
  }
  return null;
}

/**
 * Status of one saved entry against the listing, in the order selection checks it: lane not listed,
 * at limit, model blocked (also when the catalog is unreadable), model not offered (verifiable
 * catalogs only). Without a usable listing the state is unknown and nothing is marked unavailable.
 */
export function entryState(
  listing: ReviewLaneListing | null,
  entry: ReviewLaneEntry,
  place: ReviewLaneEntryPlace,
): ReviewLaneEntryState {
  if (!listing) return { unavailable: false, marks: [STATUS_UNKNOWN], reason: null, hints: [] };
  const lane = findLane(listing, entry.lane);
  const reason = unavailableReason(listing, lane, entry);
  const marks: ReviewLaneMark[] = [];
  if (lane?.limitState === 'at-limit') marks.push(AT_LIMIT);
  else if (reason) marks.push(UNAVAILABLE);
  if (lane?.limitState === 'unknown') marks.push(LIMIT_UNKNOWN);
  return {
    unavailable: reason !== null,
    marks,
    reason: reason ? `${reason} ${REASON_ENDINGS[place]}` : null,
    hints: lane ? catalogHints(listing, lane) : [],
  };
}

/** Indexes of pool entries that repeat an earlier entry's lane and model. */
export function duplicateEntryIndexes(pool: readonly ReviewLaneEntry[]): ReadonlySet<number> {
  const seen = new Set<string>();
  const repeats = new Set<number>();
  pool.forEach((entry, index) => {
    const key = JSON.stringify([entry.lane, entry.model]);
    if (seen.has(key)) repeats.add(index);
    seen.add(key);
  });
  return repeats;
}

export function poolFull(pool: readonly ReviewLaneEntry[]): boolean {
  return pool.length >= REVIEW_LANE_POOL_MAX;
}

/** Select value to stored model: "Lane default" is `null`. */
export function toModel(value: string | null): string | null {
  return value === null || value === NO_CHOICE ? null : value;
}

export const announce = {
  moved: (lane: string, direction: 'up' | 'down', position: number, total: number): string =>
    `${lane} moved ${direction} to position ${position} of ${total}`,
  removed: (lane: string, remaining: number): string => `${lane} removed. ${remaining} in pool`,
  added: (lane: string, position: number): string => `${lane} added at position ${position}`,
  pinned: (role: ReviewLaneRole, lane: string): string => `${roleLabel(role)} pinned to ${lane}`,
  pinCleared: (role: ReviewLaneRole): string => `${roleLabel(role)} pin cleared`,
} as const;
