# Fix-round F1: platform-core shared gateway policy, scope builders, prefix

Findings addressed: code-style-review S1 (shared policy function and scope builders) and S2 (the `mcp__ptah__` prefix constant).
Write set: `libs/backend/platform-core` only. `IMcpGateway` is unchanged. No consumer was edited.

## Files

- CREATED `libs/backend/platform-core/src/interfaces/mcp-gateway-caller-policy.ts`: the policy and the scope builders.
- CREATED `libs/backend/platform-core/src/interfaces/mcp-gateway-caller-policy.spec.ts`: the full matrix (5 kinds x 3 capabilities x 3 `gatewayApproval` values x 3 `includeConnectors` values = 135 rows), plus unknown kind, unknown capability, `undefined`, and the builders.
- CREATED `libs/backend/platform-core/src/interfaces/ptah-mcp-tool-name.ts`: the prefix constant and its helpers.
- CREATED `libs/backend/platform-core/src/interfaces/ptah-mcp-tool-name.spec.ts`
- MODIFIED `libs/backend/platform-core/src/index.ts`: exports the new symbols, after the `mcp-gateway.interface` exports.

## New exports (`@ptah-extension/platform-core`)

```ts
export interface McpGatewayCaller {            // type export
  readonly kind: McpCallerBindingKind;
  readonly capability: McpCallerCapability;
  readonly gatewayApproval?: boolean;
  readonly includeConnectors?: boolean;
}
export function isGatewayCallerPermitted(caller: McpGatewayCaller | undefined): boolean;
export function sessionGatewayScope(workspaceRoot: string): McpGatewayScope;
export function internalQueryGatewayScope(workspaceRoot: string, includeConnectors: boolean): McpGatewayScope;
export function gatewayScopeFromBinding(binding: McpCallerBinding, workspaceRoot?: string): McpGatewayScope;

export const PTAH_MCP_TOOL_PREFIX = 'mcp__ptah__';
export function hasPtahMcpToolPrefix(name: string): boolean;
export function stripPtahMcpToolPrefix(name: string): string;   // strips once; other names unchanged
export function withPtahMcpToolPrefix(name: string): string;    // no double prefix
```

`McpCallerBinding` and `McpGatewayScope` both fit `McpGatewayCaller` structurally. The spec checks this with a full binding.

## Semantics check (S1)

I compared `isGatewayScopePermitted` (cli-agent-runtime `gateway-caller-policy.ts`) with `isGatewayCallerPermitted` (vscode-lm-tools `mcp-caller-policy.ts`). They give the same result for every input:

- Both deny `undefined` and any capability other than `privileged`.
- With `privileged`: `agent` is allowed, `session` needs `gatewayApproval === true`, `internal-query` needs `includeConnectors === true`, and every other kind is denied.
- The only difference is form. The first uses an exhaustive `never` switch; the second uses `default: false`.

The new function keeps the `never` switch, so a new kind fails to compile here, and adds the `default` deny for untyped callers at run time.

## Scope builders vs current literals

- `sessionGatewayScope(cwd)` matches `stream-transformer.ts:433-438`: `{kind:'session', capability:'privileged', workspaceRoot, gatewayApproval:true}`.
- `internalQueryGatewayScope(root, true)` matches `job-runner.ts:418-423`.
- `internalQueryGatewayScope(cwd, includeConnectors)` produces the same scope fields as the literal at `sdk-query-runner.service.ts:931-937`: `includeConnectors` is spread only when true. That site passes a binding to `IMcpCallerCredentials.issue`. The returned `McpGatewayScope` is structurally assignable to `McpCallerBinding`, since every field the binding requires is present.
- `gatewayScopeFromBinding(binding, root?)` matches `gatewayScopeOf` in `protocol-dispatcher.ts:643-655`. It copies kind, capability, workspaceRoot, gatewayApproval and includeConnectors, keeps absent fields absent, and never copies ids, tool profile or phase fields. An explicit `workspaceRoot` wins over the binding's own root.

## `'mcp__ptah__'` literal sites (not edited; for F2-F4 to adopt)

Code (backend):

- `libs/backend/agent-sdk/src/lib/helpers/compaction/tool-output-capper.ts:63`: `const PTAH_MCP_PREFIX`
- `libs/backend/agent-sdk/src/lib/permission/cron-tool-policy.ts:23`: `const PTAH_MCP_PREFIX` (also uses a strip at :164)
- `libs/backend/agent-sdk/src/lib/permission/gateway-approval-gate.ts:42`: `const PTAH_MCP_TOOL_PREFIX`; hook matcher `'mcp__ptah__.*'` at :45
- `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:79`: `const PTAH_MCP_TOOL_PREFIX`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:217`: hook matcher `'mcp__ptah__.*'`; inline `startsWith('mcp__ptah__')` at :234
- `libs/backend/agent-sdk/src/lib/permission/cron-approval-gate.ts:37`: matcher `'mcp__ptah__ptah_cron_.*'`
- `libs/backend/agent-sdk/src/lib/permission/plan-lane-tool-policy.ts:46`: template `` `mcp__ptah__${name}` ``, which `withPtahMcpToolPrefix` can replace
- `libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/mcp-gateway.service.ts:102`: `const HOST_PREFIX`; strip at :759, which `stripPtahMcpToolPrefix` can replace
- `libs/backend/cli-agent-runtime/src/lib/claude/lane-admission-gate.ts:18`: full name `'mcp__ptah__ptah_agent_report'`
- `libs/backend/session-organization/src/lib/session-auto-link.service.ts:495,514`: full-name comparisons

Frontend (cannot import a backend lib; listed only):

- `libs/frontend/chat/src/lib/services/artifacts/published-artifact.ts:15`
- `libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-output.component.ts:407`
- `libs/frontend/chat-ui/src/lib/utils/tool-target.utils.ts:409`

Comments only: `subagent-tool-allowlist.ts`, `extract-prompt.ts`, `resolve-prompt.ts`, `sdk-query-options-builder.ts:1435,1449`, `gateway-tool-naming.ts:5-15`, and `mcp-gateway.interface.ts:93`.

## Checks

- `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath <both new specs>`: 2 suites, 153 tests passed.
- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json`: exit 0, no output.
- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.spec.json`: exit 0, no output.
- `npx eslint <4 new files> libs/backend/platform-core/src/index.ts`: exit 0, no output.
- Logs: `.ptah/tmp/f1-*.log`. I did not run Nx or `npm run verify`; the coordinator owns those.

## Decisions

- **Name.** I named the function `isGatewayCallerPermitted`, as review S1 suggests. Rejected: keeping `isGatewayScopePermitted`. F3 must drop its local copy of the same name in `mcp-caller-policy.ts` and import this one, so the two names do not clash. Reversible.
- **Location.** The files sit in `src/interfaces/` next to `mcp-gateway.interface.ts`. Precedent: `resolveMcpSessionWiring` and `INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS` are runtime exports from the same folder. Reversible.
- **Extra helper.** I added `hasPtahMcpToolPrefix` beyond strip and add, because 4 listed sites use `startsWith` on the prefix. Reversible.
- **Hook matcher.** I did not add a constant for `'mcp__ptah__.*'`. It appears twice (`gateway-approval-gate.ts:45`, `sdk-query-runner.service.ts:217`), and F4 can derive it as `` `${PTAH_MCP_TOOL_PREFIX}.*` ``. Reversible.
