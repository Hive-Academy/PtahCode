import 'reflect-metadata';
import { Logger } from '@ptah-extension/vscode-core';
import type { PtahAPI, MCPRequest } from '../types';
import {
  handleMCPRequest,
  type ProtocolHandlerDependencies,
} from './protocol-dispatcher';

/**
 * Size guard on the eager Ptah tools (TASK_2026_2323).
 *
 * A tool stamped `anthropic/alwaysLoad` is not deferred: the Claude CLI sends
 * its name, description and input schema with every request of a main-chat
 * session. Deferred tools cost only their name. So the eager set is a fixed
 * per-turn cost, like the core prompt, and it had no measurement that fails.
 *
 * The budget is the size measured on main plus five percent. A change that
 * makes an eager tool longer, or makes another tool eager, must raise it with
 * a measured reason in the same change.
 */
const EAGER_TOOL_COUNT = 15;
// Measured 21,029 chars on main (20,325 at r6 75cfd492b; ptah_grep grew), plus five percent.
const EAGER_TOOL_CHAR_BUDGET = 22_080;

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
  description?: string;
  inputSchema?: unknown;
  _meta?: Record<string, unknown>;
}

async function eagerTools(): Promise<ListedTool[]> {
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
  } as unknown as MCPRequest;
  const response = await handleMCPRequest(request, deps);
  return (response.result as { tools: ListedTool[] }).tools.filter(
    (tool) => tool._meta?.['anthropic/alwaysLoad'] === true,
  );
}

/** What the CLI sends for one eager tool: name, description, schema. */
function definitionChars(tool: ListedTool): number {
  return (
    tool.name.length +
    (tool.description ?? '').length +
    JSON.stringify(tool.inputSchema ?? {}).length
  );
}

describe('eager tool definitions budget', () => {
  it('keeps the eager set at its measured size', async () => {
    const tools = await eagerTools();
    expect(tools).toHaveLength(EAGER_TOOL_COUNT);
    const total = tools.reduce((sum, tool) => sum + definitionChars(tool), 0);
    expect(total).toBeLessThanOrEqual(EAGER_TOOL_CHAR_BUDGET);
  });
});
