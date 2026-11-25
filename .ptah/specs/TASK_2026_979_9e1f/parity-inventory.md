# Parity inventory - TASK_2026_979_9e1f, Batch 15 (C12 first step)

Old surface: base commit `a4e0154ae`. Every `File:line` below is a line at that commit, read
with `git show a4e0154ae:<path>`. Where a P1 commit on `fix/mcp-connector-parity` moved or
changed the row, the "P1" note gives the current line at `HEAD` (`0a8b4f2b6`) and the commit.

Path prefixes: `HS` = `libs/backend/harness-sync/src/lib`, `CAR` = `libs/backend/cli-agent-runtime/src/lib`,
`MH` = `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http`,
`AD` = `CAR/cli-agents/cli-adapters`, `RH` = `libs/backend/rpc-handlers/src/lib`.

Approvals: decisions row 10 (Ptah stops writing native provider MCP config files; CLIs run
outside Ptah lose Ptah-managed servers; no opt-in export) and row 13 (agy stream-json lane loses
its spawn-time `ptah` write). Row 9 makes the gateway the hub for every MCP server. Row 14 and the
P1 commits added the linked-worktree no-write guard. Row 17 picks D-U5 Option 1 (leave pre-P2
entries on disk).

## 1. Harness-sync MCP facet writes (all targets)

| # | Capability | File:line (base) | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- | --- |
| 1 | Claude target plans `.mcp.json` entries (`planMcp` -> `planMcpFacet`) | `HS/targets/claude-target.ts:298-302`, `:356-366`; facet `HS/targets/mcp/mcp-facet.registry.ts:123-134` | remove (row 10) | Hub source = install intents (`CAR/mcp-directory/gateway/server-sources.ts:337` `intents.listFor(root)`) | B16: `claude-target.retirement.spec.ts` asserts no `kind:'mcp'` write or removal in the plan; gateway spec "intent server listed for session" |
| 2 | Claude target applies `.mcp.json` writes/removals (`applyMcpFacet`) | `HS/targets/claude-target.ts:443-446` | remove (row 10) | as row 1 | B16 fake-fs spec: zero writes to `{ws}/.mcp.json`. P1: now `:463` (8165ea635 added the guard around it) |
| 3 | Claude target counts desired MCP keys in `preflightKeys` | `HS/targets/claude-target.ts:157-168` (`desiredMcp`) | remove (row 10) | none | B16: preflight keys hold skills/commands only |
| 4 | Claude target declares facet `mcp: 'supported'` | `HS/targets/claude-target.ts:124` | remove (row 10): set `unsupported` or drop | none | B16 target facet spec; see Assumption A3 for the health UI |
| 5 | Workspace target plans MCP (`planMcp` -> `planMcpFacet`) | `HS/targets/workspace-target.ts:273-277`, `:534-546` | remove (row 10) | as row 1 | B16 `workspace-target.retirement.spec.ts`: no MCP plan rows. P1: now `:562` |
| 6 | Workspace target applies MCP (`applyMcpFacet`) | `HS/targets/workspace-target.ts:361-366` | remove (row 10) | as row 1 | B16 `rival-targets.no-mcp.spec.ts` (CREATE). P1: now `:383` |
| 7 | Codex target writes `~/.codex/config.toml` `[mcp_servers.*]` | `HS/targets/rival-targets.ts:128`, `:134`; `HS/targets/mcp/codex-toml-mcp-facet.ts` | remove (row 10) | Codex lanes: `-c mcp_servers.ptah.url` (`AD/codex/codex-lane-config.builder.ts:136-151`) | `rival-targets.no-mcp.spec.ts`; `codex-lane-config.builder.spec.ts` (existing) |
| 8 | Copilot target writes `~/.copilot/mcp-config.json` | `HS/targets/rival-targets.ts:146`, `:152`; registry `:70-80` | remove (row 10) | `--additional-mcp-config` `ptah` (`AD/copilot-sdk.adapter.ts:349-368`) | `rival-targets.no-mcp.spec.ts`; `copilot-sdk.adapter.spec.ts` |
| 9 | Cursor target writes `{ws}/.cursor/mcp.json` | `HS/targets/rival-targets.ts:164`, `:171`; registry `:81-90` | remove (row 10) | SDK `agentOptions.mcpServers.ptah` (`AD/cursor-cli.adapter.ts:422-434`) | `rival-targets.no-mcp.spec.ts`; `cursor-cli.adapter.spec.ts` |
| 10 | Antigravity target writes `~/.gemini/config/mcp_config.json` (reconcile) | `HS/targets/rival-targets.ts:179`, `:183`; registry `:51-69` | remove (row 10) | ACP `session/new.mcpServers` (`libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts:289`) | `rival-targets.no-mcp.spec.ts`; `harness-reconciler.antigravity-mcp.spec.ts` rewritten to assert no write (B17) |
| 11 | OpenCode target writes `{ws}/opencode.json` `mcp` map | `HS/targets/rival-targets.ts:202`, `:206`; registry `:91-110` | remove (row 10) | `OPENCODE_CONFIG_CONTENT` (`AD/opencode-cli.adapter.ts:637-660`, `:747-756`) | `rival-targets.no-mcp.spec.ts`; `opencode-cli.adapter.spec.ts` |
| 12 | VS Code MCP target writes `{ws}/.vscode/mcp.json` (target exists only for MCP) | `HS/targets/rival-targets.ts:211-222`, listed `:233`; registry `:111-122`; exported `HS/../index.ts:157`, DI `HS/di/register.ts:60`, `:110`, `:125` | remove (row 10): the whole `createVscodeMcpTarget` and its DI registration | none (VS Code is not a Ptah-spawned provider) | B16: `createRivalTargets` returns no `vscode` target; DI smoke (`apps/ptah-electron/src/di/container.smoke.spec.ts`) still resolves |
| 13 | Skills, commands, agents copies and gitignore block in every target | `HS/targets/claude-target.ts`, `HS/targets/rival-targets.ts`, `HS/gitignore/gitignore-writer.ts` | keep | n/a | existing target, reconciler and `harness-reconciler.gitignore.spec.ts` specs pass unchanged |
| 14 | P1 linked-worktree guard for tracked skill/command/agent copies (`keepsTrackedCopy`) | not at base. P1 481c4f3fc: `HS/targets/linked-worktree-guard.ts`; used in `claude-target.ts:405-415`, `workspace-target.ts:326-336`, `:971-983` | keep (not MCP) | n/a | `harness-reconciler.linked-worktree.spec.ts` (skill/command cases) |

