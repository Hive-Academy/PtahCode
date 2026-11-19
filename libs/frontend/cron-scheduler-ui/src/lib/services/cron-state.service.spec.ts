import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AppStateManager } from '@ptah-extension/core';
import type { CronListResult, ScheduledJobDto } from '@ptah-extension/shared';

import { CronRpcService } from './cron-rpc.service';
import { CronStateService } from './cron-state.service';

interface AppStateStub {
  workspaceInfo: ReturnType<typeof signal<{ path: string } | null>>;
}

function makeJob(over: Partial<ScheduledJobDto>): ScheduledJobDto {
  return {
    id: over.id ?? 'job-1',
    name: over.name ?? 'sample',
    cronExpr: over.cronExpr ?? '* * * * *',
    timezone: over.timezone ?? 'UTC',
    prompt: over.prompt ?? 'noop',
    workspaceRoot: over.workspaceRoot ?? null,
    enabled: over.enabled ?? true,
    createdAt: over.createdAt ?? 0,
    updatedAt: over.updatedAt ?? 0,
    lastRunAt: over.lastRunAt ?? null,
    nextRunAt: over.nextRunAt ?? null,
    createdBy: over.createdBy ?? { kind: 'user' },
    lastRunStatus: over.lastRunStatus ?? null,
  };
}

