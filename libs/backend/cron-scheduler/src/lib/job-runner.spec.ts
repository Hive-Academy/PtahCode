/**
 * JobRunner — the three terminal outcomes a handler that actually RAN can
 * produce, and which store call each one lands on.
 *
 * The defect this file pins (TASK_2026_315 / C2): `markSucceeded` was called
 * unconditionally after `dispatch` resolved, so a `skills:drain:*` handler that
 * stopped at its daily token budget was recorded as `succeeded`. The captured
 * log has four pairs of
 *
 *   [skill-synthesis] drain skipped: {"reason":"daily-token-budget-exhausted"}
 *   [cron-scheduler]  run succeeded: {"jobId":"@ptah/skills-drain-frequent"}
 *
 * roughly a minute apart. `cron:runs` is exactly where a user looks to find out
 * why background synthesis stopped, and it was the one surface claiming it had
 * not.
 *
 * The three cases below are asserted TOGETHER on purpose: the fix is a branch,
 * and a branch can be wrong in both directions. Skipped-not-succeeded is the
 * regression; succeeded-still-succeeded is the guard against over-widening it;
 * failed-still-failed is the guard against swallowing a real error as "did
 * nothing". The two skips the RUNNER owns (concurrency cap, abort) are pinned
 * here too, because the handler-declared skip must not disturb them.
 *
 * Collaborators are hand-rolled fakes rather than a tsyringe graph: `JobRunner`
 * takes its five dependencies by constructor, and better-sqlite3 cannot load in
 * the Jest runner anyway (this repo rebuilds it against Electron's ABI) — the
 * same reason `run.store.spec.ts` and `job.store.spec.ts` fake the driver.
 */
import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import { JobId, RunId } from '@ptah-extension/shared';
import type {
  IMcpGateway,
  McpGatewayServerStatus,
} from '@ptah-extension/platform-core';
import { JobRunner } from './job-runner';
import type { IJobStore } from './job.store';
import type { IRunStore } from './run.store';
import { SlotAlreadyClaimedError } from './run.store';
import type {
  IHandlerRegistry,
  JobHandler,
  JobHandlerResult,
  ScheduledJob,
} from './types';

const JOB_ID = JobId.from('01ARZ3NDEKTSV4RRFFQ69G5FAV');
const RUN_ID = RunId.from('01ARZ3NDEKTSV4RRFFQ69G5FAW');

function drainJob(): ScheduledJob {
  return {
    id: JOB_ID,
    name: 'Skill Synthesis Drain (frequent)',
    cronExpr: '*/15 * * * *',
    timezone: 'UTC',
    prompt: 'handler:skills:drain:frequent',
    workspaceRoot: null,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    lastRunAt: null,
    nextRunAt: null,
    createdBy: { kind: 'user' },
    lastRunStatus: null,
  };
}

interface Harness {
  runner: JobRunner;
  runs: {
    tryClaim: jest.Mock;
    markStarted: jest.Mock;
    markSucceeded: jest.Mock;
    markFailed: jest.Mock;
    markSkipped: jest.Mock;
    setSessionId: jest.Mock;
    list: jest.Mock;
    get: jest.Mock;
    latestForJob: jest.Mock;
  };
  jobs: { update: jest.Mock };
  internalQuery: { execute: jest.Mock };
  workspaceLlm: { resolveForPath: jest.Mock; resolveSetup: jest.Mock };
  logWithContext: jest.Mock;
}

/**
 * @param handler - what the registry resolves for `skills:drain:frequent`.
 *   Pass `null` to leave the registry empty.
 */
