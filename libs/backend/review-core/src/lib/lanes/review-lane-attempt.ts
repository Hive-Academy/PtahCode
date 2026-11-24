import { z } from 'zod';
import {
  ReviewLaneCatalogSchema,
  type Lens,
  type ReviewLaneCatalog,
  type ReviewLaneRole,
  type ReviewLaneSettings,
} from '@ptah-extension/review-contracts';
import type { Logger } from '@ptah-extension/vscode-core';
import type { IReviewLaneClock } from './review-lane-admission.service';
import { parseReviewLaneList } from './review-lane-list';
import {
  reviewLaneEntryAvailability,
  selectReviewLane,
  type ReviewLaneCatalogs,
  type ReviewLaneSelection,
  type ReviewLaneSource,
} from './review-lane-selection';
import type { IReviewLaneSettingsStore } from '../persistence/review-lane-settings.store';

/** Upper bound of the one catalog read an attempt makes. */
export const REVIEW_CATALOG_TIMEOUT_MS = 8_000;

/** Partial reason of a role that could not read the lane settings; the stage stays retryable (M2). */
export const LANE_SETTINGS_UNAVAILABLE = 'lane-settings-unavailable';

/** The lane settings could not be read; the role must not run on guessed settings. */
export class ReviewLaneSettingsUnavailableError extends Error {
  override readonly name = 'ReviewLaneSettingsUnavailableError';
  constructor(options?: { cause?: unknown }) {
    super(LANE_SETTINGS_UNAVAILABLE, options);
  }
}

export interface ReviewLaneChooseInput {
  kind: ReviewLaneRole;
  /** Families of lenses that already ran or were reused in this attempt. */
  usedFamilies?: readonly string[];
  /** Lenses that start after this one; their available pins count towards diversity now. */
  laterLenses?: readonly Lens[];
  /** Verifier only: merged candidates per author family. */
  authorFamilyCounts?: Readonly<Record<string, number>>;
}

export interface ReviewLaneAttemptChoice extends ReviewLaneSelection {
  /** From the same lane list read the choice used, so a role reads the gateway once. */
  maxConcurrentAgents: number;
}

export interface ReviewLaneAttemptDeps {
  source: ReviewLaneSource;
  settings: Pick<IReviewLaneSettingsStore, 'get'>;
  clock: IReviewLaneClock;
  logger: Pick<Logger, 'warn'>;
  signal?: AbortSignal;
}

/** Lanes whose saved model needs a catalog check: pool entries and pins that name a model. */
export function catalogLaneIds(settings: ReviewLaneSettings): string[] {
  const entries = [...settings.pool, ...Object.values(settings.pins)];
  const ids = new Set<string>();
  for (const entry of entries) if (entry && entry.model !== null) ids.add(entry.lane);
  return [...ids];
}

/**
 * Lane choice for one review attempt (plan component 5, A12). Settings and catalogs are read at most
 * once per attempt, so every role of one review sees the same settings; the lane list is read fresh
 * for every role (requirement 2.8). Not a DI service: `ReviewLaneSelectionService` creates one per attempt.
 */
export class ReviewLaneAttempt {
  private settingsRead: Promise<ReviewLaneSettings> | null = null;
  private catalogRead: Promise<ReviewLaneCatalogs> | null = null;

  constructor(private readonly deps: ReviewLaneAttemptDeps) {}

  /**
   * Chooses the lane for one role. Throws `ReviewLaneSettingsUnavailableError` when the settings
   * cannot be read; a lane list failure is thrown as the gateway raised it. An invalid lane row is
   * dropped with a warn log, so the role chooses among the other lanes (M5).
   */
  async choose(input: ReviewLaneChooseInput): Promise<ReviewLaneAttemptChoice> {
    const settings = await this.loadSettings();
    const catalog = await this.loadCatalog(settings);
    const listing = parseReviewLaneList(await this.deps.source.list(), this.deps.logger);
    const blocked = (model: string): boolean => this.deps.source.modelBlocked(model);
    const avoidFamilies = new Set(input.usedFamilies ?? []);
    for (const lens of input.laterLenses ?? []) {
      const pin = settings.pins[lens];
      if (!pin) continue;
      const availability = reviewLaneEntryAvailability(pin, listing.lanes, catalog, blocked);
      if (availability.available) avoidFamilies.add(availability.lane.family);
    }
    const selection = selectReviewLane({
      kind: input.kind,
      lanes: listing.lanes,
      settings,
      catalog,
      blocked,
      avoidFamilies,
      ...(input.authorFamilyCounts ? { authorFamilyCounts: new Map(Object.entries(input.authorFamilyCounts)) } : {}),
    });
    return { ...selection, maxConcurrentAgents: listing.maxConcurrentAgents };
  }

  private loadSettings(): Promise<ReviewLaneSettings> {
    this.settingsRead ??= this.deps.settings.get().catch((error: unknown) => {
      throw new ReviewLaneSettingsUnavailableError({ cause: error });
    });
    return this.settingsRead;
  }

  private loadCatalog(settings: ReviewLaneSettings): Promise<ReviewLaneCatalogs> {
    this.catalogRead ??= this.readCatalog(catalogLaneIds(settings));
    return this.catalogRead;
  }

  /**
   * One bounded read. A rejection, a timeout or an aborted attempt gives no catalogs, so every saved
   * model is passed unchecked (requirement 4.2). An invalid lane entry is dropped the same way.
   */
  private async readCatalog(laneIds: string[]): Promise<ReviewLaneCatalogs> {
    if (laneIds.length === 0 || this.deps.signal?.aborted) return {};
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    this.deps.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = this.deps.clock.setTimeout(() => controller.abort(), REVIEW_CATALOG_TIMEOUT_MS);
    const stopped = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Review lane catalog read stopped')), { once: true });
    });
    try {
      const raw = await Promise.race([this.deps.source.listModels(laneIds, controller.signal), stopped]);
      return parseCatalogs(raw, laneIds);
    } catch (error: unknown) {
      // degradation-audit: reported - a failed catalog read is logged and saved models pass unchecked (requirement 4.2)
      this.deps.logger.warn('Review lane model catalogs could not be read; saved models are passed unchecked', {
        name: error instanceof Error ? error.name : 'UnknownError',
        timedOut: controller.signal.aborted && !this.deps.signal?.aborted,
      });
      return {};
    } finally {
      this.deps.clock.clearTimeout(timer);
      this.deps.signal?.removeEventListener('abort', onAbort);
    }
  }
}

const CatalogResultSchema = z.record(z.string(), z.unknown());

/** Keeps only requested lanes with a valid catalog; anything else counts as not read. */
function parseCatalogs(raw: unknown, laneIds: readonly string[]): ReviewLaneCatalogs {
  const result = CatalogResultSchema.safeParse(raw);
  if (!result.success) throw new Error('Review lane catalog result is not an object');
  const catalogs: Record<string, ReviewLaneCatalog> = {};
  for (const id of laneIds) {
    if (!Object.prototype.hasOwnProperty.call(result.data, id)) continue;
    const parsed = ReviewLaneCatalogSchema.safeParse(result.data[id]);
    if (parsed.success) catalogs[id] = parsed.data;
  }
  return catalogs;
}
