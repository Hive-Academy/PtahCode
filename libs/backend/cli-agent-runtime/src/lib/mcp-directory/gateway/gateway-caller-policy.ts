/**
 * Gateway caller policy: which MCP callers may see and call gateway tools.
 *
 * This is the authoritative check. `IMcpGateway.listTools` and `callTool`
 * apply it on every path, even when a client-side gate was bypassed. The
 * dispatcher's `isGatewayCallerPermitted` (vscode-lm-tools
 * `mcp-caller-policy.ts`) mirrors the same matrix only to skip asking the
 * gateway for callers that get nothing; keep the two in step.
 *
 * | Caller                         | Gateway tools when                         |
 * | ------------------------------ | ------------------------------------------ |
 * | `session` (Claude session)     | `privileged` and `gatewayApproval: true`   |
 * | `internal-query` (cron, other) | `privileged` and `includeConnectors: true` |
 * | `agent` (CLI lane)             | `privileged`                               |
 * | `lane-report`, `read-only`     | never                                      |
 * | `home` / `workspace` slots     | never                                      |
 *
 * Withheld means zero gateway tools: connectors, intents and file-declared
 * servers alike.
 */

import type { McpGatewayScope } from '@ptah-extension/platform-core';

/** `true` when `scope` may list and call gateway tools at all. */
export function isGatewayScopePermitted(
  scope: McpGatewayScope | undefined,
): boolean {
  if (scope === undefined || scope.capability !== 'privileged') return false;
  switch (scope.kind) {
    case 'agent':
      return true;
    case 'session':
      return scope.gatewayApproval === true;
    case 'internal-query':
      return scope.includeConnectors === true;
    case 'home':
    case 'workspace':
      return false;
    default: {
      // Compile-time exhaustiveness; at run time an unknown kind (from an
      // untyped caller) stays denied.
      const unhandled: never = scope.kind;
      void unhandled;
      return false;
    }
  }
}
