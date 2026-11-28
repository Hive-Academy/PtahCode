import 'reflect-metadata';
import { Logger } from '@ptah-extension/vscode-core';
import type { PtahAPI, MCPRequest } from '../types';
import {
  handleMCPRequest,
  type ProtocolHandlerDependencies,
} from './protocol-dispatcher';
import {
  ANTIGRAVITY_TOOL_DECLARATION_BUDGET,
  compactToolsForAntigravity,
} from './antigravity-tool-compaction';

/**
 * Guard on the Antigravity tool-size compaction (TASK_2026_2331): agy
 * silently drops any Ptah MCP tool declaration over roughly 2.1 KB
 * (`.ptah/specs/TASK_2026_2329_7f4a/live-test-results.md`,
 * `fix/full-auto-yolo-providers`). `handleToolsList` shortens only the
 * `description` of an over-budget tool, and only for a request carrying the
 * Antigravity caller marker (`_callerCli: 'antigravity'`); every other
 * caller's tool list stays byte-identical to today.
 */
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
  hasIDECapabilities: true,
};

interface ListedTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

/** What the CLI sends for one tool: name, description, schema, in UTF-8 bytes. */
function definitionSize(tool: ListedTool): number {
  return (
    Buffer.byteLength(tool.name, 'utf8') +
    Buffer.byteLength(tool.description, 'utf8') +
    Buffer.byteLength(JSON.stringify(tool.inputSchema ?? {}), 'utf8')
  );
}

async function toolsFor(callerCli: string | undefined): Promise<ListedTool[]> {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    _callerBinding: {
      kind: 'session',
      sessionId: 'session-1',
      capability: 'privileged',
      disallowedTools: [],
    },
    _callerSessionId: 'session-1',
    ...(callerCli !== undefined ? { _callerCli: callerCli } : {}),
  } as unknown as MCPRequest;
  const response = await handleMCPRequest(request, deps);
  return (response.result as { tools: ListedTool[] }).tools;
}

describe('Antigravity tool-size compaction', () => {
  it('keeps every tool at or under the budget for an Antigravity caller, or reduces its description to empty when name + inputSchema alone already meet or exceed the budget', async () => {
    const tools = await toolsFor('antigravity');
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      const schemaSize = JSON.stringify(tool.inputSchema ?? {}).length;
      const irreducibleFloor = tool.name.length + schemaSize;
      if (irreducibleFloor >= ANTIGRAVITY_TOOL_DECLARATION_BUDGET) {
        // name + inputSchema alone already meet or exceed the budget; name
        // and inputSchema are never touched, so the description is the only
        // thing compaction can still shrink, down to empty.
        expect(tool.description).toBe('');
      } else {
        expect(definitionSize(tool)).toBeLessThanOrEqual(
          ANTIGRAVITY_TOOL_DECLARATION_BUDGET,
        );
      }
    }
  });

  it('leaves a non-Antigravity caller fully uncompacted', async () => {
    const antigravityTools = await toolsFor('antigravity');
    const plainTools = await toolsFor(undefined);

    expect(plainTools.map((tool) => tool.name).sort()).toEqual(
      antigravityTools.map((tool) => tool.name).sort(),
    );

    // A tool known to exceed the budget uncompacted (TASK_2026_2329 live
    // evidence: ptah_agent_spawn 8,679 B, ptah_session_start 4,981 B). Its
    // plain-caller declaration must still exceed the budget, proving no
    // compaction ran for this request.
    const overBudgetName = 'ptah_agent_spawn';
    const plainOverBudget = plainTools.find(
      (tool) => tool.name === overBudgetName,
    );
    const antigravityOverBudget = antigravityTools.find(
      (tool) => tool.name === overBudgetName,
    );
    expect(plainOverBudget).toBeDefined();
    expect(antigravityOverBudget).toBeDefined();

    expect(definitionSize(plainOverBudget as ListedTool)).toBeGreaterThan(
      ANTIGRAVITY_TOOL_DECLARATION_BUDGET,
    );
    // The Antigravity caller's copy of the same tool was shortened: its
    // description is strictly shorter than the plain caller's.
    expect((antigravityOverBudget as ListedTool).description.length).toBeLessThan(
      (plainOverBudget as ListedTool).description.length,
    );
    // Neither `name` nor `inputSchema` is ever touched by compaction.
    expect((antigravityOverBudget as ListedTool).name).toBe(
      (plainOverBudget as ListedTool).name,
    );
    expect(
      JSON.stringify((antigravityOverBudget as ListedTool).inputSchema ?? {}),
    ).toBe(JSON.stringify((plainOverBudget as ListedTool).inputSchema ?? {}));
  });

  it('never splits a surrogate pair when the description budget lands mid-character', () => {
    // name + schema consume all but 3 bytes of the budget: 3 is enough bytes
    // for `Buffer.byteLength` to accept a lone (invalid) high surrogate, but
    // not enough for the emoji's real 4-byte UTF-8 encoding — the exact
    // boundary a UTF-16-code-unit truncation could get wrong.
    const schema = {};
    const schemaBytes = Buffer.byteLength(JSON.stringify(schema), 'utf8');
    const name = 'x'.repeat(
      ANTIGRAVITY_TOOL_DECLARATION_BUDGET - schemaBytes - 3,
    );
    const tool = {
      name,
      description: '😀 more text than fits in three bytes.',
      inputSchema: schema,
    };

    const [compacted] = compactToolsForAntigravity([tool]);

    expect(Buffer.byteLength(compacted.description, 'utf8')).toBeLessThanOrEqual(3);
    // A lone high surrogate (0xD800-0xDBFF) at the end would encode as the
    // UTF-8 replacement character, not a prefix of the emoji.
    const lastUnit = compacted.description.charCodeAt(
      compacted.description.length - 1,
    );
    expect(lastUnit >= 0xd800 && lastUnit <= 0xdbff).toBe(false);
  });
});
