Verdict: REVISE — 6/10

The plan is well scoped and most citations are correct. Two defects will break the first batches. Several batch contracts are incomplete. Fix them before assignment.

Counts: 1 blocker, 6 major, 4 minor. Review only. No file except this one was changed. No test or build command was run.

## Findings

1. **Blocker — migration 0076 breaks 27 existing specs.** Plan `implementation-plan.md:65` and B02 (`:207-215`) list three write files. Existing specs assert the highest migration version is 75, for example `libs/backend/persistence-sqlite/src/lib/migrations/0028_gateway_conversation_workspace_root.spec.ts:84` and `0030_skill_event_metrics.spec.ts:39`. 27 spec files use `toBe(75)`. After B02 they fail. Correction: add these 27 files to a B02 follow-on batch (or change them to read the latest version). Split it so each batch has at most six files. Also state that `migrations/index.ts` needs the import and the array entry.

2. **Major — wrong jest config path for cli-engine.** Plan `:316` runs `J(libs/backend/cli-engine; …)`, which expands to `--config libs/backend/cli-engine/jest.config.ts`. The file is `libs/backend/cli-engine/jest.config.cjs` (the directory has no `.ts`). The command fails. Correction: define `J` with the real config file per project. Verify every project (shared, rpc-handlers, vscode-core, ui, chat, webview, platform-cli) the same way.

3. **Major — wrong tsconfig for the Electron app.** Plan `:306` uses `T(apps/ptah-electron)`, which expands to `apps/ptah-electron/tsconfig.lib.json`. That file does not exist. The app has `tsconfig.app.json`, `tsconfig.json` and `tsconfig.spec.json`. Correction: use `apps/ptah-electron/tsconfig.app.json` (check which one the `typecheck` target in `apps/ptah-electron/project.json` uses).

4. **Major — DI token file is not in any write set.** Plan `:29` says persistence owns "repository port/token". Tokens live in `libs/backend/persistence-sqlite/src/lib/di/tokens.ts` (`SQLITE_CONNECTION` at line 12). B04 (`:232-240`) lists `register.ts` and `index.ts` but not `tokens.ts`. Correction: add `tokens.ts` to B04 (B04 then has six files: split the spec or the port file). The same gap exists for tokens of the adapters (`bot-source-reader`, `bot-catalog-adapter`). No batch registers them: B05 only creates the files, and B11/B12 do not list a token or registration file. Name the token file and its owner.

5. **Major — B03 exports files that do not exist yet.** B03 (`:219-228`) owns `libs/backend/bots/src/index.ts`. The service, ports and register helper come from B07. B03 and B07 run in parallel at `:410`, and `T(libs/backend/bots)` cannot pass in B03. The plan half-admits this (`:228`). Correction: move `src/index.ts` into B07, or order B03 after B07 and say so. Same issue: B00 checks `T(…)` "after B07 and U06" (`:192`). A batch must pass its own check when it ends.

6. **Major — B05 depends on B07 ports but runs beside B04/B08 with unclear order.** B05 (`:251`) "Depends: B01/B07 ports". The B05 adapters need the preset and proposal store contracts, but the plan marks catalog and root helper symbols as assumptions (`:174`). B09 then depends on B05, B07 and B10. Correction: make B05 start only after B07 lands, and list the catalog and root-authorization symbols (with `file:line`) before B05 is assigned. These are real contracts, not assumptions: the plan's own rule (`:43`, `:174`) says to open them first. The architect lane should open them now.

7. **Major — retention data-loss gap in the delete rule.** Plan `:85-94`. Hard delete keeps a tombstone but the matrix cell "Keep memory, Purge history" says "purge unreferenced revisions", while "Keep history" keeps "referenced snapshots" only. The bot's current definition is removed (`definition_json` null). If history is kept, later runs resolve "referenced snapshots" only. There is no phase 1 table for runs, so "referenced" is empty and the rule would purge all revisions of a bot whose history the user chose to keep. Correction: with `retain_history = keep`, keep all revisions of that bot until phase 2 defines run references. Add a repository test for "keep history" that checks every revision row remains. Also state that tombstone `name` is NULL (`:71`): a retained-history view cannot show a bot name. Decide whether the tombstone keeps the name.

