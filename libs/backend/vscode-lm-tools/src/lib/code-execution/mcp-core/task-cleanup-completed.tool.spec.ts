import { callTaskCleanupCompleted } from './task-cleanup-completed.tool';
import { buildTaskCloseOutNamespace } from '../namespace-builders/task-close-out.namespace';
import type { PtahAPI } from '../types';

describe('ptah_task_cleanup_completed', () => {
  const input = {
    runId: 'run-1',
    taskId: 'TASK_2026_898_c1a5',
    workspaceRoot: process.cwd(),
  };
  it('returns pending approval from the shared cleanup journal with opt-in off', async () => {
    const run = {
      runId: input.runId,
      taskId: input.taskId,
      mainRoot: input.workspaceRoot,
      steps: [
        {
          step: 'worktree',
          state: 'refused',
          reason: 'pending-user-approval',
          attempts: 1,
        },
      ],
    };
    const cleanupCompleted = jest.fn().mockResolvedValue(run);
    const service = {
      start: jest.fn().mockReturnValue(run),
      status: jest.fn().mockReturnValue(run),
      cleanupCompleted,
    };
    const tasks = buildTaskCloseOutNamespace({
      getCloseOutService: () => service,
      getIndex: () => undefined,
      getWorkspaceRoot: () => input.workspaceRoot,
      getRepoId: () => null,
      getLinks: () => [],
      getPrStatus: async () => ({ kind: 'unknown' }),
      allowRemoval: () => false,
      logger: { error: jest.fn() },
    });
    const api = Object.assign({} as PtahAPI, { tasks });
    expect(JSON.parse(await callTaskCleanupCompleted(input, api)).status).toBe(
      'pending-user-approval',
    );
    expect(cleanupCompleted).toHaveBeenCalledWith(input.runId, false);
    expect(
      JSON.parse(
        await callTaskCleanupCompleted({ ...input, taskId: '../bad' }, api),
      ).status,
    ).toBe('refused');
  });
  it('reports a dirty worktree as refused with its reason', async () => {
    const run = { runId: input.runId, taskId: input.taskId,
      mainRoot: input.workspaceRoot, steps: [
        { step: 'worktree', state: 'refused', reason: 'worktree-not-clean-and-merged', attempts: 1 },
        { step: 'branch', state: 'refused', reason: 'worktree-removal-pending', attempts: 1 },
      ] };
    const service = { start: jest.fn().mockReturnValue(run),
      status: jest.fn().mockReturnValue(run),
      cleanupCompleted: jest.fn().mockResolvedValue(run) };
    const tasks = buildTaskCloseOutNamespace({
      getCloseOutService: () => service, getIndex: () => undefined,
      getWorkspaceRoot: () => input.workspaceRoot,
    });
    const api = Object.assign({} as PtahAPI, { tasks });
    expect(JSON.parse(await callTaskCleanupCompleted(input, api))).toMatchObject({
      status: 'refused', reason: 'worktree-not-clean-and-merged',
    });
  });
});
