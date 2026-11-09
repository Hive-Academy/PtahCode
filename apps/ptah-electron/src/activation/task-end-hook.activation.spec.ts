import 'reflect-metadata';
import { container } from 'tsyringe';
import { TASK_END_TOKENS } from '@ptah-extension/task-end-hook';
import { TASK_SPECS_TOKENS } from '@ptah-extension/task-specs';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { SESSION_ORGANIZATION_TOKENS } from '@ptah-extension/session-organization';
import { startTaskEndHook } from './task-end-hook.activation';

/** Detector and worker doubles that record every lifecycle call in order. */
function scopeWithHook(
  order: string[],
  options: { reconcile?: () => Promise<void> } = {},
) {
  const scope = container.createChildContainer();
  const listeners: Array<() => void> = [];
  const detector = {
    onDidChangeRuns: jest.fn((listener: () => void) => {
      order.push('connect');
      listeners.push(listener);
      return {
        dispose: () => {
          order.push('unsubscribe-wake');
          listeners.splice(listeners.indexOf(listener), 1);
        },
      };
    }),
    reconcileStartup: jest.fn(
      options.reconcile ??
        (async () => {
          order.push('reconcileStartup');
        }),
    ),
    subscribe: jest.fn(() => order.push('subscribe')),
    cachedRepoId: jest.fn(() => 'repo-1'),
    dispose: jest.fn(() => order.push('detector.dispose')),
    whenIdle: jest.fn(async () => {
      order.push('detector.whenIdle');
    }),
  };
  const worker = {
    start: jest.fn(() => order.push('worker.start')),
    wake: jest.fn(() => order.push('worker.wake')),
    dispose: jest.fn(() => order.push('worker.dispose')),
    awaitStopped: jest.fn(async () => {
      order.push('worker.awaitStopped');
    }),
  };
  scope.register(TASK_END_TOKENS.DETECTOR, { useValue: detector });
  scope.register(TASK_END_TOKENS.WORKER, { useValue: worker });
  return { scope, detector, worker, listeners };
}

