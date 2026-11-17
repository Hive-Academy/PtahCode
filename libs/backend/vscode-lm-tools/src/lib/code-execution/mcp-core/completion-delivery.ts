import { z } from 'zod';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import type { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import type { MCPResponse } from './types/mcp-protocol.types';

const resultSchema = z.object({ content: z.array(z.unknown()) }).passthrough();
const waitIds = new WeakMap<MCPResponse, readonly string[]>();
const limits = { maxEntries: 4, maxBytes: 16 * 1024 };

/** Runtime completion IDs are derived from terminal records, never tool input. */
export function markWaitResponse(response: MCPResponse, ids: readonly string[]): MCPResponse {
  waitIds.set(response, ids);
  return response;
}

function boundedBody(body: string, transport: 'http' | 'stdio'): string {
  const bytes = Buffer.from(body);
  if (bytes.length <= limits.maxBytes) return body;
  const suffix = `\n[Completion truncated; call ${transport === 'stdio' ? 'agent_read' : 'ptah_agent_read'} for full output.]`;
  let end = limits.maxBytes - Buffer.byteLength(suffix);
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8') + suffix;
}

export function prepareCompletion(
  response: MCPResponse,
  method: string,
  owner: ExternalOwnerKey | undefined,
  outbox: ExternalCompletionOutbox | undefined,
  transport: 'http' | 'stdio' = 'stdio',
): { response: MCPResponse; success(): void; failure(): void } {
  const empty = { response, success: () => undefined, failure: () => undefined };
  if (method !== 'tools/call' || !owner?.exclusive || !outbox || response.error) return empty;
  const parsed = resultSchema.safeParse(response.result);
  if (!parsed.success || (transport === 'stdio' && parsed.data['isError'] === true)) return empty;
  const claim = outbox.claim(owner, limits);
  const terminalIds = waitIds.get(response) ?? [];
  const lateIds = terminalIds.filter(id =>
    !claim.entries.some(entry => entry.completionId === id) &&
    !outbox.hasCompletion(owner, id),
  );
  const content = [
    ...parsed.data.content,
    ...claim.entries.map(entry => ({ type: 'text', text: `Completion ID: ${entry.completionId}\n${boundedBody(entry.body, transport)}` })),
  ];
  return {
    response: claim.entries.length ? { ...response, result: { ...parsed.data, content } } : response,
    success: () => {
      outbox.acknowledge(owner, claim.claimId);
      for (const id of lateIds) outbox.markDelivered(owner, id);
    },
    failure: () => outbox.release(owner, claim.claimId),
  };
}