function makeHarness(
  handler: JobHandler | null,
  mcpGateway?: IMcpGateway,
): Harness {
  const runs = {
    tryClaim: jest.fn(() => ({
      id: RUN_ID,
      jobId: JOB_ID,
      scheduledFor: 0,
      startedAt: null,
      endedAt: null,
      status: 'pending' as const,
      resultSummary: null,
      errorMessage: null,
      sessionId: null,
    })),
    markStarted: jest.fn(),
    markSucceeded: jest.fn(),
    markFailed: jest.fn(),
    markSkipped: jest.fn(),
    setSessionId: jest.fn(),
    list: jest.fn(() => []),
    get: jest.fn(() => null),
    latestForJob: jest.fn(() => null),
  };
  const jobs = { update: jest.fn() };
  const internalQuery = { execute: jest.fn() };
  const workspaceLlm = {
    resolveForPath: jest.fn(async () => ({
      providerId: 'z-ai',
      model: 'glm-5.3',
      auth: { env: { ANTHROPIC_AUTH_TOKEN: 'ws-a-key' } },
    })),
    resolveSetup: jest.fn(),
  };
  const handlers: IHandlerRegistry = {
    register: jest.fn(),
    unregister: jest.fn(),
    has: jest.fn(() => handler !== null),
    resolve: jest.fn(() => handler ?? undefined),
  };
  const logWithContext = jest.fn();
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logWithContext,
  } as unknown as Logger;

  const runner = new JobRunner(
    runs as unknown as IRunStore,
    jobs as unknown as IJobStore,
    internalQuery,
    handlers,
    logger,
    workspaceLlm,
    null,
    mcpGateway,
  );
  return { runner, runs, jobs, internalQuery, workspaceLlm, logWithContext };
}

describe('JobRunner outcomes', () => {
  it('records a handler that deliberately did nothing as SKIPPED, not succeeded', async () => {
    // Exactly what the skill-drain seam returns when the daily token budget
    // gate closes before any queue row is claimed.
    const result: JobHandlerResult = {
      outcome: 'skipped',
      reason: 'daily-token-budget-exhausted',
    };
    const { runner, runs } = makeHarness(async () => result);

    await runner.run(drainJob(), 1_700_000_000_000);

    expect(runs.markSucceeded).not.toHaveBeenCalled();
    expect(runs.markFailed).not.toHaveBeenCalled();
    expect(runs.markSkipped).toHaveBeenCalledTimes(1);
    // The reason is the payload, not decoration: `markSkipped` writes it into
    // `job_runs.result_summary`, which is the string the run-history drawer
    // renders. A user asking "why did synthesis stop" reads this exact token.
    expect(runs.markSkipped).toHaveBeenCalledWith(
      RUN_ID,
      'daily-token-budget-exhausted',
    );
  });

  it('still records a handler that did real work as SUCCEEDED', async () => {
    const { runner, runs, jobs } = makeHarness(async () => ({
      summary: 'claimed 4, done 4, failed 0',
    }));

    await runner.run(drainJob(), 1_700_000_000_000);

    expect(runs.markSkipped).not.toHaveBeenCalled();
    expect(runs.markFailed).not.toHaveBeenCalled();
    expect(runs.markSucceeded).toHaveBeenCalledWith(
      RUN_ID,
      'claimed 4, done 4, failed 0',
    );
    expect(jobs.update).toHaveBeenCalledWith(JOB_ID, {
      lastRunAt: expect.any(Number),
    });
  });

  it('treats a handler that omits `outcome` as succeeded', async () => {
    // Every handler predating the channel returns a bare `{ summary }`; the
    // daily backup still does. Absent must keep meaning success.
    const { runner, runs } = makeHarness(async () => ({
      summary: 'backup written to /backups/daily.db',
    }));

    await runner.run(drainJob(), 1_700_000_000_000);

    expect(runs.markSucceeded).toHaveBeenCalledWith(
      RUN_ID,
      'backup written to /backups/daily.db',
    );
    expect(runs.markSkipped).not.toHaveBeenCalled();
  });

  it('still records a thrown handler as FAILED', async () => {
    const { runner, runs } = makeHarness(async () => {
      throw new Error('drain exploded');
    });

    await runner.run(drainJob(), 1_700_000_000_000);

    expect(runs.markSucceeded).not.toHaveBeenCalled();
    expect(runs.markSkipped).not.toHaveBeenCalled();
    expect(runs.markFailed).toHaveBeenCalledWith(RUN_ID, 'drain exploded');
  });

  it('falls back to the summary, then a token, when a skip carries no reason', async () => {
    const { runner, runs } = makeHarness(async () => ({
      outcome: 'skipped' as const,
    }));

    await runner.run(drainJob(), 1_700_000_000_000);

    // Never `null` — a blank run row in the history is the same dead end as
    // the wrong status.
    expect(runs.markSkipped).toHaveBeenCalledWith(RUN_ID, 'handler-skipped');
  });
});

