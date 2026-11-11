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
  mergedTaskIds(): ReadonlySet<string> { return new Set(this.record ? [this.record.taskId] : []); }
  getOrCreateCloseOut(identity: CloseOutIdentity): CloseOutRunRecord {
    this.record ??= { ...identity, runId: 'run-1', steps:
      (['memory', 'learning', 'worktree', 'branch'] as const).map((step) =>
        ({ step, state: 'pending', reason: null, attempts: 0 })) };
    return this.record;
  }
  getCloseOut(): CloseOutRunRecord | null { return this.record; }
  getCloseOutForTask(): CloseOutRunRecord | null { return this.record; }
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
  it('retries not-completed learning on a later automatic run', async () => {
    const store = new Store();
    const harvest = { harvestTask: jest.fn()
      .mockResolvedValueOnce({ outcome: 'not-completed' })
      .mockResolvedValue({ outcome: 'harvested' }) };
    const service = new TaskCloseOutService(store, { curateEndedSession: jest.fn() },
      harvest, { inspectTaskWorktree: jest.fn(), removeWorktree: jest.fn(),
        deleteBranch: jest.fn() }, logger());
    const first = await service.run(input);
    expect(first.steps.find((step) => step.step === 'learning')).toMatchObject({
      state: 'failed', reason: 'task-not-completed' });
    const second = await service.run(input);
    expect(second.steps.find((step) => step.step === 'learning')?.state).toBe('ok');
    expect(harvest.harvestTask).toHaveBeenCalledTimes(2);
  });

  it('accepts a stored worktree path with a trailing separator', async () => {
    const store = new Store();
    const cleanup: GitCleanupPort = {
      inspectTaskWorktree: jest.fn().mockResolvedValue({ kind: 'ok', value: {
        canonicalPath: '/repo/task', branch: 'task', clean: true,
        branchMergedIntoMain: true } }),
      removeWorktree: jest.fn().mockResolvedValue({ kind: 'ok', value: undefined }),
      deleteBranch: jest.fn().mockResolvedValue({ kind: 'ok', value: undefined }),
    };
    const service = new TaskCloseOutService(store, { curateEndedSession: jest.fn() },
      { harvestTask: jest.fn().mockResolvedValue({ outcome: 'harvested' }) },
      cleanup, logger());
    const run = await service.run({ ...input, worktreePath: '/repo/task/',
      autoRemoveMergedWorktreeAndBranch: true });
    expect(run.steps.find((step) => step.step === 'worktree')?.state).toBe('ok');
    expect(cleanup.removeWorktree).toHaveBeenCalledTimes(1);
  });
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

  it('serializes concurrent manual cleanup and start', async () => {
    const store = new Store();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const cleanup: GitCleanupPort = {
      inspectTaskWorktree: jest.fn().mockResolvedValue({ kind: 'ok', value: {
        canonicalPath: '/repo/task', branch: 'task', clean: true, branchMergedIntoMain: true } }),
      removeWorktree: jest.fn().mockImplementation(async () => { await held; return { kind: 'ok', value: undefined }; }),
      deleteBranch: jest.fn().mockResolvedValue({ kind: 'ok', value: undefined }),
    };
    const harvest = { harvestTask: jest.fn().mockResolvedValue({ outcome: 'harvested', reconciled: 1 }) } as HarvestPort;
    const service = new TaskCloseOutService(store, { curateEndedSession: jest.fn() }, harvest, cleanup, logger());
    const first = await service.run(input);
    const a = service.cleanupCompleted(first.runId, true);
    const b = service.cleanupCompleted(first.runId, true);
    service.start({ ...input, autoRemoveMergedWorktreeAndBranch: true });
    await Promise.resolve();
    expect(harvest.harvestTask).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([a, b]);
    expect(cleanup.removeWorktree).toHaveBeenCalledTimes(1);
  });

  it('refuses removal when the second inspection finds a dirty worktree', async () => {
    const store = new Store();
    const cleanup: GitCleanupPort = {
      inspectTaskWorktree: jest.fn()
        .mockResolvedValueOnce({ kind: 'ok', value: { canonicalPath: '/repo/task', branch: 'task', clean: true, branchMergedIntoMain: true } })
        .mockResolvedValueOnce({ kind: 'ok', value: { canonicalPath: '/repo/task', branch: 'task', clean: false, branchMergedIntoMain: true } }),
      removeWorktree: jest.fn(), deleteBranch: jest.fn(),
    };
    const service = new TaskCloseOutService(store, { curateEndedSession: jest.fn() },
      { harvestTask: jest.fn().mockResolvedValue({ outcome: 'harvested' }) }, cleanup, logger());
    const result = await service.run({ ...input, autoRemoveMergedWorktreeAndBranch: true });
    expect(result.steps.find(step => step.step === 'worktree')?.state).toBe('refused');
    expect(cleanup.removeWorktree).not.toHaveBeenCalled();
  });

  it('continues branch cleanup when the worktree was already removed', async () => {
    const store = new Store();
    const cleanup: GitCleanupPort = {
      inspectTaskWorktree: jest.fn().mockResolvedValue({ kind: 'already-removed', reason: 'already-removed' }),
      removeWorktree: jest.fn(), deleteBranch: jest.fn().mockResolvedValue({ kind: 'ok', value: undefined }),
    };
    const service = new TaskCloseOutService(store, { curateEndedSession: jest.fn() },
      { harvestTask: jest.fn().mockResolvedValue({ outcome: 'harvested' }) }, cleanup, logger());
    const result = await service.run({ ...input, autoRemoveMergedWorktreeAndBranch: true });
    expect(result.steps.find(step => step.step === 'worktree')?.reason).toBe('already-removed');
    expect(cleanup.deleteBranch).toHaveBeenCalledTimes(1);
  });


  it('does not repeat unchanged refusals and caps automatic failures', async () => {
    const store = new Store();
    const cleanup: GitCleanupPort = {
      inspectTaskWorktree: jest.fn().mockResolvedValue({ kind: 'refused', reason: 'dirty' }),
      removeWorktree: jest.fn(), deleteBranch: jest.fn(),
    };
    const harvest = { harvestTask: jest.fn().mockResolvedValue({ outcome: 'failed' }) } as HarvestPort;
    const service = new TaskCloseOutService(store, { curateEndedSession: jest.fn() }, harvest, cleanup, logger());
    for (let i = 0; i < 8; i++) await service.run({ ...input, autoRemoveMergedWorktreeAndBranch: true });
    expect(cleanup.inspectTaskWorktree).toHaveBeenCalledTimes(1);
    expect(harvest.harvestTask).toHaveBeenCalledTimes(5);
    service.start({ ...input, autoRemoveMergedWorktreeAndBranch: true }, true);
    await service.run(input);
    expect(harvest.harvestTask).toHaveBeenCalledTimes(6);
    expect(cleanup.inspectTaskWorktree).toHaveBeenCalledTimes(2);
  });

  it('curates all sessions and aggregates failures after gated results', async () => {
    const store = new Store();
    const curation = { curateEndedSession: jest.fn()
      .mockResolvedValueOnce({ kind: 'gated', gate: 'disabled' })
      .mockResolvedValueOnce({ kind: 'failed' }) } as CurationPort;
    const service = new TaskCloseOutService(store, curation,
      { harvestTask: jest.fn().mockResolvedValue({ outcome: 'harvested' }) },
      { inspectTaskWorktree: jest.fn(), removeWorktree: jest.fn(), deleteBranch: jest.fn() }, logger());
    const result = await service.run({ ...input, sessionIds: ['s1', 's2'] });
    expect(curation.curateEndedSession).toHaveBeenCalledTimes(2);
    expect(result.steps.find(step => step.step === 'memory')?.state).toBe('failed');
  });

});
