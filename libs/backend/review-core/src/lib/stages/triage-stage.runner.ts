import { inject, injectable } from 'tsyringe';
import { REVIEW_CORE_TOKENS } from '../../di/tokens';
import type { IReviewRepository } from '../persistence/review-repository.interface';
import { ReviewLaneRunner, type ReviewLaneResult } from '../lanes/review-lane.runner';
import type { ReviewLaneAttempt } from '../lanes/review-lane-attempt';
import { buildTriagePrompt } from '../lanes/prompts/triage.prompt';
import { recordPromptTruncation } from '../lanes/prompts/prompt-fence';
import type { ReviewQueueClaim } from '../review-queue.service';
import type { ContextStageResult } from './context-stage.runner';
import { TRIAGE_STAGE } from './review-stage-keys';

@injectable()
export class TriageStageRunner {
  constructor(@inject(ReviewLaneRunner) private readonly lanes: ReviewLaneRunner,
    @inject(REVIEW_CORE_TOKENS.REVIEW_REPOSITORY) private readonly repository: IReviewRepository) {}

  /** The orchestrator owns the triage stage row; this records which lane triage used on it. */
  async run(claim: ReviewQueueClaim, context: ContextStageResult, deadline: number, attempt: ReviewLaneAttempt,
    signal?: AbortSignal): Promise<ReviewLaneResult> {
    const prompt = buildTriagePrompt(context.promptInput);
    recordPromptTruncation(prompt, context.coverage);
    const { name, ordinal } = TRIAGE_STAGE;
    await this.repository.beginStageLaneRun(claim.attemptId, name, ordinal);
    let result: ReviewLaneResult;
    // The try spans only the lane run: the marker is removed only after begin and before the lane save (P2 m3).
    try {
      result = await this.lanes.run({ repo: claim.repo, prKey: `${claim.repo.owner}/${claim.repo.name}#${claim.prNumber}`, attemptId: claim.attemptId,
        attemptRoot: context.attemptRoot, headSha: claim.headSha, kind: 'triage',
        prompt, runDeadlineMs: deadline, signal, attempt });
    } catch (error: unknown) {
      await this.removePendingRun(claim.attemptId);
      throw error;
    }
    // Always record the lane and its usage, also on abort, so the pending run marker is closed (req 7.1, 7.6).
    await this.repository.saveStageLane(claim.attemptId, name, ordinal, result.lane ?? null, result.run);
    return result;
  }

  /** Clears the pending run marker after the lane throws; the lane error stays the one rethrown. */
  private async removePendingRun(attemptId: string): Promise<void> {
    try {
      await this.repository.saveStageLane(attemptId, TRIAGE_STAGE.name, TRIAGE_STAGE.ordinal, null, undefined);
    } catch {
      // degradation-audit: reported — the caller rethrows the lane error; a stale marker reads as partial usage.
    }
  }
}