8. **Minor — batch id B06 is missing.** Ids go B05, B07 (`:242`, `:253`). Rename or add a note.

9. **Minor — module boundary claim is true but reasoning cites the wrong line.** The rule `scope:extension` → `scope:extension, scope:shared` is at `eslint.config.mjs:285` and the data-access rule is at `:382` (correct). `type:feature` may depend on `type:feature` at `eslint.config.mjs:374` — the plan says so (`:37`). `rpc-handlers` is `scope:extension, type:feature` (`libs/backend/rpc-handlers/project.json:6`), so `rpc-handlers → bots` (feature → data-access) is allowed. `bots → persistence-sqlite` (data-access → util) is allowed (`persistence-sqlite/project.json:6`). `bots-ui` (`scope:webview, type:feature`) → shared/core/ui is allowed. No alias `@ptah-extension/bots` or `bots-ui` exists in `tsconfig.base.json` (grep: no match). No boundary correction needed.

10. **Minor — import ledger can leave an inconsistent state.** Plan `:73`, `:96`. `bot_import_sources` has a restrictive foreign key to `bots`, and hard delete keeps the tombstone row. This works. But the plan writes no ledger rows in phase 1 (preview only). The table is unused code and has no test with real rows except fixtures. Correction: either defer the table to the import-commit phase or add one repository test that inserts and reads a row. Prefer deferring (simplicity rule: no structure for a later need).

11. **Minor — `bots:update` full replace versus partial edits.** Plan `:109`. A full editable replacement with `expectedRevision` is safe, but two clients edit different fields and one loses edits by conflict only. This is acceptable and loses no data (conflict returns an error). No change required. Add one test for create followed by two updates on one revision.

## Contract spot-checks

