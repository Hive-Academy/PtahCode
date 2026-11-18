/**
 * `ptah.cron` — scheduled jobs for agents (issue #1400 Part 1).
 *
 * A thin, validated view over `CronJobService` (cron-scheduler). The same
 * service backs the Schedules UI through the `cron:*` RPC methods, so an
 * agent and the user see and change the same jobs under the same rules.
 *
 * Every method returns a plain JSON value: `{ status: 'ok', ... }` or
 * `{ status: 'refused', reason, field? }`. A refusal is a normal result, not
 * a thrown error, so the model can correct its input and try again.
 *
 * The service is resolved on EVERY call (`getService`), never captured at
 * construction: a host that registers the scheduler after the API builder
 * would otherwise hold `undefined` for the life of the process.
 */
import {
  CronJobValidationError,
  CronSchedulerError,
  type CronJobCreator,
  type CronJobService,
} from '@ptah-extension/cron-scheduler';
import type { JobRunDto, ScheduledJobDto } from '@ptah-extension/shared';

/** Prompt preview length in a list row. `get` returns the full prompt. */
const LIST_PROMPT_PREVIEW_MAX = 200;
const DEFAULT_RUNS_LIMIT = 20;
const MAX_RUNS_LIMIT = 100;

export interface CronRefusal {
  status: 'refused';
  reason: string;
  /** The input field the refusal refers to, when one is known. */
  field?: string;
}

/** A scheduled job as an agent sees it. Times are ISO 8601 strings. */
export interface CronJobView {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  workspaceRoot: string | null;
  /** Full prompt on `get` / `create` / `update`; a preview in `list`. */
  prompt: string;
  promptTruncated: boolean;
  nextFire: string | null;
  lastRunAt: string | null;
  lastRunStatus: ScheduledJobDto['lastRunStatus'];
  createdBy: ScheduledJobDto['createdBy'];
}

export interface CronRunView {
  id: string;
  status: JobRunDto['status'];
  scheduledFor: string;
  startedAt: string | null;
  endedAt: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  /** The SDK session that ran the prompt, once the run has started one. */
  sessionId: string | null;
}

export interface CronCreateArgs {
  name: string;
  cronExpression: string;
  prompt: string;
  workspaceRoot?: string;
  timezone?: string;
  enabled?: boolean;
}

export interface CronUpdateArgs {
  id: string;
  name?: string;
  cronExpression?: string;
  prompt?: string;
  /** `null` removes the workspace from the job. */
  workspaceRoot?: string | null;
  timezone?: string;
  enabled?: boolean;
}

export interface CronNextFireArgs {
  /** A saved job. Use this OR `cronExpression`. */
  id?: string;
  /** An expression that is not saved yet. */
  cronExpression?: string;
  timezone?: string;
  count?: number;
}

export interface CronNamespace {
  list(args?: {
    workspaceRoot?: string;
    enabledOnly?: boolean;
  }): Promise<{ status: 'ok'; jobs: CronJobView[] } | CronRefusal>;
  get(args: {
    id: string;
  }): Promise<{ status: 'ok'; job: CronJobView } | CronRefusal>;
  create(
    args: CronCreateArgs,
  ): Promise<
    | { status: 'ok'; id: string; nextFire: string | null; job: CronJobView }
    | CronRefusal
  >;
  update(
    args: CronUpdateArgs,
  ): Promise<{ status: 'ok'; job: CronJobView } | CronRefusal>;
  toggle(args: {
    id: string;
    enabled: boolean;
  }): Promise<{ status: 'ok'; job: CronJobView } | CronRefusal>;
  delete(args: {
    id: string;
  }): Promise<{ status: 'ok'; deleted: true; id: string } | CronRefusal>;
  runNow(args: {
    id: string;
  }): Promise<{ status: 'ok'; run: CronRunView } | CronRefusal>;
  runs(args: {
    id: string;
    limit?: number;
  }): Promise<{ status: 'ok'; runs: CronRunView[] } | CronRefusal>;
  nextFire(
    args: CronNextFireArgs,
  ): Promise<{ status: 'ok'; nextFire: string[] } | CronRefusal>;
}

export interface CronNamespaceDependencies {
  /** `undefined` on a host that has no scheduler (VS Code). */
  getService: () => CronJobService | undefined;
  /** The calling SDK session, when the MCP request carries one. */
  getSessionId: () => string | undefined;
  /** The workspace of the calling session, the default for a new job. */
  getWorkspaceRoot: () => string | undefined;
}

