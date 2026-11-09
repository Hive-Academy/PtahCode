import { z } from 'zod';
import type { MCPToolDefinition } from '../types';
import type { SessionNamespace } from '../namespace-builders/session-namespace.builder';

export const SESSION_HANDOFF_ACK_TOOL_NAME = 'ptah_session_handoff_ack';
export const SessionHandoffAckArgsSchema = z.object({
  predecessorSessionId: z.string().min(1),
  handoffPath: z.string().min(1),
}).strict();

export const sessionHandoffAckTool: MCPToolDefinition = {
  name: SESSION_HANDOFF_ACK_TOOL_NAME,
  description: 'After reading HANDOFF.md and adopting the work, acknowledge the handoff to close the predecessor session. Retry when the result is retryable-failure.',
  inputSchema: { type: 'object', properties: {
    predecessorSessionId: { type: 'string' },
    handoffPath: { type: 'string' },
  }, required: ['predecessorSessionId', 'handoffPath'], additionalProperties: false },
};

export async function callSessionHandoffAck(input: unknown, session: SessionNamespace): Promise<string> {
  const parsed = SessionHandoffAckArgsSchema.safeParse(input);
  if (!parsed.success) return JSON.stringify({ status: 'refused', reason: 'Invalid predecessorSessionId or handoffPath.' });
  try {
    return JSON.stringify(await session.acknowledge(parsed.data));
  } catch (_error: unknown) {
    // degradation-audit: The MCP boundary intentionally reduces internal errors to a safe retryable result.
    return JSON.stringify({ status: 'retryable-failure', reason: 'Acknowledgement is temporarily unavailable.' });
  }
}
