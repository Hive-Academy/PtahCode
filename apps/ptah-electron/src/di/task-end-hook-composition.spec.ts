import 'reflect-metadata';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import { SDK_TOKENS } from '@ptah-extension/agent-sdk';
import { MEMORY_TOKENS } from '@ptah-extension/memory-curator';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import {
  SESSION_ORGANIZATION_TOKENS,
  taskIdsInWorktreeName,
} from '@ptah-extension/session-organization';
import {
  TASK_END_CURATOR_REASONS,
  type GitPrStatusResult,
} from '@ptah-extension/shared';
import { SKILL_SYNTHESIS_TOKENS } from '@ptah-extension/skill-synthesis';
import {
  TASK_END_TOKENS,
  type ActivityPort,
  type CensusPort,
  type CurationPort,
  type GitReadRunner,
  type HarvestPort,
  type PrStatusPort,
  type CloseOutPrStatusPort,
  type SessionLinkPort,
} from '@ptah-extension/task-end-hook';
import { TOKENS, execGit, type Logger } from '@ptah-extension/vscode-core';
import { CODE_SYMBOL_INDEXER } from '@ptah-extension/workspace-intelligence';
import {
  CURATOR_REASON_TO_TASK_END,
  TASK_END_REASONS_ALL_FROM_CURATOR,
  TaskEndEngineUnavailableError,
  registerTaskEndHookComposition,
  toTaskEndCurationResult,
  toTaskEndPrStatus,
} from './task-end-hook-composition';

jest.mock('@ptah-extension/vscode-core', () => ({
  ...jest.requireActual('@ptah-extension/vscode-core'),
  execGit: jest.fn(),
}));

const execGitMock = execGit as jest.MockedFunction<typeof execGit>;

const HOST_PORTS = [
  TASK_END_TOKENS.CURATION_PORT,
  TASK_END_TOKENS.HARVEST_PORT,
  TASK_END_TOKENS.CENSUS_PORT,
  TASK_END_TOKENS.SESSION_LINK_PORT,
  TASK_END_TOKENS.ACTIVITY_PORT,
  TASK_END_TOKENS.PR_STATUS_PORT,
  TASK_END_TOKENS.GIT_READ_RUNNER,
] as const;

const LIBRARY_TOKENS = [
  TASK_END_TOKENS.STORE,
  TASK_END_TOKENS.SETTINGS_READER,
  TASK_END_TOKENS.CENSUS_COORDINATOR,
  TASK_END_TOKENS.CLOSE_CURATE_STEP,
  TASK_END_TOKENS.HARVEST_STEP,
  TASK_END_TOKENS.DISPOSE_EVALUATE_STEP,
  TASK_END_TOKENS.INDEX_REQUEST_STEP,
  TASK_END_TOKENS.DETECTOR,
  TASK_END_TOKENS.WORKER,
  TASK_END_TOKENS.RUN_READER,
] as const;

function makeLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  } as unknown as jest.Mocked<Logger>;
}

function compose(): { c: DependencyContainer; logger: jest.Mocked<Logger> } {
  const c = rootContainer.createChildContainer();
  const logger = makeLogger();
  registerTaskEndHookComposition(c, logger);
  return { c, logger };
}

const liveSignal = (): AbortSignal => new AbortController().signal;
const abortedSignal = (): AbortSignal => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
};