const UNAVAILABLE: CronRefusal = {
  status: 'refused',
  reason:
    'The scheduler is not available on this host. Scheduled jobs need the Ptah desktop app.',
};

function iso(epochMs: number | null | undefined): string | null {
  return typeof epochMs === 'number' && Number.isFinite(epochMs)
    ? new Date(epochMs).toISOString()
    : null;
}

function notFound(id: string): CronRefusal {
  return {
    status: 'refused',
    reason: `No scheduled job has the id "${id}". Call ptah_cron_list to see the ids.`,
    field: 'id',
  };
}

function toJobView(job: ScheduledJobDto, previewPrompt: boolean): CronJobView {
  const truncated =
    previewPrompt && job.prompt.length > LIST_PROMPT_PREVIEW_MAX;
  return {
    id: job.id,
    name: job.name,
    cronExpression: job.cronExpr,
    timezone: job.timezone,
    enabled: job.enabled,
    workspaceRoot: job.workspaceRoot,
    prompt: truncated
      ? `${job.prompt.slice(0, LIST_PROMPT_PREVIEW_MAX)}…`
      : job.prompt,
    promptTruncated: truncated,
    nextFire: job.enabled ? iso(job.nextRunAt) : null,
    lastRunAt: iso(job.lastRunAt),
    lastRunStatus: job.lastRunStatus,
    createdBy: job.createdBy,
  };
}

function toRunView(run: JobRunDto): CronRunView {
  return {
    id: run.id,
    status: run.status,
    scheduledFor: iso(run.scheduledFor) ?? new Date(0).toISOString(),
    startedAt: iso(run.startedAt),
    endedAt: iso(run.endedAt),
    resultSummary: run.resultSummary,
    errorMessage: run.errorMessage,
    sessionId: run.sessionId,
  };
}

/** `cronExpr` in the service is `cronExpression` in the tool input. */
function toolFieldName(field: string): string {
  return field === 'cronExpr' ? 'cronExpression' : field;
}

/**
 * Turn a scheduler error into a refusal. Anything that is not a
 * `CronSchedulerError` is a fault and propagates to the dispatcher.
 */
function refusalFrom(error: unknown): CronRefusal {
  if (error instanceof CronJobValidationError) {
    return {
      status: 'refused',
      reason: error.message,
      field: toolFieldName(error.field),
    };
  }
  if (error instanceof CronSchedulerError) {
    return { status: 'refused', reason: error.message };
  }
  throw error;
}

/**
 * An agent may only schedule with 5 fields (minute resolution). Croner also
 * accepts a 6th seconds field, which would let a job start an unattended
 * session every second.
 */
function fiveFieldRefusal(cronExpression: string): CronRefusal | undefined {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length === 5) return undefined;
  return {
    status: 'refused',
    reason:
      'cronExpression must have exactly 5 fields (minute hour day-of-month month day-of-week).',
    field: 'cronExpression',
  };
}

const WRITE_NEEDS_TOOL = (method: string, tool: string): CronRefusal => ({
  status: 'refused',
  reason: `ptah.cron.${method} is not available in execute_code. Call the ${tool} tool: the user approves each change to a scheduled job there.`,
});

/**
 * The `ptah.cron` view that `execute_code` receives. Reads pass through. The
 * five write methods refuse: a write must go through its `ptah_cron_*` tool,
 * where the caller policy and the user approval apply to that exact call.
 */
export function readOnlyCronNamespace(cron: CronNamespace): CronNamespace {
  return {
    list: (args) => cron.list(args),
    get: (args) => cron.get(args),
    runs: (args) => cron.runs(args),
    nextFire: (args) => cron.nextFire(args),
    create: async () => WRITE_NEEDS_TOOL('create', 'ptah_cron_create'),
    update: async () => WRITE_NEEDS_TOOL('update', 'ptah_cron_update'),
    toggle: async () => WRITE_NEEDS_TOOL('toggle', 'ptah_cron_toggle'),
    delete: async () => WRITE_NEEDS_TOOL('delete', 'ptah_cron_delete'),
    runNow: async () => WRITE_NEEDS_TOOL('runNow', 'ptah_cron_run_now'),
  };
}