describe('startTaskEndHook', () => {
  it('starts PR reconciliation in the background and disposes its subscription', async () => {
    const order: string[] = [];
    const { scope } = scopeWithHook(order);
    let notify: ((event: { workspaceRoot: string }) => void) | undefined;
    const unsubscribe = jest.fn();
    const reconcile = jest.fn(async () => { order.push('pr.reconcile'); });
    const disposeReconciler = jest.fn();
    scope.register(TASK_END_TOKENS.PR_RECONCILER, {
      useValue: { reconcile, dispose: disposeReconciler },
    });
    scope.register(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE, {
      useValue: {
        list: async () => ({ tasks: [{ id: 'TASK_2026_898_c1a5', status: 'in_review', frontmatterValid: true }] }),
        onDidChangeIndex: (listener: (event: { workspaceRoot: string }) => void) => {
          notify = listener;
          return { dispose: unsubscribe };
        },
      },
    });
    scope.register(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
      useValue: { getWorkspaceFolders: () => ['/repo'], getConfiguration: () => false },
    });
    scope.register(SESSION_ORGANIZATION_TOKENS.STORE, {
      useValue: {
        listTaskLinks: () => [{ sessionId: 's1' }],
        getOrganization: () => ({ worktreePath: '/repo/.claude-worktrees/task', branch: 'feat/task' }),
      },
    });
    const handle = await startTaskEndHook(scope, new AbortController().signal, { error: jest.fn() });
    expect(handle).not.toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({
      repoId: 'repo-1', taskId: 'TASK_2026_898_c1a5', branch: 'feat/task',
      autoRemoveMergedWorktreeAndBranch: false,
    }));
    notify?.({ workspaceRoot: '/repo' });
    handle?.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(disposeReconciler).toHaveBeenCalledTimes(1);
  });
  it('returns null when the hook is not registered (no SQLite)', async () => {
    const logger = { error: jest.fn() };
    const handle = await startTaskEndHook(
      container.createChildContainer(),
      new AbortController().signal,
      logger,
    );
    expect(handle).toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('connects, reconciles, starts the worker, then subscribes the detector', async () => {
    const order: string[] = [];
    const { scope, listeners } = scopeWithHook(order);
    const logger = { error: jest.fn() };
    const handle = await startTaskEndHook(
      scope,
      new AbortController().signal,
      logger,
    );
    expect(handle).not.toBeNull();
    expect(order).toEqual([
      'connect',
      'reconcileStartup',
      'worker.start',
      'subscribe',
    ]);
    // A detector run change wakes the worker.
    listeners[0]();
    expect(order[order.length - 1]).toBe('worker.wake');
    expect(logger.error).not.toHaveBeenCalled();

    order.length = 0;
    await handle?.awaitStopped();
    expect(order).toEqual(['detector.whenIdle', 'worker.awaitStopped']);
  });

  it('returns null and disposes when reconcile throws, logging no raw error text', async () => {
    const order: string[] = [];
    const { scope, worker } = scopeWithHook(order, {
      reconcile: async () => {
        throw new Error('token=ghp_secretvalue at /home/user/repo');
      },
    });
    const logger = { error: jest.fn() };
    const handle = await startTaskEndHook(
      scope,
      new AbortController().signal,
      logger,
    );
    expect(handle).toBeNull();
    expect(worker.start).not.toHaveBeenCalled();
    expect(order).toEqual([
      'connect',
      'unsubscribe-wake',
      'detector.dispose',
      'worker.dispose',
    ]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('ghp_');
    const logged = logger.error.mock.calls[0][1] as Error;
    expect(logged.message).not.toContain('ghp_');
    expect(logged.message).not.toContain('/home/user');
  });

  it('returns null when resolving the hook throws', async () => {
    const scope = container.createChildContainer();
    scope.register(TASK_END_TOKENS.DETECTOR, {
      useFactory: () => {
        throw new Error('Cannot inject the dependency');
      },
    });
    scope.register(TASK_END_TOKENS.WORKER, { useValue: {} });
    const logger = { error: jest.fn() };
    await expect(
      startTaskEndHook(scope, new AbortController().signal, logger),
    ).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('returns null without resolving anything when already aborted', async () => {
    const order: string[] = [];
    const { scope, detector } = scopeWithHook(order);
    const controller = new AbortController();
    controller.abort();
    const handle = await startTaskEndHook(scope, controller.signal, {
      error: jest.fn(),
    });
    expect(handle).toBeNull();
    expect(detector.onDidChangeRuns).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it('returns null and never starts the worker when aborted during reconcile', async () => {
    const order: string[] = [];
    const controller = new AbortController();
    const { scope, worker, detector } = scopeWithHook(order, {
      reconcile: async () => {
        order.push('reconcileStartup');
        controller.abort();
      },
    });
    const handle = await startTaskEndHook(scope, controller.signal, {
      error: jest.fn(),
    });
    expect(handle).toBeNull();
    expect(worker.start).not.toHaveBeenCalled();
    expect(detector.subscribe).not.toHaveBeenCalled();
    expect(detector.dispose).toHaveBeenCalledTimes(1);
    expect(worker.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes once however often dispose runs, including a later abort', async () => {
    const order: string[] = [];
    const controller = new AbortController();
    const { scope, detector, worker } = scopeWithHook(order);
    const handle = await startTaskEndHook(scope, controller.signal, {
      error: jest.fn(),
    });
    handle?.dispose();
    handle?.dispose();
    controller.abort();
    expect(detector.dispose).toHaveBeenCalledTimes(1);
    expect(worker.dispose).toHaveBeenCalledTimes(1);
    expect(order.filter((entry) => entry === 'unsubscribe-wake')).toHaveLength(
      1,
    );
  });

  it('disposes on abort after a successful start', async () => {
    const order: string[] = [];
    const controller = new AbortController();
    const { scope, detector, worker } = scopeWithHook(order);
    const handle = await startTaskEndHook(scope, controller.signal, {
      error: jest.fn(),
    });
    expect(handle).not.toBeNull();
    controller.abort();
    expect(detector.dispose).toHaveBeenCalledTimes(1);
    expect(worker.dispose).toHaveBeenCalledTimes(1);
    handle?.dispose();
    expect(detector.dispose).toHaveBeenCalledTimes(1);
  });
});
