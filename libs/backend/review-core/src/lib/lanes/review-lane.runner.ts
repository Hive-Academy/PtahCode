import { inject, injectable } from 'tsyringe';
import {
  OperatorSettingsSchema, REVIEW_LANE_POOL_MAX, RepoIdentitySchema, ReviewLaneFallbackSchema, ReviewLaneIdSchema, ReviewModelIdSchema,
  ShaSchema, type Lens, type RepoIdentity, type ReviewLaneRole,
} from '@ptah-extension/review-contracts';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { z } from 'zod';
import { ReviewLaneAdmissionService, REVIEW_LANE_TOKENS, type IReviewLaneClock } from './review-lane-admission.service';
import type { ReviewLaneSource } from './review-lane-selection';
import { LANE_SETTINGS_UNAVAILABLE, ReviewLaneSettingsUnavailableError, type ReviewLaneAttempt, type ReviewLaneAttemptChoice } from './review-lane-attempt';
import { ReviewOutputParser } from './review-output.parser';
import { ReviewLaneRunUsageSchema, ReviewLaneSpawnError, UNKNOWN_LANE_RUN_USAGE, type ReviewLaneRunUsage, type ReviewLaneSpawnResult } from './review-lane-usage';
import { REVIEW_CORE_TOKENS } from '../../di/tokens';
import type { ReviewStageEnvironment } from '../stages/context-stage.runner';
import { sanitizeReviewFailureMessage } from '../review-failure-sanitizer';
import { hasLegacyHeadings, parseTriageOutputDetailed } from '../publication/walkthrough/triage-output.schema';

/** The host port: the lane list, catalogs and block check of `ReviewLaneSource`, plus spawn. */
export interface IReviewLaneGateway extends ReviewLaneSource {
  /**
   * `model` is sent only when set; without it the lane's own model setting or CLI default applies.
   * Resolves with the lane's usage once it ended. A rejection that comes after the lane started is a
   * `ReviewLaneSpawnError` with `spawned: true`, carrying what the lane used before it stopped.
   */
  spawn(input: { laneId: string; model?: string; cwd: string; prompt: string; signal: AbortSignal; repo: RepoIdentity }): Promise<ReviewLaneSpawnResult>;
}

/** The lane a role used (or found none for), its model, and the pin/pool entries skipped before it. */
export const ReviewLaneUseSchema = z.object({
  lane: ReviewLaneIdSchema.nullable(),
  model: ReviewModelIdSchema.nullable(),
  family: z.string().min(1).max(64).nullable(),
  fallback: z.array(ReviewLaneFallbackSchema).max(REVIEW_LANE_POOL_MAX + 1),
}).strict();
export type ReviewLaneUse = z.infer<typeof ReviewLaneUseSchema>;

/** The adapter owns creation and exact-SHA, read-only materialization of src. */
export interface IReviewLaneFiles {
  prepare(repo: RepoIdentity, attemptRoot: string, headSha: string, signal?: AbortSignal): Promise<string>;
  sourceChecksum(repo: RepoIdentity, attemptRoot: string, headSha: string, signal?: AbortSignal): Promise<string>;
  readOutput(attemptRoot: string, name: 'lane-output.json' | 'walkthrough.md' | 'triage.json'): Promise<string>;
  /** Removes stale lane output. Only the triage lane owns walkthrough.md and triage.json. */
  clearOutput(attemptRoot: string, includeWalkthrough: boolean): Promise<void>;
}

export interface ReviewLaneRequest {
  repo: RepoIdentity;
  prKey: string;
  attemptId: string;
  attemptRoot: string;
  headSha: string;
  kind: ReviewLaneRole;
  prompt: string;
  runDeadlineMs: number;
  signal?: AbortSignal;
  verifierBatch?: boolean;
  /** Lane choice state of the review attempt this role belongs to. */
  attempt: ReviewLaneAttempt;
  /** Lenses: families of lenses that already ran or were reused in this attempt. */
  usedFamilies?: readonly string[];
  /** Lenses: lenses that start after this one; their available pins count towards diversity. */
  laterLenses?: readonly Lens[];
  /** Verifier: merged candidates per author family. */
  authorFamilyCounts?: Readonly<Record<string, number>>;
}

