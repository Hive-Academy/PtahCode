import { z } from 'zod';
import type { MCPToolDefinition, PtahAPI } from '../types';

export const TaskCleanupCompletedArgsSchema = z
  .object({
    runId: z.string().min(1),
    taskId: z.string().regex(/^TASK_\d{4}_\d{3,4}(?:_[a-zA-Z0-9]+)?$/),
    workspaceRoot: z.string().min(1),
  })
  .strict();

export const taskCleanupCompletedTool: MCPToolDefinition = {
  name: 'ptah_task_cleanup_completed',
  description:
    'Manually retry the shared journalled cleanup for a completed merged task. Removal requires the opt-in setting and a clean, merged worktree; otherwise returns pending-user-approval.',
  inputSchema: {
    type: 'object',
    properties: {
      runId: { type: 'string' },
      taskId: { type: 'string' },
      workspaceRoot: { type: 'string' },
    },
    required: ['runId', 'taskId', 'workspaceRoot'],
    additionalProperties: false,
  },
};

export async function callTaskCleanupCompleted(
  input: unknown,
  api: PtahAPI,
): Promise<string> {
  const parsed = TaskCleanupCompletedArgsSchema.safeParse(input);
  if (!parsed.success)
    return JSON.stringify({
      status: 'refused',
      reason: 'Invalid cleanup arguments.',
    });
  return JSON.stringify(await api.tasks.cleanupCompleted(parsed.data));
}
