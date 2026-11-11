import 'reflect-metadata';
import type { CloseOutPrStatusPort, TaskCloseOutPrStatus } from '../ports/pr-status.port';
import { TaskEndTransitionDetector } from '../trigger/task-end-transition-detector';
import { TaskCloseOutService } from './task-close-out.service';
import { TaskPrReconcilerService, type TaskPrReconcileTask } from './task-pr-reconciler.service';
import { Logger } from '@ptah-extension/vscode-core';
import type { ITaskCloseOutStore } from '../persistence/task-end-store.interface';
import type { TaskIndexService } from '@ptah-extension/task-specs';

const task: TaskPrReconcileTask = {
  repoId: 'repo', taskId: 'TASK_2026_898_c1a5', mainRoot: '/main',
  worktreePath: '/worktree', branch: 'feat/task-lifecycle-closeout',
  status: 'in_progress', sessionIds: [], autoRemoveMergedWorktreeAndBranch: false,
};

function setup(result: TaskCloseOutPrStatus) {
  const prs: CloseOutPrStatusPort = { prStatus: jest.fn().mockResolvedValue(result) };
  const detector = Object.create(TaskEndTransitionDetector.prototype) as TaskEndTransitionDetector;
  const closeOut = Object.create(TaskCloseOutService.prototype) as TaskCloseOutService;
  closeOut.run = jest.fn().mockResolvedValue({ runId: 'run' });
  const logger = Object.create(Logger.prototype) as Logger;
  logger.error = jest.fn();
  const store = { getCloseOutForTask: jest.fn().mockReturnValue(null),
    getOrCreateCloseOut: jest.fn() } as unknown as ITaskCloseOutStore;
  const reconciler = new TaskPrReconcilerService(prs, detector, closeOut, logger, store);
  return { reconciler, closeOut, store, prs };
}

describe('TaskPrReconcilerService', () => {
  it.each([
    { kind: 'open', number: 7, url: 'https://github.com/a/b/pull/7' },
    { kind: 'closed-unmerged', number: 7, url: 'https://github.com/a/b/pull/7' },
    { kind: 'unknown' },
  ] as TaskCloseOutPrStatus[])('never persists or writes a carrier for $kind', async (state) => {
    const { reconciler, closeOut, store } = setup(state);
    await reconciler.reconcile(task);
    expect(store.getOrCreateCloseOut).not.toHaveBeenCalled();
    expect(closeOut.run).not.toHaveBeenCalled();
    expect('setCarrierStatus' in TaskEndTransitionDetector.prototype).toBe(false);
    reconciler.dispose();
  });

  it('persists a merged identity before detached close-out', async () => {
    const { reconciler, closeOut, store } = setup({
      kind: 'merged', number: 7, url: 'https://github.com/a/b/pull/7',
    });
    await reconciler.reconcile(task);
    expect(store.getOrCreateCloseOut).toHaveBeenCalledWith(expect.objectContaining({
      repoId: 'repo', taskId: task.taskId, prNumber: 7,
    }));
    expect(closeOut.run).toHaveBeenCalledWith(expect.objectContaining({ merged: true }));
    expect('setCarrierStatus' in TaskEndTransitionDetector.prototype).toBe(false);
    reconciler.dispose();
  });

  it('notifies the index only when the merged marker first appears', async () => {
    const { closeOut, store, prs } = setup({
      kind: 'merged', number: 7, url: 'https://github.com/a/b/pull/7',
    });
    const detector = Object.create(TaskEndTransitionDetector.prototype) as TaskEndTransitionDetector;
    const logger = Object.create(Logger.prototype) as Logger;
    logger.error = jest.fn();
    const index = { notifyStatusOverlayChanged: jest.fn() } as unknown as TaskIndexService;
    jest.mocked(store.getCloseOutForTask).mockReturnValueOnce(null).mockReturnValue({} as ReturnType<ITaskCloseOutStore['getCloseOutForTask']>);
    const reconciler = new TaskPrReconcilerService(prs, detector, closeOut, logger, store, index);
    await reconciler.reconcile(task);
    await reconciler.reconcile(task);
    expect(index.notifyStatusOverlayChanged).toHaveBeenCalledTimes(1);
    reconciler.dispose();
  });

  it('retries unknown lookups for in_progress', async () => {
    jest.useFakeTimers();
    try {
      const { reconciler, prs } = setup({ kind: 'unknown' });
      await reconciler.reconcile(task);
      await jest.advanceTimersByTimeAsync(11 * 60_000);
      expect(prs.prStatus).toHaveBeenCalledTimes(2);
      reconciler.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});
