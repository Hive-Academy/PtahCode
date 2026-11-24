# Batch 17 report: planner and reconciler MCP removal (C12b)

Task: TASK_2026_979_9e1f, Batch 17 (P2-B4), Task 17.1. Executor: backend-developer subagent.
No git operations were run (no add, stash, checkout or restore).

Result: the harness-sync project is fully green, and no MCP write path is left in it.

## Files

All paths are under `libs/backend/harness-sync/src/`.

### Deleted

- `lib/targets/mcp/mcp-facet-planner.ts`: zero importers after B16 (it was not exported
  from `index.ts`, and no R5 reader imported it). `planMcpFacet`, `applyMcpFacet`,
  `emptyMcpFacetPlan`, `McpFacetPlan` and `McpRetirementContext` go with it.
- `lib/targets/mcp/mcp-facet-planner.retirement.spec.ts` (row 17).
- `lib/targets/mcp/mcp-facet-planner.linked-worktree.spec.ts` (row 18).

### Production code

- `lib/reconciler/harness-reconciler.service.ts`:
  - `remove` no longer builds `mcpServerKey` rows (row 23).
  - `freezeToMcp` is replaced by `freezePlan`. A pass with an unknown capability policy now
    applies nothing: no write, removal, migration or adoption, and the manifest stays as
    loaded (row 22). The warning no longer says "MCP still applies".
  - `hasDrift` lost its `isMcpFragmentKey` skip. `blockedReason` and its MCP wording are
    replaced by one `BLOCKED_REASON` constant (row 27). `NO_RETIRED_SOURCES` has no
    `mcpServerKeys`.
- `lib/manifest-store/managed-manifest.ts` (D1, rows 24-25): `load` drops every `kind: 'mcp'`
  row. The schema still accepts `mcp`, so a pre-P2 manifest parses and is not called
  unreadable. `load` writes nothing back. The next save of that manifest leaves the rows out.
  The config entries those rows named stay on disk (D-U5).
- `lib/targets/harness-target.port.ts` (row 21): removed `HarnessPlanWrite.mcp`,
  `HarnessPlanRemove.mcpServerKey`, `HarnessRetiredSources.mcpServerKeys` and the
  `McpServerConfig` import. Updated the doc comments.
- `lib/targets/claude-target.ts`, `lib/targets/workspace-target.ts`: removed the six
  per-target "skip MCP row" guards (2 in `planRemovals`, 4 in `apply`). No pass now hands a
  target an MCP row: the store drops them on load, and no planner or `remove` builds one.
- `lib/manifest/desired-state.types.ts`, `lib/manifest/harness-manifest.builder.ts` (row 19):
  removed `HarnessDesiredMcpServer`, `HarnessDesiredState.mcp`, `buildMcp`, the
  `HARNESS_TARGET_IDS` / `isHarnessTargetId` helpers it alone used, and the `hashMcpConfig`
  import.
- `lib/health/harness-destination-scanner.ts` (row 26): the probe state has no `mcp: []`.
- `lib/sources/plugin-config-source-resolver.ts` (rows 20-21, partial): removed
  `readRetiredMcpServerKeys`, so `retired` carries skill roots only. Updated the doc comments.
- `lib/sources/harness-source.port.ts`: doc comments only (see Deviation 1).
- `index.ts`: removed the `HarnessDesiredMcpServer` type export. Every R5 read export is
  unchanged.
- `lib/lock/file-lock.ts`: comment only. Removed the stale `applyMcpFacet` reference, so the
  acceptance `rg` comes back empty.

### Specs rewritten (no-write assertions in place of write assertions)

- `reconciler/harness-reconciler.antigravity-mcp.spec.ts`: rewritten, 3 tests.
  - An antigravity intent creates no `~/.gemini/config/mcp_config.json`, skills still land,
    and the manifest holds no `#` key.
  - An existing config (`ptah` key, `github` and a hand server) stays byte-identical across
    an install pass and an uninstall pass. No path naming it is reported.
  - A pre-P2 manifest row for the config is dropped, not removed, and the saved manifest
    leaves it out.
- `reconciler/harness-reconciler.remove.spec.ts` `[E22]`: seeding writes no `.mcp.json`. A
  pre-P2 `.mcp.json#github` manifest row and the user's `.mcp.json` survive `remove`
  byte-identical, and the saved manifest drops the row (row 23).
- `sources/plugin-config-source-resolver.spec.ts`:
  - The 3 unreadable-store tests now seed a user `.mcp.json` and assert that a reconcile
    with an intent, a reconcile over a broken store (still rejects with
    `McpIntentPersistError`) and a reconcile over an empty store all leave it
    byte-identical.
  - The built desired state has no `mcp` property.
  - The retired tests expect `{ skillSourceRoots }` only, and assert that `mcpServerKeys` is
    absent.
