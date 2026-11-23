/**
 * JobRunner — claims a slot, dispatches to a handler, and records the outcome.
 *
 * The runner owns NO scheduling logic; it is a pure executor invoked by
 * {@link CronScheduler} (for the next-fire path) and {@link CatchupCoordinator}
 * (for missed slots after resume).
 *
 * Concurrency: a global semaphore (max = `CronSchedulerOptions.maxConcurrentJobs`)
 * gates entry. Slots that can't acquire the semaphore are persisted as
 * `skipped` with reason `concurrency-limit` so the operator sees them in
 * `cron:runs` instead of vanishing silently.
 *
 * Dispatch:
 *   - `prompt` starting with `handler:NAME[:SUB]` → look up `IHandlerRegistry`.
 *     If unregistered → mark failed (this is a config bug, not a transient).
 *   - otherwise → forward the prompt to `SDK_INTERNAL_QUERY_SERVICE` and
 *     drain the stream until a `result` message lands. The result message's
 *     summary (or "ok") is stored. The first `session_id` the stream reports is
 *     written to the run row once, so run history can name the SDK session.
 *
 * Abort: every run is wrapped in an `AbortController` linked to the optional
 * caller `signal`. Aborts are recorded as `skipped` with the reason carried
 * forward (`shutdown`, `runNow-cancelled`, …).
 *
 * Outcome: a handler that returns `{ outcome: 'skipped', reason }` is recorded
 * as `skipped` too — it ran and deliberately did nothing (see
 * {@link JobHandlerResult.outcome}). So `job_runs` carries three distinct
 * terminal answers for a handler that was actually entered: `succeeded` (work
 * happened), `skipped` (a gate closed, nothing to retry) and `failed` (it
 * threw).
 */
import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { CRON_TOKENS } from './di/tokens';
import { CronConfigError } from './errors';
import type { IJobStore } from './job.store';
import type { IRunStore } from './run.store';
import { SlotAlreadyClaimedError } from './run.store';
import type { RunId } from '@ptah-extension/shared';
import type { IHandlerRegistry, JobHandlerResult, ScheduledJob } from './types';
import { SDK_TOKENS } from '@ptah-extension/agent-sdk';
import {
  PLATFORM_TOKENS,
  resolveMcpSessionWiring,
  type IMcpGateway,
  type IMcpServerStatus,
} from '@ptah-extension/platform-core';
import type {
  InternalQueryConfig,
  InternalQueryHandle,
  IWorkspaceLlmResolver,
} from '@ptah-extension/agent-sdk';

/**
 * SDK_INTERNAL_QUERY_SERVICE has a single relevant method: `execute(config)`.
 * Importing the concrete class would couple us to the SDK module's heavy
 * graph, so we declare just the slice we use.
 */
interface IInternalQueryService {
  execute(config: InternalQueryConfig): Promise<InternalQueryHandle>;
}

const HANDLER_PREFIX = 'handler:';
const SUMMARY_CAP = 500;
const MCP_WARNING_CAP = 300;

/** One MCP server the run could not use, as named in the run summary. */
interface UnavailableMcpServer {
  readonly name: string;
  readonly status: string;
  readonly detail?: string;
}

/**
 * The `system`/`init` message lists every MCP server the CLI loaded. Returns
 * the entries that are neither `connected` nor deliberately `disabled`, with
 * the CLI's error text as detail when it gives one.
 */
function readUnavailableInitServers(msg: unknown): UnavailableMcpServer[] {
  if (!msg || typeof msg !== 'object') return [];
  const m = msg as { type?: unknown; subtype?: unknown; mcp_servers?: unknown };
  if (m.type !== 'system' || m.subtype !== 'init') return [];
  if (!Array.isArray(m.mcp_servers)) return [];
  const out: UnavailableMcpServer[] = [];
  for (const entry of m.mcp_servers as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { name?: unknown; status?: unknown; error?: unknown };
    if (typeof e.name !== 'string' || typeof e.status !== 'string') continue;
    if (e.status === 'connected' || e.status === 'disabled') continue;
    out.push({
      name: e.name,
      status: e.status,
      ...(typeof e.error === 'string' && e.error.length > 0
        ? { detail: e.error }
        : {}),
    });
  }
  return out;
}

