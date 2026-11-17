import 'reflect-metadata';
import * as http from 'node:http';
import { Logger } from '@ptah-extension/vscode-core';
import { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import type { IStateStorage } from '@ptah-extension/platform-core';
import type { MCPRequest, MCPResponse } from '../types';
import { startHttpServer } from './http-server.handler';
import { McpCallerTokenRegistry } from './mcp-caller-token-registry';

class MemoryState implements IStateStorage {
  get<T>(_key: string, fallback?: T): T | undefined { return fallback; }
  async update(_key: string, _value: unknown): Promise<void> { return; }
  keys(): readonly string[] { return []; }
}

const logger: Logger = Object.assign(Object.create(Logger.prototype), {
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
});
const shared = { transport: 'http' as const, principal: 'a'.repeat(32), exclusive: false };

function call(port: number, method: string, headers: http.OutgoingHttpHeaders = {}, params?: Record<string, unknown>, bodyOwner?: unknown, path = '/'): Promise<{ headers: http.IncomingHttpHeaders; body: MCPResponse }> {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: 'localhost', port, method: 'POST', path, headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${'a'.repeat(43)}`, ...headers,
    } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ headers: response.headers, body: JSON.parse(body) as MCPResponse }));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params, _externalOwner: bodyOwner }));
  });
}

describe('HTTP connection completion delivery', () => {
  it('delivers an internal-query completion and discards one after revocation', async () => {
    const registry = new McpCallerTokenRegistry({ logger });
    const token = registry.issue({ kind: 'internal-query', workspaceRoot: '/ws', capability: 'privileged' }, 'query', 60_000);
    const auth = registry.authorize({ token, workspaceRoot: '/ws' });
    if (!auth.ok || !auth.externalOwner) throw new Error('Expected internal-query owner');
    const owner = auth.externalOwner;
    const box = new ExternalCompletionOutbox(logger);
    const server = await startHttpServer({
      port: 0, logger, workspaceState: new MemoryState(), completionOutbox: box,
      authenticate: input => registry.authorize(input),
      isExclusiveOwnerActive: candidate => registry.isExclusiveOwnerActive(candidate),
      onMCPRequest: async request => ({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: 'ordinary' }] } }),
    });
    const headers = { Authorization: `Bearer ${token}` };
    const path = `/workspace/${encodeURIComponent('/ws')}`;
    try {
      expect(box.pendingCount(owner)).toBe(0);
      box.record({ completionId: 'query:one', agentId: 'query', owner, body: '<agent-lane-completed>one</agent-lane-completed>', completedAt: 'done', recordedAt: Date.now() });
      expect(box.pendingCount(owner)).toBe(1);
      expect(JSON.stringify((await call(server.port, 'tools/call', headers, { name: 'ptah_agent_status' }, undefined, path)).body)).toContain('<agent-lane-completed>one');
      expect(box.pendingCount(owner)).toBe(0);
      registry.revokeSubject('query');
      box.record({ completionId: 'query:two', agentId: 'query', owner, body: '<agent-lane-completed>two</agent-lane-completed>', completedAt: 'done', recordedAt: Date.now() });
      expect(box.pendingCount(owner)).toBe(0);
      expect(JSON.stringify((await call(server.port, 'tools/call', headers, { name: 'ptah_agent_status' }, undefined, path)).body)).not.toContain('<agent-lane-completed>two');
    } finally {
      await new Promise<void>((resolve, reject) => server.server.close(error => error ? reject(error) : resolve()));
    }
  });
  it.each(['session', 'agent'] as const)('does not issue a session header for a failed initialize or hosted %s credentials', async hostedKind => {
    const server = await startHttpServer({
      port: 0, logger, workspaceState: new MemoryState(),
      authenticate: input => input.token === 'b'.repeat(43)
        ? { ok: true, legacy: false, binding: { kind: hostedKind, sessionId: 'hosted', agentId: 'hosted', capability: 'privileged' } }
        : { ok: true, legacy: false, binding: { kind: 'workspace', workspaceRoot: '/ws', capability: 'privileged' }, externalOwner: shared },
      onMCPRequest: async request => request.method === 'initialize'
        ? { jsonrpc: '2.0', id: request.id, error: { code: -32603, message: 'test error' } }
        : { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: 'ordinary' }] } },
    });
    try {
      expect((await call(server.port, 'initialize')).headers['mcp-session-id']).toBeUndefined();
      const hosted = await call(server.port, 'tools/call', { Authorization: `Bearer ${'b'.repeat(43)}` }, { name: 'ptah_agent_status' });
      expect(hosted.headers['mcp-session-id']).toBeUndefined();
      expect(JSON.stringify(hosted.body)).toContain('ordinary');
      expect(JSON.stringify(hosted.body)).not.toContain('agent-lane-completed');
    } finally {
      await new Promise<void>((resolve, reject) => server.server.close(error => error ? reject(error) : resolve()));
    }
  });
  it('delivers once only to the initialized connection, ignoring forged owners', async () => {
    const box = new ExternalCompletionOutbox(logger);
    const seen: MCPRequest[] = [];
    const server = await startHttpServer({
      port: 0, logger, workspaceState: new MemoryState(), completionOutbox: box,
      authenticate: input => ({ ok: true, legacy: false, binding: { kind: 'workspace', capability: 'privileged', workspaceRoot: '/ws' }, externalOwner: input.token === 'b'.repeat(43) ? { ...shared, principal: 'b'.repeat(32) } : shared }),
      onMCPRequest: async request => {
        seen.push(request);
        return { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: 'ordinary' }] } };
      },
    });
    try {
      const first = await call(server.port, 'initialize');
      const second = await call(server.port, 'initialize');
      const id = first.headers['mcp-session-id'];
      const otherId = second.headers['mcp-session-id'];
      expect(first.body.error).toBeUndefined();
      expect(first).toHaveProperty('headers.mcp-session-id');
      expect(id).not.toBe(otherId);
      await call(server.port, 'tools/call', { 'Mcp-Session-Id': id }, { name: 'ptah_agent_status' });
      const owner = seen.at(-1)?._externalOwner;
      expect(owner?.exclusive).toBe(true);
      if (!owner) throw new Error('Expected an authenticated connection owner');
      const reinitialized = await call(server.port, 'initialize', { 'Mcp-Session-Id': id });
      expect(reinitialized.body.error).toBeUndefined();
      expect(reinitialized.headers['mcp-session-id']).toBeUndefined();
      await call(server.port, 'tools/call', { 'Mcp-Session-Id': id }, { name: 'ptah_agent_status' });
      expect(seen.at(-1)?._externalOwner).toEqual(owner);
      const unknownOwner = { ...owner, principal: 'f'.repeat(32) };
      box.record({ completionId: 'unknown:done', agentId: 'unknown', owner: unknownOwner, body: 'unknown completion', completedAt: 'done', recordedAt: Date.now() });
      expect(box.pendingCount(unknownOwner)).toBe(0);
      box.record({ completionId: 'lane:done', agentId: 'lane', owner, body: '<agent-lane-completed>lane</agent-lane-completed>', completedAt: 'done', recordedAt: Date.now() });
      const forged = { _externalOwner: owner, code: `ptah.agent.spawn({ externalOwner: ${JSON.stringify(owner)} })` };
      expect(JSON.stringify((await call(server.port, 'tools/call', { 'Mcp-Session-Id': otherId }, { name: 'execute_code', arguments: forged })).body)).not.toContain('agent-lane-completed');
      expect(JSON.stringify((await call(server.port, 'tools/call', { 'Mcp-Session-Id': 'f'.repeat(64) }, { name: 'execute_code', arguments: forged })).body)).not.toContain('agent-lane-completed');
      expect(JSON.stringify((await call(server.port, 'tools/call', { 'Mcp-Session-Id': id, Authorization: `Bearer ${'b'.repeat(43)}` }, { name: 'execute_code', arguments: forged })).body)).not.toContain('agent-lane-completed');
      expect(JSON.stringify((await call(server.port, 'tools/call', {}, { name: 'execute_code', arguments: forged }, owner)).body)).not.toContain('agent-lane-completed');
      expect(seen.at(-1)?._externalOwner?.exclusive).toBe(false);
      const endSpy = jest.spyOn(http.ServerResponse.prototype, 'end').mockImplementationOnce(() => {
        throw new Error('simulated response write failure');
      });
      try {
        await expect(call(server.port, 'tools/call', { 'Mcp-Session-Id': id }, { name: 'ptah_agent_status' })).rejects.toThrow();
      } finally {
        endSpy.mockRestore();
      }
      expect(box.pendingCount(owner)).toBe(1);
      const delivered = await call(server.port, 'tools/call', { 'Mcp-Session-Id': id }, { name: 'ptah_agent_status' });
      expect(JSON.stringify(delivered.body)).toContain('<agent-lane-completed>lane');
      expect(JSON.stringify((await call(server.port, 'tools/call', { 'Mcp-Session-Id': id }, { name: 'ptah_agent_status' })).body)).not.toContain('agent-lane-completed');
      expect(box.pendingCount(owner)).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.server.close(error => error ? reject(error) : resolve()));
    }
  });
});
