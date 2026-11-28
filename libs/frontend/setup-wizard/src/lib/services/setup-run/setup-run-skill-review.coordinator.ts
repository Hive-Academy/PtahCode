import type { WizardRecommendAnalysisSkillsResult } from '@ptah-extension/shared';
import type { SetupRunRecord } from '../setup-run.types';
import type { WizardRpcService } from '../wizard-rpc.service';
import { FAILURE_COPY, type SetupRunRecordHost } from './setup-run-host';

export class SetupRunSkillReviewCoordinator {
  /** The in-flight judged review per skill-review record. */
  private readonly reviews = new Map<
    string,
    Promise<WizardRecommendAnalysisSkillsResult>
  >();

  public constructor(
    private readonly host: SetupRunRecordHost,
    private readonly rpc: WizardRpcService,
  ) {}

  public async reviewSkills(
    id: string,
    options: { force?: boolean } = {},
  ): Promise<WizardRecommendAnalysisSkillsResult | null> {
    const inFlight = this.reviews.get(id);
    if (inFlight) return inFlight;
    const record = this.host.get(id);
    const analysisRunId = record?.analysisRunId;
    if (!record || record.workflow !== 'skill-review' || !analysisRunId) {
      return null;
    }
    if (!options.force) {
      const stored = await this.readStoredReview(analysisRunId);
      if (stored) {
        this.applyReviewed(id);
        return stored;
      }
      const raced = this.reviews.get(id);
      if (raced) return raced;
    }
    const hadReview =
      record.status === 'needs-input' || record.status === 'completed';
    const previousStatus = record.status;
    this.host.markLiveThisSession(id);
    this.host.apply(id, { status: 'running', step: 'reviewing', error: null });
    const review = this.rpc.recommendAnalysisSkills(analysisRunId);
    this.reviews.set(id, review);
    try {
      const result = await review;
      this.applyReviewed(id);
      return result;
    } catch (error: unknown) {
      this.host.apply(
        id,
        hadReview
          ? { status: previousStatus, step: 'selecting' }
          : { status: 'failed', error: FAILURE_COPY['skill-review'] },
      );
      throw error;
    } finally {
      if (this.reviews.get(id) === review) this.reviews.delete(id);
    }
  }

  public async reconcile(record: SetupRunRecord): Promise<void> {
    if (
      record.status !== 'running' ||
      this.reviews.has(record.id) ||
      this.host.isLiveThisSession(record.id) ||
      !record.analysisRunId
    ) {
      return;
    }
    let stored: Awaited<ReturnType<WizardRpcService['getSkillReview']>>;
    try {
      stored = await this.rpc.getSkillReview(record.analysisRunId);
    } catch {
      // degradation-audit: optional-capability - an unreadable stored review keeps the last known status
      return;
    }
    if (this.reviews.has(record.id)) return;
    if (stored.review) this.applyReviewed(record.id);
    // The judged call was cut by a reload before it stored a review.
    else this.host.apply(record.id, { status: 'interrupted' });
  }

  private async readStoredReview(
    analysisRunId: string,
  ): Promise<WizardRecommendAnalysisSkillsResult | null> {
    try {
      return (await this.rpc.getSkillReview(analysisRunId)).review;
    } catch {
      // degradation-audit: optional-capability - an unreadable stored review falls back to a new judged review
      return null;
    }
  }

  private applyReviewed(id: string): void {
    const record = this.host.get(id);
    if (!record || record.status === 'completed') return;
    this.host.apply(id, {
      status: 'needs-input',
      step: 'selecting',
      error: null,
    });
  }
}