- `reconciler/harness-reconciler.blocked-logging.spec.ts`: drops `createVscodeMcpTarget`.
  The second blocked path is now an occupied command file. A new assertion checks that no
  blocked path has a `#` key or server-key wording, and that the user's `.mcp.json` stays
  byte-identical. `targetCount` changes from 2 to 1.
- `reconciler/harness-reconciler.verify-agreement.spec.ts`: drops the vscode target. The MCP
  case now asserts that no target reports an `mcp.json` path and that the user's
  `.vscode/mcp.json` stays byte-identical.
- `repair/blocked-repair.service.spec.ts`: drops the vscode target. The blocked set is now
  `[alpha, run-it]`. The `not-a-path` refusal (row 28, kept) is tested with a stale-report
  key `.mcp.json#wanted`, and `.mcp.json` stays byte-identical.
- `reconciler/harness-reconciler.retirement.spec.ts`: drops `mcpFacet` and the flaky facet.
  The mixed pass now covers one retired skill removed, one tracked skill kept and disowned,
  and a pre-P2 MCP row dropped with its config untouched. A second pass is a no-op. The
  MCP-only failure and retry leg went with the facet.
- `reconciler/harness-reconciler.capability-policy.spec.ts` `[C3]`: a frozen pass now applies
  nothing, and `apply` is never called (row 22).
- `targets/claude-target.retirement.spec.ts`, `targets/workspace-target.retirement.spec.ts`,
  `targets/rival-targets.no-mcp.spec.ts` (B16 specs): the old-row cases now write the manifest
  to disk and read it back through the store, which is the D1 path. They assert that the row
  is dropped, no removal is planned and the config stays byte-identical. `desired.mcp` and
  `mcpServerKeys` fixtures are removed.

### Specs added

- `manifest-store/managed-manifest.spec.ts`: a pre-P2 manifest with an `mcp` row loads with
  no warning, only that row is dropped, and the file is not rewritten (D1, row 25).
- `reconciler/harness-reconciler.preflight.spec.ts` `[D1]`: a manifest holding an old
  `.mcp.json#github` row preflights as a no-op. `apply` is not called, `found === expected`,
  the skill mtime is unchanged, the manifest bytes are unchanged and `.mcp.json` is
  byte-identical (row 24).

### Mechanical fixture edits (field removal only)

`manifest/harness-manifest.builder.spec.ts`, `targets/claude-target.overwrite-detach.spec.ts`,
`targets/skill-sibling-links.spec.ts`: removed `mcp: []` and `mcpServerKeys: []`.

Kept unchanged (D3 and row 14): `workspace/linked-worktree.ts`,
`targets/linked-worktree-guard.ts` and `gitignore/gitignore-writer.ts`.

## Plan deviations

1. **Row 20 is partial.** The resolver still reads `mcpIntents` into the source state. That
   read keeps an unreadable store failing `resolve`, as before. Removing it would also remove
   the `mcpIntents` constructor and factory parameter of `PluginConfigSourceResolver` /
   `createPluginConfigSourceResolver`. That parameter is positional, and two hosts outside
   this batch pass `undefined` in its slot before `agentModelsFactory`:
   `apps/ptah-electron/src/di/phase-2-libraries.ts:345-347` and
   `libs/backend/cli-engine/src/lib/container.ts:837-839`. A test caller does the same in
   `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts`.
   Dropping the parameter breaks their compile. That is not an import-only fix, so I report
   it and do not edit it. The builder no longer reads the field. `harness-source.port.ts`
   documents the hand-off.
2. The write set grew beyond the 8 listed files, as the B16 hand-off said it would: the
   deleted specs, the antigravity, remove, resolver, blocked-logging, verify-agreement,
   repair, retirement and capability-policy specs, the B16 target specs, the manifest store
   and its spec, the preflight spec, the desired-state types, the builder, the resolver and
   its port, and `file-lock.ts` (comment only).
3. Each rewritten test keeps its coverage intent as a no-write assertion. None was deleted
   outright. The exception is the retirement spec's MCP failure and retry leg: no MCP removal
   exists any more, so nothing is left to fail or retry.
