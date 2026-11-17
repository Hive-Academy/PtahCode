import 'reflect-metadata';
import { Logger } from '@ptah-extension/vscode-core';
import { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import type { PtahAPIBuilder } from '../ptah-api-builder.service';
import type { MCPResponse } from '../mcp-core/types/mcp-protocol.types';
import { StdioMcpServerService } from './stdio-mcp-server.service';

const logger = Object.assign(Object.create(Logger.prototype), { info: jest.fn() }) as Logger;
const builder = Object.create(null) as PtahAPIBuilder;
const response: MCPResponse = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'tool' }] } };

describe('stdio completion write contract', () => {
  it('gives two connections distinct exclusive owners', () => {
    const box = new ExternalCompletionOutbox(logger);
    const first = new StdioMcpServerService(logger, builder, box);
    const second = new StdioMcpServerService(logger, builder, box);
    expect(first['owner']).not.toEqual(second['owner']);
    box.record({ completionId: 'a:done', agentId: 'a', owner: first['owner'], body: 'private', completedAt: 'done', recordedAt: Date.now() });
    expect(second.prepareToolResponse(response).response).toEqual(response);
    expect(JSON.stringify(first.prepareToolResponse(response).response)).toContain('private');
  });

  it('releases after failure and acknowledges after success', () => {
    const box = new ExternalCompletionOutbox(logger);
    const service = new StdioMcpServerService(logger, builder, box);
    box.record({ completionId: 'a:done', agentId: 'a', owner: service['owner'], body: 'done', completedAt: 'done', recordedAt: Date.now() });
    const first = service.prepareToolResponse(response);
    expect(JSON.stringify(first.response)).toContain('Completion ID: a:done\\ndone');
    first.failure();
    expect(box.pendingCount(service['owner'])).toBe(1);
    const retry = service.prepareToolResponse(response);
    retry.success();
    expect(box.pendingCount(service['owner'])).toBe(0);
  });

  it('retires its owner when the stream closes', async () => {
    const box = new ExternalCompletionOutbox(logger);
    const service = new StdioMcpServerService(logger, builder, box);
    const owner = service['owner'];
    await service.dispose();
    box.record({ completionId: 'late:done', agentId: 'late', owner, body: 'late', completedAt: 'done', recordedAt: Date.now() });
    expect(box.pendingCount(owner)).toBe(0);
    expect(service.prepareToolResponse(response).response).toEqual(response);
  });
});