## 2. Planner, reconciler and manifest MCP handling

| # | Capability | File:line (base) | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- | --- |
| 15 | MCP facet planner: desired vs manifest vs actual per server key; `foreign`/`blocked` on unowned keys | `HS/targets/mcp/mcp-facet-planner.ts:91-170` | remove (row 10) | none | B17 spec "no MCP plan rows"; `rg -n "planMcpFacet\|applyMcpFacet" libs/backend` empty |
| 16 | Apply MCP writes/removals | `HS/targets/mcp/mcp-facet-planner.ts:191-241`, `writeFor` `:347` | remove (row 10) | none | as row 15 |
| 17 | Retired MCP key removal on proof (hash + git-tracking, D-2) | `HS/targets/mcp/mcp-facet-planner.ts:243-328` | remove (row 10, with the facets) | none; D-U5 Option 1 (row 17) leaves pre-P2 entries on disk | `mcp-facet-planner.retirement.spec.ts` deleted with the module (B17) |
| 18 | P1 C7 guard: empty plan / no apply in a linked worktree; owned-removal proof | not at base. P1 8165ea635: planner now `:111-114`, `:219-220`, `:285-286`, `applyOwnedMcpRemoval` `:369-432`, `insideGitCheckout` `:435` | remove (with the facets; implementation-plan C12) | none: no MCP writes anywhere, so no guard is needed | `mcp-facet-planner.linked-worktree.spec.ts` deleted with the module (B17) |
| 19 | Desired-state MCP list built from intents (`buildMcp`, `HarnessDesiredState.mcp`) | `HS/manifest/harness-manifest.builder.ts:377`, `:425-440`; `HS/manifest/desired-state.types.ts:66-82` | remove (row 10) | the gateway reads `McpIntentStore.listFor` directly (row 37) | B17: desired state has no `mcp` field; typecheck |
| 20 | Source resolver reads intents and retired MCP keys into the pass | `HS/sources/plugin-config-source-resolver.ts:203`, `:344-352`, `:362` (`readRetiredMcpServerKeys`); `HS/sources/harness-source.port.ts:70` | remove (row 10) | none | B17: source state has no `mcpIntents`/`mcpServerKeys`; `plugin-config-source-resolver.spec.ts` updated |
| 21 | Retired-sources `mcpServerKeys` plumbing | `HS/reconciler/harness-reconciler.service.ts:105`; `HS/targets/harness-target.port.ts:77`, `:85-86`, `:108-109` | remove (row 10) | none | typecheck of harness-sync |
| 22 | Capability-policy-unknown pass still applies MCP (`freezeToMcp`) | `HS/reconciler/harness-reconciler.service.ts:428-433`, `:670`, `:1117-1135` | remove (row 10): a frozen pass applies nothing | none | B17: `harness-reconciler.capability-policy.spec.ts` frozen pass writes nothing |
| 23 | `harness remove` builds MCP removals from manifest `mcp` rows | `HS/reconciler/harness-reconciler.service.ts:296-305` | remove (row 10) | none; old rows left per D-U5 Option 1 | `harness-reconciler.remove.spec.ts`: an old `kind:'mcp'` row produces no facet call |
| 24 | Preflight treats `#` fragment keys as hash-only | `HS/reconciler/harness-reconciler.service.ts:825-827`; `isMcpFragmentKey` `HS/targets/mcp/mcp-facet.port.ts:45` | move: B17 must keep pre-P2 `kind:'mcp'` manifest rows from making every preflight a non-no-op (`:815` compares `entries.length` to `expected.size`) | drop or ignore `kind:'mcp'` rows on load | B17 spec: a manifest that still holds an old `.mcp.json#x` row preflights as no-op (see Decision D1) |
| 25 | Manifest schema accepts `kind: 'mcp'` | `HS/manifest-store/managed-manifest.ts:61` | keep (read compatibility for pre-P2 manifests) | n/a | `harness-reconciler.manifest-recovery.spec.ts`: an old manifest with `mcp` rows still loads |

