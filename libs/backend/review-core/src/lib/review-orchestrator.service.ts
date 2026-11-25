import { inject, injectable } from 'tsyringe';
import { CandidateFindingSchema, VerifierVerdictSchema, type IGitHubReviewPort, type RepoIdentity } from '@ptah-extension/review-contracts';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { z } from 'zod';
import { REVIEW_CORE_TOKENS } from '../di/tokens';
import { ReviewQueueService, type ReviewQueueClaim } from './review-queue.service';
import { ReviewPolicyService } from './review-policy.service';
import type { IReviewRepository, ReviewAttemptRecord, ReviewStageRecord } from './persistence/review-repository.interface';
import { ReviewWorktreeService } from './context/review-worktree.service';
import type { IReviewSettingsStore } from './persistence/review-settings.store';
import { DiscoveryStageRunner } from './stages/discovery-stage.runner';
import { ContextStageRunner, resolveReviewRoots, type ReviewStageEnvironment } from './stages/context-stage.runner';
import { TriageStageRunner } from './stages/triage-stage.runner';
import { LensStageRunner } from './stages/lens-stage.runner';
import { VerificationStageRunner } from './stages/verification-stage.runner';
import { PublicationStageRunner } from './stages/publication-stage.runner';
import { TRIAGE_STAGE, VERIFICATION_STAGE } from './stages/review-stage-keys';
import type { ReviewLaneSelectionService } from './lanes/review-lane-selection.service';
import { LANE_SETTINGS_UNAVAILABLE } from './lanes/review-lane-attempt';
import { classifyReviewFailure, sanitizeReviewFailureMessage, type ReviewFailureStage } from './review-failure';
import { ReviewStatusCoordinatorService } from './status/review-status-coordinator.service';
import type { ReviewSeverity } from './status/review-status-conclusion';

const ContextSchema = z.object({ attemptRoot: z.string().min(1), baseSha: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  incrementalScope: z.object({ headSha: z.string(), previousReviewedHeadSha: z.string().nullable(), changedPaths: z.array(z.string()),
    dependentPaths: z.array(z.string()), recheckFailureIds: z.array(z.string()), reviewPaths: z.array(z.string()),
    publishNewVerifiedRootsOnly: z.boolean() }).optional(), coverage: z.array(z.string()), promptInput: z.object({
  headSha: z.string(), title: z.string(), body: z.string(), diff: z.string(), comments: z.string(), fileContent: z.string(),
  deterministicEvidence: z.string(), repositoryRules: z.string(),
}) }).strict();
const VerificationSchema = z.array(z.object({ lens: z.string(), finding: CandidateFindingSchema,
  verification: z.enum(['cross-family', 'same-family-weaker', 'unavailable']),
  result: z.discriminatedUnion('status', [z.object({ status: z.literal('partial'), reason: z.string() }),
    z.object({ status: z.literal('completed'), family: z.string(), evidenceStrength: z.enum(['strong', 'weaker']).optional(), output: VerifierVerdictSchema })]),
}));
const CompletedTriageSchema = z.object({ status: z.literal('completed'), family: z.string().min(1).max(64) });
/** The family of the lane that completed triage, from a fresh or a reused checkpoint; `null` otherwise. */
function completedTriageFamily(value: unknown): string | null {
  const parsed = CompletedTriageSchema.safeParse(value);
  return parsed.success ? parsed.data.family : null;
}
const LaneSettingsUnavailableSchema = z.object({ status: z.literal('partial'), reason: z.literal(LANE_SETTINGS_UNAVAILABLE) });
/** A role result that ended because the lane settings could not be read. */
function laneSettingsUnavailable(value: unknown): boolean {
  return LaneSettingsUnavailableSchema.safeParse(value).success;
}
/**
 * Triage or verification that could not read the lane settings is not a finished stage: it is saved
 * `interrupted` without a checkpoint, so a resumed attempt selects a lane again (M2), as lens rows do.
 */
const triageRetry = (value: unknown): string | null => laneSettingsUnavailable(value) ? LANE_SETTINGS_UNAVAILABLE : null;
const verificationRetry = (verdicts: readonly { result: unknown }[]): string | null =>
  verdicts.some((entry) => laneSettingsUnavailable(entry.result)) ? LANE_SETTINGS_UNAVAILABLE : null;
/** Attempt states that never run again; a retry makes a new attempt ID. */
const ENDED_ATTEMPT_STATES: ReadonlySet<ReviewAttemptRecord['state']> = new Set(['completed', 'failed', 'cancelled']);
/** An attempt gets its own review window; drain's deadline only limits new claims. */
const REVIEW_ATTEMPT_WINDOW_MS = 60 * 60_000;

