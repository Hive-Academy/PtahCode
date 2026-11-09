import {
  callTaskCloseOut,
  callTaskCloseOutStatus,
  TaskCloseOutArgsSchema,
} from './task-close-out.tools';
import type { PtahAPI } from '../types';

describe('task close-out MCP tools', () => {
  const input = { taskId: 'TASK_2026_898_c1a5', workspaceRoot: '/repo' };
  it('rejects unknown options such as the removed harvestSkills flag', () => {
    expect(
      TaskCloseOutArgsSchema.safeParse({ ...input, harvestSkills: true })
        .success,
    ).toBe(false);
  });
  it('validates input and explicitly requests merged-task close-out', async () => {
    const closeOut = jest
      .fn()
      .mockResolvedValue({ status: 'accepted', runId: 'run-1' });
    const api = Object.assign({} as PtahAPI, { tasks: { closeOut } });
    expect(TaskCloseOutArgsSchema.safeParse(input).success).toBe(true);
    expect(JSON.parse(await callTaskCloseOut(input, api))).toEqual({
      status: 'accepted',
      runId: 'run-1',
    });
    expect(closeOut).toHaveBeenCalledWith(input);
    expect(
      JSON.parse(await callTaskCloseOut({ ...input, taskId: '../bad' }, api))
        .status,
    ).toBe('refused');
    expect(closeOut).toHaveBeenCalledTimes(1);
  });

  it('reads a persisted run by id', async () => {
    const closeOutStatus = jest
      .fn()
      .mockResolvedValue({
        status: 'found',
        run: { runId: 'run-1', steps: [] },
      });
    const api = Object.assign({} as PtahAPI, { tasks: { closeOutStatus } });
    expect(
      JSON.parse(await callTaskCloseOutStatus({ runId: 'run-1' }, api)).run
        .runId,
    ).toBe('run-1');
    expect(
      JSON.parse(await callTaskCloseOutStatus({ runId: '' }, api)).status,
    ).toBe('refused');
    expect(closeOutStatus).toHaveBeenCalledTimes(1);
  });
});
