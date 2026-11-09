import type { MCPToolDefinition } from '../types';
import type { SessionNamespace } from '../namespace-builders/session-namespace.builder';
import { callSessionHandoffAck, sessionHandoffAckTool } from './session-handoff-ack.tool';

export interface LifecycleTool {
  readonly definition: MCPToolDefinition;
  readonly handler: (args: unknown, session: SessionNamespace) => Promise<string>;
}

export const lifecycleTools: readonly LifecycleTool[] = [
  { definition: sessionHandoffAckTool, handler: callSessionHandoffAck },
];
