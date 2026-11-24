# Batch 16 report - Harness targets stop writing MCP (C12a)

Task: TASK_2026_979_9e1f, Batch 16 (P2-B3), Task 16.1. Executor: backend-developer subagent.
No git operations were run.

## Files

All paths are under `libs/backend/harness-sync/src/`.

- MODIFIED `lib/targets/claude-target.ts`: removed the `planMcpFacet` / `applyMcpFacet` calls,
  the `mcpFacet` constructor parameter, `defaultClaudeMcpFacet`, `desiredMcp` and the MCP keys in
  `preflightKeys`. Facet `mcp` is now `'unsupported'`. Plan `expected` counts skills and commands
  only. Old `kind:'mcp'` manifest rows are skipped (no removal planned), and `apply` skips any
  MCP row it is handed.
- MODIFIED `lib/targets/workspace-target.ts`: removed the `mcpFacet` option, `planMcp`, the
  `applyMcpFacet` call and the `mcpPlan` plumbing through `plan` / `planRemovals`. Old
  `kind:'mcp'` rows are still skipped in `planRemovals`, and `apply` still skips MCP rows.
- MODIFIED `lib/targets/rival-targets.ts`: removed `mcpFacet` and `mcp: 'supported'` from
  codex, copilot, cursor, antigravity and opencode. Deleted `createVscodeMcpTarget`, which existed
  only to write `.vscode/mcp.json`, and dropped it from `createRivalTargets`. Rewrote the header
  matrix and removed the "two writers" section.
- MODIFIED `lib/targets/harness-target.port.ts`: doc comments only. The `mcp` / `mcpServerKey` /
  `mcpServerKeys` fields stay because the planner and reconciler still compile against them
  (B17, rows 21-23).
- MODIFIED `lib/di/register.ts` (G3): removed `createVscodeMcpTarget` from
  `ALL_HARNESS_TARGET_FACTORIES` and the `vscodeMcpTargetFactory` re-export.
- MODIFIED `index.ts` (G3): removed the `createVscodeMcpTarget` and `vscodeMcpTargetFactory`
  exports and updated two comments. Every facet read export in R5 is unchanged.
- CREATED `lib/targets/rival-targets.no-mcp.spec.ts` (4 tests): no `vscode` target; `mcp`
  facet is `unsupported` on every target; plan and preflight hold no MCP row; a full plan+apply
  pass leaves all six old MCP config paths absent and still copies skills; existing config
  files stay byte-identical even when the manifest holds an old `mcp` row and the key is retired.
- MODIFIED `lib/targets/claude-target.retirement.spec.ts`: added a `no MCP config writes`
  describe with 3 tests: facet unsupported and no preflight key; no `.mcp.json` written;
  an old manifest row and the user `.mcp.json` are left alone.
- MODIFIED `lib/targets/workspace-target.retirement.spec.ts`: added 1 test: no MCP row is
  planned or applied, and `.cursor/mcp.json` stays byte-identical.
- MODIFIED (deviation) `lib/targets/rival-targets.detection.spec.ts`: the E17 facet-matrix test
  asserted the `vscode` row with `mcp: 'supported'`. It now asserts there is no `vscode` row and
  that codex `mcp` is `unsupported`.
- MODIFIED (deviation) `lib/reconciler/harness-reconciler.gitignore.spec.ts`: one assertion,
  `existsSync('.mcp.json')`, changed from `true` to `false`. The test still checks that the
  gitignore block never names an MCP config file.

The task folder also has `batches.md` (Batch 16 marked COMPLETE) and this report.

## Plan deviations

1. Two spec files outside the write set changed by one assertion each: the detection spec and
   the gitignore spec. Each asserted the removed behaviour (a `vscode` MCP target, and a written
   `.mcp.json`). Acceptance said the gitignore specs "pass unchanged", which cannot hold for an
   assertion that `.mcp.json` exists once row 10 lands. The gitignore intent stays: the block
   never ignores an MCP file. Both edits can be reverted.
2. `RivalTargetDeps.homeDir` is now read by no target. It stays, with a doc note, because 20+
   specs outside this write set pass it. Removing it is a later cleanup (see hand-offs).
3. `harness-target.port.ts` got doc comments only. Its MCP fields have live importers in the
   planner and reconciler, which belong to B17.

## Inventory rows covered

- Rows 1-3 (Claude plan, apply, preflight keys): removed.
- Row 4 (Claude `mcp: 'supported'`): now `unsupported`. See A3: the marketplace health row
  (`libs/frontend/marketplace/src/lib/harness/harness-target-row.component.ts:183`) now shows
  the MCP chip as unsupported for every target. No frontend change was made.
- Rows 5-6 (workspace target plan and apply): removed.
- Rows 7-11 (codex, copilot, cursor, antigravity, opencode facets): removed.
- Row 12 (the VS Code MCP target, its DI entry and barrel export): removed. Nothing outside
  harness-sync imports `createVscodeMcpTarget`, `vscodeMcpTargetFactory` or
  `ALL_HARNESS_TARGET_FACTORIES` (checked with grep over `apps` and `libs`).
- Row 13 (skills, commands, agents and the gitignore block): kept. Their specs pass.
- Row 14 (P1 `keepsTrackedCopy` linked-worktree guard): kept unchanged in both targets.
  `harness-reconciler.linked-worktree.spec.ts` passes.
