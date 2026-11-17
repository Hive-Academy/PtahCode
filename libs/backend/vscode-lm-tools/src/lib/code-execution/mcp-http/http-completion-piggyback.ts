import type { ServerResponse } from 'node:http';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import type { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import type { MCPResponse } from '../types';
import { prepareCompletion } from '../mcp-core/completion-delivery';

/** Claim only successful tool results for one exclusive HTTP owner. */
export function prepareHttpCompletion(
  response: MCPResponse,
  method: string,
  owner: ExternalOwnerKey | undefined,
  outbox: ExternalCompletionOutbox | undefined,
): { response: MCPResponse; finish: (res: ServerResponse) => void; release: () => void } {
  const delivery = prepareCompletion(response, method, owner, outbox, 'http');
  return {
    response: delivery.response,
    finish: res => {
      res.once('finish', delivery.success);
      res.once('close', () => {
        if (!res.writableFinished) delivery.failure();
      });
    },
    release: delivery.failure,
  };
}