/**
 * `lane` is set on every result once selection ran, including `no-confirmed-room`. It is absent when
 * the role stopped before selection (abort, deadline, unreadable lane settings). `run` is the usage of
 * the lane run; it is absent when no lane was started.
 */
export type ReviewLaneResult =
  | { status: 'completed'; family: string; limitCheck?: 'unavailable'; lane?: ReviewLaneUse; run?: ReviewLaneRunUsage; output: ReturnType<ReviewOutputParser['parseLens']> | ReturnType<ReviewOutputParser['parseVerdict']> | ReturnType<ReviewOutputParser['parseVerdictBatch']> }
  | { status: 'partial'; reason: string; limitCheck?: 'unavailable'; lane?: ReviewLaneUse; run?: ReviewLaneRunUsage };

/**
 * The usage of one spawn call. A resolved value is parsed (an unreadable one is unknown, not partial);
 * a rejection carries usage only when the gateway proved the lane started.
 */
function laneRunOf(outcome: { ok: true; value: unknown } | { ok: false; error: unknown }): ReviewLaneRunUsage | undefined {
  if (outcome.ok) {
    const usage = typeof outcome.value === 'object' && outcome.value !== null && 'usage' in outcome.value ? outcome.value.usage : undefined;
    const parsed = ReviewLaneRunUsageSchema.safeParse(usage);
    return parsed.success ? parsed.data : UNKNOWN_LANE_RUN_USAGE(false);
  }
  if (!(outcome.error instanceof ReviewLaneSpawnError) || !outcome.error.spawned) return undefined;
  return outcome.error.usage ?? UNKNOWN_LANE_RUN_USAGE(true);
}

@injectable()
export class ReviewLaneRunner {
  private readonly parser = new ReviewOutputParser();
  /** Attempts whose unreadable lane settings were already logged; weak, so ended attempts are released. */
  private readonly settingsFailureLogged = new WeakSet<ReviewLaneAttempt>();

  constructor(
    @inject(REVIEW_LANE_TOKENS.GATEWAY) private readonly gateway: IReviewLaneGateway,
    @inject(REVIEW_LANE_TOKENS.FILES) private readonly files: IReviewLaneFiles,
    @inject(REVIEW_LANE_TOKENS.CLOCK) private readonly clock: IReviewLaneClock,
    @inject(REVIEW_LANE_TOKENS.ADMISSION) private readonly admission: ReviewLaneAdmissionService,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'error'>,
    @inject(REVIEW_CORE_TOKENS.ENVIRONMENT) private readonly environment: ReviewStageEnvironment,
  ) {}

