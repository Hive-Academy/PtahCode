import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import type { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import type { MCPResponse } from '../types';

const toolResultSchema = z.object({
  content: z.array(z.unknown()),
}).passthrough();

// At most 4 entries x 16 KiB, or about 64 KiB of completion text per reply.
const LIMITS = { maxEntries: 4, maxBytes: 16 * 1024 };

function boundedBody(body: string): string {
  const bytes = Buffer.from(body);
  if (bytes.length <= LIMITS.maxBytes) return body;
  const suffix = '\n[Completion truncated; call ptah_agent_read for full output.]';
  const budget = LIMITS.maxBytes - Buffer.byteLength(suffix);
  let end = budget;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8') + suffix;
}

/** Claim only tool results for a unique authenticated HTTP credential. */
export function prepareHttpCompletion(
  response: MCPResponse,
  method: string,
  owner: ExternalOwnerKey | undefined,
  outbox: ExternalCompletionOutbox | undefined,
): { response: MCPResponse; finish: (res: ServerResponse) => void; release: () => void } {
  const empty = { response, finish: () => undefined, release: () => undefined };
  if (method !== 'tools/call' || !owner?.exclusive || !outbox || response.error) return empty;
  const parsed = toolResultSchema.safeParse(response.result);
  if (!parsed.success) return empty;
  const claim = outbox.claim(owner, LIMITS);
  if (!claim.entries.length) return empty;
  const content = [
    ...parsed.data.content,
    ...claim.entries.map(entry => ({ type: 'text', text: `Completion ID: ${entry.completionId}\n${boundedBody(entry.body)}` })),
  ];
  return {
    response: { ...response, result: { ...parsed.data, content } },
    finish: res => {
      res.once('finish', () => outbox.acknowledge(owner, claim.claimId));
      res.once('close', () => {
        if (!res.writableFinished) outbox.release(owner, claim.claimId);
      });
    },
    release: () => outbox.release(owner, claim.claimId),
  };
}