/**
 * `base` capped at 500 characters, then one warning line naming every MCP
 * server the run could not use, capped at 300. The warning never changes the
 * run status (decision 6): the job reached its own verdict either way.
 */
function withMcpWarning(
  base: string,
  unavailable: readonly UnavailableMcpServer[],
): string {
  const capped = base.slice(0, SUMMARY_CAP);
  if (unavailable.length === 0) return capped;
  const names = unavailable
    .map((s) =>
      s.detail
        ? `${s.name}(${s.status}: ${s.detail})`
        : `${s.name}(${s.status})`,
    )
    .join(', ');
  const warning = `\n[warning] MCP unavailable: ${names}`;
  return capped + warning.slice(0, MCP_WARNING_CAP);
}

/**
 * Every SDK message carries the id of the session that produced it; the
 * `system`/`init` message is the first one. Returns it when present.
 */
function readSessionId(msg: unknown): string | undefined {
  if (!msg || typeof msg !== 'object') return undefined;
  const sessionId = (msg as { session_id?: unknown }).session_id;
  return typeof sessionId === 'string' && sessionId.length > 0
    ? sessionId
    : undefined;
}

function extractHandlerName(prompt: string): string | undefined {
  if (!prompt.startsWith(HANDLER_PREFIX)) return undefined;
  const rest = prompt.slice(HANDLER_PREFIX.length).trim();
  return rest.length > 0 ? rest : undefined;
}

export interface JobRunnerRunOptions {
  /** Caller-provided abort signal (e.g. from `runNow` or shutdown). */
  signal?: AbortSignal;
  /**
   * Reserved for catchup: when true, the runner will *not* update
   * `lastRunAt`/`nextRunAt` on the job (the coordinator drives those for
   * batched replays). Default false.
   */
  suppressJobTimestamps?: boolean;
}

@injectable()
export class JobRunner {
  /** In-flight count — guarded by `maxConcurrent`. */
  private inFlight = 0;
  /** Resolved at construction; the scheduler can call `setMaxConcurrent`. */
  private maxConcurrent = 3;