- R5 read APIs: untouched. `mcp-facet.registry.ts`, `mcp-facet.port.ts`, `json-mcp-facet.ts`,
  `codex-toml-mcp-facet.ts`, `mcp-json-format.ts`, `mcp-config-lock.ts`, `codex-*`,
  `mcp-intent-store.ts` and `linked-worktree.ts` still export the same names from `index.ts`.

## Verification

Every command ran through `node scripts/verify.mjs --exec --task b16 -- ...`. Logs are in
`.ptah/tmp/b16-*.log`.

- `npx tsc --noEmit --project libs/backend/harness-sync/tsconfig.lib.json`: **PASS**, exit 0
  (`b16-tsc.log`).
- `npx eslint` on the 9 changed production and spec files: **PASS**, 0 errors and 1 warning.
  The warning is `max-lines` on `workspace-target.ts` (771 lines against a 700 limit). It
  existed before this batch, and the file is now shorter. `npx prettier --check` passes after
  formatting the new spec.
- `npx jest --config libs/backend/harness-sync/jest.config.ts --runInBand --coverage=false
  --runTestsByPath` with all 12 target specs plus `harness-reconciler.gitignore.spec.ts` and
  `harness-reconciler.linked-worktree.spec.ts` (`b16-jest-targets.log`): 121/123 passed before
  the two deviation edits. The 2 failures were the asserts described under Plan deviations.
  After the edits, a rerun of the detection, gitignore and no-mcp specs passed 14/14
  (`b16-jest-fix.log`).
- Full harness-sync jest run, made only to map the hand-off (`b16-jest-all.log`): 64/73 suites
  and 744/756 tests pass, with 2 skipped. **The harness-sync test target stays red until B17.**
  The 9 failing suites (10 failing tests plus 5 compile failures) all assert the removed MCP
  behaviour. They are listed below.
- Not run: `npm run verify` and `nx`, because the brief forbids them. The coordinator runs the
  inner loop and the gate.

## Hand-offs for B17 (and the team-leader)

The suites below fail now and need B17 to rewrite or delete them. None of them is in B16's write
set, and only two are in B17's current write set, so the team-leader may need to add files to B17
or create a new batch:

- Compile failures, `createVscodeMcpTarget` removed:
  `reconciler/harness-reconciler.blocked-logging.spec.ts:41`,
  `reconciler/harness-reconciler.verify-agreement.spec.ts:57`,
  `repair/blocked-repair.service.spec.ts:106`.
- Compile failures, `mcpFacet` option removed: `reconciler/harness-reconciler.retirement.spec.ts:218`,
  plus `targets/mcp/mcp-facet-planner.retirement.spec.ts:357` and
  `targets/mcp/mcp-facet-planner.linked-worktree.spec.ts:113`. B17 deletes both planner specs.
- Behaviour failures that expect MCP writes:
  - `reconciler/harness-reconciler.antigravity-mcp.spec.ts`, 6 tests. Inventory row 10 says to
    rewrite it to assert that nothing is written.
  - `reconciler/harness-reconciler.remove.spec.ts`, the `[E22]` test (row 23).
  - `sources/plugin-config-source-resolver.spec.ts:399-432`, 3 tests that read `.mcp.json`
    (row 20).
- Production code: `mcp-facet-planner.ts` now has zero production importers in the targets. B17
  should confirm the reconciler, repair and health code no longer reach it, then delete it.
  `freezeToMcp` (`harness-reconciler.service.ts:1117-1135`) and `remove` (`:296-305`) still build
  MCP plans. The targets skip those rows, so nothing is written, but the code is dead (rows 22
  and 23).
- D1 / row 24: old `kind:'mcp'` manifest rows survive in `baseEntries` because no target plans
  a removal for them. Until B17 drops them on load, preflight will compare
  `entries.length > expected.size` (`harness-reconciler.service.ts:815`) and may never report a
  no-op.
- Row 21: `HarnessRetiredSources.mcpServerKeys`, `HarnessPlanWrite.mcp` and
  `HarnessPlanRemove.mcpServerKey` in `harness-target.port.ts` can go once the planner,
  reconciler and source resolver stop using them.
- Cleanup for later (B23 or B17): `RivalTargetDeps.homeDir` is unused in production. The
  `'vscode'` id stays in shared `HARNESS_TARGET_IDS`, because the mcp-install facets use it; no
  change was made there.
- `index.ts` is also in B17's write set. B16 changed only the vscode exports and two comments.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Set `mcp: 'unsupported'` instead of dropping the key | drop the key / `unsupported` | `HarnessFacetMatrix` is a full `Record<HarnessFacet, ...>` (`libs/shared/.../harness-sync.types.ts:55`), so the key cannot be dropped | yes |
| Keep `apply`'s `kind === 'mcp'` skip in both targets | remove / keep | The reconciler `remove` and `freezeToMcp` still pass MCP rows into `apply` until B17. The skip is what guarantees zero writes | yes |
| Make one-assertion edits to the detection and gitignore specs | leave them red for B17 / edit | Neither file is in any P2 write set, and both assert the removed behaviour (row 10) | yes |
