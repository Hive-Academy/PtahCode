/**
 * Cron Scheduler RPC Handlers.
 *
 * Bridges the frontend Cron Scheduler UI to the backend `CronJobService`,
 * which validates the input and owns the DTO mapping. Surfaces nine `cron:*`
 * methods:
 *   - cron:list         → list jobs (optionally enabled-only)
 *   - cron:get          → fetch one job by id
 *   - cron:create       → create + arm a new job (croner validates expr/tz)
 *   - cron:update       → patch + re-arm a job
 *   - cron:delete       → delete + disarm
 *   - cron:toggle       → enable/disable + arm/disarm
 *   - cron:runNow       → fire immediately, bypassing schedule
 *   - cron:runs         → list run history for a job
 *   - cron:nextFire     → next firing time (epoch ms)
 *
 * Every job created here has the creator `{ kind: 'user' }`.
 *
 * Croner errors (invalid expression, unknown timezone) propagate verbatim
 * — architecture §5.3 mandates surfacing croner's diagnostic messages
 * unchanged because they are the most actionable surface the user sees.
 */
import { inject, injectable } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import type { Logger, RpcHandler } from '@ptah-extension/vscode-core';
import {
  CRON_TOKENS,
  CronJobValidationError,
  type CronJobService,
} from '@ptah-extension/cron-scheduler';
import type {
  CronCreateParams,
  CronCreateResult,
  CronDeleteParams,
  CronDeleteResult,
  CronGetParams,
  CronGetResult,
  CronListParams,
  CronListResult,
  CronNextFireParams,
  CronNextFireResult,
  CronRunNowParams,
  CronRunNowResult,
  CronRunsParams,
  CronRunsResult,
  CronToggleParams,
  CronToggleResult,
  CronUpdateParams,
  CronUpdateResult,
  RpcMethodName,
} from '@ptah-extension/shared';

/**
 * Word a `CronJobValidationError` the way this RPC surface always has.
 * Prompt and workspaceRoot refusals carry the `cron RPC:` prefix; croner
 * diagnostics (`cronExpr`, `timezone`) and a malformed id pass through
 * unchanged. Any other error is returned as it is.
 */
function toRpcError(error: unknown): unknown {
  if (!(error instanceof CronJobValidationError)) return error;
  switch (error.field) {
    case 'prompt':
      return new Error(
        `cron RPC: ${error.message} and cannot be created via RPC`,
        { cause: error },
      );
    case 'workspaceRoot':
      return new Error(`cron RPC: ${error.message}`, { cause: error });
    default:
      return error;
  }
}

/** Run a service call and reword its validation errors for RPC callers. */
async function withRpcErrors<T>(call: () => T | Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error: unknown) {
    throw toRpcError(error);
  }
}

@injectable()
export class CronRpcHandlers {
  static readonly METHODS = [
    'cron:list',
    'cron:get',
    'cron:create',
    'cron:update',
    'cron:delete',
    'cron:toggle',
    'cron:runNow',
    'cron:runs',
    'cron:nextFire',
  ] as const satisfies readonly RpcMethodName[];

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.RPC_HANDLER) private readonly rpcHandler: RpcHandler,
    @inject(CRON_TOKENS.CRON_JOB_SERVICE)
    private readonly jobs: CronJobService,
  ) {}

  register(): void {
    this.rpcHandler.registerMethod<CronListParams, CronListResult>(
      'cron:list',
      (params) =>
        withRpcErrors(() => ({
          jobs: this.jobs.list({
            enabledOnly: params?.enabledOnly,
            workspaceRoot: params?.workspaceRoot,
          }),
        })),
    );

    this.rpcHandler.registerMethod<CronGetParams, CronGetResult>(
      'cron:get',
      async (params) => ({ job: params?.id ? this.jobs.get(params.id) : null }),
    );

    this.rpcHandler.registerMethod<CronCreateParams, CronCreateResult>(
      'cron:create',
      async (params) => {
        if (!params) {
          throw new Error('cron:create requires params');
        }
        return withRpcErrors(() => ({
          job: this.jobs.create(
            {
              name: params.name,
              cronExpr: params.cronExpr,
              timezone: params.timezone,
              prompt: params.prompt,
              workspaceRoot: params.workspaceRoot,
              enabled: params.enabled,
            },
            { kind: 'user' },
          ),
        }));
      },
    );

    this.rpcHandler.registerMethod<CronUpdateParams, CronUpdateResult>(
      'cron:update',
      async (params) => {
        if (!params?.id) {
          throw new Error('cron:update requires id');
        }
        return withRpcErrors(() => ({
          job: this.jobs.update(params.id, params.patch ?? {}),
        }));
      },
    );

    this.rpcHandler.registerMethod<CronDeleteParams, CronDeleteResult>(
      'cron:delete',
      async (params) => ({
        ok: params?.id ? this.jobs.delete(params.id) : false,
      }),
    );

    this.rpcHandler.registerMethod<CronToggleParams, CronToggleResult>(
      'cron:toggle',
      async (params) => {
        if (!params?.id) {
          throw new Error('cron:toggle requires id');
        }
        return withRpcErrors(() => ({
          job: this.jobs.toggle(params.id, params.enabled),
        }));
      },
    );

    this.rpcHandler.registerMethod<CronRunNowParams, CronRunNowResult>(
      'cron:runNow',
      async (params) => ({
        run: params?.id ? await this.jobs.runNow(params.id) : null,
      }),
    );

    this.rpcHandler.registerMethod<CronRunsParams, CronRunsResult>(
      'cron:runs',
      async (params) => ({
        runs: params?.id
          ? this.jobs.runs(params.id, {
              limit: params.limit,
              offset: params.offset,
            })
          : [],
      }),
    );

    this.rpcHandler.registerMethod<CronNextFireParams, CronNextFireResult>(
      'cron:nextFire',
      async (params) => ({
        nextRunAt: params?.id ? this.jobs.nextFire(params.id) : null,
      }),
    );

    this.logger.info('[cron] RPC handlers registered');
  }
}