describe('JobRunner skips the RUNNER owns (unchanged by the handler channel)', () => {
  it('marks the concurrency cap as skipped without entering the handler', async () => {
    // The first run parks inside the handler, so the second finds the single
    // slot occupied. Two runs on ONE runner is what the cap guards.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = jest.fn(async () => {
      await gate;
      return { summary: 'claimed 4, done 4, failed 0' };
    });
    const { runner, runs, jobs } = makeHarness(handler);
    runner.setMaxConcurrent(1);

    const first = runner.run(drainJob(), 1);
    const second = runner.run(drainJob(), 2);
    release();
    await Promise.all([first, second]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(runs.markSkipped).toHaveBeenCalledWith(RUN_ID, 'concurrency-limit');
    expect(runs.markSucceeded).toHaveBeenCalledTimes(1);
    // The capped slot never reached the handler, so only the run that actually
    // executed bumped the job row.
    expect(jobs.update).toHaveBeenCalledTimes(1);
  });

  it('marks an aborted run as skipped with reason `aborted`', async () => {
    const ctl = new AbortController();
    const { runner, runs, jobs } = makeHarness(async (ctx) => {
      ctl.abort();
      // Mirror a cooperative handler: it observes the signal and throws.
      if (ctx.signal.aborted) throw new Error('aborted mid-flight');
      return { summary: 'unreachable' };
    });

    await runner.run(drainJob(), 1_700_000_000_000, { signal: ctl.signal });

    expect(runs.markSkipped).toHaveBeenCalledWith(RUN_ID, 'aborted');
    expect(runs.markFailed).not.toHaveBeenCalled();
    // An abort is not evidence the job ran, so the timestamp stays put.
    expect(jobs.update).not.toHaveBeenCalled();
  });

  it('returns quietly when another runner already claimed the slot', async () => {
    const handler = jest.fn(async () => ({ summary: 'should not run' }));
    const { runner, runs } = makeHarness(handler);
    runs.tryClaim.mockImplementation(() => {
      throw new SlotAlreadyClaimedError(JOB_ID, 1);
    });

    await runner.run(drainJob(), 1);

    expect(handler).not.toHaveBeenCalled();
    expect(runs.markSkipped).not.toHaveBeenCalled();
    expect(runs.markSucceeded).not.toHaveBeenCalled();
    expect(runs.markFailed).not.toHaveBeenCalled();
  });
});

describe('JobRunner prompt jobs — workspace provider and model', () => {
  function emptyHandle() {
    return {
      stream: (async function* () {
        yield { type: 'result', subtype: 'success', result: 'done' };
      })(),
      close: jest.fn(),
      abort: jest.fn(),
    };
  }

  it('runs on the provider AND model of one snapshot for the job workspace', async () => {
    const h = makeHarness(null);
    h.internalQuery.execute.mockResolvedValue(emptyHandle());

    await h.runner.run(
      { ...drainJob(), prompt: 'Summarise the repo', workspaceRoot: '/ws/a' },
      1_700_000_000_000,
    );

    expect(h.workspaceLlm.resolveForPath).toHaveBeenCalledWith('/ws/a');
    const config = h.internalQuery.execute.mock.calls[0][0];
    expect(config.cwd).toBe('/ws/a');
    expect(config.model).toBe('glm-5.3');
    expect(config.auth).toEqual({
      env: { ANTHROPIC_AUTH_TOKEN: 'ws-a-key' },
    });
  });

  it('a rootless job resolves the app/global snapshot explicitly', async () => {
    const h = makeHarness(null);
    h.internalQuery.execute.mockResolvedValue(emptyHandle());

    await h.runner.run(
      { ...drainJob(), prompt: 'Summarise', workspaceRoot: null },
      1_700_000_000_000,
    );

    expect(h.workspaceLlm.resolveForPath).toHaveBeenCalledWith(undefined);
    expect(h.internalQuery.execute.mock.calls[0][0].model).toBe('glm-5.3');
  });
});

