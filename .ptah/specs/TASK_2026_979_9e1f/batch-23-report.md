# Batch 23 report: P2 fix reserve

Executor: backend-developer (subagent). No git operations were run. The run was cut off once
(parent restart) and resumed from the uncommitted tree; every item below was re-checked after
the resume.

## Items

### 1. MUST: stdio children die on quit — DONE

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts`:
  `disposeAsync()` calls `this.gateway?.dispose()` after `stop()`. `stop()` does not, because a
  stop can be followed by a restart and `McpGateway.dispose()` is terminal.
- `apps/ptah-electron/src/activation/shutdown.ts`: new required dep `disposeMcpGateway`, run
  through `nonFatal('MCP gateway dispose', …)` right after `CLI registry dispose` (after the
  agent reap, so no lane can still call a stdio server). Both the inline and the deferred quit
  paths reach it.
- `apps/ptah-electron/src/main.ts`: `disposeMcpGateway` resolves `PLATFORM_TOKENS.MCP_GATEWAY`
  only when `bootContainer?.isRegistered(…, true)`; otherwise a no-op.
- Specs: `http-mcp-server.service.spec.ts` (dispose on `disposeAsync`, not on `stop`);
  `shutdown.spec.ts` (new describe: order after SQLite close and before diagnostics; a throwing
  dispose does not stop the quit); `main.quit-path.spec.ts` (LIFO list gains
  `disposeMcpGateway` after `cliRegistry`); `main.metadata-flush.spec.ts` (dep added).

### 2. MUST: rpc-handlers TS2367 — DONE

- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts` (`chat:start`,
  `chat:continue`): the `'timeout'` "pending" branches are gone. `registered: false` now means
  the server is not ready, so `chat:start` starts without MCP and `chat:continue` resumes
  without it. Log lines no longer mention `.mcp.json`.
- The same B19 fallout broke the Electron and cli-engine typecheck through
  `libs/backend/gateway-chat-bridge/src/lib/gateway-turn-preparation.ts:223`; fixed the same way
  (outside the listed write set, needed for item 2's goal). Spec wording updated in
  `gateway-chat-bridge.spec.ts` and `chat-ptah-cli.service.spec.ts` (the latter used the removed
  `'lock-timeout'` literal and failed to compile under ts-jest).

### 3. MUST: Installed tab lists intent-store installs — DONE

- `libs/shared/src/lib/types/mcp-directory.types.ts`: new `McpServerOrigin` member
  `'ptah-intent'`.
- `libs/backend/harness-sync/src/lib/sources/mcp-intent-store.ts`: `filePath` getter.
- `libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.ts`:
  `listDeclarations` (and so `listInstalled` and the capability inventory) adds intent rows:
  the global record (`listFor('')`) and this workspace's own record (`targetsIn(…,'workspace')`
  with its config from `listFor(root)`), one row per target, `origin: 'ptah-intent'`, label
  `Ptah`, `removal: 'ptah-managed'`, `managedByPtah: true`, `configPath` = the store file, and
  the recorded `scope` (not re-classified). An unreadable store drops only these rows and logs
  through `warn` (`degradation-audit: optional-capability`). The `listInstalled` dedup identity
  now includes `target`, because intent rows share one file.
- Frontend (`libs/frontend/marketplace`): `server-ref.ts` (known origin),
  `provider-filtering.ts` (rank), `provider-row.ts` (`kindOf` → `config`; `sessionScopeOf` →
  `null`, since a session reaches it only inside `ptah`), `marketplace-inventory.store.ts`
  (`canMakeServerGlobal` accepts `ptah-intent`). Uninstall uses the existing `ptah-managed`
  path (`mcpDirectory:uninstall` with the row targets).
- Specs: `mcp-install.service.spec.ts` (new describe, 6 cases: workspace rows, global rows with
  and without a folder, both scopes with separate configs, row gone after uninstall, same rows in
  `listDeclarations`, unreadable store); `marketplace-inventory.store.spec.ts` (Make global for
  a workspace intent row, not for a global one).

### 4. MUST: instant refresh — DONE

- `libs/backend/platform-core/src/interfaces/mcp-gateway.interface.ts`: new
  `IMcpGateway.refresh(): Promise<void>`.
- `libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/mcp-gateway.service.ts` (and new
  `gateway/gateway-call-result.ts`):
  `refresh()` invalidates `GatewayServerSources` and re-reads every known root now
  (`refreshRoot` emits `onToolsChanged` for a changed set; new or unserved servers start
  loading). The poll shares the same `rereadKnownRoots()`. To keep the file under `max-lines`
  (700) the pure call-result helpers moved to the new `gateway/gateway-call-result.ts`.
