import type { MCPToolDefinition } from '../types';
import type { PtahAPI } from '../types';
import {
  callSessionHandoffAck,
  sessionHandoffAckTool,
} from './session-handoff-ack.tool';
import {
  callTaskCloseOut,
  callTaskCloseOutStatus,
  taskCloseOutTool,
  taskCloseOutStatusTool,
} from './task-close-out.tools';
import {
  callTaskCleanupCompleted,
  taskCleanupCompletedTool,
} from './task-cleanup-completed.tool';

export interface LifecycleTool {
  readonly definition: MCPToolDefinition;
  readonly handler: (args: unknown, api: PtahAPI) => Promise<string>;
}

export const lifecycleTools: readonly LifecycleTool[] = [
  {
    definition: sessionHandoffAckTool,
    handler: (args, api) => callSessionHandoffAck(args, api.session),
  },
  { definition: taskCloseOutTool, handler: callTaskCloseOut },
  { definition: taskCloseOutStatusTool, handler: callTaskCloseOutStatus },
  { definition: taskCleanupCompletedTool, handler: callTaskCleanupCompleted },
];