## 3. Harness health rows that read MCP config

`rg -n "mcp" libs/backend/harness-sync/src/lib/health` at base returns one line.

| # | Capability | File:line (base) | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- | --- |
| 26 | Destination scanner probe state carries `mcp: []` | `HS/health/harness-destination-scanner.ts:277` | remove (row 10) with the `HarnessDesiredState.mcp` field | none | typecheck; `harness-destination-scanner.spec.ts` unchanged |
| 27 | Blocked-row reason in MCP wording ("config file already defines this server key") | `HS/reconciler/harness-reconciler.service.ts:1078-1082` (`blockedReason`), `:1055-1071` | remove (row 10) once no target plans MCP | none | `harness-reconciler.blocked-logging.spec.ts`: no MCP-key reason |
| 28 | Blocked repair refuses an MCP fragment key (`not-a-path`) | `HS/repair/blocked-repair.service.ts:526-532` | remove (row 10) with row 27, or keep while a stale report can still name a `#` key (Decision D1) | none | `blocked-repair.service.spec.ts` |
| 29 | Install `writeFailed` per server key (`#<serverKey>`) mapped to per-target RPC results | `CAR/mcp-directory/mcp-install.service.ts:769-786` | remove (row 10) | intent result only (row 33) | `mcp-install.service.spec.ts` (B18) |
| 30 | Capability resolver gates session policy on facet read status (`listDeclarations().sourceStatus`) | `CAR/capabilities/capability-resolver.service.ts:365`, `:419`, `:599`; source `CAR/mcp-directory/mcp-install.service.ts:415-499` | keep (read-only, R5) | n/a | `capability-resolver.service.spec.ts` unchanged |

## 4. mcp-directory install and uninstall writes

