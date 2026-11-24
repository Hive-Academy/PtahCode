# Backend implementation — `TASK_2026_979_9e1f`, batch 1 (P1-B1, Contracts C1)

**Tasks completed**: Task 1.1 (port, token, binding flags, status source)

## Files

- CREATED `libs/backend/platform-core/src/interfaces/mcp-gateway.interface.ts` — `IMcpGateway` port plus
  plain-JSON types `McpGatewayScope`, `McpGatewayTool`, `McpGatewayCallResult`,
  `McpGatewayServerState`, `McpGatewayServerStatus`. The header doc states the Hub 6 caller policy
  and names where it is enforced (`listTools`/`callTool` are authoritative; the PreToolUse gates are
  the client-side half, as Hub 10 describes).
- MODIFIED `libs/backend/platform-core/src/interfaces/mcp-caller-credentials.interface.ts` — adds the
  optional `gatewayApproval?` and `includeConnectors?` fields to `McpCallerBinding`. Each doc names
  its enforcing sites (the gateway approval gate or the one-shot PreToolUse hook, plus `IMcpGateway`).
- MODIFIED `libs/backend/platform-core/src/di/tokens.ts` — adds
  `PLATFORM_TOKENS.MCP_GATEWAY = Symbol.for('PlatformMcpGateway')` next to the other MCP tokens.
- MODIFIED `libs/backend/platform-core/src/index.ts` — adds a type-only export of the six gateway types.
- MODIFIED `libs/shared/src/lib/types/messages/session-mcp-status.ts` — adds
  `source?: 'cli' | 'ptah-gateway'` to `SessionMcpServerEntry`.

No runtime code was added. Every new field is optional, so no existing producer changes.

## Stack observed

- The port style follows `IMcpServerStatus` and `IMcpCallerCredentials` in
  `platform-core/src/interfaces/`.
- Tokens are `Symbol.for` entries in `PLATFORM_TOKENS` (`di/tokens.ts:128-135`).
- The barrel uses `export type` blocks (`index.ts:166-182`).
- `Disposable` maps to the existing `IDisposable` in `types/platform.types.ts:12`.

## Verification (focused checks, as the brief requires; logs are in `.ptah/tmp/b1-*.log`)

- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json` (renderer typecheck, M1):
  exit 0.
- `npx eslint <5 changed files>`: exit 0, no errors.
  - `@nx/enforce-module-boundaries` was skipped ("No cached ProjectGraph is available"). The `nx`
    lint target will cover it.
- `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/usage-contracts.spec.ts`:
  1 suite and 2 tests passed. It is the only platform-core spec that references `PLATFORM_TOKENS`.
- Not run, for the orchestrator: the batch's `npm run verify` commands, including
  `-t typecheck-templates -p ptah-extension-webview`. The brief limits this executor to focused
  `jest`/`tsc`/`eslint`.
  - Templates are not affected: the change only adds an optional field to a shared interface.

## Decisions

- **`status(scope)` is synchronous.** It returns `McpGatewayServerStatus[]`.
  - Options: synchronous, or `Promise`.
  - Evidence: the contract writes `status(scope)` as returning an array. It marks only
    `servedFileServerNames` as a `Promise`. Hub 8 has `StreamTransformer` append the entries inline,
    and Hub 3 keeps status in a cache.
  - Reversible: yes; only C2 and later consumers depend on it.
- **Return types the contract left open.**
  - `listTools` returns `Promise<readonly McpGatewayTool[]>`.
  - `callTool` returns `Promise<McpGatewayCallResult>`. The type has an index signature so upstream
    results pass through unchanged (Hub 5).
  - `args` is `Readonly<Record<string, unknown>>`.
  - `onToolsChanged(listener: () => void): IDisposable`.
  - Reversible: yes.

## Plan deviations

None.

## Out-of-scope observations

None.
