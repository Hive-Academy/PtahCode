import type { MCPToolDefinition } from '../types';
import type { PtahAPI } from '../types';
import type { Logger } from '@ptah-extension/vscode-core';
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
  readonly handler: (
    args: unknown,
    api: PtahAPI,
    logger: Logger,
  ) => Promise<string>;
}

export const lifecycleTools: readonly LifecycleTool[] = [
  {
    definition: sessionHandoffAckTool,
    handler: (args, api, logger) =>
      callSessionHandoffAck(args, api.session, logger),
  },
  { definition: taskCloseOutTool, handler: callTaskCloseOut },
  { definition: taskCloseOutStatusTool, handler: callTaskCloseOutStatus },
  { definition: taskCleanupCompletedTool, handler: callTaskCleanupCompleted },
];
