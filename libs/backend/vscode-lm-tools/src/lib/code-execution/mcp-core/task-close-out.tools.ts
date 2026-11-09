import { z } from 'zod';
import type { MCPToolDefinition, PtahAPI } from '../types';

const taskId = z.string().regex(/^TASK_\d{4}_\d{3,4}(?:_[a-zA-Z0-9]+)?$/);
export const TaskCloseOutArgsSchema = z
  .object({
    taskId,
    workspaceRoot: z.string().min(1),
  })
  .strict();
export const TaskCloseOutStatusArgsSchema = z
  .object({ runId: z.string().min(1) })
  .strict();

export const taskCloseOutTool: MCPToolDefinition = {
  name: 'ptah_task_close_out',
  description:
    'After a merged PR, start or retry task close-out: memory curation, skill harvest ' +
    '(not run on Stop) and cleanup evaluation. Poll ptah_task_close_out_status with the runId.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      workspaceRoot: { type: 'string' },
    },
    required: ['taskId', 'workspaceRoot'],
    additionalProperties: false,
  },
};

export const taskCloseOutStatusTool: MCPToolDefinition = {
  name: 'ptah_task_close_out_status',
  description:
    'Read the journal status and separate memory, learning, worktree, and branch outcomes of a close-out run.',
  inputSchema: {
    type: 'object',
    properties: { runId: { type: 'string' } },
    required: ['runId'],
    additionalProperties: false,
  },
};

export async function callTaskCloseOut(
  input: unknown,
  api: PtahAPI,
): Promise<string> {
  const parsed = TaskCloseOutArgsSchema.safeParse(input);
  if (!parsed.success)
    return JSON.stringify({
      status: 'refused',
      reason: 'Invalid task close-out arguments.',
    });
  return JSON.stringify(await api.tasks.closeOut(parsed.data));
}

export async function callTaskCloseOutStatus(
  input: unknown,
  api: PtahAPI,
): Promise<string> {
  const parsed = TaskCloseOutStatusArgsSchema.safeParse(input);
  if (!parsed.success)
    return JSON.stringify({ status: 'refused', reason: 'Invalid runId.' });
  return JSON.stringify(await api.tasks.closeOutStatus(parsed.data));
}
