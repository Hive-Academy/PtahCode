/**
 * CronJobService — validated job CRUD over `CronScheduler`.
 *
 * One entry point for every caller that is not trusted host code: the
 * `cron:*` RPC handlers (creator `{ kind: 'user' }`) and the agent tools
 * (creator `{ kind: 'session', sessionId }`). It validates caller input,
 * delegates to the scheduler and returns the shared DTOs, so both surfaces
 * apply the same rules.
 *
 * Rejected input throws {@link CronJobValidationError}. A job id that does
 * not exist throws the scheduler's `JobNotFoundError`.
 */
import * as path from 'node:path';
import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  JobId,
  type JobRunDto,
  type ScheduledJobDto,
} from '@ptah-extension/shared';
import type { CronScheduler } from './cron-scheduler';
import { loadCron } from './croner-loader';
import { CRON_TOKENS } from './di/tokens';
import { CronJobValidationError } from './errors';
import { normalizeWorkspaceRoot } from './normalize-workspace-root';
import type {
  CronJobCreator,
  JobRun,
  ScheduledJob,
  UpdateJobPatch,
} from './types';

/** Upper bound of `previewNextFire`'s `count`. */
export const CRON_PREVIEW_MAX_COUNT = 50;

const DEFAULT_TIMEZONE = 'UTC';
/** A pattern croner always accepts; used to read its timezone diagnostic. */
const EVERY_MINUTE = '* * * * *';

export interface CronJobListFilter {
  enabledOnly?: boolean;
  /** Absolute path; `null` / `undefined` list every workspace. */
  workspaceRoot?: string | null;
}

export interface CronJobCreateInput {
  name: string;
  cronExpr: string;
  /** IANA timezone. Default `UTC`. */
  timezone?: string;
  prompt: string;
  /** Absolute path, or `null` / `undefined` for no workspace. */
  workspaceRoot?: string | null;
  enabled?: boolean;
}

export interface CronJobUpdatePatch {
  name?: string;
  cronExpr?: string;
  timezone?: string;
  prompt?: string;
  /** Absent = unchanged, `null` = clear, string = replace. */
  workspaceRoot?: string | null;
  enabled?: boolean;
}

export interface CronJobRunsOptions {
  limit?: number;
  offset?: number;
}

/**
 * SECURITY: `handler:NAME` prompts dispatch to in-process handlers that
 * trusted libraries register (memory:decay, …). Neither the UI nor an agent
 * may create or edit a job that invokes one; such jobs are created by host
 * code through `CronScheduler` directly.
 */
/** Longest job name the service stores. */
export const CRON_JOB_NAME_MAX = 200;
/** Longest job prompt the service stores. */
export const CRON_JOB_PROMPT_MAX = 20_000;

/**
 * `value` must be a non-blank string of at most `max` characters. The value
 * crosses a process boundary (RPC, MCP tool), so its type is not trusted.
 */
function assertText(
  field: 'name' | 'prompt',
  value: unknown,
  max: number,
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CronJobValidationError(
      field,
      `${field} must be a non-empty string`,
    );
  }
  if (value.length > max) {
    throw new CronJobValidationError(
      field,
      `${field} must be at most ${max} characters`,
    );
  }
}

function assertSafePrompt(prompt: unknown): void {
  if (
    typeof prompt === 'string' &&
    prompt.trim().toLowerCase().startsWith('handler:')
  ) {
    throw new CronJobValidationError(
      'prompt',
      "prompts starting with 'handler:' are reserved for internal jobs",
    );
  }
}

/**
 * Validate a caller-supplied `workspaceRoot` and return its canonical form.
 *
 * `undefined` / `null` pass through. Any other value must be a non-empty,
 * absolute, `..`-free string: `workspaceRoot` becomes the `cwd` of the SDK
 * query when the job runs and the scope key of the "This workspace" filter.
 * The parameter is `unknown` because the value crosses a process boundary
 * and may not be a string. The result is {@link normalizeWorkspaceRoot}
 * canonical, so the stored root and the list filter compare on one key.
 */
function validateAndNormalizeWorkspaceRoot(
  wr: unknown,
): string | null | undefined {
  if (wr === undefined) return undefined;
  if (wr === null) return null;
  if (typeof wr !== 'string' || wr.length === 0) {
    throw new CronJobValidationError(
      'workspaceRoot',
      'workspaceRoot must be a non-empty string',
    );
  }
  if (!path.isAbsolute(wr)) {
    throw new CronJobValidationError(
      'workspaceRoot',
      'workspaceRoot must be an absolute path',
    );
  }
  // Check the RAW segments: `path.normalize` collapses every `..` of an
  // absolute path, so a check after it can never reject.
  if (wr.split(/[\\/]+/).some((seg) => seg === '..')) {
    throw new CronJobValidationError(
      'workspaceRoot',
      "workspaceRoot must not contain '..' segments",
    );
  }
  return normalizeWorkspaceRoot(wr);
}