describe('CronStateService', () => {
  let rpc: jest.Mocked<CronRpcService>;
  let appState: AppStateStub;

  beforeEach(() => {
    rpc = {
      list: jest.fn().mockResolvedValue({ jobs: [] } as CronListResult),
    } as unknown as jest.Mocked<CronRpcService>;
    appState = { workspaceInfo: signal<{ path: string } | null>(null) };

    TestBed.configureTestingModule({
      providers: [
        CronStateService,
        { provide: CronRpcService, useValue: rpc },
        { provide: AppStateManager, useValue: appState },
      ],
    });
  });

  it('defaults the scope filter to "workspace"', () => {
    appState.workspaceInfo.set({ path: '/ws-a' });
    const service = TestBed.inject(CronStateService);
    expect(service.scopeFilter()).toBe('workspace');
  });

  it('reads the scope as "all" while no workspace is open', () => {
    const service = TestBed.inject(CronStateService);
    expect(service.scopeFilter()).toBe('all');
    appState.workspaceInfo.set({ path: '/ws-a' });
    expect(service.scopeFilter()).toBe('workspace');
  });

  it('removes a created row on a scope change when no list succeeded yet', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });
    const service = TestBed.inject(CronStateService);
    rpc.list.mockRejectedValue(new Error('offline'));
    service.setScopeFilter('all');
    await Promise.resolve();
    await Promise.resolve();
    rpc.create = jest
      .fn()
      .mockResolvedValue({ job: makeJob({ id: 'b', workspaceRoot: '/ws-b' }) });
    await service.create({} as never);
    expect(service.jobs().map((j) => j.id)).toEqual(['b']);

    service.setScopeFilter('workspace');
    expect(service.jobs()).toEqual([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(service.jobs()).toEqual([]);
  });

  it('removes the rows of the previous scope before the new list arrives', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });
    const service = TestBed.inject(CronStateService);
    rpc.list.mockResolvedValueOnce({
      jobs: [makeJob({ id: 'other', workspaceRoot: '/ws-b' })],
    });
    service.setScopeFilter('all');
    await Promise.resolve();
    await Promise.resolve();
    expect(service.jobs().map((j) => j.id)).toEqual(['other']);

    // Same scope: the rows stay while the refresh is open.
    let resolveSame: (value: CronListResult) => void = () => undefined;
    rpc.list.mockReturnValueOnce(
      new Promise<CronListResult>((resolve) => (resolveSame = resolve)),
    );
    const same = service.refresh();
    expect(service.jobs().map((j) => j.id)).toEqual(['other']);
    resolveSame({ jobs: [makeJob({ id: 'other' })] });
    await same;

    // Other scope: no row of "all" shows as a row of "this workspace",
    // and a failed request does not bring the old rows back.
    rpc.list.mockRejectedValueOnce(new Error('offline'));
    service.setScopeFilter('workspace');
    expect(service.jobs()).toEqual([]);
    expect(service.stats().total).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(service.jobs()).toEqual([]);
    expect(service.error()).toBe('offline');
  });

  describe('run history of the selected job', () => {
    type RunsResult = Awaited<ReturnType<CronRpcService['runs']>>;
    const run = (id: string, jobId: string) =>
      ({ id, jobId }) as unknown as RunsResult['runs'][number];

    it('reports loading, loaded and error', async () => {
      const service = TestBed.inject(CronStateService);
      let resolve: (value: RunsResult) => void = () => undefined;
      rpc.runs = jest
        .fn()
        .mockReturnValueOnce(
          new Promise<RunsResult>((done) => (resolve = done)),
        )
        .mockRejectedValueOnce(new Error('no runs'));
      expect(service.runsState()).toBe('idle');

      service.select('job-1');
      expect(service.runsState()).toBe('loading');
      resolve({ runs: [] } as RunsResult);
      await Promise.resolve();
      await Promise.resolve();
      expect(service.runsState()).toBe('loaded');

      service.select('job-2');
      await Promise.resolve();
      await Promise.resolve();
      expect(service.runsState()).toBe('error');

      service.select(null);
      expect(service.runsState()).toBe('idle');
    });

    it('drops a response for a job that is no longer selected', async () => {
      const service = TestBed.inject(CronStateService);
      const resolvers: Array<(value: RunsResult) => void> = [];
      rpc.runs = jest.fn(
        () => new Promise<RunsResult>((done) => resolvers.push(done)),
      );

      service.select('job-1');
      service.select('job-2');
      expect(service.runs()).toEqual([]);
      resolvers[1]({ runs: [run('r2', 'job-2')] } as RunsResult);
      await Promise.resolve();
      resolvers[0]({ runs: [run('r1', 'job-1')] } as RunsResult);
      await Promise.resolve();
      await Promise.resolve();
      expect(service.runs().map((r) => r.id)).toEqual(['r2']);

      // A response that arrives after the drawer closed is dropped too.
      service.select('job-1');
      service.select(null);
      resolvers[2]({ runs: [run('r1', 'job-1')] } as RunsResult);
      await Promise.resolve();
      await Promise.resolve();
      expect(service.runs()).toEqual([]);
      expect(service.runsState()).toBe('idle');
    });
  });

  it('keeps the error of a failed save through a list refresh', async () => {
    const service = TestBed.inject(CronStateService);
    rpc.create = jest.fn().mockRejectedValue(new Error('name is taken'));
    await service.create({} as never);
    expect(service.saveError()).toBe('name is taken');

    await service.refresh();
    expect(service.error()).toBeNull();
    expect(service.saveError()).toBe('name is taken');

    service.clearSaveError();
    expect(service.saveError()).toBeNull();
  });

  it('scopes cron:list to the active workspace root under "workspace" scope', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });

    const service = TestBed.inject(CronStateService);
    await service.refresh();

    expect(rpc.list).toHaveBeenCalledWith({ workspaceRoot: '/ws-a' });
  });

  it('lists globally under "workspace" scope when no workspace is open', async () => {
    const service = TestBed.inject(CronStateService);
    await service.refresh();

    expect(rpc.list).toHaveBeenCalledWith({});
  });

  it('lists globally under "all" scope even when a workspace is open', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });

    const service = TestBed.inject(CronStateService);
    service.setScopeFilter('all');
    await Promise.resolve();

    expect(service.scopeFilter()).toBe('all');
    expect(rpc.list).toHaveBeenLastCalledWith({});
  });

  it('setScopeFilter re-lists when the scope actually changes', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });

    const service = TestBed.inject(CronStateService);
    await service.refresh();
    rpc.list.mockClear();

    service.setScopeFilter('all');
    await Promise.resolve();

    expect(rpc.list).toHaveBeenCalledTimes(1);
    expect(rpc.list).toHaveBeenCalledWith({});
  });

  it('setScopeFilter is a no-op when the scope is unchanged', async () => {
    const service = TestBed.inject(CronStateService);
    await service.refresh();
    rpc.list.mockClear();

    service.setScopeFilter('workspace'); // already the default

    expect(rpc.list).not.toHaveBeenCalled();
  });

  it('re-lists when the workspace root changes under "workspace" scope', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });

    const service = TestBed.inject(CronStateService);
    TestBed.tick(); // first effect run only records the current root
    expect(rpc.list).not.toHaveBeenCalled();

    await service.refresh();
    expect(rpc.list).toHaveBeenCalledTimes(1);

    appState.workspaceInfo.set({ path: '/ws-b' });
    TestBed.tick();
    await Promise.resolve();

    expect(rpc.list).toHaveBeenCalledTimes(2);
    expect(rpc.list).toHaveBeenLastCalledWith({ workspaceRoot: '/ws-b' });
  });

  it('fetches on first flush when the workspace switched during construction', async () => {
    // Baseline captured at construction is /ws-a...
    appState.workspaceInfo.set({ path: '/ws-a' });
    TestBed.inject(CronStateService);

    // ...but the active workspace changes BEFORE the effect's first flush.
    appState.workspaceInfo.set({ path: '/ws-b' });
    TestBed.tick();
    await Promise.resolve();

    // The first observation must detect the drift and fetch for /ws-b rather
    // than silently recording it as the baseline (Issue 7).
    expect(rpc.list).toHaveBeenCalledTimes(1);
    expect(rpc.list).toHaveBeenCalledWith({ workspaceRoot: '/ws-b' });
  });

  it('does not fetch on first flush when the workspace is unchanged since construction', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });
    const service = TestBed.inject(CronStateService);

    TestBed.tick();
    await Promise.resolve();

    // No drift during construction → first flush only records the baseline,
    // leaving the initial load to the tab's ngOnInit refresh.
    expect(rpc.list).not.toHaveBeenCalled();
    // Referenced to keep the injected service alive for the effect.
    expect(service.scopeFilter()).toBe('workspace');
  });

  it('does not re-list on workspace change under "all" scope', async () => {
    appState.workspaceInfo.set({ path: '/ws-a' });

    const service = TestBed.inject(CronStateService);
    TestBed.tick();
    service.setScopeFilter('all');
    await Promise.resolve();
    rpc.list.mockClear();

    appState.workspaceInfo.set({ path: '/ws-b' });
    TestBed.tick();
    await Promise.resolve();

    expect(rpc.list).not.toHaveBeenCalled();
  });

  it('does not render a stale list after the workspace switched', async () => {
    const resolvers: Array<(r: CronListResult) => void> = [];
    rpc.list.mockImplementation(
      () =>
        new Promise<CronListResult>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    appState.workspaceInfo.set({ path: '/ws-a' });
    const service = TestBed.inject(CronStateService);
    TestBed.tick(); // record /ws-a without firing a list

    // Refresh for /ws-a (token 1) — response deliberately left pending.
    const stalePromise = service.refresh();

    // Switch to /ws-b — the effect fires a fresh refresh (token 2).
    appState.workspaceInfo.set({ path: '/ws-b' });
    TestBed.tick();
    await Promise.resolve();

    expect(resolvers).toHaveLength(2);

    // Newer (B) resolves first and renders.
    resolvers[1]({ jobs: [makeJob({ id: 'b1', workspaceRoot: '/ws-b' })] });
    await Promise.resolve();
    expect(service.jobs().map((j) => j.id)).toEqual(['b1']);

    // Stale (A) resolves last but must NOT overwrite the current view.
    resolvers[0]({ jobs: [makeJob({ id: 'a1', workspaceRoot: '/ws-a' })] });
    await stalePromise;
    await Promise.resolve();

    expect(service.jobs().map((j) => j.id)).toEqual(['b1']);
  });
});