  /** Reads an optional triage output file. A missing file gives null; any other failure is thrown. */
  private async readTriageFile(attemptRoot: string, name: 'triage.json' | 'walkthrough.md'): Promise<string | null> {
    try { return (await this.files.readOutput(attemptRoot, name)).replace(/^\uFEFF/, ''); }
    catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  /**
   * Checks the triage output. A valid out/triage.json or an earlier-format walkthrough.md is fine.
   * Anything else must not lose the review: the lane stays completed, the cause is logged with schema
   * paths only, and the publication stage renders a safe body without a walkthrough.
   */
  private async checkTriageOutput(attemptRoot: string): Promise<void> {
    const json = await this.readTriageFile(attemptRoot, 'triage.json');
    const parsed = json === null ? null : parseTriageOutputDetailed(json);
    if (parsed?.ok) return;
    const walkthrough = await this.readTriageFile(attemptRoot, 'walkthrough.md');
    if (walkthrough !== null && hasLegacyHeadings(walkthrough)) return;
    this.logger.error(new Error(`Triage output unusable, the review continues without a walkthrough: triage.json ${
      parsed ? `invalid at ${parsed.issues}` : 'missing'}; walkthrough.md ${walkthrough === null ? 'missing' : 'without the required headings'}`));
  }

  /**
   * One fresh lane list read and selection for this role. Unreadable lane settings give `null`: the
   * role must not run on guessed settings (logged once per attempt). A lane list failure is thrown.
   */
  private async choose(request: ReviewLaneRequest): Promise<ReviewLaneAttemptChoice | null> {
    try {
      return await request.attempt.choose({ kind: request.kind,
        ...(request.usedFamilies ? { usedFamilies: request.usedFamilies } : {}),
        ...(request.laterLenses ? { laterLenses: request.laterLenses } : {}),
        ...(request.authorFamilyCounts ? { authorFamilyCounts: request.authorFamilyCounts } : {}) });
    } catch (error: unknown) {
      if (!(error instanceof ReviewLaneSettingsUnavailableError)) throw error;
      if (!this.settingsFailureLogged.has(request.attempt)) {
        this.settingsFailureLogged.add(request.attempt);
        this.logger.error(new Error('Review lane settings could not be read; review roles end partial without a lane'));
      }
      return null;
    }
  }

  async run(request: ReviewLaneRequest): Promise<ReviewLaneResult> {
    if (request.signal?.aborted) return { status: 'partial', reason: 'aborted' };
    RepoIdentitySchema.parse(request.repo);
    ShaSchema.parse(request.headSha);
    z.string().min(1).max(128).parse(request.attemptId);
    if (!Number.isFinite(request.runDeadlineMs)) throw new Error('Invalid run deadline');
    const limit = 480_000;
    const deadline = Math.min(request.runDeadlineMs, this.clock.now() + limit);
    if (this.clock.now() >= deadline) return { status: 'partial', reason: 'deadline' };
    const chosen = await this.choose(request);
    if (!chosen) return { status: 'partial', reason: LANE_SETTINGS_UNAVAILABLE };
    const choice = chosen.choice;
    const lane: ReviewLaneUse = { lane: choice?.lane.id ?? null, model: choice?.model ?? null,
      family: choice?.lane.family ?? null, fallback: chosen.fallback };
    if (request.signal?.aborted) return { status: 'partial', reason: 'aborted', lane };
    if (this.clock.now() >= deadline) return { status: 'partial', reason: 'deadline', lane };
    if (!choice) return { status: 'partial', reason: 'no-confirmed-room', lane };
    const operatorSettings = OperatorSettingsSchema.parse(await this.environment.settings());
    if (request.signal?.aborted) return { status: 'partial', reason: 'aborted', lane };
    if (this.clock.now() >= deadline) return { status: 'partial', reason: 'deadline', lane };
    const lease = this.admission.acquire(`${request.prKey}:${request.attemptId}`, deadline, chosen.maxConcurrentAgents, operatorSettings.laneCapPerPr);
    if (lease.status === 'partial') return { status: 'partial', reason: lease.reason, lane };
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    request.signal?.addEventListener('abort', onAbort, { once: true });
    if (request.signal?.aborted) controller.abort();
    const timer = this.clock.setTimeout(() => controller.abort(), Math.max(0, deadline - this.clock.now()));
    let completed = false;
    // Set right after the spawn call, so every later return, including a failure, carries it.
    let run: ReviewLaneRunUsage | undefined;
    try {
      const before = await this.files.prepare(request.repo, request.attemptRoot, request.headSha, controller.signal);
      if (controller.signal.aborted || this.clock.now() >= deadline) return { status: 'partial', reason: request.signal?.aborted ? 'aborted' : 'deadline', lane };
      await this.files.clearOutput(request.attemptRoot, request.kind === 'triage');
      let spawnError: unknown;
      let resolved: unknown;
      try {
        resolved = await this.gateway.spawn({ laneId: choice.lane.id, ...(choice.model !== null ? { model: choice.model } : {}),
          cwd: request.attemptRoot, prompt: request.prompt, signal: controller.signal, repo: request.repo });
      } catch (error: unknown) { spawnError = error; }
      run = laneRunOf(spawnError === undefined ? { ok: true, value: resolved } : { ok: false, error: spawnError });
      const after = await this.files.sourceChecksum(request.repo, request.attemptRoot, request.headSha, controller.signal);
      if (before !== after) throw new Error('Lane mutated source');
      if (controller.signal.aborted || this.clock.now() >= deadline)
        return { status: 'partial', reason: request.signal?.aborted ? 'aborted' : 'deadline', lane, ...(run ? { run } : {}) };
      if (spawnError !== undefined) throw spawnError;
      let raw: string;
      try {
        raw = (await this.files.readOutput(request.attemptRoot, 'lane-output.json')).replace(/^\uFEFF/, '');
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
          throw new Error('output-missing');
        throw error;
      }
      if (!raw.trim()) throw new Error('output-missing');
      let output: ReturnType<ReviewOutputParser['parseLens']> | ReturnType<ReviewOutputParser['parseVerdict']> | ReturnType<ReviewOutputParser['parseVerdictBatch']>;
      try {
        output = request.kind === 'verifier'
          ? request.verifierBatch ? this.parser.parseVerdictBatch(raw, request.headSha, choice.lane.family)
            : this.parser.parseVerdict(raw, request.headSha, choice.lane.family)
          : this.parser.parseLens(raw, request.headSha, request.kind === 'triage' ? undefined : request.kind as Lens);
      } catch (error: unknown) {
        const detail = error instanceof z.ZodError ? error.issues.map((issue) => issue.path.join('.') || '<root>').join(', ') :
          error instanceof Error ? error.message : 'unknown';
        throw new Error(`output-invalid: ${sanitizeReviewFailureMessage(detail).slice(0, 160)}`);
      }
      if (request.kind === 'triage') await this.checkTriageOutput(request.attemptRoot);
      completed = true;
      return { status: 'completed', family: choice.lane.family,
        ...(choice.lane.limitState === 'unknown' ? { limitCheck: 'unavailable' as const } : {}), lane, ...(run ? { run } : {}), output };
    } catch (error: unknown) {
      if (controller.signal.aborted || this.clock.now() >= deadline)
        return { status: 'partial', reason: request.signal?.aborted ? 'aborted' : 'deadline', lane, ...(run ? { run } : {}) };
      const failure = error instanceof Error ? error : new Error('Review lane failed');
      this.logger.error(new Error(failure.message === 'Lane mutated source' ? 'Lane mutated source' : 'Review lane failed'));
      const precise = /^(output-missing|output-invalid:|status-failed:|timeout|cancelled)/.test(failure.message);
      return { status: 'partial', reason: failure.message === 'Lane mutated source' ? 'source-mutated' :
        precise ? sanitizeReviewFailureMessage(failure.message) :
          `lane-failed: ${sanitizeReviewFailureMessage(choice.lane.id).slice(0, 80)}; ${sanitizeReviewFailureMessage(failure.name).slice(0, 40)}; ${sanitizeReviewFailureMessage(failure.message)}`,
        ...(choice.lane.limitState === 'unknown' ? { limitCheck: 'unavailable' as const } : {}), lane, ...(run ? { run } : {}) };
    } finally {
      if (request.kind === 'triage' && !completed) {
        try { await this.files.clearOutput(request.attemptRoot, true); }
        catch (cleanupError: unknown) {
          this.logger.error('Review triage output cleanup failed', cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)));
        }
      }
      this.clock.clearTimeout(timer);
      request.signal?.removeEventListener('abort', onAbort);
      lease.release();
    }
  }
}
