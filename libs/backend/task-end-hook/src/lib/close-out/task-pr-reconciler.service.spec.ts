import 'reflect-metadata';
import type { CloseOutPrStatusPort, TaskCloseOutPrStatus } from '../ports/pr-status.port';
import { TaskEndTransitionDetector } from '../trigger/task-end-transition-detector';
import { TaskCloseOutService } from './task-close-out.service';
import { TaskPrReconcilerService, type TaskPrReconcileTask } from './task-pr-reconciler.service';
import { Logger } from '@ptah-extension/vscode-core';

const task: TaskPrReconcileTask = {
  repoId: 'repo', taskId: 'TASK_2026_898_c1a5', mainRoot: '/main',
  worktreePath: '/worktree', branch: 'feat/task-lifecycle-closeout',
  status: 'in_progress', sessionIds: [], autoRemoveMergedWorktreeAndBranch: false,
};

function setup(result: TaskCloseOutPrStatus) {
  const prs: CloseOutPrStatusPort = { prStatus: jest.fn().mockResolvedValue(result) };
  const detector = Object.create(TaskEndTransitionDetector.prototype) as TaskEndTransitionDetector;
  detector.setCarrierStatus = jest.fn().mockResolvedValue(true);
  const closeOut = Object.create(TaskCloseOutService.prototype) as TaskCloseOutService;
  closeOut.run = jest.fn().mockResolvedValue({ runId: 'run' });
  const logger = Object.create(Logger.prototype) as Logger;
  logger.error = jest.fn();
  const reconciler = new TaskPrReconcilerService(prs, detector, closeOut, logger);
  return { reconciler, detector, closeOut, logger };
}

describe('TaskPrReconcilerService', () => {
  it('confirms an open PR before entering review', async () => {
    const { reconciler, detector, closeOut } = setup({ kind: 'open', number: 7, url: 'https://github.com/a/b/pull/7' });
    expect(await reconciler.reconcile(task)).toEqual({ kind: 'open', number: 7 });
    expect(detector.setCarrierStatus).toHaveBeenCalledWith('/main', task.taskId, 'in_review');
    expect(closeOut.run).not.toHaveBeenCalled();
    reconciler.dispose();
  });

  it('keeps watching after an in_review write fails and retries on the next poll', async () => {
    jest.useFakeTimers();
    try {
      const { reconciler, detector, closeOut, logger } = setup({ kind: 'open', number: 7, url: 'https://github.com/a/b/pull/7' });
      const failure = new Error('write failed');
      jest.mocked(detector.setCarrierStatus).mockRejectedValueOnce(failure);
      await expect(reconciler.reconcile(task)).resolves.toEqual({ kind: 'open', number: 7 });
      expect(logger.error).toHaveBeenCalledWith('[task-pr-reconciler] carrier update failed', failure);
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(detector.setCarrierStatus).toHaveBeenCalledTimes(2);
      expect(detector.setCarrierStatus).toHaveBeenLastCalledWith('/main', task.taskId, 'in_review');
      expect(closeOut.run).not.toHaveBeenCalled();
      reconciler.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does nothing on unknown or closed-unmerged PR state', async () => {
    for (const state of [{ kind: 'unknown' }, { kind: 'closed-unmerged', number: 7, url: 'https://github.com/a/b/pull/7' }] as TaskCloseOutPrStatus[]) {
      const { reconciler, detector, closeOut } = setup(state);
      await reconciler.reconcile(task);
      expect(detector.setCarrierStatus).not.toHaveBeenCalled();
      expect(closeOut.run).not.toHaveBeenCalled();
      reconciler.dispose();
    }
  });

  it('marks confirmed merge done and starts background close-out without cleanup opt-in', async () => {
    const { reconciler, detector, closeOut } = setup({ kind: 'merged', number: 7, url: 'https://github.com/a/b/pull/7' });
    expect(await reconciler.reconcile({ ...task, status: 'in_review' })).toEqual({ kind: 'merged', number: 7 });
    expect(detector.setCarrierStatus).toHaveBeenCalledWith('/main', task.taskId, 'done');
    expect(closeOut.run).toHaveBeenCalledWith(expect.objectContaining({ merged: true, autoRemoveMergedWorktreeAndBranch: false }));
    reconciler.dispose();
  });

  it('leaves cancelled tasks untouched after merge', async () => {
    const { reconciler, detector, closeOut } = setup({ kind: 'merged', number: 7, url: 'https://github.com/a/b/pull/7' });
    await reconciler.reconcile({ ...task, status: 'cancelled' });
    expect(detector.setCarrierStatus).not.toHaveBeenCalled();
    expect(closeOut.run).not.toHaveBeenCalled();
    reconciler.dispose();
  });

  it('starts close-out even when the carrier write fails', async () => {
    const { reconciler, detector, closeOut } = setup({ kind: 'merged', number: 7, url: 'https://github.com/a/b/pull/7' });
    jest.mocked(detector.setCarrierStatus).mockRejectedValueOnce(new Error('write failed'));
    await reconciler.reconcile(task);
    expect(closeOut.run).toHaveBeenCalledTimes(1);
    reconciler.dispose();
  });

});
