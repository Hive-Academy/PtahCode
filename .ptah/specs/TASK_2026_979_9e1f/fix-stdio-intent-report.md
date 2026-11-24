# Fix: workspace-scoped stdio install never served (TASK_2026_979_9e1f)

Live symptom: `ptah_harness_install_mcp_server` with `scope: 'workspace'`, a stdio config and
`targets: ['claude']` recorded the intent correctly. The gateway still did not list the server,
did not spawn it and logged nothing about it.

## Root cause

The capability policy denied the server, and the gateway drops a denied server without logging
it. The intent store, sources, dedupe, stdio host and DI wiring are all correct.

1. `McpInstallService.listDeclarations` adds a workspace intent row with `origin: 'ptah-intent'`
   and the scope it was recorded in, `scope: 'workspace'`
   (`libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.ts:404-413`,
   rows built at `:540-597`). Batch 23 added these rows so the Installed tab could show them, and
   the scope is deliberately not re-classified.
2. `mcpRows` passes only the declaration scopes to `defaultEnabled`
   (`libs/backend/cli-agent-runtime/src/lib/capabilities/capability-policy-model.ts:177` before the
   fix).
3. `defaultEnabled` gives an MCP name with no `global` scope
   `{ enabled: false, reason: 'repository-only' }`
   (`libs/shared/src/lib/types/capability-toggle.types.ts:154-160` before the fix). That default
   exists so a cloned repository's `.mcp.json` cannot start a server. A Ptah intent is the user's
   own record in `~/.ptah/mcp-installed.json`, not a repository file.
4. `toEffectiveSet` puts every row that is not enabled into `deniedMcpServers`
   (`capability-policy-model.ts:366-374`).
5. `McpGateway.readRoot` drops every endpoint that fails `isMcpServerEnabled`, and logs nothing
   when it does (`libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/mcp-gateway.service.ts:481-485`).
   No state is created, so nothing spawns and no load, failure or skip line is logged.

`livecheck` was served because it has an explicit workspace "on" toggle. That toggle also makes
it an approved project server. `stdiocheck` had only its default, so it was OFF. This hits every
workspace-scoped intent, http included, not only stdio. Global intents were not affected
(`scope: 'global'` gives the `user-scope` default, ON).

The marketplace `mcp:install` RPC takes the same path. `mcp-directory-rpc.handlers.ts:558` and
`harness-mcp-install.service.ts:125` both call `McpInstallService.install(..., 'workspace')`, so
both record the same workspace bucket and hit the same deny.

## Fix

- `libs/shared/src/lib/types/capability-toggle.types.ts`: the `mcp` variant of
  `CapabilityDefaultInput` has a new optional field, `installedByPtah`. When it is set,
  `defaultEnabled` returns `{ enabled: true, reason: 'user-scope' }`. The doc of the `user-scope`
  reason now covers it. I reused the existing reason, so the renderer's `Record` over the reasons
  (`capability-toggle.component.ts:366`) did not need a change.
- `libs/backend/cli-agent-runtime/src/lib/capabilities/capability-policy-model.ts`: `mcpRows`
  marks a name that has any `origin === 'ptah-intent'` declaration and passes `installedByPtah` to
  `defaultEnabled`. The row keeps its `workspace` scope, so the Installed tab and the
  `approvedProjectMcpServers` rule are unchanged. An explicit workspace or global OFF still wins
  over the default.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| A Ptah intent defaults ON whatever its scope | (a) default ON via a new input flag; (b) re-classify intent rows as `global` in `listDeclarations`; (c) leave it OFF and require a toggle | `McpInstallService.install` doc: "`workspace` (the default) records the install against this workspace only, so the gateway serves it in this workspace alone". (b) would undo batch 23's display scope. (c) contradicts the install contract. | yes |
| Reuse the `user-scope` reason | new `ptah-install` reason / reuse | A new reason changes the renderer's `Record<CapabilityDefaultReason, boolean>` and its spec. The record lives in the user's home folder, which is a user-scope source. | yes |

## Regression spec

`libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/gateway-stdio-intent.spec.ts` (new)
runs the whole path with real parts. Only the stdio process is faked.

- The real `McpInstallService.install(..., 'workspace')`, which both entry points call, writes to
  a temp `mcp-installed.json`. The spec asserts the live file shape: v2, a workspace bucket
  `{ root, targets: ['claude'], config }` and no global record.
- The real policy path is used, without the resolver's I/O: `listDeclarations` -> `mcpRows` ->
  `toEffectiveSet`. The spec asserts `status: 'verified'` and that `stdiocheck` is not in
  `deniedMcpServers`.
- A real `GatewayServerSources` (real `McpIntentStore`) and a real `McpGateway` run with a fake
  stdio host. The spec asserts that the first `tools/list` creates one client with
  `cwd === root`, calls its `listTools` once and returns `['stdiocheck__echo']`.

I confirmed that the spec fails without the fix: with `installedByPtah` forced to `false`, it
fails on `Expected value: not "stdiocheck" / Received array: ["stdiocheck"]`
(`.ptah/tmp/stdio-bug-jest-nofix.log`). With the fix it passes.

`libs/shared/src/lib/types/capability-toggle.types.spec.ts` has a new case: a workspace-scoped
Ptah install is ON with reason `user-scope`.

## Checks (all under `node scripts/verify.mjs --exec --task stdio-bug`)

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath`
  on `gateway-stdio-intent.spec.ts`, `capability-resolver.service.spec.ts`,
  `mcp-install.service.spec.ts`, `mcp-gateway.service.spec.ts` and `server-sources.spec.ts`:
  5 suites, 221 tests passed.
- `npx jest --config libs/shared/jest.config.ts ... capability-toggle.types.spec.ts`: 34 passed.
- `npx tsc --noEmit` passed (exit 0) for `libs/backend/cli-agent-runtime/tsconfig.lib.json`,
  `libs/backend/cli-agent-runtime/tsconfig.spec.json` and `libs/shared/tsconfig.lib.json`.
- `npx eslint` on the 4 changed files: clean. `prettier --check` is clean after formatting the
  new spec.
- Not run: `npm run verify`, nx, the renderer's `capability-toggle.component.spec.ts` (its inputs
  per reason are unchanged) and the Electron typecheck. The coordinator's gate should run them for
  `shared`, `cli-agent-runtime`, `marketplace` and `ptah-electron`.

## Out of scope, not changed

- `McpGateway.readRoot` drops a policy-denied server with no log line, which is why this failure
  left no trace. A debug line (server name only) at `mcp-gateway.service.ts:481-485` would make
  the next failure like this visible. That file is close to its 700-line limit.
- The fix means an agent's workspace-scoped stdio install now runs without a toggle, as a global
  intent already did. That is the S6 question the P2 review left to the orchestrator: whether an
  agent-created stdio intent needs user approval.
