import 'reflect-metadata';
import { Logger } from '@ptah-extension/vscode-core';
import type { ITaskCloseOutStore, CloseOutIdentity, CloseOutRunRecord,
  CloseOutStep, CloseOutStepState } from '../persistence/task-end-store.interface';
import type { CurationPort } from '../ports/curation.port';
import type { HarvestPort } from '../ports/harvest.port';
import type { GitCleanupPort } from '../ports/git-cleanup.port';
import { TaskCloseOutService, type TaskCloseOutRequest } from './task-close-out.service';

const input = { repoId: 'repo', taskId: 'TASK_2026_001', prNumber: 12,
  prUrl: 'https://github.com/example/repo/pull/12', mainRoot: '/repo',
  worktreePath: '/repo/task', branch: 'task', merged: true,
  sessionIds: [], autoRemoveMergedWorktreeAndBranch: false } satisfies TaskCloseOutRequest;
const logger = (): Logger => {
  const value = Object.create(Logger.prototype) as Logger;
  value.error = jest.fn();
  return value;
};

class Store implements ITaskCloseOutStore {
  private record: CloseOutRunRecord | null = null;
  getOrCreateCloseOut(identity: CloseOutIdentity): CloseOutRunRecord {
    this.record ??= { ...identity, runId: 'run-1', steps:
      (['memory', 'learning', 'worktree', 'branch'] as const).map((step) =>
        ({ step, state: 'pending', reason: null, attempts: 0 })) };
    return this.record;
  }
  getCloseOut(): CloseOutRunRecord | null { return this.record; }
  startCloseOutStep(_runId: string, step: CloseOutStep): void {
    this.change(step, 'running', null, true);
  }
  finishCloseOutStep(_runId: string, step: CloseOutStep,
    state: Exclude<CloseOutStepState, 'pending' | 'running'>, reason: string | null): void {
    this.change(step, state, reason, false);
  }
  private change(step: CloseOutStep, state: CloseOutStepState,
    reason: string | null, increment: boolean): void {
    if (!this.record) throw new Error('no run');
    this.record = { ...this.record, steps: this.record.steps.map((entry) =>
      entry.step === step ? { ...entry, state, reason,
        attempts: entry.attempts + Number(increment) } : entry) };
  }
}

describe('TaskCloseOutService', () => {
  it('joins a run, retains completed learning, and retries only cleanup after opt-in', async () => {
    const store = new Store();
    const curation = { curateEndedSession: jest.fn() } as CurationPort;
    const harvest = { harvestTask: jest.fn().mockResolvedValue({ outcome: 'harvested', reconciled: 1 }) } as HarvestPort;
    const inspection = { canonicalPath: '/repo/task', branch: 'task', clean: true,
      branchMergedIntoMain: true };
    const cleanup: GitCleanupPort = {
      inspectTaskWorktree: jest.fn().mockResolvedValue({ kind: 'ok', value: inspection }),
      removeWorktree: jest.fn().mockResolvedValue({ kind: 'ok', value: undefined }),
      deleteBranch: jest.fn().mockResolvedValue({ kind: 'ok', value: undefined }),
    };
    const service = new TaskCloseOutService(store, curation, harvest, cleanup, logger());
    const pending = await service.run(input);
    expect(pending.steps.find((step) => step.step === 'worktree')).toMatchObject({
      state: 'refused', reason: 'pending-user-approval' });
    expect(cleanup.removeWorktree).not.toHaveBeenCalled();
    const done = await service.run({ ...input, autoRemoveMergedWorktreeAndBranch: true });
    expect(done.runId).toBe(pending.runId);
    expect(done.steps.map((step) => step.state)).toEqual(['skipped', 'ok', 'ok', 'ok']);
    expect(harvest.harvestTask).toHaveBeenCalledTimes(1);
    expect(cleanup.inspectTaskWorktree).toHaveBeenCalledTimes(2);
  });

  it('does not delete a branch after worktree refusal', async () => {
    const store = new Store();
    const cleanup: GitCleanupPort = {
      inspectTaskWorktree: jest.fn().mockResolvedValue({ kind: 'ok', value: {
        canonicalPath: '/repo/task', branch: 'task', clean: false, branchMergedIntoMain: true } }),
      removeWorktree: jest.fn(), deleteBranch: jest.fn(),
    };
    const service = new TaskCloseOutService(store,
      { curateEndedSession: jest.fn() },
      { harvestTask: jest.fn().mockResolvedValue({ outcome: 'already-harvested', reconciled: 0 }) },
      cleanup, logger());
    const run = await service.run({ ...input, autoRemoveMergedWorktreeAndBranch: true });
    expect(run.steps.find((step) => step.step === 'worktree')?.state).toBe('refused');
    expect(cleanup.removeWorktree).not.toHaveBeenCalled();
    expect(cleanup.deleteBranch).not.toHaveBeenCalled();
  });
});
