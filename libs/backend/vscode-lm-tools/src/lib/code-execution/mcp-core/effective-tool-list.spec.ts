import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { Logger } from '@ptah-extension/vscode-core';
import type { McpCallerBinding } from '@ptah-extension/platform-core';
import type { PtahAPI, MCPRequest } from '../types';
import {
  handleMCPRequest,
  type ProtocolHandlerDependencies,
} from './protocol-dispatcher';
import { composeEffectiveToolList } from './effective-tool-list';
import { buildRouteCandidateSource } from '../namespace-builders/route-namespace.builder';

const deps: ProtocolHandlerDependencies = {
  ptahAPI: {} as PtahAPI,
  permissionPromptService:
    {} as ProtocolHandlerDependencies['permissionPromptService'],
  logger: Object.assign(Object.create(Logger.prototype) as Logger, {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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

type ListedTool = { name: string; inputSchema?: unknown };

/** Key order must not change the hash, so objects are serialized with sorted keys. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** One line for each tool, in list order: the name and a hash of its input schema. */
function nameAndSchemaHashes(tools: readonly ListedTool[]): string[] {
  return tools.map(
    (tool) =>
      `${tool.name} ${createHash('sha256').update(canonicalJson(tool.inputSchema)).digest('hex').slice(0, 16)}`,
  );
}

async function listed(
  binding?: McpCallerBinding,
  hostDeps: ProtocolHandlerDependencies = deps,
) {
  const request: MCPRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    ...(binding ? { _callerBinding: binding } : {}),
    ...(binding?.kind === 'session' && binding.sessionId
      ? { _callerSessionId: binding.sessionId }
      : {}),
  };
  const response = await handleMCPRequest(request, hostDeps);
  return (response.result as { tools: ListedTool[] }).tools;
}

import { MCP_CRON_WRITE_DENIED_MESSAGE } from './mcp-caller-policy';

describe('effective tool list characterization', () => {
  it('matches ordered names with IDE tools and a disabled namespace', async () => {
    const hostDeps: ProtocolHandlerDependencies = {
      ...deps,
      hasIDECapabilities: true,
      disabledMcpNamespaces: ['browser'],
    };
    const binding: McpCallerBinding = {
      kind: 'session',
      sessionId: 'session-1',
      capability: 'privileged',
      phaseKind: 'visual-review',
      disallowedTools: [],
    };
    const actual = await listed(binding, hostDeps);
    const composed = composeEffectiveToolList(
      { kind: 'session' },
      'coding',
      'privileged',
      binding,
      hostDeps,
    );
    expect(actual.map((tool) => tool.name)).toEqual(
      composed.map((tool) => tool.name),
    );
    const source = buildRouteCandidateSource(
      { list: async () => [], listRoles: async () => [] },
      () => hostDeps,
    );
    const routeNames = await source.tools?.(
      {
        kind: 'subagent',
        id: 'subagent:visual-review',
        phaseKind: 'visual-review',
        family: 'claude',
      },
      { kind: 'visual-review', toolProfile: { disallowedTools: [] } },
    );
    expect(routeNames).toEqual(actual.map((tool) => tool.name));
    expect(actual.map((tool) => tool.name)).toContain('ptah_lsp_references');
    expect(actual.some((tool) => tool.name.startsWith('ptah_browser_'))).toBe(
      false,
    );
  });
  it.each([
    ['no phase', undefined],
    ['phase with denials', phase],
    [
      'denied ptah tool hides execute_code',
      { ...phase, disallowedTools: ['ptah_search_files'] },
    ],
  ] as const)(
    '%s keeps the ordered names and schema hashes',
    async (_label, binding) => {
      const actual = await listed(binding);
      const composed = composeEffectiveToolList(
        { kind: 'anonymous' },
        'coding',
        'privileged',
        binding,
        deps,
      );
      // The dispatcher adds only transport metadata and budgets after composition.
      expect(actual.map((tool) => tool.name)).toEqual(
        composed.map((tool) => tool.name),
      );
      expect(nameAndSchemaHashes(actual)).toMatchSnapshot();
      if (binding?.disallowedTools?.includes('ptah_search_files')) {
        expect(actual.map((tool) => tool.name)).not.toContain('execute_code');
      }
    },
  );
  describe('cron write tools (issue #1400)', () => {
    const CRON_WRITE_NAMES = [
      'ptah_cron_create',
      'ptah_cron_update',
      'ptah_cron_toggle',
      'ptah_cron_delete',
      'ptah_cron_run_now',
    ];
    const session: McpCallerBinding = {
      kind: 'session',
      sessionId: 'cron-session-1',
      capability: 'privileged',
    };
    const approved: McpCallerBinding = { ...session, cronWriteApproval: true };
    const cronNames = (tools: ListedTool[]) =>
      tools
        .map((tool) => tool.name)
        .filter((name) => name.startsWith('ptah_cron_'));

    it('lists them only for a credential that proves user approval', async () => {
      const withApproval = await listed(approved);
      expect(cronNames(withApproval)).toEqual(
        expect.arrayContaining(CRON_WRITE_NAMES),
      );
      expect(
        nameAndSchemaHashes(
          withApproval.filter((tool) => tool.name.startsWith('ptah_cron_')),
        ),
      ).toMatchSnapshot();

      for (const binding of [undefined, session]) {
        expect(cronNames(await listed(binding))).toEqual([
          'ptah_cron_list',
          'ptah_cron_get',
          'ptah_cron_runs',
          'ptah_cron_next_fire',
        ]);
      }
    });

    it.each(CRON_WRITE_NAMES)(
      'rejects a %s call from a credential without that proof',
      async (name) => {
        for (const binding of [undefined, session]) {
          const response = await handleMCPRequest(
            {
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: { name, arguments: { id: 'job-1' } },
              ...(binding
                ? {
                    _callerBinding: binding,
                    _callerSessionId: binding.sessionId,
                  }
                : {}),
            },
            deps,
          );
          expect(response.error?.message).toBe(MCP_CRON_WRITE_DENIED_MESSAGE);
        }
      },
    );
  });
});