describe('JobRunner prompt jobs — run session id', () => {
  const SESSION_ID = '5b2c1d4e-0000-4000-8000-0000000000aa';

  function handleOf(messages: readonly unknown[]) {
    return {
      stream: (async function* () {
        for (const message of messages) yield message;
      })(),
      close: jest.fn(),
      abort: jest.fn(),
    };
  }

  function promptJob(): ScheduledJob {
    return {
      ...drainJob(),
      prompt: 'Summarise the repo',
      workspaceRoot: '/ws/a',
    };
  }

  it('records the SDK session id once, from the first message that carries it', async () => {
    const h = makeHarness(null);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        { type: 'system', subtype: 'init', session_id: SESSION_ID },
        { type: 'assistant', session_id: SESSION_ID },
        // A later message naming another session must not replace the link.
        { type: 'assistant', session_id: 'another-session' },
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          session_id: SESSION_ID,
        },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.setSessionId).toHaveBeenCalledTimes(1);
    expect(h.runs.setSessionId).toHaveBeenCalledWith(RUN_ID, SESSION_ID);
    expect(h.runs.markSucceeded).toHaveBeenCalledWith(RUN_ID, 'done');
  });

  it('skips messages without a usable session id and records the first real one', async () => {
    const h = makeHarness(null);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        null,
        'not-an-object',
        { type: 'system', subtype: 'init' },
        { type: 'system', session_id: '' },
        { type: 'system', session_id: 42 },
        { type: 'assistant', session_id: SESSION_ID },
        { type: 'result', subtype: 'success', result: 'done' },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.setSessionId).toHaveBeenCalledTimes(1);
    expect(h.runs.setSessionId).toHaveBeenCalledWith(RUN_ID, SESSION_ID);
  });

  it('does not write a session id when the stream never reports one', async () => {
    const h = makeHarness(null);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([{ type: 'result', subtype: 'success', result: 'done' }]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.setSessionId).not.toHaveBeenCalled();
    expect(h.runs.markSucceeded).toHaveBeenCalledWith(RUN_ID, 'done');
  });

  it('a throwing setSessionId is logged and does not fail the run', async () => {
    const h = makeHarness(null);
    const storeError = new Error('database is locked');
    h.runs.setSessionId.mockImplementation(() => {
      throw storeError;
    });
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        { type: 'system', subtype: 'init', session_id: SESSION_ID },
        { type: 'assistant', session_id: SESSION_ID },
        { type: 'result', subtype: 'success', result: 'done' },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    // One attempt only: the failed write is not retried on later messages.
    expect(h.runs.setSessionId).toHaveBeenCalledTimes(1);
    expect(h.runs.markFailed).not.toHaveBeenCalled();
    expect(h.runs.markSucceeded).toHaveBeenCalledWith(RUN_ID, 'done');
    expect(h.jobs.update).toHaveBeenCalledTimes(1);
    expect(h.logWithContext).toHaveBeenCalledWith(
      'warn',
      '[cron-scheduler] could not record the run session id',
      { error: storeError, metadata: { jobId: JOB_ID, runId: RUN_ID } },
    );
  });

  it('a handler run has no SDK stream and never writes a session id', async () => {
    const h = makeHarness(async () => ({ summary: 'claimed 1, done 1' }));

    await h.runner.run(drainJob(), 1_700_000_000_000);

    expect(h.internalQuery.execute).not.toHaveBeenCalled();
    expect(h.runs.setSessionId).not.toHaveBeenCalled();
    expect(h.runs.markSucceeded).toHaveBeenCalledWith(
      RUN_ID,
      'claimed 1, done 1',
    );
  });
});