describe('registerTaskEndHookComposition', () => {
  it('binds the seven host ports and the library tokens without resolving an engine', () => {
    const c = rootContainer.createChildContainer();
    const resolve = jest.spyOn(c, 'resolve');
    registerTaskEndHookComposition(c, makeLogger());

    for (const token of [...HOST_PORTS, ...LIBRARY_TOKENS]) {
      expect(c.isRegistered(token, true)).toBe(true);
    }
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('curation adapter', () => {
  it('maps each of the 11 curator reasons to the same task-end reason', () => {
    expect(TASK_END_REASONS_ALL_FROM_CURATOR).toBe(true);
    expect(Object.keys(CURATOR_REASON_TO_TASK_END).sort()).toEqual(
      [...TASK_END_CURATOR_REASONS].sort(),
    );
    for (const reason of TASK_END_CURATOR_REASONS) {
      expect(CURATOR_REASON_TO_TASK_END[reason]).toBe(reason);
      expect(
        toTaskEndCurationResult({
          kind: 'stalled',
          reason,
          transcript: 'not-read',
        }),
      ).toEqual({ kind: 'stalled', reason, transcript: 'not-read' });
    }
  });

  it('converts every outcome kind, keeping a null reason null', () => {
    expect(
      toTaskEndCurationResult({
        kind: 'ran',
        counts: { extracted: 3, merged: 1, created: 2 },
        transcript: 'read',
      }),
    ).toEqual({
      kind: 'ran',
      counts: { extracted: 3, merged: 1, created: 2 },
      transcript: 'read',
    });
    expect(
      toTaskEndCurationResult({ kind: 'gated', gate: 'hourly-limit' }),
    ).toEqual({ kind: 'gated', gate: 'hourly-limit' });
    expect(
      toTaskEndCurationResult({
        kind: 'failed',
        reason: null,
        observations: 'marked-uncurated',
        transcript: 'read-failed',
      }),
    ).toEqual({
      kind: 'failed',
      reason: null,
      observations: 'marked-uncurated',
      transcript: 'read-failed',
    });
    expect(toTaskEndCurationResult({ kind: 'threw', stage: 'pass' })).toEqual(
      { kind: 'threw', stage: 'pass' },
    );
  });

  it('resolves the trigger service lazily, at call time, and returns the converted result', async () => {
    const { c } = compose();
    const port = c.resolve<CurationPort>(TASK_END_TOKENS.CURATION_PORT);
    // Bound after the composition: proves resolution happens inside the call.
    const curateSessionForTaskEnd = jest.fn(async () => ({
      kind: 'failed' as const,
      reason: 'auth-required' as const,
      observations: 'kept' as const,
      transcript: 'read' as const,
    }));
    c.register(MEMORY_TOKENS.MEMORY_TRIGGER_SERVICE, {
      useValue: { curateSessionForTaskEnd },
    });

    await expect(
      port.curateEndedSession('session-1', '/repo', liveSignal()),
    ).resolves.toEqual({
      kind: 'failed',
      reason: 'auth-required',
      observations: 'kept',
      transcript: 'read',
    });
    expect(curateSessionForTaskEnd).toHaveBeenCalledWith('session-1', '/repo');
  });

  it('rejects when the trigger service is not registered, which the step records as failed/curator-failed', async () => {
    const { c } = compose();
    const port = c.resolve<CurationPort>(TASK_END_TOKENS.CURATION_PORT);
    await expect(
      port.curateEndedSession('session-1', '/repo', liveSignal()),
    ).rejects.toBeInstanceOf(TaskEndEngineUnavailableError);
  });

  it('rejects an already aborted request without starting a pass', async () => {
    const { c } = compose();
    const curateSessionForTaskEnd = jest.fn();
    c.register(MEMORY_TOKENS.MEMORY_TRIGGER_SERVICE, {
      useValue: { curateSessionForTaskEnd },
    });
    const port = c.resolve<CurationPort>(TASK_END_TOKENS.CURATION_PORT);
    await expect(
      port.curateEndedSession('session-1', '/repo', abortedSignal()),
    ).rejects.toThrow();
    expect(curateSessionForTaskEnd).not.toHaveBeenCalled();
  });
});

describe('harvest adapter', () => {
  it('calls SpecHarvesterService.harvestTask, resolved at call time', async () => {
    const { c } = compose();
    const port = c.resolve<HarvestPort>(TASK_END_TOKENS.HARVEST_PORT);
    const harvestTask = jest.fn(async () => ({
      outcome: 'harvested' as const,
      reconciled: 2,
    }));
    c.register(SKILL_SYNTHESIS_TOKENS.SPEC_HARVESTER_SERVICE, {
      useValue: { harvestTask },
    });

    await expect(port.harvestTask('/repo', 'TASK_1')).resolves.toEqual({
      outcome: 'harvested',
      reconciled: 2,
    });
    expect(harvestTask).toHaveBeenCalledWith('/repo', 'TASK_1');
  });

  it('rejects when the harvester is not registered', async () => {
    const { c } = compose();
    const port = c.resolve<HarvestPort>(TASK_END_TOKENS.HARVEST_PORT);
    await expect(port.harvestTask('/repo', 'TASK_1')).rejects.toBeInstanceOf(
      TaskEndEngineUnavailableError,
    );
  });
});

describe('census adapter', () => {
  function bindEngines(c: DependencyContainer) {
    const getStatus = jest.fn(async () => ({
      symbolsEnabled: true,
      lastIndexedAt: 1234,
      errorMessage: 'boom',
    }));
    const start = jest.fn(
      async (
        _pipeline: string,
        root: string,
        deps: {
          runSymbols: (
            root: string,
            options?: { signal?: AbortSignal },
          ) => Promise<unknown>;
        },
      ) => {
        await deps.runSymbols(root, { signal: new AbortController().signal });
      },
    );
    const indexWorkspace = jest.fn(async () => ({ filesScanned: 1 }));
    const isIndexing = jest.fn(() => true);
    c.register(MEMORY_TOKENS.INDEXING_CONTROL, {
      useValue: { getStatus, start },
    });
    c.register(CODE_SYMBOL_INDEXER, {
      useValue: { indexWorkspace, isIndexing },
    });
    return { getStatus, start, indexWorkspace, isIndexing };
  }

  it('reads the status fields and the indexer flag, resolved at call time', async () => {
    const { c } = compose();
    const port = c.resolve<CensusPort>(TASK_END_TOKENS.CENSUS_PORT);
    const { getStatus, isIndexing } = bindEngines(c);

    await expect(port.symbolsEnabled('/repo')).resolves.toBe(true);
    await expect(port.lastIndexedAt('/repo')).resolves.toBe(1234);
    await expect(port.lastError('/repo')).resolves.toBe('boom');
    expect(port.isCensusActive('/repo')).toBe(true);
    expect(getStatus).toHaveBeenCalledWith('/repo');
    expect(isIndexing).toHaveBeenCalledWith('/repo');
  });

  it('starts a symbols census as background work, with the caller signal joined', async () => {
    const { c } = compose();
    const port = c.resolve<CensusPort>(TASK_END_TOKENS.CENSUS_PORT);
    const { start, indexWorkspace } = bindEngines(c);
    const controller = new AbortController();

    await port.requestCensus('/repo', controller.signal);

    expect(start).toHaveBeenCalledWith('symbols', '/repo', expect.any(Object));
    expect(indexWorkspace).toHaveBeenCalledTimes(1);
    const [root, options] = indexWorkspace.mock.calls[0] as unknown as [
      string,
      { signal: AbortSignal; userInitiated?: boolean },
    ];
    expect(root).toBe('/repo');
    expect(options.userInitiated).toBeUndefined();
    expect(options.signal.aborted).toBe(false);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });

  it('rejects an aborted request without starting a census', async () => {
    const { c } = compose();
    const port = c.resolve<CensusPort>(TASK_END_TOKENS.CENSUS_PORT);
    const { start } = bindEngines(c);
    await expect(port.requestCensus('/repo', abortedSignal())).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects (and throws for the sync flag) when the engines are not registered', async () => {
    const { c } = compose();
    const port = c.resolve<CensusPort>(TASK_END_TOKENS.CENSUS_PORT);
    await expect(port.symbolsEnabled('/repo')).rejects.toBeInstanceOf(
      TaskEndEngineUnavailableError,
    );
    await expect(
      port.requestCensus('/repo', liveSignal()),
    ).rejects.toBeInstanceOf(TaskEndEngineUnavailableError);
    expect(() => port.isCensusActive('/repo')).toThrow(
      TaskEndEngineUnavailableError,
    );
  });
});

describe('session link adapter', () => {
  function bindStore(c: DependencyContainer, ready = true) {
    const listTaskLinks = jest.fn((root: string) =>
      root === '/main'
        ? [{ sessionId: 's1' }, { sessionId: 's2' }]
        : [{ sessionId: 's2' }, { sessionId: 's3' }],
    );
    const getOrganization = jest.fn((root: string, sessionId: string) =>
      root === '/seen' && sessionId === 's1'
        ? { worktreePath: '/repo/.claude-worktrees/x' }
        : root === '/main'
          ? { worktreePath: null }
          : null,
    );
    c.register(SESSION_ORGANIZATION_TOKENS.STORE, {
      useValue: { isReady: () => ready, listTaskLinks, getOrganization },
    });
    return { listTaskLinks, getOrganization };
  }

  it('de-duplicates linked sessions across roots in a stable order', () => {
    const { c } = compose();
    const port = c.resolve<SessionLinkPort>(TASK_END_TOKENS.SESSION_LINK_PORT);
    const { listTaskLinks } = bindStore(c);

    expect(port.linkedSessions('TASK_1', ['/main', '/seen'])).toEqual([
      's1',
      's2',
      's3',
    ]);
    expect(listTaskLinks).toHaveBeenCalledWith('/main', ['TASK_1']);
    expect(listTaskLinks).toHaveBeenCalledWith('/seen', ['TASK_1']);
  });

  it('returns the first stored worktree path across roots, else null', () => {
    const { c } = compose();
    const port = c.resolve<SessionLinkPort>(TASK_END_TOKENS.SESSION_LINK_PORT);
    bindStore(c);

    expect(port.worktreePathForSession('s1', ['/main', '/seen'])).toBe(
      '/repo/.claude-worktrees/x',
    );
    expect(port.worktreePathForSession('s9', ['/main', '/seen'])).toBeNull();
  });

  it('delegates worktree naming to the session-organization export (D2)', () => {
    const { c } = compose();
    const port = c.resolve<SessionLinkPort>(TASK_END_TOKENS.SESSION_LINK_PORT);
    const path = '/repo/.claude-worktrees/TASK_2026_886_cae4';
    expect(port.taskIdsInWorktreeName(path, 'feat/x')).toEqual(
      taskIdsInWorktreeName(path, 'feat/x'),
    );
  });

  it('throws when the store is unregistered or not ready', () => {
    const unregistered = compose().c;
    expect(() =>
      unregistered
        .resolve<SessionLinkPort>(TASK_END_TOKENS.SESSION_LINK_PORT)
        .linkedSessions('TASK_1', ['/main']),
    ).toThrow(TaskEndEngineUnavailableError);

    const { c } = compose();
    bindStore(c, false);
    expect(() =>
      c
        .resolve<SessionLinkPort>(TASK_END_TOKENS.SESSION_LINK_PORT)
        .worktreePathForSession('s1', ['/main']),
    ).toThrow(TaskEndEngineUnavailableError);
  });
});

describe('activity adapter', () => {
  function bindEngines(c: DependencyContainer) {
    const now = Date.now();
    const records: Record<
      string,
      {
        turnInFlight: boolean;
        lastActivityAt: number;
        config: { projectPath?: string };
      }
    > = {
      tab1: {
        turnInFlight: false,
        lastActivityAt: now - 60_000,
        config: { projectPath: '/repo' },
      },
      tab2: {
        turnInFlight: false,
        lastActivityAt: now - 1_000,
        config: { projectPath: '/repo/.claude-worktrees/x' },
      },
    };
    c.register(SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER, {
      useValue: {
        find: (id: string) => records[id],
        getLiveSessionIds: () => Object.keys(records),
        getLiveWorkspaceRoots: () => ['/repo'],
      },
    });
    c.register(TOKENS.AGENT_PROCESS_MANAGER, {
      useValue: {
        listTrackedAgents: () => [
          { workingDirectory: '/lane/a' },
          { workingDirectory: '/lane/a' },
          { workingDirectory: '/lane/b' },
        ],
      },
    });
    c.register(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
      useValue: { getWorkspaceFolders: () => ['/repo', '/other'] },
    });
  }

  it('answers every probe from the engines, resolved at call time', () => {
    const { c } = compose();
    const port = c.resolve<ActivityPort>(TASK_END_TOKENS.ACTIVITY_PORT);
    bindEngines(c);

    expect(port.isSessionLive('tab1')).toEqual({ kind: 'ok', value: true });
    expect(port.isSessionLive('gone')).toEqual({ kind: 'ok', value: false });
    expect(port.liveSessionRoots()).toEqual({
      kind: 'ok',
      value: ['/repo', '/repo/.claude-worktrees/x'],
    });
    expect(port.trackedLaneDirs()).toEqual({
      kind: 'ok',
      value: ['/lane/a', '/lane/b'],
    });
    expect(port.registeredWorkspaceRoots()).toEqual({
      kind: 'ok',
      value: ['/repo', '/other'],
    });
    expect(port.foregroundActive(10_000)).toEqual({ kind: 'ok', value: true });
    expect(port.foregroundActive(100)).toEqual({ kind: 'ok', value: false });
  });

  it('reports unavailable without a log line when an engine is not registered', () => {
    const { c, logger } = compose();
    const port = c.resolve<ActivityPort>(TASK_END_TOKENS.ACTIVITY_PORT);

    expect(port.isSessionLive('tab1')).toEqual({ kind: 'unavailable' });
    expect(port.liveSessionRoots()).toEqual({ kind: 'unavailable' });
    expect(port.trackedLaneDirs()).toEqual({ kind: 'unavailable' });
    expect(port.registeredWorkspaceRoots()).toEqual({ kind: 'unavailable' });
    expect(port.foregroundActive(100)).toEqual({ kind: 'unavailable' });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('reports unavailable and warns when an engine call throws', () => {
    const { c, logger } = compose();
    c.register(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
      useValue: {
        getWorkspaceFolders: () => {
          throw new Error('folders unreadable');
        },
      },
    });
    const port = c.resolve<ActivityPort>(TASK_END_TOKENS.ACTIVITY_PORT);

    expect(port.registeredWorkspaceRoots()).toEqual({ kind: 'unavailable' });
    expect(logger.warn).toHaveBeenCalledWith(
      '[Electron DI] task-end activity probe failed',
      { probe: 'registeredWorkspaceRoots', error: 'folders unreadable' },
    );
  });
});

describe('PR status adapter', () => {
  it('marks a GitHub lookup failure for scan-level logging', async () => {
    const { c } = compose();
    c.register(TOKENS.GIT_INFO_SERVICE, { useValue: {
      readPrStatus: jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'not-authenticated' }),
    } });
    const port = c.resolve<CloseOutPrStatusPort>(TASK_END_TOKENS.CLOSE_OUT_PR_STATUS_PORT);
    await expect(port.prStatus('/repo', 'feat/x')).resolves.toEqual({ kind: 'unknown', lookupFailed: true });
  });
  it('does not report a PR merged into another base as merged', async () => {
    const { c } = compose();
    c.register(TOKENS.GIT_INFO_SERVICE, { useValue: {
      readPrStatus: jest.fn().mockResolvedValue({ status: 'ok', pr: {
        number: 7, url: 'https://github.com/a/b/pull/7', state: 'MERGED',
        headRefName: 'feat/x', baseRefName: 'release',
      } }),
    } });
    const port = c.resolve<CloseOutPrStatusPort>(TASK_END_TOKENS.CLOSE_OUT_PR_STATUS_PORT);
    await expect(port.prStatus('/repo', 'feat/x')).resolves.toEqual({ kind: 'unknown' });
  });
  const unavailable = (
    reason: Extract<GitPrStatusResult, { status: 'unavailable' }>['reason'],
  ): GitPrStatusResult => ({ status: 'unavailable', reason });
  const ok = (state: 'OPEN' | 'CLOSED' | 'MERGED' | 'UNKNOWN') =>
    ({ status: 'ok', pr: { state }, checks: {} }) as unknown as GitPrStatusResult;

  it('maps every readPrStatus result to the closed answer', () => {
    expect(toTaskEndPrStatus(ok('OPEN'))).toEqual({ kind: 'open' });
    expect(toTaskEndPrStatus(ok('MERGED'))).toEqual({ kind: 'none' });
    expect(toTaskEndPrStatus(ok('CLOSED'))).toEqual({ kind: 'none' });
    expect(toTaskEndPrStatus(unavailable('no-pr'))).toEqual({ kind: 'none' });
    expect(toTaskEndPrStatus(unavailable('gh-missing'))).toEqual({
      kind: 'gh-unavailable',
    });
    expect(toTaskEndPrStatus(unavailable('not-github'))).toEqual({
      kind: 'gh-unavailable',
    });
    for (const reason of ['not-authenticated', 'timeout', 'failed'] as const) {
      expect(toTaskEndPrStatus(unavailable(reason))).toEqual({ kind: 'error' });
    }
  });

  it('reads through GitInfoService at call time', async () => {
    const { c } = compose();
    const port = c.resolve<PrStatusPort>(TASK_END_TOKENS.PR_STATUS_PORT);
    const readPrStatus = jest.fn(async () => ok('OPEN'));
    c.register(TOKENS.GIT_INFO_SERVICE, { useValue: { readPrStatus } });

    await expect(port.openPrStatus('/repo', 'feat/x')).resolves.toEqual({
      kind: 'open',
    });
    expect(readPrStatus).toHaveBeenCalledWith('/repo', 'feat/x');
  });

  it('never rejects: an unregistered service or a rejection gives error', async () => {
    const unregistered = compose().c;
    await expect(
      unregistered
        .resolve<PrStatusPort>(TASK_END_TOKENS.PR_STATUS_PORT)
        .openPrStatus('/repo', 'feat/x'),
    ).resolves.toEqual({ kind: 'error' });

    const { c } = compose();
    c.register(TOKENS.GIT_INFO_SERVICE, {
      useValue: {
        readPrStatus: jest.fn(async () => {
          throw new Error('gh exploded');
        }),
      },
    });
    await expect(
      c
        .resolve<PrStatusPort>(TASK_END_TOKENS.PR_STATUS_PORT)
        .openPrStatus('/repo', 'feat/x'),
    ).resolves.toEqual({ kind: 'error' });
  });
});

describe('git read runner', () => {
  beforeEach(() => {
    execGitMock.mockReset();
    execGitMock.mockResolvedValue({ stdout: 'out', stderr: '', exitCode: 0 });
  });

  it('runs the vector unchanged through execGit at background priority', async () => {
    const { c } = compose();
    const runner = c.resolve<GitReadRunner>(TASK_END_TOKENS.GIT_READ_RUNNER);
    const signal = liveSignal();
    const args = ['rev-parse', '--git-common-dir'] as const;

    await expect(
      runner.run(args, '/repo', {
        timeoutMs: 5_000,
        maxOutputBytes: 1024,
        signal,
      }),
    ).resolves.toEqual({ stdout: 'out', stderr: '', exitCode: 0 });

    expect(execGitMock).toHaveBeenCalledWith(
      ['rev-parse', '--git-common-dir'],
      '/repo',
      { timeoutMs: 5_000, maxOutputBytes: 1024, priority: 'background', signal },
    );
  });

  it('uses the off-thread spawner when the host bound one', async () => {
    const { c } = compose();
    const spawner = { spawnProcess: jest.fn() };
    c.register(SDK_TOKENS.SDK_PROCESS_SPAWNER, { useValue: spawner });
    const runner = c.resolve<GitReadRunner>(TASK_END_TOKENS.GIT_READ_RUNNER);

    await runner.run(['status', '--porcelain=v1', '-z'], '/repo', {
      timeoutMs: 5_000,
      maxOutputBytes: 1024,
    });

    expect(execGitMock).toHaveBeenCalledWith(
      ['status', '--porcelain=v1', '-z'],
      '/repo',
      {
        timeoutMs: 5_000,
        maxOutputBytes: 1024,
        priority: 'background',
        spawner,
      },
    );
  });
});