- New `gateway/refresh-bound-gateway.ts` (`refreshBoundMcpGateway(container)`, exported from the
  lib barrel): resolves `PLATFORM_TOKENS.MCP_GATEWAY` per call, no-op when unbound.
- `McpInstallServiceOptions.onIntentsChanged`: called after a saved install, make-global and
  uninstall (not after an unsaved one). Wired with `refreshBoundMcpGateway(container)` in
  `mcp-directory-rpc.handlers.ts`, `harness-mcp-install.service.ts`, `plugin-rpc.handlers.ts`
  (external plugin installs) and `ptah-api-builder.service.ts` (the
  `ptah_harness_install_mcp_server` tool).
- `capability-rpc.handlers.ts`: optional `@inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional:
  true })`; `void this.gateway?.refresh()` after a saved `capabilities:setEnabled`.
- No new token, so `apps/ptah-electron/src/di/expected-resolvable.ts` is unchanged.
- Specs: `mcp-gateway.service.spec.ts` (`refresh (B23)`: fires at once on a toggle and on an
  added server, not when nothing changed, no read once disposed); `refresh-bound-gateway.spec.ts`;
  `mcp-install.service.spec.ts` (`onIntentsChanged`); `capability-rpc.handlers.spec.ts` (refresh
  after a saved toggle, none after a rejected write). Fake gateways in `job-runner.spec.ts`,
  `protocol-dispatcher.spec.ts` and `http-mcp-server.service.spec.ts` gained `refresh`.

### 5. harness-namespace.builder — DONE

- `harness-namespace.builder.ts`: `HarnessMcpInstallOutcome.installedPaths` replaced by
  `recordedTargets` (targets whose intent was saved). The log line says "recorded", the deferred
  note no longer says files are written, and the workspace/home-target refusals no longer say
  "write". Tool description (`tool-description.builder.ts`) and `system-namespace.builders.ts`
  say the server is recorded and served through `ptah`, no file written. The effective-tool-list
  schema-hash snapshot was updated for the changed `ptah_harness_install_mcp_server` schema
  descriptions (3 snapshots).
- Specs: `harness-namespace.builder.spec.ts`, `protocol-dispatcher.spec.ts`.

### 6. Inventory row 20 — DONE

- `plugin-config-source-resolver.ts`: the `mcpIntents` ctor param, the read and the state field
  are gone; `createPluginConfigSourceResolver(readerFactory, layout?, agentModelsFactory?)`.
  `harness-source.port.ts`: `HarnessSourceState.mcpIntents` removed. An unreadable intent store
  therefore no longer fails a reconcile (no target reads it).
- Callers: `apps/ptah-electron/src/di/phase-2-libraries.ts`,
  `libs/backend/cli-engine/src/lib/container.ts`,
  `rpc-handlers/.../wizard-generation.preview-fidelity.spec.ts`, plus harness-sync specs that
  passed a store or a `mcpIntents` field (capability-policy, plugin-gate, rival-targets
  agent-model, workspace-target overwrite-detach, destination-scanner, linked-worktree,
  gitignore, antigravity-mcp). `plugin-config-source-resolver.spec.ts`: the intent-scoping cases
  and the "unreadable store fails the pass" block are replaced by two cases pinning the new
  contract (no `mcpIntents` in the state; an unreadable store no longer fails the pass and
  `.mcp.json` is untouched).

### 7. Docs and wording — DONE (with one note)

- `platform-core/.../mcp-subagent-root-registrar.interface.ts` rewritten as a readiness port.
- `chat-ptah-cli.service.ts` comments and log lines; `ptah-mcp-url.ts` and `codex-ptah-mcp.ts`
  no longer name the deleted `ptah-mcp-slots.ts`; `harness-sync.types.ts` no longer cites
  `mcp-facet-planner.ts`.
- MCP-key wording changed together: shared `harness-blocked-wording.ts` (opening clause; the
  `occupiedMcpKey` WARN reason removed from the reasons and the allowlist), its spec, the
  reconciler's pinned `action`, and the marketplace `harness-blocked-paths.component.ts`
  **inline Angular template** (the coordinator should run `typecheck-templates`).
- `McpCallerTokenRegistry.preparePersistent` NOT removed: it still has a caller
  (`reconcilePersistent`, same file) and specs. Note: `issuePersistent`, `preparePersistent` and
  `reconcilePersistent` have no production caller; a follow-up can remove the family.

## Verification

