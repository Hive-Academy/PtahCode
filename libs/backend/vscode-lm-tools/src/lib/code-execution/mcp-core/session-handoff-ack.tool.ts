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
  description: 'After reading HANDOFF.md and adopting the work, acknowledge the handoff to close the predecessor session. Retry when the result is retryable-failure. Do not retry a refused result; report its reason to the user.',
  inputSchema: { type: 'object', properties: {
    predecessorSessionId: { type: 'string' },
    handoffPath: { type: 'string' },
  }, required: ['predecessorSessionId', 'handoffPath'], additionalProperties: false },
};

/** Logs MCP-boundary failures before they are reduced to a safe result. */
export interface HandoffAckErrorLogger { error(message: string, error: Error): void }

export async function callSessionHandoffAck(
  input: unknown,
  session: SessionNamespace,
  logger: HandoffAckErrorLogger,
): Promise<string> {
  const parsed = SessionHandoffAckArgsSchema.safeParse(input);
  if (!parsed.success) return JSON.stringify({ status: 'refused', reason: 'Invalid predecessorSessionId or handoffPath.' });
  try {
    return JSON.stringify(await session.acknowledge(parsed.data));
  } catch (error: unknown) {
    logger.error('[session-handoff-ack] acknowledge failed', error instanceof Error ? error : new Error(String(error)));
    return JSON.stringify({ status: 'retryable-failure', reason: 'Acknowledgement is temporarily unavailable.' });
  }
}
