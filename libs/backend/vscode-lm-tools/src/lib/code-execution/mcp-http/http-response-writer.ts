import type { ServerResponse } from 'node:http';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import type { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import type { Logger } from '@ptah-extension/vscode-core';
import type { MCPResponse } from '../types';
import { prepareHttpCompletion } from './http-completion-piggyback';
import { HttpConnectionOwners } from './http-connection-owners';

export function writeHttpMcpResponse(input: {
  res: ServerResponse;
  response: MCPResponse;
  method: string;
  status: number;
  owner?: ExternalOwnerKey;
  initialOwner?: ExternalOwnerKey;
  outbox?: ExternalCompletionOutbox;
  connections?: HttpConnectionOwners;
  logger: Logger;
}): void {
  const { res, response, method, status, owner, initialOwner, outbox, connections, logger } = input;
  const delivery = prepareHttpCompletion(response, method, owner, outbox);
  if (res.destroyed) { delivery.release(); return; }
  try {
    const payload = JSON.stringify(delivery.response);
    const sessionId = method === 'initialize' && !response.error && initialOwner && !owner?.exclusive
      ? connections?.issue(initialOwner)
      : undefined;
    res.writeHead(status, {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    });
    delivery.finish(res);
    res.end(payload);
  } catch (error: unknown) {
    delivery.release();
    if (!res.headersSent && !res.destroyed) throw error;
    logger.error('[MCP] HTTP response write failed', error instanceof Error ? error : new Error('HTTP response write failed'));
    res.destroy();
  }
}
