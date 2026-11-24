# Batch 18 report: install records intent only (C12c)

Task: TASK_2026_979_9e1f. Executor: backend-developer subagent. Worktree:
`D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity`. Git was not touched.

## Files

Write set (batch 18 plus the decision row 38 amendment):

- MODIFIED `libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.ts`.
  `install`, `makeGlobal` and `uninstall` change the intent store only. Removed:
  `reconcileTargets`, `removeUnowned` (force path), `verifyRemoved`, `inLinkedWorktree`,
  `skippedForWorktree`, `MCP_LINKED_WORKTREE_SKIP_COPY` and `McpUninstallOptions.force`.
  The service makes no reconciler call and no facet `write` or `remove` call. A success
  result is `{ target, configPath: '', success: true }`. An uninstall target that was never
  recorded fails with fixed copy ("was not installed by Ptah ... remove an entry you added
  yourself"). A harness-config row that Ptah does not own is now `removal: 'none'` with a
  `removalBlockedReason` for removing it by hand (D2). It was `'direct'` before.
  `listDeclarations`, `inspect`, `getConfigPath`, `listInstalled` and the claude-user,
  Smithery and OAuth rows are unchanged.
- MODIFIED `.../mcp-directory/mcp-install.service.spec.ts`. New intent-only cases check
  the recorded intent, zero reconciler calls and no file except the intent store (a
  directory walk). Removed the force, reconcile-failure, write-failure and worktree-skip
  cases. 61 tests.
- MODIFIED `libs/backend/rpc-handlers/src/lib/harness/io/harness-mcp-install.service.ts` (+ spec).
  `HarnessMcpInstallOutcome.installedPaths` is replaced by `recordedServers` (server keys).
  Results no longer claim config paths.
- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/external-plugin-mcp.service.ts` (+ spec).
  Doc comments and copy now say "record" and "the gateway serves" instead of
  "reconcile" and "write". "could not be written to X" is now "could not be recorded for X".
  The collision warning says Ptah does not edit the file.
- MODIFIED `libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts` (+ spec).
  The "What Apply Writes" line for `.mcp.json` and `.vscode/mcp.json` now reads: "MCP servers —
  no config file is written ... Ptah serves it to every session and CLI lane through its own
  `ptah` MCP server." A new spec case checks that neither path appears in the prompt.

Outside the listed write set. These were needed to compile after the D2 and G1 changes. All
are in rpc-handlers, which no other batch edits:

- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/mcp-directory-rpc.handlers.ts`. Removed
  `force` from the uninstall call and from the log line.
- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/mcp-directory-rpc.schema.ts`. Removed
  `force` from `UninstallMcpSchema`. The schema is non-strict, so a stale `force` from the
  webview is stripped.
- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts` (+ spec).
  `harness:apply` no longer pushes MCP paths into `appliedPaths`. Prettier also reformatted
  older unformatted lines in this file and its spec. lint-staged would make the same change.

Nothing in `libs/backend/harness-sync/**` (B16) or in the vscode-lm-tools slot writer and
http server (B19) was touched.

## Gateway read path (an intent recorded here is what the gateway serves)

- `McpInstallService` writes `new McpIntentStore()`, which is the default
  `~/.ptah/mcp-installed.json`. The RPC handler, harness apply, plugin installs and
  `ptah-api-builder` all pass `undefined` or no store.
- The gateway binding `libs/backend/cli-agent-runtime/src/lib/di/register.ts:627` gives
  `GatewayServerSources` `intents: new McpIntentStore()`. That is the same default file.
- `gateway/server-sources.ts:259` → `intentCandidates(root)` (`:375-390`) calls
  `intents.listFor(root)`. It reads the workspace root and the main checkout root of a linked
  worktree. Each intent's config becomes an `intent` candidate, source 2 in precedence.
  `listFor('')` returns the global intents, and the new spec case checks this.
- Caching: `GatewayServerSources` caches each root for 30 s
  (`GATEWAY_SOURCES_CACHE_MS`). An install does not call `invalidate()`, so a new intent is
  served on the next resolve, up to 30 s later. See the follow-ups.

## Inventory rows covered (parity-inventory.md §4)

| Row | Result |
| --- | --- |
| 31 install | intent only, no reconciler, no facet write (spec "records the intent, writes no config file and never reconciles") |
| 32 makeGlobal | intent only (spec "makeGlobal promotes the record ... writing no config file") |
| 33 uninstall + verifyRemoved | intent forgotten, `verifyRemoved` removed (spec "forgets a recorded intent and writes no config file") |
| 34 force uninstall | removed (D2). Spec "has no force path". RPC schema `force` removed. Unowned rows are `removal:'none'` with a hand-removal reason |
| 35 reconcileTargets | removed. A global install with no folder is now `success:true`: row 35 keeps `deferred` only where a workspace intent needs a root, and that case throws `McpIntentScopeError` first |
| 36 linked-worktree skip | removed with the writes (spec "needs no special case") |
| 37 intent store | unchanged |
| 38, 39 listing and getConfigPath | unchanged, except the unowned-row removal kind (D2, see Deviations) |
| 40 RPC callers | result shape follows. `force` dropped from the uninstall RPC |
| 41 harness apply | reports `recordedServers`, not paths |
| 42 external plugin | intent only through `McpInstallService`. Copy updated |
| 43 `ptah_harness_install_mcp_server` | still records an intent (no change; see the follow-up on `installedPaths`) |
| 44 workflow prompt | text updated, spec added |

## Decisions

- **Deferred contract (decision row 31).** The shared `deferred` field and the webview's
  separate count stay as they are. `ExternalPluginMcpService.collectFailures` still skips
  deferred results. `McpInstallService` no longer returns a deferred result: inventory rows
  35 and 36 remove both the no-folder deferral for global intents and the worktree skip.
  Reversible.
- **Constructor `_reconciler` slot kept.** The first parameter stays and is never used, so
  five callers compile unchanged during the concurrent batches:
  `mcp-directory-rpc.handlers.ts`, `plugin-rpc.handlers.ts`, `harness-mcp-install.service.ts`,
  `vscode-lm-tools ptah-api-builder.service.ts` and `cli-agent-runtime di/register.ts`.
  One of them is in vscode-lm-tools, which B19 was editing. B23 should drop the parameter
  from all five. Reversible.
- **`configPath: ''`** for every result, because no file is written. The shared
  `McpInstallResult.configPath` is still required, so the type was not changed.

## Deviations

- One list case changed even though the acceptance says "list spec unchanged". The first
  `listInstalled` case expected `removal: 'direct'`. D2 and inventory row 34 replace that
  with removal instructions, so it now expects `'none'` plus `removalBlockedReason`.
  Every other list and declaration case is unchanged.
- Three rpc-handlers files outside the listed write set were edited (see Files). They were
  needed to compile once `force` and `installedPaths` were removed.

## Verification (focused, under `node scripts/verify.mjs --exec --task b18`)

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath mcp-install.service.spec.ts capability-resolver.service.spec.ts gateway/server-sources.spec.ts` | PASS: 3 suites, 150 tests (mcp-install alone: 61/61) |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts ... harness-mcp-install, external-plugin-mcp, harness-workflow-prompt, harness-rpc.handlers, mcp-directory-rpc.handlers, plugin-rpc.handlers specs` | PASS: 6 suites, 291 tests |
| `npx tsc --noEmit -p libs/backend/cli-agent-runtime/tsconfig.lib.json` | PASS, 0 errors |
| `npx tsc --noEmit -p libs/backend/cli-agent-runtime/tsconfig.spec.json` | PASS, 0 errors |
| `npx tsc --noEmit -p libs/backend/rpc-handlers/tsconfig.lib.json` | FAIL, 2 errors, both outside B18: `chat/session/chat-session.service.ts:1235,2057` TS2367 (`'"not-started" \| undefined'` vs `'"timeout"'`). This looks like the B19 readiness-port change. No B18 file has an error |
| `npx tsc --noEmit -p libs/backend/rpc-handlers/tsconfig.spec.json` | NOT RUN TO COMPLETION: node ran out of memory (exit 134). ts-jest compiled all 6 specs |
| `npx eslint <12 changed files>` | PASS: 0 errors, 3 warnings, all pre-existing (`max-lines` on harness-rpc.handlers.ts and mcp-directory-rpc.handlers.ts, `preserve-caught-error` at mcp-directory-rpc.handlers.ts:906) |

No catch block was added. The `getConfigPath` catch keeps its `degradation-audit` marker.
The batch's `npm run verify` gate commands are for the coordinator.

Logs: `.ptah/tmp/b18-car-jest.log`, `b18-car-jest2.log`, `b18-rh-jest.log`, `b18-car-tsc.log`,
`b18-car-tsc-spec.log`, `b18-rh-tsc.log`, `b18-rh-tsc-spec.log`, `b18-eslint.log`.

## Out-of-scope observations (for B23)

1. **The Installed tab does not show a new install.** `listInstalled` reads config files,
   `~/.claude.json`, Smithery and OAuth, but never the intent store. A server installed from
   now on is written to no file, so it gets no row. This is a parity gap: the gateway serves
   it, but the UI does not list it. Fixing it needs an intent-row source and likely a new
   `McpServerOrigin` in shared and the webview. It was not done here because the acceptance
   pins the list spec.
2. The gateway is not invalidated on install or uninstall, so a change can take up to 30 s
   (`GATEWAY_SOURCES_CACHE_MS`). Fix: a hook from `McpInstallService` or from the RPC
   handler into `PLATFORM_TOKENS.MCP_GATEWAY` sources `invalidate()`.
3. In vscode-lm-tools, `harness-namespace.builder.ts:1120-1145` still pushes
   `result.configPath` (now `''`) into `installedPaths`. Its log line and its deferred note
   still say "written" and "config files are written when you open a folder".
4. Dead after B18: the frontend `removal === 'direct'` paths (`chat-ui installed-mcp-removal.ts:61,76`,
   `marketplace provider-row.ts:476`, `marketplace-inventory.store.ts:989`) and the shared
   `McpDirectoryUninstallParams.force`. Also the shared `MCP_INSTALL_RESULT_COPY` codes
   `reconciler-unavailable`, `reconcile-failed`, `write-failed`, `config-unresolved`,
   `remove-failed` and `deferred-no-workspace`. The last one's copy says "Config files are
   written when you open a folder".
5. B23 should remove the constructor `_reconciler` slot from the five callers named under
   Decisions.
6. rpc-handlers lib typecheck: 2 TS2367 errors in `chat-session.service.ts` (see Verification).