All focused, under `node scripts/verify.mjs --exec --task b23 -- …`, logs in `.ptah/tmp/b23-*.log`.

Typecheck (`npx tsc --noEmit --project <p>/tsconfig.lib.json`, `tsconfig.app.json` for Electron):

| Project | Result |
| --- | --- |
| shared, platform-core, harness-sync, codex-runtime, vscode-lm-tools, rpc-handlers, marketplace, gateway-chat-bridge | PASS, 0 errors |
| cli-agent-runtime | PASS, 0 errors (re-run after the `gateway-call-result.ts` split) |
| apps/ptah-electron (`tsconfig.app.json`), cli-engine | PASS, 0 errors after the gateway-chat-bridge fix (each had 1 TS2367 before it) |
| spec tsconfigs: shared, harness-sync, cli-agent-runtime, gateway-chat-bridge, cron-scheduler | PASS, 0 errors |
| spec tsconfig: apps/ptah-electron | NOT COMPLETED: node ran out of memory (exit 134) |
| spec tsconfigs: rpc-handlers, vscode-lm-tools | not run (too large; every changed spec compiled under ts-jest) |

Jest (`npx jest --config <p>/jest.config.ts --runInBand --coverage=false --runTestsByPath …`):

| Project | Specs | Result |
| --- | --- | --- |
| cli-agent-runtime | mcp-install.service, gateway/mcp-gateway.service, gateway/refresh-bound-gateway, gateway/server-sources, capabilities/capability-resolver.service | PASS 208/208, 5 suites (final run, after the split) |
| harness-sync | plugin-config-source-resolver, destination-scanner, reconciler antigravity-mcp / capability-policy / gitignore / linked-worktree / plugin-gate / blocked-logging, rival-targets.agent-model, workspace-target.overwrite-detach, agent-workspace-scope | PASS 117/117, 11 suites; re-run of resolver + antigravity after lint tidy-up PASS 30/30 |
| shared | harness-blocked-wording | PASS 42/42 |
| rpc-handlers | capability-rpc, mcp-directory-rpc, plugin-rpc, harness-mcp-install, chat-ptah-cli, 9 chat/session suites, wizard-generation.preview-fidelity | PASS 437/437 in 14 suites; chat-ptah-cli failed to compile on the pre-existing `'lock-timeout'` literal, fixed, re-run PASS 28/28 |
| gateway-chat-bridge | gateway-chat-bridge | PASS 79/79 |
| vscode-lm-tools | http-mcp-server.service (+ concurrency), harness-namespace.builder, protocol-dispatcher, effective-tool-list | 573/577 on first run: 1 known Windows symlink EPERM (protocol-dispatcher D15, pre-existing) and 3 effective-tool-list snapshot diffs from the changed install-tool schema; snapshot updated (`-u`, that spec only), re-run PASS 10/10 |
| cron-scheduler | job-runner | PASS 25/25 |
| apps/ptah-electron | activation/shutdown, main.quit-path, main.metadata-flush | PASS 65/65, 3 suites |
| marketplace | marketplace-inventory.store, provider-filtering, provider-row, server-ref, harness-blocked-paths | PASS 281/281; inventory store re-run after the new case PASS 82/82 |

ESLint (`npx eslint <all 62 changed .ts files>`): 0 errors, 22 warnings. All of them were
there before this batch (`max-lines` on files that were already over the limit,
`preserve-caught-error`, `no-useless-assignment`, one non-null assertion). `mcp-gateway.service.ts`
went over `max-lines` (711) after the refresh was added; the helper split brings it back
under, and a re-run of eslint on the gateway files and the tidied specs is clean.

Not run: `typecheck-templates`. `harness-blocked-paths.component.ts` has an inline-template
change, so the coordinator should run it.

## Left open / out of scope

- Repair-dialog wording for MCP-key blocked items (`harness-blocked-wording.ts:192,:317`,
  `blocked-repair.service.ts:530`, `harness-repair-dialog.component.ts:53`) still describes a
  server-key occupant; that case can no longer arise. Not in the B23 list.
- In a linked worktree the Installed tab shows the worktree's own and global intents, not the
  main checkout's workspace intents (the gateway serves both). Follow-up if wanted.
- Skipped as instructed: the "Follow-up only" bullets (`upstream-client` helper export, dead
  frontend `'direct'` paths, shared `force` param, old result codes, `_reconciler` ctor slot).
- `rpc-handlers` and `vscode-lm-tools` spec tsconfigs were not run (too large; ts-jest compiled
  every changed spec); `apps/ptah-electron/tsconfig.spec.json` ran out of memory (exit 134).