function isKnownTimezone(timezone: unknown): timezone is string {
  if (typeof timezone !== 'string' || timezone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    // degradation-audit: reported - Intl rejects an unknown zone; the caller
    // turns `false` into a CronJobValidationError that names the field.
    return false;
  }
}

/** Deterministic id of a system job, for example `@ptah/daily-backup`. */
const SYSTEM_JOB_ID = /^@[a-z0-9-]+\/[a-z0-9-]+$/;

/**
 * Id that the read methods accept: a ULID, or the id of a system job, which
 * `list` also returns. The write methods accept a ULID only.
 */
function readableJobId(id: string): JobId | null {
  const jobId = JobId.safeParse(id);
  if (jobId) return jobId;
  return typeof id === 'string' && SYSTEM_JOB_ID.test(id)
    ? (id as unknown as JobId)
    : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Next fire times (epoch ms) of an expression. Throws whatever croner throws
 * for a bad pattern or timezone.
 */
function probeFireTimes(
  cronExpr: string,
  timezone: string,
  count: number,
): number[] {
  const Cron = loadCron();
  const probe = new Cron(cronExpr, {
    timezone,
    protect: false,
    paused: true,
  });
  try {
    const times: number[] = [];
    let after: Date | undefined;
    while (times.length < count) {
      const next = probe.nextRun(after);
      if (!next) break;
      times.push(next.getTime());
      after = next;
    }
    return times;
  } finally {
    probe.stop();
  }
}

/**
 * Reject an unknown timezone on its own, so the error names `timezone` and
 * not `cronExpr`. The message is croner's diagnostic when croner has one.
 */
function assertTimezone(timezone: unknown): asserts timezone is string {
  if (isKnownTimezone(timezone)) return;
  let message = `Invalid timezone '${String(timezone)}'. Provide a valid IANA timezone (e.g. 'America/New_York').`;
  if (typeof timezone === 'string' && timezone.length > 0) {
    try {
      probeFireTimes(EVERY_MINUTE, timezone, 1);
    } catch (error: unknown) {
      message = messageOf(error);
    }
  }
  throw new CronJobValidationError('timezone', message);
}

/** Validate an expression + timezone pair and return its next fire times. */
function validateSchedule(
  cronExpr: unknown,
  timezone: unknown,
  count: number,
): number[] {
  assertTimezone(timezone);
  if (typeof cronExpr !== 'string') {
    throw new CronJobValidationError('cronExpr', 'cronExpr must be a string');
  }
  try {
    return probeFireTimes(cronExpr, timezone, count);
  } catch (error: unknown) {
    throw new CronJobValidationError('cronExpr', messageOf(error), {
      cause: error,
    });
  }
}

function clampPreviewCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(1, Math.trunc(count)), CRON_PREVIEW_MAX_COUNT);
}

function toJobDto(job: ScheduledJob): ScheduledJobDto {
  return {
    id: job.id,
    name: job.name,
    cronExpr: job.cronExpr,
    timezone: job.timezone,
    prompt: job.prompt,
    workspaceRoot: job.workspaceRoot,
    enabled: job.enabled,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    lastRunAt: job.lastRunAt,
    nextRunAt: job.nextRunAt,
    createdBy: job.createdBy,
    lastRunStatus: job.lastRunStatus,
  };
}

function toRunDto(run: JobRun): JobRunDto {
  return {
    id: run.id,
    jobId: run.jobId,
    scheduledFor: run.scheduledFor,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    status: run.status,
    resultSummary: run.resultSummary,
    errorMessage: run.errorMessage,
    sessionId: run.sessionId,
  };
}

/** Parse an id that the caller must get right; a malformed one is an error. */
function requireJobId(id: string): JobId {
  try {
    return JobId.from(id);
  } catch (error: unknown) {
    throw new CronJobValidationError('id', messageOf(error), { cause: error });
  }
}

@injectable()
export class CronJobService {
  constructor(
    @inject(CRON_TOKENS.CRON_SCHEDULER)
    private readonly scheduler: CronScheduler,
    @inject(TOKENS.LOGGER)
    private readonly logger: Logger,
  ) {}

  list(filter?: CronJobListFilter): ScheduledJobDto[] {
    const workspaceRoot =
      validateAndNormalizeWorkspaceRoot(filter?.workspaceRoot) ?? undefined;
    return this.scheduler
      .list({ enabledOnly: filter?.enabledOnly, workspaceRoot })
      .map(toJobDto);
  }

