import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { REVIEW_LANE_TOKENS, type IReviewLaneClock } from './review-lane-admission.service';
import { ReviewLaneAttempt } from './review-lane-attempt';
import type { ReviewLaneSource } from './review-lane-selection';
import { REVIEW_CORE_TOKENS } from '../../di/tokens';
import type { IReviewLaneSettingsStore } from '../persistence/review-lane-settings.store';

/** Singleton that hands each review attempt its own lane-choice state. Holds no per-attempt state. */
@injectable()
export class ReviewLaneSelectionService {
  constructor(
    @inject(REVIEW_LANE_TOKENS.GATEWAY) private readonly source: ReviewLaneSource,
    @inject(REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE) private readonly settings: IReviewLaneSettingsStore,
    @inject(REVIEW_LANE_TOKENS.CLOCK) private readonly clock: IReviewLaneClock,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'warn'>,
  ) {}

  /** `signal` is the attempt's signal; it also stops the attempt's catalog read. */
  beginAttempt(signal?: AbortSignal): ReviewLaneAttempt {
    return new ReviewLaneAttempt({
      source: this.source,
      settings: this.settings,
      clock: this.clock,
      logger: this.logger,
      ...(signal ? { signal } : {}),
    });
  }
}
