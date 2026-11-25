import { inject, injectable } from 'tsyringe';
import {
  ReviewLaneCatalogSchema,
  type ReviewLaneCatalog,
  type ReviewLaneListing,
  type ReviewLaneSettings,
} from '@ptah-extension/review-contracts';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { REVIEW_LANE_TOKENS } from './review-lane-admission.service';
import { parseReviewLaneList } from './review-lane-list';
import type { ReviewLaneSource } from './review-lane-selection';
import { REVIEW_CORE_TOKENS } from '../../di/tokens';
import type { IReviewLaneSettingsStore } from '../persistence/review-lane-settings.store';

/** Bound for the per-lane model catalog reads of one listing. */
export const REVIEW_LANE_LISTING_CATALOG_TIMEOUT_MS = 10_000;

const UNREAD_CATALOG: ReviewLaneCatalog = { status: 'failed', models: [], truncated: false, verifiable: false };

/** The settings drawer's lane listing (`review:listLanes`): lanes, their model catalogs, blocked saved models. */
@injectable()
export class ReviewLaneListingService {
  constructor(
    @inject(REVIEW_LANE_TOKENS.GATEWAY) private readonly source: ReviewLaneSource,
    @inject(REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE) private readonly settings: Pick<IReviewLaneSettingsStore, 'get'>,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'warn'>,
  ) {}

  /**
   * A lane list failure propagates (the drawer offers Retry). A catalog read failure gives every lane
   * a failed catalog; an invalid lane row or catalog is dropped or marked failed, so other lanes render.
   */
  async list(): Promise<ReviewLaneListing> {
    const { lanes } = parseReviewLaneList(await this.source.list(), this.logger);
    const [catalogs, saved] = await Promise.all([
      this.source
        .listModels(lanes.map((lane) => lane.id), AbortSignal.timeout(REVIEW_LANE_LISTING_CATALOG_TIMEOUT_MS))
        .catch((error: unknown): Record<string, ReviewLaneCatalog> => {
          // degradation-audit: reported — every lane then shows a failed catalog, which the drawer reports.
          this.logger.warn('[review] Lane model catalogs unavailable', {
            name: error instanceof Error ? error.name : 'UnknownError',
          });
          return {};
        }),
      this.settings.get(),
    ]);
    return {
      lanes: lanes.map((lane) => {
        const catalog = Object.prototype.hasOwnProperty.call(catalogs, lane.id)
          ? ReviewLaneCatalogSchema.safeParse(catalogs[lane.id]) : null;
        return { id: lane.id, label: lane.label, family: lane.family, limitState: lane.limitState,
          catalog: catalog?.success ? catalog.data : UNREAD_CATALOG, ...(lane.defaultModelBlocked ? { defaultModelBlocked: true } : {}) };
      }),
      blockedModels: this.blockedModels(saved),
    };
  }

  /** Distinct saved pool and pin models that the lane block list refuses. */
  private blockedModels(saved: ReviewLaneSettings): string[] {
    const models = [...saved.pool, ...Object.values(saved.pins)]
      .map((entry) => entry?.model ?? null)
      .filter((model): model is string => model !== null);
    return [...new Set(models)].filter((model) => this.source.modelBlocked(model));
  }
}