  /** `null` for an unknown or malformed id. */
  get(id: string): ScheduledJobDto | null {
    const jobId = readableJobId(id);
    if (!jobId) return null;
    const job = this.scheduler.get(jobId);
    return job ? toJobDto(job) : null;
  }

  create(input: CronJobCreateInput, creator: CronJobCreator): ScheduledJobDto {
    assertText('name', input.name, CRON_JOB_NAME_MAX);
    assertText('prompt', input.prompt, CRON_JOB_PROMPT_MAX);
    assertSafePrompt(input.prompt);
    const workspaceRoot =
      validateAndNormalizeWorkspaceRoot(input.workspaceRoot) ?? null;
    const timezone = input.timezone ?? DEFAULT_TIMEZONE;
    validateSchedule(input.cronExpr, timezone, 1);
    const job = this.scheduler.create({
      name: input.name,
      cronExpr: input.cronExpr,
      timezone,
      prompt: input.prompt,
      workspaceRoot,
      enabled: input.enabled,
      createdBy: creator,
    });
    this.logger.info('[cron] job created', {
      jobId: job.id,
      createdBy: creator.kind,
    });
    return toJobDto(job);
  }

  /**
   * Patch a job. A changed expression or timezone is validated against the
   * stored value of the other one. Throws `JobNotFoundError` for an unknown
   * id and {@link CronJobValidationError} for a malformed one.
   */
  update(id: string, patch: CronJobUpdatePatch): ScheduledJobDto {
    const jobId = requireJobId(id);
    if (patch.name !== undefined) {
      assertText('name', patch.name, CRON_JOB_NAME_MAX);
    }
    if (patch.prompt !== undefined) {
      assertText('prompt', patch.prompt, CRON_JOB_PROMPT_MAX);
    }
    assertSafePrompt(patch.prompt);
    const next: UpdateJobPatch = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.cronExpr !== undefined) next.cronExpr = patch.cronExpr;
    if (patch.timezone !== undefined) next.timezone = patch.timezone;
    if (patch.prompt !== undefined) next.prompt = patch.prompt;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.workspaceRoot !== undefined) {
      next.workspaceRoot = validateAndNormalizeWorkspaceRoot(
        patch.workspaceRoot,
      );
    }
    if (patch.cronExpr !== undefined || patch.timezone !== undefined) {
      // An unknown id is reported by `scheduler.update` below.
      const existing = this.scheduler.get(jobId);
      if (existing) {
        validateSchedule(
          patch.cronExpr ?? existing.cronExpr,
          patch.timezone ?? existing.timezone,
          1,
        );
      }
    }
    return toJobDto(this.scheduler.update(jobId, next));
  }

  toggle(id: string, enabled: boolean): ScheduledJobDto {
    return toJobDto(this.scheduler.toggle(requireJobId(id), enabled));
  }

  /** `false` for an unknown or malformed id. */
  delete(id: string): boolean {
    const jobId = JobId.safeParse(id);
    if (!jobId) return false;
    const deleted = this.scheduler.delete(jobId);
    if (deleted) this.logger.info('[cron] job deleted', { jobId });
    return deleted;
  }

  /**
   * Fire a job now and return the run of this call. `null` for a malformed
   * id, or when the scheduler started no run; throws `JobNotFoundError` for
   * an unknown id.
   */
  async runNow(id: string, signal?: AbortSignal): Promise<JobRunDto | null> {
    const jobId = JobId.safeParse(id);
    if (!jobId) return null;
    const run = await this.scheduler.runNow(jobId, signal);
    return run ? toRunDto(run) : null;
  }

  /** Run history, newest first. `[]` for a malformed id. */
  runs(id: string, opts?: CronJobRunsOptions): JobRunDto[] {
    const jobId = readableJobId(id);
    if (!jobId) return [];
    return this.scheduler
      .listRuns(jobId, { limit: opts?.limit, offset: opts?.offset })
      .map(toRunDto);
  }

  /** Next fire time (epoch ms) of a saved, enabled job; otherwise `null`. */
  nextFire(id: string): number | null {
    const jobId = readableJobId(id);
    if (!jobId) return null;
    return this.scheduler.nextFire(jobId);
  }

  /**
   * Next fire times (epoch ms, ascending) of an expression that is not
   * saved. Validates like `create`. `count` is clamped to
   * 1..{@link CRON_PREVIEW_MAX_COUNT}; the result is shorter when the
   * expression has fewer future occurrences.
   */
  previewNextFire(
    cronExpr: string,
    timezone: string = DEFAULT_TIMEZONE,
    count = 1,
  ): number[] {
    return validateSchedule(cronExpr, timezone, clampPreviewCount(count));
  }
}
