/**
 * Gateway tool bridge: the dispatcher's side of `IMcpGateway`.
 *
 * The user's own MCP servers are served through `ptah`. This module lists
 * their tools for `tools/list` (after Ptah's byte-stable list), keeps the
 * per-scope reverse map of the names each scope saw, and forwards a
 * `tools/call` whose name is in that map.
 *
 * Every call re-checks the caller's own permission (gateway caller policy and
 * phase `disallowedTools`) before it consults the shared name map, because
 * two callers with different phases can share one scope key. Every forwarded
 * result is held to the server-side tool-result budget, the same one Ptah's
 * host tools get.
 */
import {
  gatewayScopeFromBinding,
  isGatewayCallerPermitted,
  type IMcpGateway,
  type McpCallerBinding,
  type McpCallerCapability,
  type McpGatewayCallResult,
  type McpGatewayScope,
  type McpGatewayTool,
} from '@ptah-extension/platform-core';
import type { MCPRequest, MCPResponse } from '../types';
import { buildToolDefinitions } from './effective-tool-list';
import {
  MCP_CALLER_FORBIDDEN_CODE,
  MCP_TOOL_DENIED_MESSAGE,
} from './mcp-caller-auth.types';
import {
  isPhaseToolDenied,
  phaseDisallowedTools,
} from './mcp-caller-phase-filter';
import { isToolPermitted } from './mcp-caller-policy';

/** What the bridge needs from the dispatcher for one request. */
export interface GatewayBridgeContext {
  /** Absent (a host without auth secrets): no gateway tools at all. */
  readonly gateway: IMcpGateway | undefined;
  /** The request's effective capability (the dispatcher's own reading). */
  readonly capability: McpCallerCapability;
  /** Logs one warning. Must never throw. */
  readonly warn: (message: string, meta: Record<string, unknown>) => void;
}

/** {@link GatewayBridgeContext} plus the result budget for `tools/call`. */
export interface GatewayCallContext extends GatewayBridgeContext {
  /**
   * The tool-result budget applied to `text` under this request's tool name:
   * the text itself when within budget, else the reduced or cut text with
   * its spool trailer. Must never throw.
   */
  readonly budgetText: (text: string) => Promise<string>;
}

/** Most scopes remembered per gateway; the oldest is dropped first. */
const MAX_GATEWAY_SCOPES = 64;

/**
 * Gateway tool names each scope saw in its last list: the reverse map a
 * `tools/call` consults before it asks the gateway. Keyed weakly by the
 * gateway so a disposed hub takes its names with it.
 */
const gatewayNamesByScope = new WeakMap<
  IMcpGateway,
  Map<string, ReadonlySet<string>>
>();

let hostToolNameSet: ReadonlySet<string> | undefined;

/**
 * Every host tool name (all namespaces and capabilities on), built on first
 * use. A gateway name is never one of these, so a call is routed to the
 * gateway only for a name outside this set.
 */
export function hostToolNames(): ReadonlySet<string> {
  hostToolNameSet ??= new Set(
    buildToolDefinitions({ hasIDECapabilities: true }).map((tool) => tool.name),
  );
  return hostToolNameSet;
}

/**
 * The gateway scope of this request, copied from its binding, or `undefined`
 * when the caller gets no gateway tools (class `gateway` is privileged only;
 * see `isGatewayCallerPermitted`).
 */
function gatewayScopeOf(
  request: MCPRequest,
  capability: McpCallerCapability,
): McpGatewayScope | undefined {
  const binding = request._callerBinding;
  if (
    binding === undefined ||
    !isGatewayCallerPermitted(binding) ||
    capability !== 'privileged'
  ) {
    return undefined;
  }
  return gatewayScopeFromBinding(binding);
}

function gatewayScopeKey(scope: McpGatewayScope): string {
  return JSON.stringify([
    scope.kind,
    scope.capability,
    scope.workspaceRoot ?? null,
    scope.gatewayApproval === true,
    scope.includeConnectors === true,
  ]);
}

/**
 * Phase denial for a gateway name. `disallowedTools` applies by exact name.
 * A present phase with a malformed list hides every gateway tool, the same
 * fail-closed reading the host tools get.
 */
function isGatewayPhaseDenied(
  name: string,
  binding: McpCallerBinding | undefined,
): boolean {
  if (
    binding?.phaseKind !== undefined &&
    phaseDisallowedTools(binding) === undefined
  ) {
    return true;
  }
  return isPhaseToolDenied(name, binding);
}

/**
 * Ask the gateway for this scope's tools, drop host-name collisions and
 * phase-denied names, sort by name, and remember the names for `tools/call`.
 * Throws whatever `listTools` throws.
 */