| # | Capability | File:line (base) | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- | --- |
| 31 | `install`: record intent, then reconcile targets (writes native configs) | `CAR/mcp-directory/mcp-install.service.ts:222-251` | move (intent only) | hub serves intents (row 37) | B18 install spec: intent recorded, zero facet writes, no reconciler call. P1: now `:233` |
| 32 | `makeGlobal`: promote intent, reconcile home targets | `CAR/mcp-directory/mcp-install.service.ts:263-279` | move (intent only) | hub serves the global intent in every workspace | B18 spec: `makeGlobal` records the scope, writes nothing. P1: now `:274` |
| 33 | `uninstall`: forget intent, reconcile, then `verifyRemoved` re-reads config | `CAR/mcp-directory/mcp-install.service.ts:311-351`, `:635-664` | move (intent only); `verifyRemoved` removed | hub stops serving the forgotten intent | B18 spec: intent forgotten, no facet call. P1: now `:322`, `:655` |
| 34 | `force` uninstall deletes a user-owned key from a native config (`removeUnowned`) | `CAR/mcp-directory/mcp-install.service.ts:596-626` | remove (row 10) | none: the Installed tab gives removal instructions for `harness-config` rows that Ptah does not own, as it already does for `~/.claude.json` rows (`:501-530`) | B18 spec: `force:true` on an unowned key makes no facet call. P1: now `:607` with the worktree skip (8165ea635). See Decision D2 |
| 35 | `reconcileTargets`: no-folder defer, no-reconciler failure, reconcile pass | `CAR/mcp-directory/mcp-install.service.ts:718-786` | remove (row 10) | intent result only; the no-folder `deferred` contract stays only where a workspace-scoped intent still needs a root (decision row 31) | B18 spec. P1: now `:773`, with the linked-worktree skip `:790-792` |
| 36 | P1 linked-worktree skip in install (`inLinkedWorktree`, `skippedForWorktree`, `MCP_LINKED_WORKTREE_SKIP_COPY`) | not at base. P1 8165ea635: `CAR/mcp-directory/mcp-install.service.ts:102-109`, `:690-718` | remove (goes with the writes; B18 contract "B2's guard going along with it") | none | B18 spec |
| 37 | Intent store: record, forget, makeGlobal, listFor, scopeOf | `HS/sources/mcp-intent-store.ts:268-520` | keep | n/a (it becomes the hub's source of record) | existing intent-store spec; gateway `server-sources.spec.ts` |
| 38 | List declared servers for the UI (`listInstalled`, `listDeclarations`, `harnessConfigRows` via `inspect`) | `CAR/mcp-directory/mcp-install.service.ts:381-499` | keep (read-only) | n/a | existing `mcp-install.service.spec.ts` list cases unchanged |
| 39 | `getConfigPath` per target | `CAR/mcp-directory/mcp-install.service.ts:435-449` | keep (read-only; used by listing) | n/a | existing spec |
| 40 | RPC `mcp:install` / `mcp:makeGlobal` / `mcp:uninstall` / `mcp:listInstalled` callers | `RH/handlers/mcp-directory-rpc.handlers.ts:555`, `:652`, `:702`, `:739` | keep (callers); result shape follows rows 31-35 | n/a | `mcp-directory-rpc.handlers.spec.ts`; webview counts `deferred` separately (decision row 31) |
| 41 | Harness apply installs `config.mcp.servers` and reports `installedPaths` (config file paths) | `RH/harness/io/harness-mcp-install.service.ts:67-151` | move (intent only) | report recorded intents, not written paths | `harness-mcp-install.service.spec.ts`. Not in any P2 write set: see Gap G1 |
| 42 | External marketplace plugin's declared `mcpServers` install/uninstall | `RH/handlers/external-plugin-mcp.service.ts:185-300`; callers `RH/handlers/plugin-rpc.handlers.ts:856`, `:925` | move (intent only, through `McpInstallService`) | hub serves the intent | `external-plugin-mcp.service.spec.ts`. See Gap G1 |
| 43 | `ptah_harness_install_mcp_server` tool / `ptah.harness` install | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:2668`; `.../namespace-builders/harness-namespace.builder.ts:1111` | keep (records intent) | hub serves it | dispatcher spec; harness namespace spec |
| 44 | Harness workflow prompt tells the agent servers land in `.mcp.json` and `.vscode/mcp.json` | `RH/harness/ai/harness-workflow-prompt.service.ts:64-74` | move (text only) | prompt says the server is recorded and served by Ptah | prompt snapshot/spec if any. See Gap G1 |

## 5. Ptah slot writer

| # | Capability | File:line (base) | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- | --- |
| 45 | Slot plan: `ptah` entry per open root in `.mcp.json`, `.cursor/mcp.json`, Codex workspace or home TOML by trust | `MH/ptah-mcp-slots.ts:127-160` (`SLOT_SPECS`), `:172-180`, `:215-246`, `planPtahMcpSlots` `:246` | remove (row 10) | spawn injection per lane (rows 7-11, 53-57); Claude chat via SDK `mcpServers` | B19: `ptah-mcp-slots.ts` and its spec deleted when zero importers. P1: now `:256`, linked-worktree skip `:262`, `:290`, `:302-313` (5673e1c82) |
| 46 | Register slots at server start and on workspace change | `MH/http-mcp-server.service.ts:442-470` (`queueRepoint`), `:479-530` (`start`), `:884-897` (`syncMcpJsonRegistration`) | remove (row 10) | none | B19 http server spec: start writes no config file |
| 47 | `ensureRegisteredForSubagents` writes the active root's slots before a session | `MH/http-mcp-server.service.ts:532-600`, `:601-715` (`queueEnsureRegistered`, `hasCurrentClaudeEntry`, `ensureRegisteredNow`, `reconcileRegistrations`), `registerRootSlots` `:717-736` (plan call `:718`) | remove the write (row 10) | readiness answer only: "registered" when the server is up. See Gap G2 for the callers | B19 spec: no slot writes; callers keep `mcpServerRunning`. P1: now `:616`, `:711-713` returns registered in a linked worktree, `:765-766` |
| 48 | `retainRoot` / `releaseRoot` write and remove slots for child-session worktrees | `MH/http-mcp-server.service.ts:737-828`, `desiredSlots` `:829-848` (plan call `:830`); port `libs/backend/platform-core/src/interfaces/mcp-subagent-root-registrar.interface.ts:29`, `:41`; callers `CAR/session-children/session-spawner.service.ts:1057`, `:2581`; DI `libs/backend/vscode-lm-tools/src/lib/di/register.ts:153`, `:166` | remove the write (row 10) | child sessions get `ptah` at spawn. See Gap G2 | B19 spec. P1: now `:804-810` (`linked-worktree` failure), `:880-881` |
| 49 | Slot write/remove under `withMcpConfigLock`, token reuse from file | `MH/http-mcp-server.service.ts:1077-1150` (`registerInSlot`), `:1152-1219` (`writeMcpJsonEntry`), `:1220-1257` (`writeFacetEntry`), `:1258-1351` (`unregisterFromSlot`, `removeMcpJsonEntry`, `removeFacetEntry`), `:981` (`readFileAuthToken`) | remove (row 10) | tokens stay in the existing encrypted slots and per-spawn issue (`issue` `:925`) | B19 spec |
| 50 | Retired `ptah` sweep (`~/.gemini/config/mcp_config.json`, `{ws}/.agents/mcp_config.json`) | `MH/retired-ptah-mcp-slots.ts:86-205`, called `MH/http-mcp-server.service.ts:850-868` | keep (D-U5 Option 1, row 17; C13 makes no change) | n/a | `retired-ptah-mcp-slots.spec.ts` incl. the B8 linked-worktree case. P1: skip at `:228-237` (e8058b200) |

## 6. agy spawn-time home `mcp_config.json` write

| # | Capability | File:line (base) | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- | --- |
| 51 | Stream-json lane writes `ptah` into `~/.gemini/config/mcp_config.json` before the spawn | `AD/antigravity-cli.adapter.ts:1186-1195` (facet), `:1205-1250` (`configureMcpServer`, write `:1231`), call `:1369` | remove (row 13, user-approved) | none. The stream-json fallback (older `agy`, ACP probe failure, `PTAH_AGY_TRANSPORT=stream-json`) gets no `ptah` server, so no Ptah tools and no `ptah_agent_report` | B22: `antigravity-cli.adapter.mcp.spec.ts` shows a stream-json spawn records zero writes to the home file (fake fs) |
| 52 | Restore the prior `ptah` entry after the run | `AD/antigravity-cli.adapter.ts:1261-1275` (`cleanupMcpEntry`, `:1265-1267`), `:1360-1366` (`restoreMcpConfig`), `:1779`, `:1933` | remove (row 13) | `onMcpConfigRestored` token revoke at teardown stays (decision row 36) | same spec; `agent-process-manager.service.ts` teardown still revokes |
| 53 | ACP lane attaches `ptah` via `session/new.mcpServers` | `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts:289`; `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:1201-1233` | keep | n/a; row 36 changes the token class to `privileged` in B22 | `antigravity-acp-profile.spec.ts`, `antigravity-cli.adapter.acp.spec.ts` |

## 7. Lane config (copilot, cursor, opencode, grok, codex)

None of these lanes writes an MCP config file at base. Each passes `ptah` inline per spawn. C14
adds a switch so the lane loads only `ptah`, where verified (A5).

| # | Capability | File:line (base) | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- | --- |
| 54 | Copilot: `--additional-mcp-config` JSON with `ptah` | `AD/copilot-sdk.adapter.ts:349-368` | keep; add A5 switch if verified | n/a | B21 `copilot-sdk.adapter.spec.ts` argv |
| 55 | Cursor: SDK `agentOptions.mcpServers.ptah` with bearer header | `AD/cursor-cli.adapter.ts:422-434` | keep; add A5 switch if verified | n/a | B21 `cursor-cli.adapter.spec.ts` |
| 56 | OpenCode: `OPENCODE_CONFIG_CONTENT` merges inherited `mcp` plus `ptah` | `AD/opencode-cli.adapter.ts:637-660`, `:745-756` | keep; A5 may drop the inherited `mcp` merge | n/a | B21 `opencode-cli.adapter.spec.ts` env |
| 57 | Grok: ACP `session/new.mcpServers` | `libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.ts:127`; `AD/grok-cli.adapter.ts:146` | keep; add A5 switch if verified | n/a | B22 `grok-cli.adapter.spec.ts`, `grok-acp-profile.spec.ts` |
| 58 | Codex: disable user `[mcp_servers]` and add `ptah` via `-c` | `AD/codex/codex-lane-config.builder.ts:131-151`; names read by `AD/codex/codex-app-server-lane.adapter.ts:283` | keep (already "only `ptah`") | n/a | `codex-lane-config.builder.spec.ts` |

## Facet read APIs that stay (R5)

These readers import facet modules or helpers from `@ptah-extension/harness-sync`. B16 to B19
remove write call sites only. A module is deleted only when `rg` shows zero importers.

| Reader | Imports (verified at base, re-checked at HEAD) | Module that must stay |
| --- | --- | --- |
| `CAR/mcp-directory/mcp-install.service.ts:60-66`, `:200` | `createAllMcpFacets`, `IHarnessMcpFacet`, `McpSourceStatus`, `McpIntentStore`, `McpIntentPersistError`; uses `inspect`, `configPath`, `readAll` | `mcp-facet.registry.ts`, `mcp-facet.port.ts`, `json-mcp-facet.ts`, `codex-toml-mcp-facet.ts`, `mcp-intent-store.ts` |
| `AD/codex/codex-user-mcp-servers.ts:109-113`, `:165`, `:181`, `:338` | `CodexTomlMcpFacet` (read), `parseMcpServerTables`, `codexProjectTrusted` | `codex-toml-mcp-facet.ts`, `codex-project-trust.ts`, `codex-home.ts` |
| `CAR/mcp-directory/claude-user-mcp.reader.ts:42` | `jsonToConfig` | `mcp-json-format.ts` |
| `CAR/mcp-directory/gateway/server-sources.ts:66-67` (P1) | `jsonToConfig`, `HarnessMcpIntent` | `mcp-json-format.ts`, `mcp-intent-store.ts` |
| `MH/retired-ptah-mcp-slots.ts:52-57` | `ANTIGRAVITY_URL_KEY`, `PTAH_SPAWN_MCP_KEY`, `createMcpFacet` (`configPath` only), `withMcpConfigLock`; P1 adds `isLinkedWorktreeRoot` | `mcp-json-format.ts`, `mcp-facet.port.ts`, `mcp-facet.registry.ts`, `mcp-config-lock.ts`, `workspace/linked-worktree.ts` |
| `AD/codex/codex-rollout-usage.reader.ts:28` | `codexHomeDir` | `codex-home.ts` |
| `RH/handlers/mcp-directory-rpc.handlers.ts:70-74` | `McpIntentPersistError` | `mcp-intent-store.ts` |
| `CAR/capabilities/capability-resolver.service.ts:365`, `:419`, `:599` | `listDeclarations` (status-bearing `inspect`) | through `McpInstallService` |
| linked-worktree callers (`gitignore-writer.ts:139`, `linked-worktree-guard.ts` callers, `retired-ptah-mcp-slots.ts`, rpc-handlers) | `isLinkedWorktreeRoot`, `isLinkedWorktreeRootSync` | `workspace/linked-worktree.ts` (D3) |

The read API that stays is `IHarnessMcpFacet.configRelPath`, `configPath`, `readAll`, `inspect`
and `canonicalize` (`HS/targets/mcp/mcp-facet.port.ts:129-175`). `write` and `remove` (`:155-162`)
lose every production caller once rows 2, 6, 34, 49 and 51-52 land. If the port is narrowed, the
retired sweep keeps its own `fs.writeFileSync` (`MH/retired-ptah-mcp-slots.ts:152`) and needs no
facet write. Writers that go with their callers: `ptah-mcp-slots.ts` (zero importers after B19),
`mcp-facet-planner.ts` (zero after B16/B17). `PTAH_SPAWN_MCP_KEY`, `isMcpFragmentKey` and
`mcpEntryKey` stay exported while any importer remains.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | Pre-P2 manifests keep `kind:'mcp'` rows (D-U5 Option 1 leaves the entries). The schema keeps accepting them (row 25). B17 must stop them from counting in preflight (row 24) and from producing removals (row 23). Keep `isMcpFragmentKey` and the repair `not-a-path` refusal (row 28) until those rows are dropped on load. | (a) ignore `mcp` rows in preflight/plan; (b) drop them on load and rewrite the manifest | `harness-reconciler.service.ts:815-827` compares `entries.length` with `expected.size`; `claude-target.ts:311`, `workspace-target.ts:699` skip `mcp` entries today | yes |
| D2 | `force` uninstall of a user-owned key (row 34) is removed under row 10: it writes a native config file. Installed-tab rows of origin `harness-config` that Ptah does not own then get removal instructions, as `~/.claude.json` rows already do. | (a) remove (row 10); (b) keep as an explicit user action | row 10 text "Ptah stops writing native provider MCP config files"; base `mcp-install.service.ts:596-626` | yes. If the orchestrator reads row 10 as covering only sync writes, the user must confirm (b) |

## Gaps for the team-leader (not in any P2 write set)

- **G1.** Rows 41, 42 and 44 sit in rpc-handlers (`harness-mcp-install.service.ts`,
  `external-plugin-mcp.service.ts`, `harness-workflow-prompt.service.ts`). B18 changes only
  `mcp-install.service.ts`. These callers' result copy ("installedPaths", "written to") must
  follow, or they report config paths that were never written.
- **G2.** Rows 47 and 48: `ensureRegisteredForSubagents` has five callers outside B19's write set
  (`RH/chat/session/chat-session.service.ts:1339`, `:2158`; `RH/chat/ptah-cli/chat-ptah-cli.service.ts:155`,
  `:258`; `libs/backend/gateway-chat-bridge/src/lib/gateway-turn-preparation.ts:219`;
  `libs/backend/vscode-core/src/services/subsystem-bringup.ts:118`). `retainRoot`/`releaseRoot`
  are a platform-core port used by `session-spawner.service.ts:1057`, `:2581`. B19 either keeps
  these signatures as non-writing readiness answers, or adds the callers to a batch.
- **G3.** Row 12 removes the `vscode` target, which is registered in `HS/di/register.ts` and
  exported from `harness-sync/src/index.ts:157`, `:369`. Those files are not in B16's write set.

## Assumptions

- **A1.** No other production writer of an MCP config exists. Check: at base,
  `git grep -nE "facet\.(write|remove)\(|createMcpFacet\(|createAllMcpFacets\(" a4e0154ae -- libs apps ':!*.spec.ts'`
  returns only the files in rows 1-12, 34, 45-49, 50 (`configPath` only) and 51-52.
- **A2.** `codex-runtime` (`codex-mcp-config.ts`, `codex-ptah-mcp.ts`) builds config in memory
  and writes no file. Check: `git grep -nE "writeFile|rename\(" a4e0154ae -- libs/backend/codex-runtime/src/lib/codex-mcp-config.ts libs/backend/codex-runtime/src/lib/codex-ptah-mcp.ts`
  returned nothing.
- **A3.** The harness health UI reads each target's `facets.mcp` state (row 4). Check:
  `rg -n "facets" libs/frontend` for an `mcp` facet badge before B16 flips it to `unsupported`.
