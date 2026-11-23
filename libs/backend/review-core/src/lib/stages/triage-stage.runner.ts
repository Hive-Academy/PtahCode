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
    const result = await this.lanes.run({ repo: claim.repo, prKey: `${claim.repo.owner}/${claim.repo.name}#${claim.prNumber}`, attemptId: claim.attemptId,
      attemptRoot: context.attemptRoot, headSha: claim.headSha, kind: 'triage',
      prompt, runDeadlineMs: deadline, signal, attempt });
    if (result.lane && !signal?.aborted)
      await this.repository.saveStageLane(claim.attemptId, TRIAGE_STAGE.name, TRIAGE_STAGE.ordinal, result.lane);
    return result;
  }
}