export function buildCronNamespace(
  deps: CronNamespaceDependencies,
): CronNamespace {
  const NO_SESSION: CronRefusal = {
    status: 'refused',
    reason:
      'This call carries no session identity, so the job cannot be recorded as agent-created. Create the job from a Ptah chat session.',
  };

  /** Run `work` with the service, or refuse when the host has none. */
  const withService = async <T>(
    work: (service: CronJobService) => T | Promise<T>,
  ): Promise<T | CronRefusal> => {
    const service = deps.getService();
    if (!service) return UNAVAILABLE;
    try {
      return await work(service);
    } catch (error: unknown) {
      return refusalFrom(error);
    }
  };

  return {
    list: (args) =>
      withService((service) => ({
        status: 'ok' as const,
        jobs: service
          .list({
            enabledOnly: args?.enabledOnly,
            workspaceRoot: args?.workspaceRoot,
          })
          .map((job) => toJobView(job, true)),
      })),

    get: (args) =>
      withService((service) => {
        const job = service.get(args.id);
        return job
          ? { status: 'ok' as const, job: toJobView(job, false) }
          : notFound(args.id);
      }),

    create: (args) =>
      withService((service) => {
        // Never fall back to a user creator: the job would lose its
        // "created by an agent" provenance.
        const sessionId = deps.getSessionId();
        if (!sessionId) return NO_SESSION;
        const creator: CronJobCreator = { kind: 'session', sessionId };
        const fieldRefusal = fiveFieldRefusal(args.cronExpression);
        if (fieldRefusal) return fieldRefusal;
        const job = service.create(
          {
            name: args.name,
            cronExpr: args.cronExpression,
            prompt: args.prompt,
            timezone: args.timezone,
            // A new job belongs to the workspace of the calling session
            // unless the caller names another one.
            workspaceRoot:
              args.workspaceRoot ?? deps.getWorkspaceRoot() ?? null,
            enabled: args.enabled,
          },
          creator,
        );
        const view = toJobView(job, false);
        return {
          status: 'ok' as const,
          id: view.id,
          nextFire: view.nextFire,
          job: view,
        };
      }),

    update: (args) =>
      withService((service) => {
        if (!service.get(args.id)) return notFound(args.id);
        if (args.cronExpression !== undefined) {
          const fieldRefusal = fiveFieldRefusal(args.cronExpression);
          if (fieldRefusal) return fieldRefusal;
        }
        const job = service.update(args.id, {
          name: args.name,
          cronExpr: args.cronExpression,
          prompt: args.prompt,
          timezone: args.timezone,
          enabled: args.enabled,
          // Absent = unchanged; only pass the key when the caller sent it.
          ...(args.workspaceRoot !== undefined
            ? { workspaceRoot: args.workspaceRoot }
            : {}),
        });
        return { status: 'ok' as const, job: toJobView(job, false) };
      }),

    toggle: (args) =>
      withService((service) => {
        if (!service.get(args.id)) return notFound(args.id);
        const job = service.toggle(args.id, args.enabled);
        return { status: 'ok' as const, job: toJobView(job, false) };
      }),

    delete: (args) =>
      withService((service) =>
        service.delete(args.id)
          ? { status: 'ok' as const, deleted: true as const, id: args.id }
          : notFound(args.id),
      ),

    runNow: (args) =>
      withService(async (service) => {
        if (!service.get(args.id)) return notFound(args.id);
        const run = await service.runNow(args.id);
        return run
          ? { status: 'ok' as const, run: toRunView(run) }
          : {
              status: 'refused' as const,
              reason:
                'The scheduler did not start a run for this job. Call ptah_cron_runs to see its latest runs.',
            };
      }),

    runs: (args) =>
      withService((service) => {
        if (!service.get(args.id)) return notFound(args.id);
        const limit = Math.min(
          Math.max(1, Math.trunc(args.limit ?? DEFAULT_RUNS_LIMIT)),
          MAX_RUNS_LIMIT,
        );
        return {
          status: 'ok' as const,
          runs: service.runs(args.id, { limit }).map(toRunView),
        };
      }),

    nextFire: (args) =>
      withService((service) => {
        if (args.id !== undefined) {
          if (args.cronExpression !== undefined) {
            return {
              status: 'refused' as const,
              reason:
                'Give either the id of a saved job or a cronExpression, not both.',
            };
          }
          if (!service.get(args.id)) return notFound(args.id);
          const next = iso(service.nextFire(args.id));
          return { status: 'ok' as const, nextFire: next ? [next] : [] };
        }
        if (!args.cronExpression) {
          return {
            status: 'refused' as const,
            reason: 'Give the id of a saved job or a cronExpression.',
          };
        }
        return {
          status: 'ok' as const,
          nextFire: service
            .previewNextFire(args.cronExpression, args.timezone, args.count)
            .map((epochMs) => new Date(epochMs).toISOString()),
        };
      }),
  };
}
