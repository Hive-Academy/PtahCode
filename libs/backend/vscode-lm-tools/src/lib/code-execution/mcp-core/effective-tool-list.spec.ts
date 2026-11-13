import 'reflect-metadata';

import { Logger } from '@ptah-extension/vscode-core';
import type { McpCallerBinding } from '@ptah-extension/platform-core';
import type { PtahAPI, MCPRequest } from '../types';
import { handleMCPRequest, type ProtocolHandlerDependencies } from './protocol-dispatcher';
import { composeEffectiveToolList } from './effective-tool-list';

const deps: ProtocolHandlerDependencies = {
  ptahAPI: {} as PtahAPI,
  permissionPromptService: {} as ProtocolHandlerDependencies['permissionPromptService'],
  logger: Object.assign(Object.create(Logger.prototype) as Logger, {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
  hasIDECapabilities: false,
};

const phase: McpCallerBinding = {
  kind: 'agent',
  agentId: 'agent-1',
  capability: 'privileged',
  phaseKind: 'implement',
  disallowedTools: ['ptah_browser_navigate'],
};

async function listed(binding?: McpCallerBinding) {
  const request: MCPRequest = {
    jsonrpc: '2.0', id: 1, method: 'tools/list',
    ...(binding ? { _callerBinding: binding } : {}),
  };
  const response = await handleMCPRequest(request, deps);
  return (response.result as { tools: Array<{ name: string }> }).tools;
}

describe('effective tool list characterization', () => {
  it.each([
    ['no phase', undefined],
    ['phase with denials', phase],
    ['denied ptah tool hides execute_code', { ...phase, disallowedTools: ['ptah_search_files'] }],
  ] as const)('%s keeps the ordered full definitions', async (_label, binding) => {
    const actual = await listed(binding);
    const composed = composeEffectiveToolList(
      { kind: 'anonymous' }, 'coding', 'privileged', binding, deps,
    );
    // The dispatcher adds only transport metadata and budgets after composition.
    expect(actual.map((tool) => tool.name)).toEqual(composed.map((tool) => tool.name));
    expect(actual).toMatchSnapshot();
    if (binding?.disallowedTools?.includes('ptah_search_files')) {
      expect(actual.map((tool) => tool.name)).not.toContain('execute_code');
    }
  });
});