export class ReviewPollDisabledError extends Error {
  constructor() { super('Review repository is disabled'); }
}

@injectable()
export class ReviewOrchestratorService {
  private workerActive = false;
  constructor(
    @inject(DiscoveryStageRunner) private readonly discovery: DiscoveryStageRunner,
    @inject(ContextStageRunner) private readonly context: ContextStageRunner,
    @inject(TriageStageRunner) private readonly triage: TriageStageRunner,
    @inject(LensStageRunner) private readonly lenses: LensStageRunner,
    @inject(VerificationStageRunner) private readonly verification: VerificationStageRunner,
    @inject(PublicationStageRunner) private readonly publication: PublicationStageRunner,
    @inject(ReviewQueueService) private readonly queue: ReviewQueueService,
    @inject(ReviewPolicyService) private readonly policy: ReviewPolicyService,
    @inject(REVIEW_CORE_TOKENS.REVIEW_REPOSITORY) private readonly repository: IReviewRepository,
    @inject(REVIEW_CORE_TOKENS.GITHUB) private readonly github: IGitHubReviewPort,
    @inject(REVIEW_CORE_TOKENS.ENVIRONMENT) private readonly environment: ReviewStageEnvironment,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(REVIEW_CORE_TOKENS.SETTINGS_STORE) private readonly settingsStore: IReviewSettingsStore,
    @inject(ReviewWorktreeService) private readonly worktree: ReviewWorktreeService,
    @inject(REVIEW_CORE_TOKENS.LANE_SELECTION) private readonly laneSelection: ReviewLaneSelectionService,
    @inject(ReviewStatusCoordinatorService) private readonly statuses?: ReviewStatusCoordinatorService,
  ) {}

  async lastPollAt(repo: RepoIdentity): Promise<number | null> { return this.repository.getLastPollAt(repo); }

  async pollAndRecord(input: RepoIdentity): Promise<number> {
    // Callers may pass a full RepositorySettings entry; downstream schemas are strict identities.
    const repo: RepoIdentity = { owner: input.owner, name: input.name };
    const settings = await this.settingsStore.getSettings();
    if (!settings?.repositories.some((entry) => entry.enabled && entry.owner === repo.owner && entry.name === repo.name))
      throw new ReviewPollDisabledError();
    try {
      await this.environment.resolve(repo);
      const count = await this.discovery.run(repo);
      await this.repository.recordPoll(repo, true);
      return count;
    } catch (error: unknown) {
      await this.repository.recordPoll(repo, false);
      throw error;
    }
  }

  /** Bind this to cron's named handler job. It only discovers and enqueues. */
  async discoveryHandler(): Promise<{ summary: string }> {
    const count = await this.pollEnabledRepositories();
    return { summary: `Enqueued ${count} review heads` };
  }

  /** Reconcile only findings identified by Ptah's own inline marker. */
  async syncThreads(selectedRepo?: RepoIdentity, signal?: AbortSignal): Promise<number> {
    let changed = 0;
    const settings = await this.settingsStore.getSettings();
    for (const repo of settings?.repositories.filter((entry) => entry.enabled &&
      (!selectedRepo || entry.owner === selectedRepo.owner && entry.name === selectedRepo.name)) ?? []) {
      if (signal?.aborted) break;
      try {
        let pullPage = 1;
        while (pullPage <= 100) {
          const pulls = await this.github.listOpenPulls(repo, undefined, pullPage);
          for (const pull of pulls.items) {
            if (signal?.aborted) break;
            let reviewPage = 1;
            while (reviewPage <= 100) {
              const reviews = await this.github.listOwnReviewsAndThreads(repo, pull.number, reviewPage);
              for (const review of reviews.items) for (const thread of review.threads) {
                const match = /<!-- ptah-review:finding:([0-9A-HJKMNP-TV-Z]{26}) -->/.exec(thread.body);
                if (match && await this.repository.syncFindingResolution(repo, pull.number, match[1], thread.resolved)) changed++;
              }
              if (reviews.nextPage === null) break;
              reviewPage = reviews.nextPage;
            }
          }
          if (pulls.nextPage === null) break;
          pullPage = pulls.nextPage;
        }
      } catch (error: unknown) {
        this.logger.error('Review thread sync failed', error instanceof Error ? error : new Error('Review thread sync failed'));
      }
    }
    return changed;
  }