async function listGatewayTools(
  gateway: IMcpGateway,
  scope: McpGatewayScope,
  request: MCPRequest,
): Promise<McpGatewayTool[]> {
  const listed = await gateway.listTools(scope, request._abortSignal);
  const host = hostToolNames();
  const tools = listed
    .filter(
      (tool) =>
        !host.has(tool.name) &&
        !isGatewayPhaseDenied(tool.name, request._callerBinding),
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  rememberGatewayNames(gateway, scope, tools);
  return tools;
}

function rememberGatewayNames(
  gateway: IMcpGateway,
  scope: McpGatewayScope,
  tools: readonly McpGatewayTool[],
): void {
  let byScope = gatewayNamesByScope.get(gateway);
  if (byScope === undefined) {
    byScope = new Map();
    gatewayNamesByScope.set(gateway, byScope);
  }
  const key = gatewayScopeKey(scope);
  byScope.delete(key);
  byScope.set(key, new Set(tools.map((tool) => tool.name)));
  if (byScope.size > MAX_GATEWAY_SCOPES) {
    const oldest = byScope.keys().next().value;
    if (oldest !== undefined) byScope.delete(oldest);
  }
}

/**
 * Gateway tools for `tools/list`. A gateway failure never fails the list:
 * it is logged as a warning and the caller gets Ptah's tools only.
 */
export async function listGatewayToolsForList(
  request: MCPRequest,
  context: GatewayBridgeContext,
): Promise<McpGatewayTool[]> {
  const gateway = context.gateway;
  const scope = gatewayScopeOf(request, context.capability);
  if (gateway === undefined || scope === undefined) return [];
  try {
    return await listGatewayTools(gateway, scope, request);
  } catch (error) {
    // degradation-audit: reported - logged at warn; one failing hub must not
    // take the host tool list down, so the caller gets Ptah's tools only.
    context.warn('[MCP] gateway tools/list failed; listing Ptah tools only', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function isTextContent(item: unknown): item is { type: 'text'; text: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    (item as { type?: unknown }).type === 'text' &&
    typeof (item as { text?: unknown }).text === 'string'
  );
}

/**
 * Hold a forwarded result to the tool-result budget.
 *
 * The budgeted payload is the result's text items joined by a newline, or,
 * with no text item, its `structuredContent` as JSON. Within the budget the
 * result passes through unchanged. Over it, the text items become one item
 * with the budgeted text, placed first; other items (images, resources) keep
 * their order after it, and `structuredContent` is dropped because it would
 * carry the same unbounded payload. Every other field is kept.
 */
async function budgetGatewayResult(
  result: McpGatewayCallResult,
  budgetText: (text: string) => Promise<string>,
): Promise<McpGatewayCallResult> {
  const content = Array.isArray(result.content) ? result.content : [];
  const texts: string[] = [];
  const others: unknown[] = [];
  for (const item of content) {
    if (isTextContent(item)) texts.push(item.text);
    else others.push(item);
  }
  let payload: string | undefined;
  if (texts.length > 0) payload = texts.join('\n');
  else if (result.structuredContent !== undefined) {
    payload = JSON.stringify(result.structuredContent);
  }
  if (payload === undefined) return result;
  const budgeted = await budgetText(payload);
  if (budgeted === payload) return result;
  const fields: Record<string, unknown> = { ...result };
  delete fields['structuredContent'];
  return {
    ...fields,
    content: [{ type: 'text', text: budgeted }, ...others],
  };
}

/**
 * Forward a `tools/call` to the gateway when its reverse map has the name.
 *
 * The caller's own permission is checked first, on every call and
 * independent of the name map: no gateway tools for this caller means `null`;
 * a phase that hides the name (or a malformed phase list, which hides every
 * gateway name) means a forbidden error.
 *
 * `relist`: on a miss, list once more and look again (a server that came up
 * after the caller's last list). `null` means "not a gateway tool for this
 * caller"; the dispatcher then goes on, and at the end answers `-32602`.
 */
export async function routeGatewayCall(
  request: MCPRequest,
  context: GatewayCallContext,
  name: string,
  args: unknown,
  relist: boolean,
): Promise<MCPResponse | null> {
  const gateway = context.gateway;
  const scope = gatewayScopeOf(request, context.capability);
  if (
    gateway === undefined ||
    scope === undefined ||
    hostToolNames().has(name) ||
    !isToolPermitted(name, context.capability, 'gateway')
  ) {
    return null;
  }
  if (isGatewayPhaseDenied(name, request._callerBinding)) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: MCP_CALLER_FORBIDDEN_CODE,
        message: MCP_TOOL_DENIED_MESSAGE,
      },
    };
  }
  let known =
    gatewayNamesByScope.get(gateway)?.get(gatewayScopeKey(scope))?.has(name) ===
    true;
  if (!known && relist) {
    try {
      const tools = await listGatewayTools(gateway, scope, request);
      known = tools.some((tool) => tool.name === name);
    } catch (error) {
      // degradation-audit: reported - logged at warn; the re-list is best
      // effort and the caller gets an explicit "unknown tool" answer.
      context.warn('[MCP] gateway re-list on tools/call failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
  if (!known) return null;
  if (
    args !== undefined &&
    (args === null || typeof args !== 'object' || Array.isArray(args))
  ) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid params: tools/call "arguments" must be an object',
      },
    };
  }
  let result: McpGatewayCallResult;
  try {
    result = await gateway.callTool(
      scope,
      name,
      (args ?? {}) as Readonly<Record<string, unknown>>,
      request._abortSignal,
    );
  } catch (error) {
    // degradation-audit: reported - logged at warn and answered as a tool
    // error, never `-32603`: the agent sees the failure and goes on.
    const message = error instanceof Error ? error.message : String(error);
    context.warn('[MCP] gateway tools/call failed', {
      tool: name,
      error: message,
    });
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          { type: 'text', text: `Gateway tool ${name} failed: ${message}` },
        ],
        isError: true,
      },
    };
  }
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: await budgetGatewayResult(result, context.budgetText),
  };
}