describe('JobRunner prompt jobs — connectors opt-in and MCP warning', () => {
  function handleOf(messages: readonly unknown[]) {
    return {
      stream: (async function* () {
        for (const message of messages) yield message;
      })(),
      close: jest.fn(),
      abort: jest.fn(),
    };
  }

  function promptJob(): ScheduledJob {
    return {
      ...drainJob(),
      prompt: 'Summarise the repo',
      workspaceRoot: '/ws/a',
    };
  }

  function gatewayOf(
    statuses: McpGatewayServerStatus[] | (() => never),
  ): IMcpGateway & { status: jest.Mock } {
    return {
      registerHostToolNames: jest.fn(),
      isGatewayTool: jest.fn(() => false),
      listTools: jest.fn(async () => []),
      callTool: jest.fn(),
      status: jest.fn(
        typeof statuses === 'function' ? statuses : () => statuses,
      ),
      servedFileServerNames: jest.fn(async () => []),
      onToolsChanged: jest.fn(() => ({ dispose: jest.fn() })),
      refresh: jest.fn(async () => undefined),
      dispose: jest.fn(),
    };
  }

  const init = (servers: unknown[]) => ({
    type: 'system',
    subtype: 'init',
    session_id: 'sess-1',
    mcp_servers: servers,
  });

  it('opts the one-shot run in to connectors', async () => {
    const h = makeHarness(null);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([{ type: 'result', subtype: 'success', result: 'done' }]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.internalQuery.execute.mock.calls[0][0].includeConnectors).toBe(
      true,
    );
    expect(h.runs.markSucceeded).toHaveBeenCalledWith(RUN_ID, 'done');
  });

  it('names a needs-auth init server and a cold-start pending gateway server', async () => {
    const gateway = gatewayOf([
      {
        key: 'https://ok.example/mcp',
        display: 'ok-server',
        status: 'connected',
      },
      {
        key: 'https://slow.example/mcp',
        display: 'slow-server',
        status: 'pending',
        detail: 'tools/list timed out after 12s',
      },
    ]);
    const h = makeHarness(null, gateway);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        init([
          { name: 'ptah', status: 'connected' },
          { name: 'off-server', status: 'disabled' },
          { name: 'linear', status: 'needs-auth' },
        ]),
        { type: 'result', subtype: 'success', result: 'done' },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(gateway.status).toHaveBeenCalledWith({
      kind: 'internal-query',
      capability: 'privileged',
      includeConnectors: true,
      workspaceRoot: '/ws/a',
    });
    expect(h.runs.markSucceeded).toHaveBeenCalledWith(
      RUN_ID,
      'done\n[warning] MCP unavailable: linear(needs-auth), ' +
        'slow-server(pending: tools/list timed out after 12s)',
    );
    expect(h.runs.markFailed).not.toHaveBeenCalled();
    expect(h.runs.markSkipped).not.toHaveBeenCalled();
  });

  it('carries the failed init server error as detail and dedups by name', async () => {
    const gateway = gatewayOf([
      { key: 'k', display: 'broken', status: 'failed', detail: 'gateway copy' },
    ]);
    const h = makeHarness(null, gateway);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        init([{ name: 'broken', status: 'failed', error: 'spawn ENOENT' }]),
        { type: 'result', subtype: 'success', result: 'done' },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.markSucceeded).toHaveBeenCalledWith(
      RUN_ID,
      'done\n[warning] MCP unavailable: broken(failed: spawn ENOENT)',
    );
  });

  it('caps the base at 500 and the warning at 300 characters', async () => {
    const gateway = gatewayOf(
      Array.from({ length: 40 }, (_, i) => ({
        key: `k${i}`,
        display: `server-${i}`,
        status: 'failed' as const,
        detail: 'connection refused',
      })),
    );
    const h = makeHarness(null, gateway);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        { type: 'result', subtype: 'success', result: 'x'.repeat(900) },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    const summary = h.runs.markSucceeded.mock.calls[0][1] as string;
    expect(summary.slice(0, 500)).toBe('x'.repeat(500));
    const warning = summary.slice(500);
    expect(warning.startsWith('\n[warning] MCP unavailable: server-0(')).toBe(
      true,
    );
    expect(warning).toHaveLength(300);
    expect(summary).toHaveLength(800);
  });

  it('leaves the summary unchanged when every server is connected', async () => {
    const gateway = gatewayOf([
      { key: 'k', display: 'ok-server', status: 'connected' },
    ]);
    const h = makeHarness(null, gateway);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        init([{ name: 'ptah', status: 'connected' }]),
        { type: 'result', subtype: 'success', result: 'done' },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.markSucceeded).toHaveBeenCalledWith(RUN_ID, 'done');
  });

  it('a throwing gateway status is logged and keeps the run succeeded', async () => {
    const statusError = new Error('cache unavailable');
    const gateway = gatewayOf(() => {
      throw statusError;
    });
    const h = makeHarness(null, gateway);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([{ type: 'result', subtype: 'success', result: 'done' }]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.markSucceeded).toHaveBeenCalledWith(RUN_ID, 'done');
    expect(h.logWithContext).toHaveBeenCalledWith(
      'warn',
      '[cron-scheduler] could not read MCP gateway status',
      { error: statusError, metadata: { jobId: JOB_ID, runId: RUN_ID } },
    );
  });

  it('M8: appends the MCP warning to a failed run and keeps it failed', async () => {
    const gateway = gatewayOf([
      {
        key: 'https://slow.example/mcp',
        display: 'slow-server',
        status: 'pending',
        detail: 'tools/list timed out after 12s',
      },
    ]);
    const h = makeHarness(null, gateway);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        init([{ name: 'linear', status: 'needs-auth' }]),
        { type: 'result', subtype: 'error_max_turns' },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.markFailed).toHaveBeenCalledWith(
      RUN_ID,
      'SDK reported max-turns exceeded\n[warning] MCP unavailable: ' +
        'linear(needs-auth), slow-server(pending: tools/list timed out after 12s)',
    );
    expect(h.runs.markSucceeded).not.toHaveBeenCalled();
    expect(h.runs.markSkipped).not.toHaveBeenCalled();
    const logged = h.logWithContext.mock.calls.find(
      ([, message]) => message === '[cron-scheduler] run failed',
    );
    expect((logged?.[2] as { error: Error }).error.cause).toEqual(
      new Error('SDK reported max-turns exceeded'),
    );
  });

  it('M8: a failed run with every server connected keeps its own message', async () => {
    const h = makeHarness(
      null,
      gatewayOf([{ key: 'k', display: 'ok-server', status: 'connected' }]),
    );
    h.internalQuery.execute.mockResolvedValue(
      handleOf([{ type: 'result', subtype: 'error_during_execution' }]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    expect(h.runs.markFailed).toHaveBeenCalledWith(
      RUN_ID,
      'SDK reported execution error',
    );
  });

  it('M8: an aborted run that throws stays skipped', async () => {
    const h = makeHarness(
      null,
      gatewayOf([{ key: 'k', display: 'down', status: 'failed' }]),
    );
    const caller = new AbortController();
    h.internalQuery.execute.mockResolvedValue({
      stream: {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            caller.abort();
            throw new Error('stream torn down');
          },
        }),
      },
      close: jest.fn(),
      abort: jest.fn(),
    });

    await h.runner.run(promptJob(), 1_700_000_000_000, {
      signal: caller.signal,
    });

    expect(h.runs.markSkipped).toHaveBeenCalledWith(RUN_ID, 'aborted');
    expect(h.runs.markFailed).not.toHaveBeenCalled();
  });

  it('M8: redacts URL queries, tokens and header values in the warning', async () => {
    const gateway = gatewayOf([
      {
        key: 'k',
        display: 'hosted',
        status: 'failed',
        detail: 'HTTP 401 from https://mcp.example/v1?api_key=GW-SECRET-1',
      },
    ]);
    const h = makeHarness(null, gateway);
    h.internalQuery.execute.mockResolvedValue(
      handleOf([
        init([
          {
            name: 'broken',
            status: 'failed',
            error:
              'connect https://user:pw-SECRET-2@srv.example/mcp?token=SECRET-3 ' +
              'failed; Authorization: Token SECRET-4',
          },
        ]),
        { type: 'result', subtype: 'success', result: 'done' },
      ]),
    );

    await h.runner.run(promptJob(), 1_700_000_000_000);

    const summary = h.runs.markSucceeded.mock.calls[0][1] as string;
    for (const secret of ['GW-SECRET-1', 'SECRET-2', 'SECRET-3', 'SECRET-4']) {
      expect(summary).not.toContain(secret);
    }
    expect(summary).toContain('https://srv.example/mcp?***redacted***');
    expect(summary).toContain('https://mcp.example/v1?***redacted***');
  });
});