  constructor(
    @inject(CRON_TOKENS.CRON_RUN_STORE)
    private readonly runs: IRunStore,
    @inject(CRON_TOKENS.CRON_JOB_STORE)
    private readonly jobs: IJobStore,
    @inject(SDK_TOKENS.SDK_INTERNAL_QUERY_SERVICE)
    private readonly internalQuery: IInternalQueryService,
    @inject(CRON_TOKENS.CRON_HANDLER_REGISTRY)
    private readonly handlers: IHandlerRegistry,
    @inject(TOKENS.LOGGER)
    private readonly logger: Logger,
    /** Provider + model for the job's own workspace (never the active one's). */
    @inject(SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER)
    private readonly workspaceLlm: IWorkspaceLlmResolver,
    /**
     * Optional: a host with no in-process MCP server (the CLI) resolves
     * nothing and every job runs exactly as it did before.
     */
    @inject(PLATFORM_TOKENS.MCP_SERVER_STATUS, { isOptional: true })
    private readonly mcpServerStatus: IMcpServerStatus | null = null,
    /**
     * Optional: a host without auth secrets binds no gateway. Read only for
     * the run-summary warning about connectors that were not available.
     */
    @inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional: true })
    private readonly mcpGateway: IMcpGateway | null = null,
  ) {}

  /**
   * Set the global concurrency cap. Called by `CronScheduler` after it reads
   * `cron.maxConcurrentJobs` from settings; defaults to 3 if never called.
   */
  setMaxConcurrent(n: number): void {
    if (!Number.isFinite(n) || n < 1) {
      throw new CronConfigError(
        `JobRunner.setMaxConcurrent: expected positive integer, got ${n}`,
      );
    }
    this.maxConcurrent = Math.floor(n);
  }

  /** Read-only view for tests / metrics. */
  get currentInFlight(): number {
    return this.inFlight;
  }

  /**
   * Claim a slot and execute the job. Returns when the run terminates
   * (succeeded / failed / skipped). Never throws — all errors are recorded
   * on the run row so the scheduler loop continues.
   */
  async run(
    job: ScheduledJob,
    scheduledFor: number,
    opts: JobRunnerRunOptions = {},
  ): Promise<void> {
    let runId: RunId;
    try {
      const claimed = this.runs.tryClaim(job.id, scheduledFor);
      runId = claimed.id;
    } catch (err) {
      // degradation-audit: reported - a lost slot race is logged at debug and
      // any other claim failure at error (logWithContext) here; the run is
      // skipped and the scheduler loop continues.
      if (err instanceof SlotAlreadyClaimedError) {
        this.logger.debug('[cron-scheduler] slot already claimed', {
          jobId: job.id,
          scheduledFor,
        });
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.logWithContext('error', '[cron-scheduler] tryClaim failed', {
        error,
        metadata: {
          jobId: job.id,
          scheduledFor,
          handler: extractHandlerName(job.prompt),
        },
      });
      return;
    }
    if (this.inFlight >= this.maxConcurrent) {
      this.runs.markSkipped(runId, 'concurrency-limit');
      this.logger.warn('[cron-scheduler] skipped: concurrency cap reached', {
        jobId: job.id,
        scheduledFor,
        max: this.maxConcurrent,
      });
      return;
    }
    const localCtl = new AbortController();
    const onCallerAbort = (): void => localCtl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) localCtl.abort();
      else opts.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    this.inFlight += 1;
    this.runs.markStarted(runId);

    try {
      const result = await this.dispatch(job, scheduledFor, localCtl, runId);
      // A handler that ran to completion and deliberately did nothing is not a
      // success. `markSucceeded` used to be unconditional here, so a skill
      // drain that stopped at its daily token budget wrote "succeeded" into
      // `cron:runs` roughly once a minute (TASK_2026_315 / C2) — the history a
      // user reads to find out why background work stopped was the one place
      // that denied it had. `outcome` is the handler's own verdict; absent
      // still means succeeded.
      if (result.outcome === 'skipped') {
        this.runs.markSkipped(
          runId,
          result.reason ?? result.summary ?? 'handler-skipped',
        );
      } else {
        this.runs.markSucceeded(runId, result.summary);
      }
      // `lastRunAt` records that the HANDLER executed, which is true of both
      // branches above and of the failure branch below — the job fired on
      // schedule and reached a verdict. The runner's own two skips
      // (concurrency cap, abort) deliberately leave it alone: there the
      // handler never ran at all.
      if (!opts.suppressJobTimestamps) {
        this.jobs.update(job.id, { lastRunAt: Date.now() });
      }
      if (result.outcome === 'skipped') {
        this.logger.debug('[cron-scheduler] run skipped by handler', {
          jobId: job.id,
          runId,
          reason: result.reason,
        });
      } else {
        this.logger.debug('[cron-scheduler] run succeeded', {
          jobId: job.id,
          runId,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (localCtl.signal.aborted) {
        this.runs.markSkipped(runId, 'aborted');
        this.logger.info('[cron-scheduler] run aborted', {
          jobId: job.id,
          runId,
        });
      } else {
        this.runs.markFailed(runId, error.message);
        if (!opts.suppressJobTimestamps) {
          this.jobs.update(job.id, { lastRunAt: Date.now() });
        }
        this.logger.logWithContext('error', '[cron-scheduler] run failed', {
          error,
          metadata: {
            jobId: job.id,
            runId,
            handler: extractHandlerName(job.prompt),
          },
        });
      }
    } finally {
      this.inFlight -= 1;
      if (opts.signal) {
        opts.signal.removeEventListener('abort', onCallerAbort);
      }
    }
  }
  private async dispatch(
    job: ScheduledJob,
    scheduledFor: number,
    ctl: AbortController,
    runId: RunId,
  ): Promise<JobHandlerResult> {
    if (job.prompt.startsWith(HANDLER_PREFIX)) {
      const name = job.prompt.slice(HANDLER_PREFIX.length).trim();
      if (!name) {
        throw new Error(`Empty handler name in prompt for job ${job.id}`);
      }
      const handler = this.handlers.resolve(name);
      if (!handler) {
        throw new Error(`No handler registered under '${name}'`);
      }
      return handler({ job, scheduledFor, signal: ctl.signal });
    }
    // Provider and model of ONE snapshot for the job's workspace: the job runs
    // on that workspace's files, so it runs on that workspace's provider too,
    // whichever workspace is active when it fires. A rootless job resolves the
    // app/global provider and model explicitly.
    const { model, auth } = await this.workspaceLlm.resolveForPath(
      job.workspaceRoot ?? undefined,
    );
    const cwd = job.workspaceRoot ?? process.cwd();
    const handle = await this.internalQuery.execute({
      cwd,
      model,
      ...(auth ? { auth } : {}),
      prompt: job.prompt,
      // A cron job used to run with MCP hard-disabled, so it could not call a
      // single Ptah tool on a host where the server was listening the whole
      // time (defect 13). Derived now, from the live port.
      ...resolveMcpSessionWiring(this.mcpServerStatus),
      // A scheduled job is the user's own automation, so it sees the user's
      // connectors through the gateway. It is the only one-shot caller that
      // opts in (#1466).
      includeConnectors: true,
      abortController: ctl,
    });

    let summary: string | undefined;
    let sessionRecorded = false;
    const unavailable: UnavailableMcpServer[] = [];
    try {
      for await (const msg of handle.stream) {
        if (ctl.signal.aborted) break;
        if (!sessionRecorded) {
          const sessionId = readSessionId(msg);
          if (sessionId) {
            sessionRecorded = true;
            this.recordSessionId(job, runId, sessionId);
          }
        }
        unavailable.push(...readUnavailableInitServers(msg));
        if (
          msg &&
          typeof msg === 'object' &&
          (msg as { type?: unknown }).type === 'result'
        ) {
          const r = msg as { result?: unknown; subtype?: unknown };
          if (typeof r.result === 'string') summary = r.result;
          else if (r.subtype === 'error_max_turns')
            throw new Error('SDK reported max-turns exceeded');
          else if (r.subtype === 'error_during_execution')
            throw new Error('SDK reported execution error');
        }
      }
    } finally {
      handle.close();
    }
    for (const server of this.readGatewayUnavailable(job, runId, cwd)) {
      if (!unavailable.some((u) => u.name === server.name)) {
        unavailable.push(server);
      }
    }
    return { summary: withMcpWarning(summary ?? 'ok', unavailable) };
  }

  /**
   * Gateway servers the run's scope could see but that were not connected,
   * including a cold-start `pending` server with its timeout detail. Reads
   * the gateway's cache only; it never connects.
   */
  private readGatewayUnavailable(
    job: ScheduledJob,
    runId: RunId,
    workspaceRoot: string,
  ): UnavailableMcpServer[] {
    if (!this.mcpGateway) return [];
    try {
      return this.mcpGateway
        .status({
          kind: 'internal-query',
          capability: 'privileged',
          includeConnectors: true,
          workspaceRoot,
        })
        .filter((s) => s.status !== 'connected')
        .map((s) => ({
          name: s.display,
          status: s.status,
          ...(s.detail ? { detail: s.detail } : {}),
        }));
    } catch (err) {
      // degradation-audit: reported - the gateway status only feeds the
      // run-summary warning; a failed read is logged at warn and the run keeps
      // its own verdict and summary.
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.logWithContext(
        'warn',
        '[cron-scheduler] could not read MCP gateway status',
        { error, metadata: { jobId: job.id, runId } },
      );
      return [];
    }
  }

  /**
   * Links the run row to its SDK session. The link is run-history metadata:
   * a failed write must not fail a run whose agent is already working, so the
   * error is logged and the run continues with `session_id` NULL.
   */
  private recordSessionId(
    job: ScheduledJob,
    runId: RunId,
    sessionId: string,
  ): void {
    try {
      this.runs.setSessionId(runId, sessionId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.logWithContext(
        'warn',
        '[cron-scheduler] could not record the run session id',
        { error, metadata: { jobId: job.id, runId } },
      );
    }
  }
}