| Claim | Location | Result |
| --- | --- | --- |
| Last migration is 75, registry entry | `libs/backend/persistence-sqlite/src/lib/migrations/index.ts:103`, `:512` | Correct. Next free number is 76. Files in the directory end at `0075_phase_grade_keys.*`. |
| Existing tests allow version 76 | `migrations/0028_…spec.ts:84` and 26 more | **Wrong by omission.** 27 specs assert max version 75 (finding 1). |
| `ALLOWED_METHOD_PREFIXES` in vscode-core | `libs/backend/vscode-core/src/messaging/rpc-handler.ts:46`, check at `:178`, `:364` | Correct. `bots:` is absent. The array has no other copy in non-test source. |
| Manifest entry shape `methods`, `requires: []`, `handler` | `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:305-312` | Correct. |
| Electron persistence registration | `apps/ptah-electron/src/di/phase-2-libraries.ts:451`, `:523` | Correct (`SQLITE_DB_PATH` registered at 451, `registerPersistenceSqliteServices` at 523). |
| Electron handler registration seam | `apps/ptah-electron/src/di/phase-4-handlers.ts:103`, `:107`, `:130` | Correct (`registerPhase4Handlers`, `registerSharedRpcHandlers`, `registerSingleton(HarnessRpcHandlers)`). |
| `expected-resolvable.ts` lists handlers | `apps/ptah-electron/src/di/expected-resolvable.ts:55` | Correct. Handler classes are listed; add `BotsRpcHandlers` and the new tokens. |
| CLI persistence helper and DB path | `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts:65`, `:108` | Correct (same `resolvePtahDbPath`, same helper). |
| CLI RPC surface | `libs/backend/cli-engine/src/lib/container.ts:1121`, `:1129` | Correct (`registerHarnessServices`, `registerRpcSurface`). |
| `RpcUserError` carries message and code only | `libs/backend/vscode-core/src/messaging/rpc-types.ts:85-90` | Correct. |
| Error code union | `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts:10`, `:16` | Correct. `PERSISTENCE_UNAVAILABLE`, `UNAUTHORIZED_WORKSPACE`, `MODEL_NOT_AVAILABLE` exist. |
| Persistence registration and public helper | `libs/backend/persistence-sqlite/src/lib/di/register.ts:37`, `:47`; `src/index.ts:121` | Correct. Tokens are in `di/tokens.ts` (not in B04, finding 4). |
| Surface identity and `ViewType` | `libs/shared/src/lib/types/webview-surface.types.ts:51`, `:76`; `libs/frontend/core/src/lib/services/app-state.service.ts:35`, `:48` | Correct. `ViewType` and `SURFACE_ROUTE_IDS` exist; `app-state.service.ts` re-exports the type. |
| Electron-only route guard | `apps/ptah-extension-webview/src/app/app.routes.ts:146`, `:157`; guard import `:11` | Correct. |
| List-detail 768 px | `libs/frontend/ui/src/lib/foundation/list-detail.component.ts:9-12` | Correct. 768 is hard-coded in six container-query class strings. `splitAt` must change the template classes, not only a signal (plan `:59` should say so). |
| Tasks tab in shell | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:296-309` | Correct. |
| Proposal store validates before write | `libs/backend/rpc-handlers/src/lib/harness/config/harness-proposal-store.service.ts:144-155` | Correct (`HarnessProposalSchema.parse` then write). |
| `PTAH_DB_PATH` override | `libs/backend/persistence-sqlite/src/lib/db-path.ts:49`, `:55` | Correct. |
| Jest config for cli-engine | `libs/backend/cli-engine/jest.config.cjs` | **Wrong.** Plan implies `jest.config.ts` (finding 2). |
| tsconfig for Electron app | `apps/ptah-electron/tsconfig.app.json` | **Wrong.** Plan implies `tsconfig.lib.json` (finding 3). |
| Alias collision `bots`, `bots-ui` | `tsconfig.base.json` | No collision. No bot library or alias exists. |
| Boundary tags for new libraries | `eslint.config.mjs:282-287`, `:372-387` | Correct (finding 9). |

## Lane-introduced constraints

| # | Constraint | Decision | Reason |
| --- | --- | --- | --- |
| 1 | Library names `bots`, `bots-ui`, tags, port placement | Accept | No collision. Tags satisfy the rules. Keep SQL port in persistence and policy in `bots`. |
| 2 | Schema 2 plus synthetic schema 1 | Accept | Needed to meet the "older record upgrades" criterion. Keep it labeled as a synthetic fixture. |
| 3 | Every state edit is revisioned; no-op does not increment; restore leaves disabled | Accept | Matches the definition's full-snapshot rule. Restore disabled is safe. Enable toggle revision noise is acceptable. |
| 4 | Minimal tombstone and retained source identity | Needs user decision | It keeps data after the user chose hard delete. The retained fields must be minimal and stated to the user. See question 1. |
| 5 | Empty production retention participants, refusal for unexpected owned data | Accept with change | Correct for phase 1. Fix finding 7 so "keep history" never purges revisions. |
| 6 | `splitAt` 768/960 on the shared list-detail | Accept | Default keeps current behavior. Requires template class changes (spot-check). Check other consumers' specs stay green. |
| 7 | Conflict detail from a new `get`, no force-save, no error-details payload | Accept | `RpcUserError` carries only message and code. This fits the transport. |
| 8 | Catalog validation only for changed selections | Accept | Prevents a stale skill from blocking rename or disable. Add a test. |
| 9 | Names not unique; sort by name then id; no FTS; no automatic mutation retry | Accept | Safe. Duplicate names must show an id hint in the UI (design item). |
| 10 | Explicit source selection, no import commit, no import UI | Needs user decision | It narrows "repeatable, source-preserving import" to preview only. Matches the plan's recommended placeholder. See question 2. |

## Questions for the user

1. **Tombstone content after hard delete.** The tombstone keeps id, owner scope and retention choices. Options: (a) keep id, scope, workspace root and retention only (Recommended); (b) also keep the name for retained history screens; (c) keep nothing and refuse "keep" choices. Recommendation: (a), and add the name only when history retention is chosen.
2. **Import in phase 1.** Options: (a) backend preview only with an inert placeholder in the UI (Recommended); (b) add a commit RPC and a designed import UI now. Recommendation: (a). It matches decisions 1, 3 and the "no undesigned UI" rule.
3. **Import ledger table.** Options: (a) defer `bot_import_sources` until import commit exists (Recommended); (b) create it now and test with fixture rows. Recommendation: (a). It removes an unused table.
