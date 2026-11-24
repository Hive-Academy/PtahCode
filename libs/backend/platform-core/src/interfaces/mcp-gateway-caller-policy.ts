/**
 * Gateway caller policy: which MCP callers may see and call gateway tools
 * (the user's own MCP servers served through `ptah`, see `IMcpGateway`).
 *
 * The one copy of the matrix. `IMcpGateway` applies it on every path and is
 * authoritative; the MCP dispatcher calls it too, only to skip asking the
 * gateway for callers that get nothing.
 *
 * | Caller                         | Gateway tools when                         |
 * | ------------------------------ | ------------------------------------------ |
 * | `session` (Claude session)     | `privileged` and `gatewayApproval: true`   |
 * | `internal-query` (cron, other) | `privileged` and `includeConnectors: true` |
 * | `agent` (CLI lane)             | `privileged`                               |
 * | `lane-report`, `read-only`     | never                                      |
 * | `home` / `workspace` slots     | never                                      |
 * | no caller, unknown kind        | never                                      |
 *
 * Withheld means zero gateway tools: connectors, intents and file-declared
 * servers alike.
 *
 * The scope builders below produce the scopes consumers used to write by
 * hand, so a scope and the credential it mirrors cannot drift apart.
 */

import type {
  McpCallerBinding,
  McpCallerBindingKind,
  McpCallerCapability,
} from './mcp-caller-credentials.interface';
import type { McpGatewayScope } from './mcp-gateway.interface';

/**
 * The caller fields the policy reads. Both {@link McpCallerBinding} and
 * {@link McpGatewayScope} satisfy it structurally.
 */
export interface McpGatewayCaller {
  readonly kind: McpCallerBindingKind;
  readonly capability: McpCallerCapability;
  readonly gatewayApproval?: boolean;
  readonly includeConnectors?: boolean;
}

/** `true` when `caller` may list and call gateway tools at all. */
export function isGatewayCallerPermitted(
  caller: McpGatewayCaller | undefined,
): boolean {
  if (caller === undefined || caller.capability !== 'privileged') return false;
  switch (caller.kind) {
    case 'agent':
      return true;
    case 'session':
      return caller.gatewayApproval === true;
    case 'internal-query':
      return caller.includeConnectors === true;
    case 'home':
    case 'workspace':
      return false;
    default: {
      // Compile-time exhaustiveness; at run time an unknown kind (from an
      // untyped caller) stays denied.
      const unhandled: never = caller.kind;
      void unhandled;
      return false;
    }
  }
}

/**
 * Scope of an interactive Claude session: a privileged `session` caller with
 * `gatewayApproval`, the same shape as the credential the session options
 * builder mints when a gateway is bound.
 */
export function sessionGatewayScope(workspaceRoot: string): McpGatewayScope {
  return {
    kind: 'session',
    capability: 'privileged',
    workspaceRoot,
    gatewayApproval: true,
  };
}

/**
 * Scope of a privileged one-shot `internal-query` (cron and other host
 * queries). `includeConnectors` is set only when the run opted in; without
 * it the gateway shows no tools to this caller.
 */
export function internalQueryGatewayScope(
  workspaceRoot: string,
  includeConnectors: boolean,
): McpGatewayScope {
  return {
    kind: 'internal-query',
    capability: 'privileged',
    workspaceRoot,
    ...(includeConnectors ? { includeConnectors: true } : {}),
  };
}

/**
 * Gateway scope copied from a caller binding. `workspaceRoot` overrides the
 * binding's own root when given. Fields absent from the binding stay absent;
 * the token-only fields (ids, tool profile, phase) are never copied.
 */
export function gatewayScopeFromBinding(
  binding: McpCallerBinding,
  workspaceRoot?: string,
): McpGatewayScope {
  const root = workspaceRoot ?? binding.workspaceRoot;
  return {
    kind: binding.kind,
    capability: binding.capability,
    ...(root !== undefined ? { workspaceRoot: root } : {}),
    ...(binding.gatewayApproval !== undefined
      ? { gatewayApproval: binding.gatewayApproval }
      : {}),
    ...(binding.includeConnectors !== undefined
      ? { includeConnectors: binding.includeConnectors }
      : {}),
  };
}
