import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  ReviewLaneSettingsSchema,
  type ReviewLaneSettings,
} from '@ptah-extension/review-contracts';
import { PLATFORM_TOKENS, type IStateStorage } from '@ptah-extension/platform-core';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';

/**
 * Review lane pool and pins. They live in global state, not in `settings_json`, so a build from
 * before this change still parses its strict operator settings (decisions.md D5, plan A1).
 */
export interface IReviewLaneSettingsStore {
  /** The settings reviews use; a corrupt document gives empty settings. */
  get(): Promise<ReviewLaneSettings>;
  /** The same read, plus whether the stored document was corrupt, so the drawer can report it. */
  read(): Promise<ReviewLaneSettingsRead>;
  update(next: ReviewLaneSettings): Promise<ReviewLaneSettings>;
}

export interface ReviewLaneSettingsRead {
  settings: ReviewLaneSettings;
  /** The stored document failed validation; `settings` is empty and a save replaces the document. */
  corrupt: boolean;
}

export const REVIEW_LANE_SETTINGS_KEY = 'review.lanes.v1';
export const REVIEW_LANE_SETTINGS_VERSION = 1;

const ReviewLaneSettingsDocumentSchema = z
  .object({
    version: z.literal(REVIEW_LANE_SETTINGS_VERSION),
    pool: ReviewLaneSettingsSchema.shape.pool,
    pins: ReviewLaneSettingsSchema.shape.pins,
  })
  .strict();

@injectable()
export class ReviewLaneSettingsStore implements IReviewLaneSettingsStore {
  constructor(
    @inject(PLATFORM_TOKENS.STATE_STORAGE) private readonly storage: IStateStorage,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'warn'>,
  ) {}

  /**
   * A missing document gives empty settings. An invalid one is logged without its values and also
   * gives empty settings, so a corrupt document never blocks reviews. A throwing read propagates.
   */
  async get(): Promise<ReviewLaneSettings> {
    return (await this.read()).settings;
  }

  async read(): Promise<ReviewLaneSettingsRead> {
    const raw = this.storage.get<unknown>(REVIEW_LANE_SETTINGS_KEY);
    if (raw === undefined || raw === null) return { settings: { pool: [], pins: {} }, corrupt: false };
    const parsed = ReviewLaneSettingsDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn('Review lane settings are invalid; reviews use empty lane settings', {
        paths: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.') || '<root>'),
      });
      return { settings: { pool: [], pins: {} }, corrupt: true };
    }
    return { settings: { pool: parsed.data.pool, pins: parsed.data.pins }, corrupt: false };
  }

  /** Validates before writing; a rejected value leaves the stored document unchanged. */
  async update(next: ReviewLaneSettings): Promise<ReviewLaneSettings> {
    const settings = ReviewLaneSettingsSchema.parse(next);
    await this.storage.update(REVIEW_LANE_SETTINGS_KEY, {
      version: REVIEW_LANE_SETTINGS_VERSION,
      pool: settings.pool,
      pins: settings.pins,
    });
    return settings;
  }
}