4. The repair `not-a-path` refusal for `#` keys stays (row 28, D1 "keep while a stale report
   can still name a `#` key"). `isMcpFragmentKey` stays exported for it.

## Inventory rows covered

| Row | State |
| --- | --- |
| 15, 16 | Planner and apply removed. The `planMcpFacet\|applyMcpFacet` grep over `libs/backend` is empty. |
| 17, 18 | Removed with the module. Both specs deleted. |
| 19 | `HarnessDesiredState.mcp` and `buildMcp` removed. Typecheck passes. The resolver spec asserts no `mcp` property. |
| 20 | Partial: retired MCP keys removed. The `mcpIntents` read stays (Deviation 1). |
| 21 | Port fields and `NO_RETIRED_SOURCES.mcpServerKeys` removed. |
| 22 | `freezePlan`: a frozen pass applies nothing (capability-policy `[C3]`). |
| 23 | `remove` builds no MCP rows (remove spec `[E22]`). |
| 24 | D1: rows dropped on load, preflight is a no-op (preflight `[D1]`). |
| 25 | Schema still accepts `mcp` (manifest-store spec). |
| 26 | Scanner probe has no `mcp: []`. |
| 27 | MCP blocked wording removed from the reconciler (blocked-logging spec). |
| 28 | Kept: repair spec, stale-key case. |
| 10 (antigravity) | `harness-reconciler.antigravity-mcp.spec.ts` asserts no write. |
| R5 | No read export removed. `mcp-facet.port.ts`, `mcp-facet.registry.ts`, `json-mcp-facet.ts`, `codex-toml-mcp-facet.ts`, `mcp-json-format.ts`, `mcp-config-lock.ts`, `codex-*`, `mcp-intent-store.ts` and `linked-worktree.ts` are untouched. |

## Verification

Every heavy command ran through `node scripts/verify.mjs --exec --task b17 -- ...`. Logs are
in `.ptah/tmp/b17-*.log`.

- `npx tsc --noEmit --project libs/backend/harness-sync/tsconfig.lib.json`: **PASS**, exit 0
  (`b17-tsc-lib.log`).
- `npx tsc --noEmit --project libs/backend/harness-sync/tsconfig.spec.json`: **PASS**, exit 0
  (`b17-tsc-spec.log`). It reported 28 errors before the spec edits.
- `npx jest ... --runTestsByPath` on the 14 changed specs: **14/14 suites, 191/191 tests
  pass** (`b17-jest-focused.log`).
- Full project, one run: `npx jest --config libs/backend/harness-sync/jest.config.ts
  --runInBand --coverage=false`: **71/71 suites pass; 806 passed, 2 skipped, 0 failed**
  (`b17-jest-all.log`). After B16 the project stood at 64/73 suites. There were no Windows
  EPERM symlink failures in this run.
- `npx eslint` on the 28 changed files: **0 errors** (`b17-eslint.log`).
  - One unused import in `blocked-repair.service.spec.ts` was then removed and that file
    re-linted: exit 0, no output (`b17-eslint2.log`). This single-file run went outside the
    lock, because the lock queue was held by another worktree's lint and typecheck.
  - One warning remains: `max-lines` on `workspace-target.ts` (768 against 700). It existed
    before B17 (771 after B16).
- `npx prettier --check` on every changed file: passes.
- `git grep -nE "planMcpFacet|applyMcpFacet|freezeToMcp|createVscodeMcpTarget|HarnessDesiredMcpServer" -- libs apps`:
  no code hits. One stale comment remains outside this batch (see below).
- Not run: `npm run verify` and `nx` (forbidden by the brief), and checks for other
  projects. No harness-sync export used outside the lib was removed:
  `HarnessDesiredMcpServer`, `HarnessRetiredSources` and the port types have no importer
  outside harness-sync (grep over `libs` and `apps`).

## Out-of-scope observations (not edited)

- `libs/shared/src/lib/types/harness-blocked-wording.ts:76`, `:260` (and its spec) and
  `libs/frontend/marketplace/src/lib/harness/harness-blocked-paths.component.ts:94` still
  carry the MCP server-key wording ("the conflicting key in each config file", "the config
  file already defines this server key"). The reconciler's approved `reconcile-warn` action
  sentence is pinned to that shared allowlist, so I left the action text alone. Rewording
  it needs a shared, frontend and reconciler change together (B23 candidate).
- `libs/shared/src/lib/types/harness-sync.types.ts:483` has a comment that cites the deleted
  `mcp/mcp-facet-planner.ts:107-108`.
- Row 20 remainder (Deviation 1): drop the `mcpIntents` parameter, the read and the
  `HarnessSourceState.mcpIntents` field. This needs the Electron `phase-2-libraries.ts` and
  cli-engine `container.ts` call sites, and the rpc-handlers preview-fidelity spec, to drop
  one `undefined` argument in the same change.
- `RivalTargetDeps.homeDir` is still unused in production (B16 note).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Drop `mcp` rows in `ManagedManifestStore.load`, not only in preflight | (a) ignore them in `hasDrift` only; (b) drop them on load | Decision row 38 and P2 amendment D1 say "drops on load". Every consumer (plan, verify, remove, repair, health) reads through `load`, so one filter covers them all | yes |
| A frozen pass applies nothing | keep `freezeToMcp`; freeze everything | Row 22 ("a frozen pass applies nothing") | yes |
| Remove the six target skip guards | keep as defence; remove | Brief: "once nothing passes MCP rows". After D1 and row 23, no producer of MCP rows remains | yes |
| Keep the resolver's `mcpIntents` read | remove it with the param; keep it | The positional param is passed by hosts outside the write set (Deviation 1) | yes |