  async startupPoll(lastDiscoveryAt: number | null, repo?: RepoIdentity): Promise<number> {
    if (lastDiscoveryAt !== null && Date.now() - lastDiscoveryAt < 48 * 60 * 60 * 1000) return 0;
    return repo ? this.pollAndRecord(repo) : this.pollEnabledRepositories();
  }

  async reconcileStartup(): Promise<number> {
    const count = await this.queue.reconcileStartup([]);
    await this.statuses?.recoverOwnPending();
    await this.statuses?.retryDue();
    return count;
  }

  /**
   * Startup sweep: removes `src/` of attempts that ended but kept it (a crash between release
   * and cleanup, or attempts from builds without cleanup). It touches only ended attempts, which
   * never run again, so the host may run it while the queue drains. It never throws.
   */
  async releaseEndedSources(): Promise<number> {
    let released = 0;
    let repositories: ReadonlyArray<{ owner: string; name: string }> = [];
    try { repositories = (await this.settingsStore.getSettings())?.repositories ?? []; }
    catch (error: unknown) {
      // degradation-audit: reported — without settings there is no repository to sweep.
      this.logger.error('Review attempt source sweep failed', error instanceof Error ? error : new Error(String(error)));
    }
    for (const entry of repositories) {
      const repo: RepoIdentity = { owner: entry.owner, name: entry.name };
      try {
        const roots = await resolveReviewRoots(this.environment, repo);
        for (const attemptId of await this.worktree.listAttemptSources(repo, roots.repoRoot, roots.attemptsRoot)) {
          try {
            const attempt = await this.repository.getAttempt(attemptId);
            if (!attempt || !ENDED_ATTEMPT_STATES.has(attempt.state)) continue;
            if (await this.worktree.releaseSource(repo, roots.repoRoot, roots.attemptsRoot, attemptId)) released++;
          } catch (error: unknown) {
            // degradation-audit: reported — one attempt's cleanup failure must not stop the sweep.
            this.logger.error('Review attempt source cleanup failed', error instanceof Error ? error : new Error(String(error)));
          }
        }
        await this.worktree.prune(repo, roots.repoRoot);
      } catch (error: unknown) {
        // degradation-audit: reported — a repository without a local checkout has nothing to sweep.
        this.logger.error('Review attempt source sweep failed', error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (released > 0) this.logger.info(`Review startup removed ${released} ended attempt sources`);
    return released;
  }

  /** Best-effort: frees the attempt's checkout after it ended; never fails the attempt. */
  private async releaseAttemptSource(claim: ReviewQueueClaim): Promise<void> {
    try {
      const roots = await resolveReviewRoots(this.environment, claim.repo);
      await this.worktree.releaseSource(claim.repo, roots.repoRoot, roots.attemptsRoot, claim.attemptId);
    } catch (error: unknown) {
      // degradation-audit: reported — the startup sweep retries ended attempts that kept src/.
      this.logger.error('Review attempt source cleanup failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Polls every enabled repository; one repository's failure does not stop the others. */
  private async pollEnabledRepositories(): Promise<number> {
    const settings = await this.settingsStore.getSettings();
    let count = 0;
    for (const repo of settings?.repositories.filter((entry) => entry.enabled) ?? []) {
      try { count += await this.pollAndRecord(repo); }
      catch (error: unknown) { this.logger.error('Review discovery failed', error instanceof Error ? error : new Error(String(error))); }
    }
    return count;
  }

  /** Host starts this detached from cron and owns its lifetime. */
  async drain(owner: string, deadlineMs: number, signal?: AbortSignal): Promise<number> {
    if (this.workerActive) return 0;
    this.workerActive = true;
    let count = 0;
    try {
      while (!signal?.aborted && Date.now() < deadlineMs) {
        const claim = await this.queue.claim(owner, 60_000);
        if (!claim) break;
        await this.process(claim, signal);
        count++;
      }
      return count;
    } finally { this.workerActive = false; }
  }

  private async process(claim: ReviewQueueClaim, signal?: AbortSignal): Promise<void> {
    let status: 'succeeded' | 'partial' | 'failed' | 'superseded' = 'succeeded';
    let acceptedSeverities: ReviewSeverity[] = [];
    let publicationBlocked = false;
    let failureStage: ReviewFailureStage = 'discovery';
    let attemptDeadline = Date.now() + REVIEW_ATTEMPT_WINDOW_MS;
    const pendingHeartbeats = new Set<Promise<void>>();
    const heartbeat = setInterval(() => {
      if (signal?.aborted) return;
      const pending = this.queue.heartbeat(claim.attemptId, claim.lease.owner, 60_000).then((renewed) => {
        if (renewed) attemptDeadline = Date.now() + REVIEW_ATTEMPT_WINDOW_MS;
      }).catch(() => {
        this.logger.error('Review lease heartbeat failed', new Error('Review lease heartbeat failed'));
      });
      pendingHeartbeats.add(pending);
      void pending.finally(() => pendingHeartbeats.delete(pending));
    }, 20_000);
    heartbeat.unref();
    try {
      await this.statuses?.claimed(claim, this.lenses.selectedLensCount);
      if (signal?.aborted) { status = 'partial'; return; }
      if (!await this.guard(claim, signal)) { status = signal?.aborted ? 'partial' : 'superseded'; return; }
      failureStage = 'context';
      const context = await this.stage(claim, 'context', 0, ContextSchema, () => this.context.run(claim, attemptDeadline, signal), signal);
      if (!context) { status = 'partial'; return; }
      if (signal?.aborted) { status = 'partial'; return; }
      if (!await this.guard(claim, signal)) { status = signal?.aborted ? 'partial' : 'superseded'; return; }
      failureStage = 'lanes';
      // One lane-choice state per attempt: lane settings and catalogs are read once, the lane list per role.
      const lanes = this.laneSelection.beginAttempt(signal);
      const triage = await this.stage(claim, TRIAGE_STAGE.name, TRIAGE_STAGE.ordinal, z.unknown(),
        () => this.triage.run(claim, context, attemptDeadline, lanes, signal), signal, triageRetry);
      if (!triage) { status = 'partial'; return; }
      if (typeof triage === 'object' && 'status' in triage && triage.status === 'partial' &&
          'reason' in triage && triage.reason === 'deadline') { status = 'partial'; return; }
      if (!triage || (typeof triage === 'object' && triage !== null && 'status' in triage && triage.status === 'partial')) status = 'partial';
      if (signal?.aborted) { status = 'partial'; return; }
      if (!await this.guard(claim, signal)) { status = signal?.aborted ? 'partial' : 'superseded'; return; }
      const lensResults = await this.lenses.run(claim, context, attemptDeadline, lanes, signal,
        (completed, total) => this.statuses?.lensCompleted(claim, completed, total) ?? Promise.resolve());
      if (context.coverage.some((entry) => entry === 'diff-truncated' || entry.startsWith('prompt:truncated:'))) status = 'partial';
      if (lensResults.some((entry) => entry.result.status === 'partial')) status = 'partial';
      if (lensResults.length > 0 && lensResults.every((entry) => entry.result.status === 'partial' && entry.result.reason === 'deadline')) return;
      if (signal?.aborted) { status = 'partial'; return; }
      if (!await this.guard(claim, signal)) { status = signal?.aborted ? 'partial' : 'superseded'; return; }
      failureStage = 'verification';
      const verdicts = await this.stage(claim, VERIFICATION_STAGE.name, VERIFICATION_STAGE.ordinal, VerificationSchema,
        () => this.verification.run(claim, context, lensResults, attemptDeadline, lanes, signal), signal, verificationRetry);
      if (!verdicts) { status = 'partial'; return; }
      if (verdicts.some((entry) => entry.verification === 'unavailable')) status = 'partial';
      acceptedSeverities = verdicts.filter((entry) => entry.result.status === 'completed' &&
        'verdict' in entry.result.output && entry.result.output.verdict === 'accepted').map((entry) => entry.finding.severity);
      if (signal?.aborted) { status = 'partial'; return; }
      if (!await this.guard(claim, signal)) { status = signal?.aborted ? 'partial' : 'superseded'; return; }
      failureStage = 'publication';
      publicationBlocked = !this.policy.publication(await this.environment.settings(),
        await this.environment.baseConfig(claim.repo, context.baseSha), claim.repo).allowed;
      const publication = await this.stage(claim, 'publication', 4, z.object({ artifactPath: z.string(), exportPath: z.string(),
        acceptedCount: z.number(), suppressedCount: z.number() }), () => this.publication.run(claim, context, lensResults, verdicts, signal,
          typeof triage === 'object' && triage !== null && 'status' in triage && triage.status === 'completed',
          completedTriageFamily(triage)), signal);
      if (!publication) status = 'partial';
    } catch (error: unknown) {
      if (signal?.aborted) {
        status = 'partial';
      } else {
        status = 'failed';
        const failure = classifyReviewFailure(error, failureStage);
        this.logger.error(new Error('Review attempt failed: ' + failure.message), { attemptId: claim.attemptId, ...failure });
        try {
          await this.repository.saveFailure(claim.attemptId, failure);
        } catch (_saveError: unknown) {
          this.logger.error('Review failure persistence failed', new Error('Review failure persistence failed'));
        }
      }
    } finally {
      clearInterval(heartbeat);
      await Promise.allSettled(pendingHeartbeats);
      // Only a released attempt has ended. An aborted one keeps src/ because it is requeued and resumes.
      if (!signal?.aborted && await this.queue.release(claim.attemptId, claim.lease.owner, status)) {
        try {
          await this.statuses?.finished(claim, status === 'failed' ? 'failed' : status === 'partial' ? 'partial' :
            status === 'superseded' ? 'cancelled' : publicationBlocked ? 'publication-blocked' : 'complete', acceptedSeverities);
        } finally { await this.releaseAttemptSource(claim); }
      }
    }
  }

  private async guard(claim: ReviewQueueClaim, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false;
    await resolveReviewRoots(this.environment, claim.repo);
    if (signal?.aborted) return false;
    const pull = await this.github.getPull(claim.repo, claim.prNumber);
    if (signal?.aborted) return false;
    if (pull.headSha !== claim.headSha) return false;
    const settings = await this.environment.settings();
    if (signal?.aborted) return false;
    const baseConfig = await this.environment.baseConfig(claim.repo, pull.baseSha);
    if (signal?.aborted) return false;
    const eligible = this.policy.eligibility({ owner: claim.repo.owner, name: claim.repo.name, authorLogin: pull.authorLogin,
      state: pull.state, draft: pull.draft, headIsFork: pull.headIsFork, headRepoId: pull.headRepoId,
      baseRepoId: pull.baseRepoId, settings, baseConfig });
    return eligible.eligible;
  }

  /**
   * Runs one checkpointed stage; a completed prior row is reused. `retry` names a result that must run
   * again on resume: that row is saved `interrupted` with the reason and no checkpoint.
   */
  private async stage<T>(claim: ReviewQueueClaim, name: string, ordinal: number, schema: z.ZodType<T>, run: () => Promise<T>,
    signal?: AbortSignal, retry?: (value: T) => string | null): Promise<T | null> {
    if (signal?.aborted) return null;
    const prior = (await this.repository.getStages(claim.attemptId)).find((row) => row.stage === name && row.ordinal === ordinal);
    if (signal?.aborted) return null;
    if (prior?.state === 'completed') return signal?.aborted ? null : schema.parse(await this.repository.getCheckpoint(claim.attemptId, name, ordinal));
    const startedAt = new Date().toISOString();
    const row: ReviewStageRecord = { attemptId: claim.attemptId, stage: name, ordinal, state: 'running', startedAt,
      endedAt: null, outcome: null, errorSummary: null, artifactHash: null, artifactPath: null };
    await this.repository.saveStage(row);
    // An aborted stage ends `interrupted` with no checkpoint, so it reruns on resume and no row stays `running` (req 7.3).
    const interrupt = async (): Promise<null> => {
      await this.repository.closeRunningStage(claim.attemptId, name, ordinal, startedAt, new Date().toISOString());
      return null;
    };
    try {
      if (signal?.aborted) return await interrupt();
      const value = await run();
      if (signal?.aborted) return await interrupt();
      const retryReason = retry?.(value) ?? null;
      if (retryReason !== null) {
        await this.repository.saveStage({ ...row, state: 'interrupted', endedAt: new Date().toISOString(), outcome: 'partial',
          errorSummary: retryReason });
        return value;
      }
      await this.repository.saveCheckpoint(claim.attemptId, name, ordinal, value);
      if (signal?.aborted) return await interrupt();
      const artifactPath = typeof value === 'object' && value !== null && 'artifactPath' in value && typeof value.artifactPath === 'string'
        ? value.artifactPath : null;
      await this.repository.saveStage({ ...row, state: 'completed', endedAt: new Date().toISOString(), outcome: 'completed', artifactPath });
      return value;
    } catch (error: unknown) {
      if (signal?.aborted) await interrupt();
      else await this.repository.saveStage({ ...row, state: 'failed', endedAt: new Date().toISOString(), errorSummary: sanitizeReviewFailureMessage(error instanceof Error ? error.message : 'Unknown stage error') });
      throw error;
    }
  }
}
