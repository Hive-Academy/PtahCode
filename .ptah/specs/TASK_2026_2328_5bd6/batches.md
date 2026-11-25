# Batches - TASK_2026_2328_5bd6

Decomposition of `implementation-plan.md` (APPROVED at Gate 2, revision log round 1 fixed, round 2
residual notes applied below). Team-leader, decomposition mode. No production code in this file.

- Worktree (W): `/home/amun/ptah-extension/.claude-worktrees/performance-backed-routing`
- Plan (PLAN): `W/.ptah/specs/TASK_2026_2328_5bd6/implementation-plan.md`
- Requirements: `W/.ptah/specs/TASK_2026_2328_5bd6/task-description.md` (FA1-FA9)
- All paths in this file are absolute. Commands run with `cwd = W`.

## Totals

| Item | Value |
| --- | --- |
| Batches | 31 (B1-B31), plus the Electron visual review and the full gate after B31 |
| Work units | 32 plan units (WU0-WU19b) + 1 user-approved unit (WU20) = 40 executable units after the splits below |
| Team-leader splits | WU3b -> WU3b-w (writer) + WU3b-a (APM); WU13 -> WU13a (adapter) + WU13b (runner); WU7 -> WU7 (score) + WU7r (reasons); WU8 -> WU8a (store, absorbs WU8b) + WU8c (gather) + WU8d (plan/assemble); new WU9c (service-level spec); WU20 -> WU20a/b/c |
| Nx projects written | 14: shared, persistence-sqlite, lane-outcomes, codex-runtime, acp-runtime, cli-agent-runtime, lane-routing, rpc-handlers, vscode-lm-tools, platform-core, agent-sdk, chat, webview-e2e-harness (+ gate on ptah-extension-webview, ptah-electron) |
| Status | B1-B28 COMPLETE. B29, B30 IN_PROGRESS. All others PENDING. Manifest red fixed by B27 |
| Estimated executor context | 4,500-13,500 tokens per batch (see each batch). None above the 16,000 ceiling |
| Plan validation | PASS with 0 BLOCKER, 11 RISK (all have a batch-level mitigation), 4 ASSUMPTION |
| Status | See the Status row above |

### Token method

`ptah_count_tokens` calibration: `pipeline/gather.ts` = 6,383 tokens (bytes/4 = 6,954);
`route-decide.gate.spec.ts` = 18,663 tokens (bytes/4 = 18,774). So bytes/4 is a safe upper
estimate. Each batch weight = (read ranges + write files + inline contract excerpts) by bytes/4,
plus 10 %. Files above 1,000 lines are read by line range only. "Actual tokens" stays `pending`
until the executor returns.

### Required skills (all batches)

`nx-workspace-architect` (all batches) and `angular-frontend-patterns` (B30, B31 only) are
assigned. Neither skill is in this host's skill catalogue, and the host refused both earlier
("disabled for model invocation in skillOverrides settings", plan line 13, D14). This file does
not use or rebuild their rules. Nx boundaries come from `W/eslint.config.mjs:279-319` and the
`project.json` tags. Angular rules come from
`W/libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts`. Each batch
carries the skill ids so that an executor whose host allows them loads them.

### Lane brief rules (coordinator copies this block into every lane brief)

1. Work only in `W`. Write only the files of your batch's write set.
2. Do not run `npm run verify`, `nx`, build, serve, dev, e2e or package targets.
3. Run only the lane-level checks of your batch:
   `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
   `npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`.
4. Never run git commands that change the tree. Do not commit or push. The coordinator commits.
5. Electron first. Keep provider CLI lanes, `platform-cli` and `cli-engine` working. Add only
   optional fields on shared types.
6. Do not edit `W/libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts` or its
   fixture after B1. A failure there is an off-mode regression. Report it, do not "fix" the fixture.
7. Replace in place. No `V2`/`Legacy` copies. Delete code that your change makes unused.
8. Report: changed files, check output (tail only), and each unmet acceptance item.

### Coordinator checks

- After each batch: `npm run verify -- --related -p <projects>` then
  `npm run verify -- -t lint,typecheck -p <projects>`. Write output to `W/.ptah/tmp/<batch>.log`
  and filter the file.
- Do not start a coordinator check of a project while a lane still edits that project. In a batch
  with two or more lanes on one project, run the check only after all lanes end.
- Projects use scoped Nx names (`@ptah-extension/<name>`); apps are `ptah-extension-webview` and
  `ptah-electron`.
- Full gate before the first push (and before each later push that changes code):
  `npm run verify -- -p @ptah-extension/shared,@ptah-extension/persistence-sqlite,@ptah-extension/lane-outcomes,@ptah-extension/codex-runtime,@ptah-extension/acp-runtime,@ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing,@ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools,@ptah-extension/platform-core,@ptah-extension/agent-sdk,@ptah-extension/chat,@ptah-extension/webview-e2e-harness,ptah-extension-webview,ptah-electron`
  then `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.
  Confirm the header says "Running target test for 15 projects" (webview-e2e-harness has only
  `typecheck`, so the test header can show 14; the typecheck header must show 15).
- Commit after each batch that passes (B1 MUST be committed before B3 starts).

---

## Plan validation

Method: every named file checked on disk (`[ -e ]` over 98 paths), every new file checked absent,
cited lines read, producer/consumer shapes compared, dependency order checked.

| # | Class | Finding | Evidence | Mitigation (batch) |
| --- | --- | --- | --- | --- |
| V1 | OK | Every changed file named in §7 exists (98 paths checked). Every new file is absent except V2 | file check run 2026-11-25 | - |
| V2 | RISK | `provider-session-lane-handle.spec.ts` exists (2,112 lines). Plan §1.1 and §6 mark it "new" | `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.spec.ts` | B18: append a new `describe`, do not create or overwrite |
| V3 | RISK | "APM spawn spec" pattern `rg "model: resolvedModel"` finds nothing. `agent-process-manager.service.spec.ts` is 6,789 lines (about 64,000 tokens) | grep run; the repo already splits APM specs (`.account-binding`, `.guard`, `.restore`, `.wait`, `.workspace-scope`) | B16: new file `agent-process-manager.spawn-effort.spec.ts` (decision TL3) |
| V4 | OK + verification step | Open check WU3b: does APM write a failed completion when `runSdk` throws after admission? Code read: `spawn()` catch calls `failSpawn` (`agent-process-manager.service.ts:826-829`). `failSpawn` (`:832-854`): if `spawnReplied` is false it deletes the record and returns, so NO completion signal and NO outcome row. If `spawnReplied` is true it calls `signalLaneCompletion` (`:851`), which reaches `LaneCompletionNotifier` -> `enqueueLaneCompletionOutcome` (`lane-completion-notifier.service.ts:610`) | read of both files | B16 step 1: the executor re-reads `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:780-860` and `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:560-640`, confirms both paths with one spec case each, and reports the `spawnReplied === false` gap (FA5.2). No synthetic row |
| V5 | RISK | Migration 0078 is free today (origin/main `ac25cf011` ends at `0077_code_symbol_files.ts`). A parallel branch can claim 0078 before this PR merges | `git ls-tree origin/main .../migrations/` | B5 and before each push: coordinator re-lists migrations on `origin/main`; renumber if 0078 is taken |
| V6 | RISK | WU8 write set reads 4 pipeline files of about 6,000-6,400 tokens each plus contracts: about 30,000 tokens | sizes: gather 6,383 (counted), phase-plan 6,348, assemble-gate 6,078, capability-matrix.store 6,055 (bytes/4) | Split into WU8a (B21), WU8c (B23), WU8d (B24). WU8b merges into WU8a |
| V7 | RISK | `route-choice.spec.ts` (WU8) lists a `routeId` case, but `routeId` is minted in `RouteDecideService` (WU9), which lands after WU8. The setting reader is consumed only in WU9 | plan 2.10, 3.3 step 1; §7 order | WU8d tests the pipeline functions with an injected `routeId`. New WU9c (B26) adds service-level cases to `route-decide.gate.spec.ts`: id factory, absent reader = off (D25), on-mode read, facts stored |
| V8 | RISK | WU20 (decisions.md row 20) needs a UI label. The composer gets efforts as `readonly string[]` through 4 projects: `cli-adapter.interface.ts:80-86,408-411` -> `agent-message-coordinator.service.ts:103-145` -> `rpc-agents.types.ts:84-96` + `agent-message-rpc.handlers.ts:166-185` -> `lane-composer.component.ts:117-125,349-352` | read of each file | Split WU20a (cli-agent-runtime, the removal), WU20b (shared + rpc-handlers pass-through), WU20c (chat label). WU20a runs after WU14b (B18) because both write `codex-app-server-lane-models.ts` and `codex-app-server-lane.adapter.ts` |
| V9 | RISK | Round-2 note 2: offer rules in 2.12.4 do not name a `ptah-fallback` input list | `implementation-plan-review.md:286-291` | B6: treat a `ptah-fallback` `nativeEfforts` the same as rule 4 (labeled fallback mapper). Spec case added (decision TL4) |
| V10 | RISK | Round-2 note 1: WU0 and WU19 share a project | `implementation-plan-review.md:282-285` | WU0 is B1 alone; WU19 is B3 and starts only after the B1 commit |
| V11 | RISK | WU0 golden must be deterministic. `RouteDecideService` reads `deps.now` (`route-decide.service.ts:108,605`) and `deps.seams.monotonicNow` (`:164`); results carry `durationMs` (`:206,218,517`) | read | B1: inject fixed `now` and `seams.monotonicNow`; remove only `routeId` before the compare. If any other field still varies, stop and report (no extra key stripping without coordinator approval) |
| V12 | OK | Cited lines match: `score.ts:129-131` (system CLI block), `codex-app-server-lane-models.ts:41-44` (`validatedEffort` filter), `di/register.ts:221` (`new RouteDecideService`), `route-decide-result.schema.ts:191-192` (`MODEL_EFFORTS`), `agent-spawn-args.schema.ts:75` (`MAX_EFFORT_LENGTH = 32`), `protocol-dispatcher.ts:1419`, `agent-tool.dispatcher.ts:505`, `decision-matrix-page.component.ts:92`, `rpc.types.ts:168,203,2069,3974`, `lane-outcome.types.ts:122-139` (15-key summary), `agent-process.types.ts:330-334` | read | - |
| V13 | OK | "Shared barrel" of WU1 is `W/libs/shared/src/index.ts` (`:28` agent-process, `:30` lane-outcome) | grep | B2 |
| V14 | OK | Rotation store pattern lives at `W/libs/backend/lane-routing/src/lib/ranking/rotation.store.ts` (plan cites file name only) | find | B10 read set |
| V15 | OK | Dependency order of §7 is valid after the splits. No cycle. `cli-agent-runtime` never imports `lane-routing`; `lane-outcomes` and `lane-routing` meet only through `shared` | plan §1 | - |

### Assumptions

- A1: `npm run verify -- -p` accepts the scoped Nx names (`@ptah-extension/<name>`). If the
  coordinator sees "No projects", use the short names of the CLAUDE.md example.
- A2: `ComposerEffortPickerComponent` shows `ComposerEffortOption.description`
  (`composer-effort-picker.component.ts:42-52,59`). WU20c puts the label there. If the picker hides
  the text, WU20c reports it and the coordinator decides on a template change.
- A3: WU12b adds an `agent:getRoutingEvidence` answer to the Electron settings scenario so the new
  component does not stay `aria-busy` (same reason as `settings.fixtures.ts:823-825`).
- A4: The off-mode route result of today has no field that depends on a random value other than
  the new `routeId`. B1 proves this on unchanged code.

### Edge cases the batches must keep

- Old outcome rows (new columns `NULL`) read as `null` and land in the `*` buckets (plan 2.4). B5, B11, B15.
- Claude `supportsEffort: true` with absent or empty levels is `unknown`, never an empty native list (R0). B12.
- Codex absent `supportedReasoningEfforts` stays absent (`codex-context.ts:1472` today gives `[]`). B7, B18.
- A requested effort outside the native list is not sent and not mapped; precedence continues (D18). B6.
- Over-long `decisionModel` id is truncated to 128 characters in two places and the row is still written. B13, B25.
- Unknown, evicted or other-lane `routeId`: spawn without facts, log ids only. B28.
- A seed with any dropped row fails a spec. B3, B10.
- Off mode: `score()` without `choice` runs today's body; golden stays green after every batch.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| TL1 | 31 small batches; one executor per batch except B10, B13, B16, B18 (2-3 file-disjoint lanes on one project, check after all end) | fewer large batches / this | 6-file and 16,000-token limits; plan §7 suggested 9 batches with up to 8 units | yes |
| TL2 | WU0 alone in B1 and committed before any other batch | WU0 + WU1 + WU11 (plan) / alone | Task brief rule: batch 1 alone or only with test-only work | yes |
| TL3 | APM spawn cases go to a new split spec `agent-process-manager.spawn-effort.spec.ts` | append to the 6,789-line spec / split file | V3; six existing split APM specs | yes |
| TL4 | `resolveLaneEffort` treats a `ptah-fallback` `nativeEfforts` as rule 4 | reject / rule 4 | V9; the registry returns only `native`/`unknown`, so this is a guard | yes |
| TL5 | WU20 contract: `LaneTurnOptionsCatalog`, `StoppedLaneCatalog`, `LaneTurnOptionsView` and `AgentGetLaneComposerOptionsResult` get optional `unsendableEfforts?: readonly string[]` (subset of `efforts`, the values `validatedEffort` rejects). `efforts` is the native union unchanged | separate list / per-item objects / optional subset field | Optional field keeps VS Code, TUI, `platform-cli`, `cli-engine` unchanged; per-item objects would break `efforts: readonly string[]` consumers (`lane-turn-settings.store.ts:213-215`) | yes |
| TL6 | The live setter refusal (`codex-app-server-lane.adapter.ts:889-890`) and spawn check (`:336`) stay. Only the composer list filter goes | remove all / composer only | decisions.md row 20 names `codexAdvertisedEfforts` only; the lane still cannot send these values, so the label tells the user why a pick is refused | yes |
| TL7 | Split WU8 and add WU9c | keep WU8 at about 30,000 tokens / split | V6, V7 | yes |

---

## Batches

Legend. Shape: mechanical / logic / contract / test / docs. Weight: est. tokens incl. 10 %.
Executor: "CLI lane" by default; tier words only (no vendor or model id). Review family: the
phase reviewer comes from a different model family than the executor of the batch.

### B1 - WU0 off-mode golden (test only, unchanged code)

- **Status**: COMPLETE (commit 6da0941f7; 2 lane rounds, golden revised once)
- **Shape / weight**: test / est. 7,800. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**:
  - `W/libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts:1-300` (imports, `harness()` at :204, service build at :240)
  - `W/libs/backend/lane-routing/src/lib/route-decide.service.ts:90-170,600-610` (deps, `now`, `seams.monotonicNow`)
  - `W/libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:290-346` (`GateResultSchema`)
  - `W/libs/backend/lane-routing/src/lib/lane-model-listing.port.ts` (whole, 15 lines)
  - PLAN:982-997 (§4.5)
- **Write set**: `W/libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts` (new); `W/libs/backend/lane-routing/src/lib/pipeline/__fixtures__/route-off-golden.json` (new)
- **Contract excerpt**: build `RouteDecideService` with today's deps only (no `performanceRouting`). Listing fixtures carry no `efforts`. Fixed `now: () => 1_790_000_000_000` and `seams.monotonicNow`. Cover at least: one implement gate with two system CLI lanes and one Ptah CLI lane, one review gate, one lane at limit. Before compare: `delete result.routeId` (no-op today). Compare with `toEqual(fixture)`.
- **Fixture generation**: write a temporary script under `W/.ptah/tmp/` that prints the result JSON; paste it into the fixture; delete the script. The spec itself never writes the fixture.
- **Depends on**: none
- **Required Skills**: nx-workspace-architect (host refused; see header)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `senior-tester`
- **Review family**: test review by a different family; check that no field is stripped other than `routeId`
- **Mode / parallel**: sequential, alone. Nothing else starts until B1 is committed
- **Lane checks**:
  - `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`
  - `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`
  - `npx eslint libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`. Then commit (`test(lane-routing): ...`)
- **Acceptance**: spec passes on unchanged code (FA4.3); fixture is deterministic over 2 runs (FA4.3); no source file changed (`git status` shows only the 2 files) (FA9.6, D9)

### B2 - WU1 shared contracts

- **Status**: COMPLETE (commit a118a5241; codex lane 2696dac7. Electron and renderer typecheck runs after B3)
- **Shape / weight**: contract / est. 10,400. **Actual tokens**: unavailable
- **Projects**: shared (1)
- **Read set**:
  - `W/libs/shared/src/lib/types/lane-outcome.types.ts` (whole, 233 lines)
  - `W/libs/shared/src/lib/types/agent-process.types.ts:300-345,480-590`
  - `W/libs/shared/src/lib/types/rpc.types.ts:160-210,2060-2075,3965-3980`
  - `W/libs/shared/src/lib/types/rpc/rpc-capability-matrix.types.ts` (whole, pattern)
  - `W/libs/shared/src/index.ts:20-40`
  - `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts:138-145` (`LaneModelSource` values)
  - PLAN:120-207 (§2.1, §2.2), PLAN:284-322 (§2.6), PLAN:540-605 (§2.11 RPC)
- **Write set**: `W/libs/shared/src/lib/types/lane-native-values.types.ts` (new); `W/libs/shared/src/lib/types/lane-outcome.types.ts`; `W/libs/shared/src/lib/types/agent-process.types.ts`; `W/libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts` (new); `W/libs/shared/src/lib/types/rpc.types.ts`; `W/libs/shared/src/index.ts`
- **Contract excerpt**: exactly the TypeScript of PLAN §2.1, §2.2 (14 optional nullable fields, `OUTCOME_MODEL_SOURCES`, `OUTCOME_EFFORT_SOURCES`, `MAX_OUTCOME_EFFORT_LENGTH = 32`, summary Pick +14 keys incl. `routedEffort`), §2.6 (`modelSource`, `spawnEffort`, `reportedSession`, `routeFacts`, `SpawnAgentRequest.route`, `RouteSpawnFacts`), §2.11 (RPC types; registry entry `'agent:getRoutingEvidence'` next to `:2069`; method map next to `:3974`).
- **Depends on**: B1 committed
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: contract review by a different family; check optional-only additions
- **Mode / parallel**: may run in parallel with B3 and B4 (file-disjoint, different projects, no shared registry)
- **Lane checks**:
  - `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`
  - `npx eslint libs/shared/src/lib/types/lane-native-values.types.ts libs/shared/src/lib/types/lane-outcome.types.ts libs/shared/src/lib/types/agent-process.types.ts libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts libs/shared/src/lib/types/rpc.types.ts libs/shared/src/index.ts`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/shared`; `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,ptah-extension-webview,ptah-electron` (shared-lib rule: affected Electron and renderer)
- **Acceptance**: every new field optional (FA2.4); no text field in `LaneOutcomeSummary` (FA2.5); `agent:getRoutingEvidence` in the registry and the method map (FA6); `EffortSupport` has the three provenance arms (FA8.3)

### B3 - WU19 seed format

- **Status**: COMPLETE (commit db5e90e72; claude e606cde6 partial, codex b3055aa9 finished, round 2 codex 35d3495b fixed store spec fixture)
- **Shape / weight**: logic / est. 8,900. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**:
  - `W/libs/backend/lane-routing/src/lib/matrix/matrix.types.ts` (whole)
  - `W/libs/backend/lane-routing/src/lib/matrix/matrix.schema.ts` (whole)
  - `W/libs/backend/lane-routing/src/lib/matrix/seed-matrix.ts` (whole)
  - `W/libs/backend/lane-routing/src/lib/matrix/seed-matrix.spec.ts` (whole)
  - `W/libs/backend/lane-routing/src/lib/routing-constants.ts:40-70`
  - `W/libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:185-195`
  - PLAN:748-842 (§2.13)
- **Write set**: `.../lane-routing/src/lib/matrix/matrix.types.ts`; `.../matrix/matrix.schema.ts`; `.../matrix/seed-source.ts` (new); `.../matrix/seed-aliases.ts` (new, data only); `.../matrix/seed-matrix.ts`; `.../matrix/seed-matrix.spec.ts` (all under `W/libs/backend/lane-routing/src/lib/`)
- **Contract excerpt**: PLAN §2.13 `SeedSourceRowSchema`, `SeedAliasSchema`, `SeedCompileResult`, `compileSeed(rows, aliases, nowMs)`; four seed-only cell fields required by `superRefine` when `source === 'seed'`, rejected for `user`/`local`; `MatrixProfile.effort?: ModelEffort`, duplicate key `[family, model, effort ?? '*']`; today's `resolve()` reads only profiles without `effort`. Shipped row: `swe-bench-verified`, `NOASSERTION`, `2026-10-14`, `GLM-5 high`, `implement`, score 80.
- **Depends on**: B1 committed
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B2 and B4
- **Lane checks**:
  - `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/matrix/seed-matrix.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`
  - `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`
  - `npx eslint <6 written files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: `buildSeedMatrix` gives today's value plus the 4 fields, zero dropped rows (FA9.1, FA9.6); `seed-aliases.ts` exports one `const` array and no function (FA9.3); golden green (FA9.6)

### B4 - WU11 setting key

- **Status**: COMPLETE (commit f64eb2971; claude lane bcf3e713 stopped by user request after its edits, coordinator verified the edits and checks)
- **Shape / weight**: mechanical / est. 4,500. **Actual tokens**: unavailable
- **Projects**: platform-core, agent-sdk (2)
- **Read set**: `W/libs/backend/platform-core/src/file-settings-keys.ts:130-160,380-410`; `W/libs/backend/platform-core/src/file-settings-manager.ts:40-70`; `W/libs/backend/agent-sdk/src/lib/types/settings-export.types.ts:80-110`; `W/libs/backend/lane-routing/src/lib/scope/lane-rotation-setting.ts` (key pattern); PLAN:527-538
- **Write set**: `W/libs/backend/platform-core/src/file-settings-keys.ts`; `W/libs/backend/platform-core/src/file-settings-manager.ts`; `W/libs/backend/agent-sdk/src/lib/types/settings-export.types.ts`
- **Contract excerpt**: key `agentOrchestration.performanceRouting`, boolean, default `true`; in `FILE_BASED_SETTINGS_KEYS`, defaults, `ROUTING_KEYS`, settings export list. Mirror the `laneRotation` key entries.
- **Depends on**: B1 committed
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, fast tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: style review only
- **Mode / parallel**: may run in parallel with B2 and B3
- **Lane checks**: `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`; `npx eslint <3 files>`; run any existing spec that lists the keys: `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs that reference ROUTING_KEYS or FILE_BASED_SETTINGS_KEYS>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/platform-core,@ptah-extension/agent-sdk`; `npm run verify -- -t lint,typecheck -p @ptah-extension/platform-core,@ptah-extension/agent-sdk`
- **Acceptance**: key is file-based, default `true`, in routing keys and export list (FA6, Q3/D9)

### B5 - WU2 row schema and migration 0078

- **Status**: COMPLETE (commit d85e23c52; antigravity 52ee4241 (write-only), round 2 0f64264e fixed 3 test files)
- **Shape / weight**: contract / est. 9,300. **Actual tokens**: unavailable
- **Projects**: lane-outcomes, persistence-sqlite (2)
- **Read set**: `W/libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.ts` (whole); `W/libs/backend/persistence-sqlite/src/lib/migrations/0077_code_symbol_files.spec.ts:1-80`; `W/libs/backend/persistence-sqlite/src/lib/migrations/index.ts:1-30,480-528`; `W/libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts` (whole); `W/libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.ts:1-110`; `W/libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts:1-120`; `W/libs/shared/src/lib/types/lane-outcome.types.ts` (after B2); PLAN:221-252
- **Write set**: `W/libs/backend/persistence-sqlite/src/lib/migrations/0078_lane_outcome_choice_keys.ts` (new); `W/libs/backend/persistence-sqlite/src/lib/migrations/0078_lane_outcome_choice_keys.spec.ts` (new); `W/libs/backend/persistence-sqlite/src/lib/migrations/index.ts`; `W/libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts`; `W/libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.ts`; `W/libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts`
- **Contract excerpt**: the 14 `ALTER TABLE lane_outcome_records ADD COLUMN ...` of PLAN §2.3; register version 78 after 77; 14 pairs in `columns` (`sqlite-lane-outcome.store.ts:28-56`); schema entries `.nullable().default(null)`, model ids `.min(1).max(200)`, efforts `.max(MAX_OUTCOME_EFFORT_LENGTH)`, `decisionModel.max(128)`, `proposalConfidence.min(0).max(1)`.
- **Pre-step (coordinator)**: re-list `origin/main` migrations (V5)
- **Depends on**: B2
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family (data migration)
- **Mode / parallel**: may run in parallel with B6 and B7 (max 3 lanes)
- **Lane checks**:
  - `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0078_lane_outcome_choice_keys.spec.ts`
  - `npx jest --config libs/backend/lane-outcomes/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts`
  - `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/lane-outcomes/tsconfig.lib.json`; `npx eslint <6 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-outcomes,@ptah-extension/persistence-sqlite`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-outcomes,@ptah-extension/persistence-sqlite`
- **Acceptance**: 14 columns exist; a pre-0078 row reads `NULL` (FA2.4); 14 fields round-trip; old row decodes `null` (FA2, FA8.2)

### B6 - WU3a effort policy and native effort registry

- **Status**: COMPLETE (commit 9ea49dddd; codex 1b8c57b8, round 2 codex 261cda0c updated 3 specs. Review note: refused reviewer default falls through to step 5 (plan 2.12.4 step 3). Electron typecheck at full gate)
- **Shape / weight**: logic / est. 12,100. **Actual tokens**: unavailable
- **Projects**: cli-agent-runtime (1)
- **Read set**: `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts` (whole, 499 lines); `.../cli-agents/lane-spawn-policy.spec.ts` (whole); `.../cli-agents/cli-adapters/cli-adapter.interface.ts:55-100,130-150,400-490`; `.../cli-agents/cli-detection.service.ts:1-80,430-520`; `W/libs/shared/src/lib/types/lane-native-values.types.ts` (after B2); PLAN:607-731 (§2.12.1, §2.12.4) (all `.../cli-agents/` = `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/`)
- **Write set**: `.../cli-agents/cli-adapters/cli-adapter.interface.ts`; `.../cli-agents/lane-spawn-policy.ts`; `.../cli-agents/lane-spawn-policy.spec.ts`; `.../cli-agents/native-effort.registry.ts` (new); `.../cli-agents/native-effort.registry.spec.ts` (new); `.../cli-agents/cli-detection.service.ts`
- **Contract excerpt**: `CliModelInfo.efforts?: Extract<EffortSupport,{provenance:'native'}>`; `SdkHandle.reportedSession?()`, `SdkHandle.effortDelivery?`; `laneEfforts` JSDoc says labeled fallback; `NativeEffortRegistry.recordCatalog/recordSession/lookup`; `CliDetectionService.recordNativeCatalog(laneKey, models)` and `nativeEfforts(laneKey, model)`; `LaneEffortInput.nativeEfforts?`; `LaneEffortResolution` with `requested`, `provenance`, `disposition`; rules R0 and 1-4 of PLAN §2.12.4; TL4: `ptah-fallback` input = rule 4.
- **Depends on**: B2
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, high-capability tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family (FA8.4 no-mapping rule)
- **Mode / parallel**: may run in parallel with B5 and B7
- **Lane checks**:
  - `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/native-effort.registry.spec.ts`
  - `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <6 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- **Acceptance**: native match sent unchanged; not-in-list not sent and next step used; empty native list sends nothing; unknown list uses fallback with `fallback-mapped` (`max`->`xhigh`, `minimal`->`low`), `fallback-allowlist`, `fallback-refused` (FA8.4, FA8.5); registry record/lookup/unknown default/replace (FA8.1, FA8.3); `ptah-fallback` input follows rule 4 (TL4)

### B7 - WU14a Codex runtime native values

- **Status**: COMPLETE (commit 232150f5f; codex 4b2ea746, round 2 codex 04116a4f fixed codex-runtime.spec.ts and restored .min(1))
- **Shape / weight**: logic / est. 9,000. **Actual tokens**: unavailable
- **Projects**: codex-runtime (1)
- **Read set**: `W/libs/backend/codex-runtime/src/lib/codex-context.ts:340-380,1030-1070,1450-1490`; `W/libs/backend/codex-runtime/src/lib/codex-runtime.types.ts` (range with `CodexModelInfo`, find by `rg -n "CodexModelInfo"`); `W/libs/backend/codex-runtime/src/lib/codex-context.spec.ts:1-120` + the `listModels` describe; `codex-protocol-schemas.ts:440-470,635-650` and `codex-protocol-methods.ts:40-60` (same folder); PLAN:637,654
- **Write set**: `W/libs/backend/codex-runtime/src/lib/codex-context.ts`; `W/libs/backend/codex-runtime/src/lib/codex-runtime.types.ts`; `W/libs/backend/codex-runtime/src/lib/codex-context.spec.ts`
- **Contract excerpt**: `CodexModelInfo.defaultEffort?: string`; keep absent `supportedReasoningEfforts` absent (no `[]` coercion at `:1472`); new private fields written only from server frames; `CodexContext.reportedSettings(): { model: string | null; effort: string | null }` from `thread/start`/`thread/resume` result and `thread/settings/updated`; outgoing `params.model` never changes it.
- **Depends on**: B2
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B5 and B6
- **Lane checks**: `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-context.spec.ts`; `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json`; `npx eslint <3 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/codex-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/codex-runtime`
- **Acceptance**: `listModels` keeps `defaultReasoningEffort` (FA8.1); `reportedSettings()` from server frames only (FA8.2); absent field stays absent (R0, FA8.3)

### B8 - WU15a ACP reported state
- **Status**: COMPLETE (12cebc8e6; codex e373f408 + round 2 891407c1: native default null)
- **Status**: COMPLETE (codex e373f408; round 1 fix: native default null; commit 12cebc8e6)
- **Shape / weight**: logic / est. 11,000. **Actual tokens**: unavailable
- **Projects**: acp-runtime (1)
- **Read set**: `W/libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:1060-1120` + the session-reply handling range (find `currentModelId`, `configOptions`); `W/libs/backend/acp-runtime/src/lib/acp-session-helpers.ts` (whole, 234 lines); `W/libs/backend/acp-runtime/src/lib/acp-vendor-profile.ts:180-230`; `W/libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.ts:195-225`; `W/libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts` (effort option range, find `thought_level`); `W/libs/backend/acp-runtime/src/lib/acp-session-runtime.spec.ts:1-120`; PLAN:638,655
- **Write set**: `W/libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`; `.../acp-session-helpers.ts`; `.../acp-vendor-profile.ts`; `.../profiles/grok-acp-profile.ts`; `.../profiles/antigravity-acp-profile.ts`; `.../acp-session-runtime.spec.ts` (all under `W/libs/backend/acp-runtime/src/lib/`)
- **Contract excerpt**: `AcpVendorProfile.effortConfigId?: string` (grok `reasoning_effort`, antigravity `thought_level`); `AcpSession.getReportedState(): { model: string | null; effort: string | null; efforts: EffortSupport }`; model = `models.currentModelId`, else model option `currentValue`, never `acknowledgedModel`/`options.model`; efforts `native` only when the option lists at least one value, else `unknown`.
- **Depends on**: B2
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B9 and B10 (start when one of B5-B7 ends; max 3 lanes)
- **Lane checks**: `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/acp-session-runtime.spec.ts libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.spec.ts libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts`; `npx tsc --noEmit --project libs/backend/acp-runtime/tsconfig.lib.json`; `npx eslint <6 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/acp-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/acp-runtime`
- **Acceptance**: `getReportedState()` never returns the requested model; effort `currentValue` and advertised values; absent gives null and unknown (FA8.2, FA8.6)

### B9 - WU4a spawn argument `route`

- **Status**: COMPLETE (3b52b2225; antigravity 44552c4c + coordinator fix: route_decide description budget, tool list snapshot)
- **Shape / weight**: contract / est. 10,200. **Actual tokens**: unavailable
- **Projects**: vscode-lm-tools (1)
- **Read set** (prefix `W/libs/backend/vscode-lm-tools/src/lib/code-execution/`): `mcp-core/agent-spawn-args.schema.ts` (whole); `mcp-core/agent-spawn-args.schema.spec.ts:1-120`; `mcp-core/protocol-dispatcher.ts:1395-1480`; `mcp-stdio/agent-tool.dispatcher.ts:485-545`; `mcp-core/tool-description.builder.ts:940-995`; `mcp-core/route-tools.ts` (whole); `W/libs/shared/src/lib/types/agent-process.types.ts` (`SpawnAgentRequest.route`, after B2); PLAN:898-901
- **Write set**: `mcp-core/agent-spawn-args.schema.ts`; `mcp-core/protocol-dispatcher.ts`; `mcp-stdio/agent-tool.dispatcher.ts`; `mcp-core/tool-description.builder.ts`; `mcp-core/route-tools.ts`; `mcp-core/agent-spawn-args.schema.spec.ts` (same prefix)
- **Contract excerpt**: `route: z.object({ routeId: z.string().min(1).max(64), phaseId: z.string().min(1).max(<existing phase id bound>) }).strict().optional()`; both dispatchers copy `route` into the request next to `routingSource`; tool descriptions tell the coordinator to pass `route: { routeId, phaseId }` from `ptah_route_decide`. Callers never set `routeFacts`.
- **Depends on**: B2
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: style review by a different family
- **Mode / parallel**: may run in parallel with B8 and B10
- **Lane checks**: `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.spec.ts`; `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`; `npx eslint <6 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`; `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`
- **Acceptance**: `route` accepted with bounds, `routeFacts` not accepted from callers (FA5); both dispatchers pass it (FA5.1)

### B10 - WU5 catalog snapshot + WU19b seed tests
- **Status**: COMPLETE (a2e5ed439; lane A codex b4dae4de, lane B codex 2b402052)
- **Status**: PENDING
- **Shape / weight**: logic / lane A (WU5) est. 9,400; lane B (WU19b) est. 5,200. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: lane A: `W/libs/backend/lane-routing/src/lib/lane-model-listing.port.ts`; `W/libs/backend/lane-routing/src/lib/routing-constants.ts` (whole); `W/libs/backend/lane-routing/src/lib/ranking/rotation.store.ts:130-175`; `W/libs/backend/lane-routing/src/lib/pipeline/gather.ts:495-540`; `W/libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.ts:85-100`; PLAN:324-390, PLAN:848-865. Lane B: `W/libs/backend/lane-routing/src/lib/matrix/seed-source.ts`, `seed-aliases.ts` (after B3); PLAN:780-842; PLAN:1110
- **Write set**: lane A: `W/libs/backend/lane-routing/src/lib/lane-model-listing.port.ts`; `.../routing-constants.ts`; `.../catalog/lane-catalog.types.ts` (new); `.../catalog/lane-catalog.store.ts` (new); `.../catalog/lane-catalog.store.spec.ts` (new). Lane B: `W/libs/backend/lane-routing/src/lib/matrix/seed-source.spec.ts` (new)
- **Contract excerpt**: PLAN §2.7 (`LaneModelEntry.efforts?: EffortSupport`, `LaneCatalogModel`, `LaneCatalogEntry`, `LaneCatalogSnapshotReader`, `LaneCatalogRefresher`, constants `CATALOG_REFRESH_AGE_MS`, `CATALOG_REFRESH_TIMEOUT_MS`, `CATALOG_RETRY_AFTER_MS`, `CATALOG_STORAGE_KEY`, `EXPLORATION_PERIOD = 5`, `ROUTE_RECORD_CAP = 200`). Values copied unchanged; drop only blank ids and non-string items; zod check on read; no timer; logs hold `laneId`, status, error class only.
- **Depends on**: B2, B3
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: two CLI lanes (A balanced tier, B fast tier), file-disjoint. **Fallback**: Task subagent `backend-developer` (A), `senior-tester` (B)
- **Review family**: logic review by a different family
- **Mode / parallel**: lanes A and B in parallel; coordinator check only after both end. B10 may run in parallel with B8 and B9
- **Lane checks**: A: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/catalog/lane-catalog.store.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`. B: same config with `--runTestsByPath libs/backend/lane-routing/src/lib/matrix/seed-source.spec.ts`. Both: `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`; `npx eslint <own files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: snapshot keeps `efforts` unchanged, absent -> `unknown`, failure keeps old models, blank ids dropped, invalid document dropped with one warning, no host text in logs (FA1, FA8.1, FA8.3); seed cases of PLAN:1110 incl. exact alias match and drop counts (FA9.1-FA9.3, FA9.5)

### B11 - WU2b key-value guard test + WU12b e2e harness fixture

- **Status**: COMPLETE (antigravity c9dba3c0)
- **Shape / weight**: test / est. 6,600. **Actual tokens**: unavailable
- **Projects**: lane-outcomes, webview-e2e-harness (2)
- **Read set**: `W/libs/backend/lane-outcomes/src/lib/store/key-value-lane-outcome.store.spec.ts` (whole); `W/libs/backend/lane-outcomes/src/lib/store/key-value-lane-outcome.store.ts:60-80`; `W/libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts:800-840`; `W/libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts` (after B2)
- **Write set**: `W/libs/backend/lane-outcomes/src/lib/store/key-value-lane-outcome.store.spec.ts`; `W/libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`
- **Contract excerpt**: fixture answer `'agent:getRoutingEvidence': { windowDays: 30, performanceRouting: true, lanes: [], decisionModels: [] }` typed by `AgentGetRoutingEvidenceResult`; `settings:get` of `agentOrchestration.performanceRouting` answers `true` if the scenario lists settings keys.
- **Depends on**: B5 (WU2b), B2 (WU12b)
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, fast tier. **Fallback**: Task subagent `senior-tester`
- **Review family**: test review only
- **Mode / parallel**: may run in parallel with B12 and B13 if lane slots allow
- **Lane checks**: `npx jest --config libs/backend/lane-outcomes/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-outcomes/src/lib/store/key-value-lane-outcome.store.spec.ts`; `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`; `npx eslint <2 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-outcomes`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-outcomes,@ptah-extension/webview-e2e-harness`
- **Acceptance**: old JSON row parses; new row round-trips (FA2.4); harness typechecks with the new RPC answer (FA6)

### B12 - WU15a2 ACP profile tests

- **Status**: COMPLETE (codex 183def93)
- **Shape / weight**: test / est. 5,400. **Actual tokens**: unavailable
- **Projects**: acp-runtime (1)
- **Read set**: `W/libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.spec.ts:1-80`; `W/libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts:1-80`; the two profile files (effort option ranges, after B8)
- **Write set**: `W/libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.spec.ts`; `W/libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts`
- **Contract excerpt**: `effortConfigId` is `reasoning_effort` (grok) and `thought_level` (antigravity).
- **Depends on**: B8
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, fast tier. **Fallback**: Task subagent `senior-tester`
- **Review family**: test review only
- **Mode / parallel**: may run in parallel with B11 and B13
- **Lane checks**: `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.spec.ts libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts`; `npx eslint <2 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/acp-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/acp-runtime`
- **Acceptance**: `effortConfigId` values pinned (FA8.2)

### B13 - WU3b-w completion writer + WU13a Claude adapter + WU16 Pi session state

- **Status**: COMPLETE (codex 649578a3, one lane for A+B+C)
- **Shape / weight**: logic / lane A (WU3b-w) est. 7,300; lane B (WU13a) est. 9,800; lane C (WU16) est. 8,600. **Actual tokens**: unavailable
- **Projects**: cli-agent-runtime (1)
- **Read set** (prefix `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/`):
  - A: `lane-completion-outcome.ts` (whole); `lane-completion-outcome.spec.ts` (whole); `W/libs/shared/src/lib/types/lane-outcome.types.ts`, `agent-process.types.ts` new fields (after B2); `W/libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts` (after B5); PLAN:209-219, PLAN:867-884
  - B: `cli-adapters/claude-cli.adapter.ts:140-180,560-618`; `cli-adapters/claude-cli.adapter.spec.ts` (the `listModels` and `resolveEffort` describes only); `W/libs/backend/agent-sdk/src/lib/**/sdk-model-service.ts:300-315` (find with `rg -n supportedEffortLevels libs/backend`); PLAN:636, PLAN:699-709, PLAN:725-727
  - C: `cli-adapters/pi-cli.adapter.ts:85-160,770-800`; `cli-adapters/pi-cli.adapter.spec.ts` (the `get_state` describe); `lane-model-log.ts:30-45`; PLAN:656
- **Write set**: A: `lane-completion-outcome.ts`; `lane-completion-outcome.spec.ts`. B: `cli-adapters/claude-cli.adapter.ts`; `cli-adapters/claude-cli.adapter.spec.ts`. C: `cli-adapters/pi-cli.adapter.ts`; `cli-adapters/pi-cli.adapter.spec.ts`
- **Contract excerpt**: A: PLAN §3.2 step 4 field rules; `routingSource = info.routingSource ?? info.routeFacts?.source ?? 'not-routed'`; truncate `decisionModel` to 128 before the row. B: rule R0 four cases; `effortDelivery: { sent: null, disposition: 'lane-refused' }` when candidates existed and `resolveEffort` returns `undefined`. C: response data schema gets optional `model` and `thinkingLevel`; `reportedSession()` returns them, missing field = null/unknown; Pi efforts stay fallback-labeled (`PI_LANE_EFFORTS`).
- **Depends on**: B5, B6
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: three CLI lanes (A, C balanced tier; B high-capability tier), file-disjoint. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: lanes A, B, C in parallel; coordinator check only after all end
- **Lane checks**: each lane: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <own spec>`; `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <own 2 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- **Acceptance**: A: every §2.2 field written; `reportedSession` wins over telemetry; no value gives `unknown`; caller `routingSource` wins; over-long id stored as 128 characters and the row is written (FA2, FA5.1, FA5.3, FA7.1, FA8.2, FA8.3). B: four R0 cases and `lane-refused` (FA8.1, FA8.4). C: `get_state` with fields gives native, without gives unknown (FA8.2, FA8.6)

### B14 - WU10a listing efforts and shared flight

- **Status**: COMPLETE (codex d6e1ac6a). Gate: lint+typecheck pass; related tests 641 pass, 2 fail (rpc-allowlist.spec, host-profile/manifest.spec: no manifest owner for agent:getRoutingEvidence, red since B2 until B27 adds the handler)
- **Shape / weight**: logic / est. 11,600. **Actual tokens**: unavailable
- **Projects**: rpc-handlers (1)
- **Read set**: `W/libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.ts` (whole); `.../services/lane-model-listing.adapter.spec.ts:1-120`; `.../services/cli-model-list.service.ts` (whole); `.../services/cli-model-list.service.spec.ts:1-100`; `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-detection.service.ts` (new public methods, after B6); `W/libs/backend/lane-routing/src/lib/lane-model-listing.port.ts` (after B10); PLAN:859-865, PLAN:675-681
- **Write set**: `W/libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.ts`; `.../services/lane-model-listing.adapter.spec.ts`; `.../services/cli-model-list.service.ts`; `.../services/cli-model-list.service.spec.ts`
- **Contract excerpt**: copy `CliModelInfo.efforts` to `LaneModelEntry.efforts` unchanged; else `CliModelListService.effortSupport(cli, modelId)`: registry native > `adapter.laneEfforts?.(modelId)` as `{ provenance: 'ptah-fallback', supported, default: null }` > `{ provenance: 'unknown' }`; Ptah CLI rows unknown; `cliDetection.recordNativeCatalog('codex', models)` after `getCodexModelsFromCliCatalog`; concurrent `listAll()`/`listForClassification()` share one in-flight promise (pattern `discoveryInFlight`, `:92-96`).
- **Depends on**: B6, B10
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B13 and B15
- **Lane checks**: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.spec.ts libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.spec.ts`; `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`; `npx eslint <4 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/rpc-handlers`; `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers`
- **Acceptance**: efforts unchanged; fallback wrapped as `ptah-fallback`; one in-flight `listAll` (FA1.1, FA8.1, FA8.5); `effortSupport` order; Codex catalog recorded (FA8.1, FA8.5)

### B15 - WU6 evidence index and funnel

- **Status**: COMPLETE (codex 41abf2d9; FA7.2 on-mode wiring moved to B21, decision 28)
- **Shape / weight**: logic / est. 12,800. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: `W/libs/backend/lane-routing/src/lib/matrix/local-derivation.ts` (whole, 504 lines); `.../matrix/outcome-figures.ts` (whole); `.../decision-model/decision-payload.ts:30-60`; `.../catalog/lane-catalog.types.ts` (after B10); `.../routing-constants.ts:15-40,210-225`; failure-class constants (`rg -n CAPACITY_FAILURE_CLASSES libs/backend/lane-routing/src`); PLAN:392-460, PLAN:1035-1039
- **Write set**: `.../matrix/blend.ts` (new); `.../matrix/local-derivation.ts`; `.../matrix/choice-evidence.ts` (new); `.../matrix/choice-evidence.spec.ts` (new); `.../matrix/outcome-figures.ts`; `.../decision-model/decision-payload.ts` (all under `W/libs/backend/lane-routing/src/lib/`)
- **Contract excerpt**: PLAN §2.8 types and `deriveChoiceEvidence(summaries, nowMs)`; same window and `dedupeByRun`; bucket from SENT effort; levels (m,e),(m,*), family cells for `lane-default` with native resolved model; move `blendedRate`, `blendedMean`, `roundPercent`, `roundMean` + helpers to `blend.ts` WITHOUT change; `outcomeFiguresFrom(..., { byModelEffort })`; `DecisionOutcomeFigures.model?`, `.effort?`.
- **Depends on**: B10 (and B2, B3)
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, high-capability tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B14 and B16
- **Lane checks**: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/matrix/choice-evidence.spec.ts libs/backend/lane-routing/src/lib/matrix/local-derivation.spec.ts libs/backend/lane-routing/src/lib/matrix/outcome-figures.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`; `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`; `npx eslint <6 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: `local-derivation.spec.ts` passes with no edit (FA2.4); key rule, sent-effort bucket, `effortNotSent`, funnel order and drop-outs, capacity out of rates, aggregates, window, dedupe, decision models (FA2.4, FA3, FA7.2, FA8.4); existing `outcome-figures.spec.ts` passes with `byModelEffort: false` default

### B16 - WU3b-a APM capture + WU13b Claude composer + WU18 OpenCode native model

- **Status**: COMPLETE (codex 78795f48, one lane for A+B+C; decision 29; V4 pinned, no synthetic row. Review note: spawnEffort.source maps OUTCOME_EFFORT_SOURCES by step index)
- **Shape / weight**: logic / lane A (WU3b-a) est. 11,900; lane B (WU13b) est. 7,200; lane C (WU18) est. 8,100. **Actual tokens**: unavailable
- **Projects**: cli-agent-runtime (1)
- **Read set** (prefix `W/libs/backend/cli-agent-runtime/src/lib/`):
  - A: `cli-agents/agent-process-manager.service.ts:780-860,1361-1560,2100-2130,4524-4600`; `cli-agents/lane-completion-notifier.service.ts:560-640`; `cli-agents/agent-process-manager.service.spec.ts:1-140,555-640` (harness only); `cli-agents/cli-detection.service.ts` new methods (after B6); `ptah-cli/ptah-cli-registry.ts:805-825`; PLAN:718-721, PLAN:867-875, PLAN:1068
  - B: `claude/claude-sdk-lane-runner.ts:590-630`; `claude/claude-sdk-lane-runner.spec.ts` (describe that covers `listTurnOptions`, find by `rg -n listTurnOptions`); PLAN:636
  - C: `cli-agents/cli-adapters/opencode-cli.adapter.ts:950-975,1155-1190`; `cli-agents/cli-adapters/opencode-cli.adapter.spec.ts` (telemetry model describe); PLAN:657
- **Write set**: A: `cli-agents/agent-process-manager.service.ts`; `cli-agents/agent-process-manager.spawn-effort.spec.ts` (new, TL3). B: `claude/claude-sdk-lane-runner.ts`; `claude/claude-sdk-lane-runner.spec.ts`. C: `cli-agents/cli-adapters/opencode-cli.adapter.ts`; `cli-agents/cli-adapters/opencode-cli.adapter.spec.ts`
- **Contract excerpt**: A: at spawn `resolveLaneEffort({ ..., nativeEfforts: cliDetection.nativeEfforts(laneKey, resolvedModel) })` -> `info.spawnEffort`, `info.modelSource`, `info.routeFacts = request.routeFacts`; apply `sdkHandle.effortDelivery`; at each turn end and terminal transition copy `sdkHandle.reportedSession?.()` to `info.reportedSession` and call `recordSession` for native efforts. Step 1 = V4 verification (2 spec cases + gap report). B: composer efforts = current model's native list; `EFFORT_LEVELS` only without one. C: report model only from a paired `modelID`+`providerID` stream frame, never the request seed (`:963`).
- **Coordinator note (B6, decisions row 27)**: APM records a session list through the public `CliDetectionService.recordNativeSession(laneKey, model, efforts)` (B6), only when a `reportedSession()` read has native `efforts`. The registry stays private to `CliDetectionService`.
- **Depends on**: B13 (project serialization), B6
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: three CLI lanes (A high-capability tier; B, C balanced tier). **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family (A is the riskiest unit of the task)
- **Mode / parallel**: lanes A, B, C in parallel; coordinator check only after all end
- **Lane checks**: each lane: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <own spec>` (lane A also runs `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` once at the end); `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <own files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- **Acceptance**: A: `modelSource`, `spawnEffort` with native list, `effortDelivery` applied, `reportedSession` copied at turn end; V4 paths pinned and gap reported (FA2.1, FA5.2, FA8.2, FA8.4). B: composer native list, fallback only without one (FA8.1, FA8.5). C: request seed never reported (FA8.2)

### B17 - WU7 pair scoring + WU6b figures test

- **Status**: COMPLETE (lane A codex b10957b0, lane B antigravity 43e5a42e; decisions 30, 31)
- **Shape / weight**: logic / lane A (WU7) est. 12,400; lane B (WU6b) est. 4,300. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: A: `W/libs/backend/lane-routing/src/lib/ranking/score.ts` (whole); `W/libs/backend/lane-routing/src/lib/ranking/score.spec.ts:1-80`; `W/libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts` (whole); `.../matrix/choice-evidence.ts` (exports, after B15); PLAN:462-509, PLAN:912-980, PLAN:1006-1033. B: `.../matrix/outcome-figures.ts`, `.../matrix/outcome-figures.spec.ts` (whole); PLAN:1035-1039
- **Write set**: A: `.../ranking/score.ts`; `.../ranking/choice.types.ts` (new); `.../ranking/score-choice.spec.ts` (new); `.../contracts/route-decide-result.schema.ts`. B: `.../matrix/outcome-figures.spec.ts` (all under `W/libs/backend/lane-routing/src/lib/`)
- **Contract excerpt**: `ScoreInput.choice?: ChoiceInput`; without it today's body runs unchanged incl. `isSystemCliLane`; `ListedModel.efforts?`; `CandidateScore.effort?`; `scoreResolvedCell(..., { priorMode: 'capped' | 'blended' })` default `capped`; pairs §4.2 (native lists only, D13); choice §4.3 (closeness band, ties); explore §4.4 (exploit total kept, `parts.explore = true`); schema additions of §2.9 (`effort`, `evidence`, `explore`, `effortCheck`, `routeId`) all optional.
- **Depends on**: B15
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: lane A CLI lane high-capability tier; lane B fast tier. **Fallback**: Task subagent `backend-developer` / `senior-tester`
- **Review family**: logic review by a different family
- **Mode / parallel**: lanes A and B in parallel; check after both end
- **Lane checks**: A: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts libs/backend/lane-routing/src/lib/ranking/score.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`. B: same config, `--runTestsByPath libs/backend/lane-routing/src/lib/matrix/outcome-figures.spec.ts`. Both: `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`; `npx eslint <own files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: `score.spec.ts` unchanged and green (FA4.3); pair beats default only past the band; codex promoted in on mode only; no evidence equals today; user cell wins; not-in-catalog model is no pair; fallback/unknown lists give no effort pairs; explore rules; determinism (FA4, FA8.3); blended prior: strong seed with 40 failed runs scores 16 (FA9.4); `byModelEffort` true/false (FA7.2)

### B18 - WU14b Codex lane native values + WU15b ACP lane handle

- **Status**: COMPLETE (codex 49729dd5, one lane for A+B; decision 33. Review note: ACP handle reports ptah-fallback with an empty list when the profile has no efforts)
- **Shape / weight**: logic / lane A (WU14b) est. 10,500; lane B (WU15b) est. 10,200. **Actual tokens**: unavailable
- **Projects**: cli-agent-runtime (1)
- **Read set** (prefix `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/`):
  - A: `codex/codex-app-server-lane-models.ts` (whole); `codex/codex-app-server-lane.adapter.ts:280-345,860-935` + handle return range; `codex/codex-app-server-lane.adapter.spec.ts:1-120` + a handle describe; `W/libs/backend/codex-runtime/src/lib/codex-context.ts` `reportedSettings` (after B7); PLAN:637, PLAN:654
  - B: `provider-session/provider-session-lane-handle.ts:110-150` + effort-hint and `listTurnOptions` ranges; `provider-session/provider-session-lane-handle.spec.ts:1-120` (V2: append); `W/libs/backend/acp-runtime/src/lib/acp-session-runtime.ts` `getReportedState` (after B8); PLAN:638, PLAN:655, PLAN:728-729
- **Write set**: A: `codex/codex-app-server-lane-models.ts`; `codex/codex-app-server-lane-models.spec.ts` (new); `codex/codex-app-server-lane.adapter.ts`; `codex/codex-app-server-lane.adapter.spec.ts`. B: `provider-session/provider-session-lane-handle.ts`; `provider-session/provider-session-lane-handle.spec.ts` (EXISTS, append)
- **Contract excerpt**: A: `codexLaneModels` sets `efforts: { provenance: 'native', supported: supportedEfforts, default: defaultEffort ?? null }` unfiltered, only for a non-empty server list; handle `reportedSession()` mirrors `context.reportedSettings()` with the current model's native efforts. Do NOT touch `codexAdvertisedEfforts` (that is B22). B: `reportedSession()` from `getReportedState()`; composer prefers the session's native list; `acpProfileEfforts` stays as labeled fallback; refused hint -> `effortDelivery.disposition = 'lane-refused'`.
- **Coordinator note (B6, decisions row 27)**: `CliModelInfo` has `readonly isDefault?: boolean` (B6). The Codex model mapping sets `isDefault: true` only when Codex marks the model default (its native `isDefault` flag), and leaves it absent otherwise. Pin it in the models spec.
- **Depends on**: B16 (project serialization), B6, B7, B8
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: two CLI lanes, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: lanes A and B in parallel; check after both end
- **Lane checks**: each lane: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <own specs>`; `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <own files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- **Acceptance**: A: per-model efforts unfiltered with native default; absent field gives no `efforts`; handle mirrors context (FA8.1, FA8.2). B: session values native; fallback labeled; `lane-refused` (FA8.2, FA8.4, FA8.5)

### B19 - WU7r reasons + WU9b evidence view service

- **Status**: COMPLETE (lane A codex 632d6454, lane B codex 01f931ea; decision 32; notes added to B25, B27)
- **Shape / weight**: logic / lane A (WU7r) est. 11,200; lane B (WU9b) est. 9,000. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: A: `W/libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts` (whole, 868 lines); `.../reasons/compile-reasons.spec.ts:1-120` + one chosen-entry describe; `.../contracts/route-decide-result.schema.ts` parts (after B17); PLAN:999-1004, PLAN:507-509. B: `.../matrix/choice-evidence.ts`, `.../catalog/lane-catalog.types.ts`, `W/libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts`; `.../matrix/capability-matrix.store.ts:280-360` (summaries source); PLAN:540-605
- **Write set**: A: `.../reasons/compile-reasons.ts`; `.../reasons/compile-reasons.spec.ts`. B: `.../evidence/routing-evidence.service.ts` (new); `.../evidence/routing-evidence.service.spec.ts` (new) (all under `W/libs/backend/lane-routing/src/lib/`)
- **Contract excerpt**: A: on-mode clause `model <m> effort <e> (<evidence>, <n> samples)`; explore clause `explore <m>/<e>: <n>/3 samples, 1 of every 5 routed runs` (from constants); both-mode clause only when `inList === false`: `effort <e> not in <lane> native list; spawn sends no effort at this step`. B: builds `AgentGetRoutingEvidenceResult` from snapshot + evidence; `score: null` for zero samples; `inCatalog`; efforts with provenance unchanged; reads trigger `refreshIfDue`.
- **Depends on**: B17, B15, B10
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: two CLI lanes, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: lanes A and B in parallel; check after both end. B19 may run in parallel with B20
- **Lane checks**: each lane: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath <own spec> libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`; `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`; `npx eslint <own files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: A: three clauses as specified; golden green (no clause without efforts) (FA4.9, FA8.4). B: view, `score: null`, catalog status and age, `inCatalog: false`, provenance unchanged, decision models (FA6, FA7, FA8.3)

### B20 - WU17 Copilot effort flag

- **Status**: COMPLETE (codex 44afd3c7)
- **Shape / weight**: logic / est. 10,300. **Actual tokens**: unavailable
- **Projects**: cli-agent-runtime (1)
- **Read set**: `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:50-70,170-200,370-400,580-600`; `.../cli-adapters/copilot-sdk.adapter.spec.ts:1-120` + spawn-args describe; `cli-stdout-probe.ts` (find with `rg -ln probeCliStdout libs/backend/cli-agent-runtime/src`, whole); PLAN:732-746
- **Write set**: `.../cli-adapters/copilot-effort-flag.ts` (new); `.../cli-adapters/copilot-effort-flag.spec.ts` (new); `.../cli-adapters/copilot-sdk.adapter.ts`; `.../cli-adapters/copilot-sdk.adapter.spec.ts` (prefix `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/`)
- **Contract excerpt**: run `copilot --help` once per resolved path + version with `probeCliStdout` and the existing timeout pattern; cache in memory; `--reasoning-effort` if listed, else `--effort` if listed, else none; none -> no flag and `effortDelivery: { sent: null, disposition: 'cli-has-no-effort-flag' }`; probe failure -> none + one warning without help text; fixed `--effort` (`:382-385`) removed; setter allowlist (`:590-592`) stays as fallback.
- **Depends on**: B18 (project serialization), B6
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B19 and B21 (different project)
- **Lane checks**: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts`; `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <4 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- **Acceptance**: three help outcomes, probe failure, cache by path and version (FA8.6); spawn uses detected flag; none gives no flag and `cli-has-no-effort-flag` (FA8.4, FA8.6)

### B21 - WU8a matrix store pair resolve (absorbs WU8b)

- **Status**: COMPLETE (codex 0b7993a3; decisions 28, 31; MatrixLoadInput.choice forwarded by B23)
- **Shape / weight**: logic / est. 11,700. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: `W/libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.ts` (whole, 738 lines); `.../matrix/capability-matrix.store.spec.ts:1-140` + the `resolve` describe; `.../matrix/choice-evidence.ts` exports; `.../matrix/matrix.types.ts` (after B3); PLAN:886-892, PLAN:914-927, PLAN:774-778
- **Write set**: `W/libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.ts`; `W/libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.spec.ts`
- **Contract excerpt**: `load({ nowMs, outcomeQueries, choice?: boolean })`; with `choice: true` the snapshot also carries `evidence: ChoiceEvidence` from the same `summaries`; new pair resolve reads `user`/`seed` from (m,e) then (m,*); today's `resolve(family, model, taskKind)` and the view ignore effort profiles; without `choice` the snapshot equals today's.
- **Added by decision 28 (FA7.2)**: at `capability-matrix.store.ts:353` pass `{ byModelEffort: <performanceRouting on> }` to `outcomeFiguresFrom`; off mode passes `false` and its decision payload bytes stay unchanged. Spec pins both modes. Read `.../matrix/outcome-figures.ts` (after B15).
- **Added by decision 31 (PLAN 4.1)**: write-set addition `.../matrix/choice-evidence.ts`, `.../matrix/local-derivation.ts`: the seed prior for a choice key looks up (model, effort) first, then (model, `*`). The family/model prior for today's cells is unchanged and `local-derivation.spec.ts` stays unedited. Also use the optional `ScoreMatrix.resolvePair(family, model, taskKind, effort)` from B17.
- **Depends on**: B19 (project serialization), B15, B3
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B20 and B22 (different projects)
- **Lane checks**: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/matrix/capability-matrix.store.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`; `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`; `npx eslint <2 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: pair resolve order; `resolve` ignores effort profiles; view skips effort profiles (FA9.2); off snapshot unchanged (FA4.3)

### B22 - WU20a Codex native effort list for the composer (decisions.md row 20)

- **Status**: COMPLETE (codex 76d257a7)
- **Shape / weight**: logic / est. 11,300. **Actual tokens**: unavailable
- **Projects**: cli-agent-runtime (1)
- **Read set** (prefix `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/`): `cli-adapters/codex/codex-app-server-lane-models.ts` (whole, after B18); `cli-adapters/codex/codex-app-server-lane-models.spec.ts` (whole, after B18); `cli-adapters/codex/codex-app-server-lane-rejection.ts:1-25`; `cli-adapters/codex/codex-app-server-lane.adapter.ts:285-300,880-930`; `cli-adapters/cli-adapter.interface.ts:78-87,405-412`; `messaging/agent-message-coordinator.service.ts:100-145,520-600`; `messaging/agent-message-coordinator.service.spec.ts` (describe that covers turn options, find by `rg -n "turnOptions" ...spec.ts`)
- **Write set**: `cli-adapters/codex/codex-app-server-lane-models.ts`; `cli-adapters/codex/codex-app-server-lane-models.spec.ts`; `cli-adapters/codex/codex-app-server-lane.adapter.ts`; `cli-adapters/cli-adapter.interface.ts`; `messaging/agent-message-coordinator.service.ts`; `messaging/agent-message-coordinator.service.spec.ts`
- **Contract excerpt** (TL5, TL6): remove `.filter((effort) => validatedEffort(effort) !== undefined)` from `codexAdvertisedEfforts` (`:41-44`); the function returns the native union in catalog order, unchanged. Add pure `codexUnsendableEfforts(efforts)` = values where `validatedEffort` is `undefined`. Add `unsendableEfforts?: readonly string[]` to `LaneTurnOptionsCatalog` (`:80-86`) and `StoppedLaneCatalog` (`:408-411`); the Codex adapter sets it in `listTurnOptions` (`:914-927`) and `stoppedLaneCatalog` (`:297`) only when non-empty. `stoppedLaneView` and the cached-catalog path carry it through. The setter refusal (`:889-890`) and spawn check (`:336`) stay. The `CLI_REASONING_EFFORT_VALUES` fallback for an empty catalog stays.
- **Depends on**: B18 (same files), B20 (project serialization)
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B21 and B23 (different projects)
- **Lane checks**: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-models.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-coordinator.service.spec.ts`; `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx eslint <6 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- **Acceptance**: spec case: a catalog with a value outside Ptah's allowlist keeps it in `efforts`, in vendor order, and lists it in `unsendableEfforts` (FA8.5, decisions.md row 20); all-sendable catalog has no `unsendableEfforts`; stopped-lane view keeps the field; setter still refuses the value (TL6)

### B23 - WU8c gather on-mode catalog read + setting reader

- **Status**: COMPLETE (codex 0ae58424 + coordinator fix: on mode without a catalog keeps the listing path)
- **Shape / weight**: logic / est. 10,900. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: `W/libs/backend/lane-routing/src/lib/pipeline/gather.ts` (whole, 6,383 tokens counted); `.../pipeline/gather.spec.ts:1-100`; `.../catalog/lane-catalog.types.ts`; `.../scope/lane-rotation-setting.ts` (whole); PLAN:848-865, PLAN:886-892, PLAN:903-907, PLAN:533-534
- **Write set**: `W/libs/backend/lane-routing/src/lib/pipeline/gather.ts`; `W/libs/backend/lane-routing/src/lib/scope/performance-routing-setting.ts` (new)
- **Contract excerpt**: `gatherRouteCall(..., { choice })`; `choice: false` = today's `listModels` path (`:439-490`) unchanged; `choice: true` = §3.1 steps 2-5 (snapshot at once when `lastOkAt !== null`; never-read lane races `refresh` with `withinBudget`; reasons `models unknown for <lane> (timeout)`, `catalog for <lane> is <age> old (<status>)`); `matrix.load({ ..., choice: true })`. Setting reader: `getConfiguration('ptah', 'agentOrchestration.performanceRouting') !== false`; a throw returns `true` and warns once.
- **Depends on**: B21
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B22
- **Lane checks**: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/gather.spec.ts libs/backend/lane-routing/src/lib/pipeline/live-model-options.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`; `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`; `npx eslint <2 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: existing gather specs green; golden green (FA4.3); on-mode behavior is tested in B24 (FA1.2-FA1.4)

### B24 - WU8d phase plan, assemble, route-choice spec

- **Status**: COMPLETE (codex ef65abef)
- **Shape / weight**: logic / est. 13,500. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: `W/libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts` (ranges that build `ScoreInput` and call `score()`, find by `rg -n "score\(" ...phase-plan.ts`, about 250 lines); `.../pipeline/assemble-gate.ts:600-734`; `.../pipeline/assemble-gate.spec.ts:1-80`; `.../pipeline/tier-effort-policy.ts:140-195`; `.../ranking/choice.types.ts`; `.../pipeline/route-off-golden.spec.ts` (read only, harness reuse); PLAN:893-901, PLAN:502-509, PLAN:982-997
- **Write set**: `W/libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts`; `W/libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts`; `W/libs/backend/lane-routing/src/lib/pipeline/route-choice.spec.ts` (new)
- **Contract excerpt**: `planRoutePhases` builds `ChoiceInput` per lane candidate only in on mode (`policyEffort`, `effortFixed`, `exploreTurn` §4.4); `assembleGateResult` writes pair model/effort/provenance/score, `effortCheck` (both modes, lane entries with listed `efforts`), reason text, and the `routeId` it receives as input; off mode `ChosenEntry.effort = plan.policy.effort`. Spec drives gather + plan + assemble with an injected `routeId` (V7).
- **Added by decision 32**: in `pipeline/assemble-gate.ts` pass `selected.parts` as `ChosenReasonFacts.parts` and the ChosenEntry `effortCheck` to `compile-reasons` (both optional, B19). Off path passes today's parts unchanged; the golden must stay green.
- **Added by coordinator (B23 review)**: also test `PerformanceRoutingSetting.isEnabled()` (false only for an explicit false; a throw returns true with one warning) and that `gatherRouteCall({ choice: true })` without a `catalog` keeps the listing path.
- **Depends on**: B23, B17, B19
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, high-capability tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: sequential (lane-routing)
- **Lane checks**: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/route-choice.spec.ts libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.trace.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`; `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`; `npx eslint <3 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: second off-mode case with native efforts differs only in `effortCheck` and the 2.9 clause; on-mode snapshot read; never-read lane; stale reason; pair effort; `effortCheck` for native, fallback, unknown; `routeId` written (FA1.2-FA1.4, FA4, FA5, FA8.4); golden green

### B25 - WU9 route service, registry, wiring

- **Status**: COMPLETE (codex 6fb6df80)
- **Shape / weight**: logic / est. 12,900. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: `W/libs/backend/lane-routing/src/lib/route-decide.service.ts` (whole, 674 lines); `.../di/register.ts:180-285`; `.../di/tokens.ts` (whole); `W/libs/backend/lane-routing/src/index.ts` (whole); `W/libs/backend/rpc-handlers/src/lib/handlers/capability-matrix-rpc.handlers.ts:90-100` (`RotationStateReader` pattern); PLAN:511-525, PLAN:886-901, PLAN:1264 (D25)
- **Write set**: `W/libs/backend/lane-routing/src/lib/route-decide.service.ts`; `.../route/route-record.registry.ts` (new); `.../route/route-record.registry.spec.ts` (new); `.../di/register.ts`; `.../di/tokens.ts`; `W/libs/backend/lane-routing/src/index.ts`
- **Contract excerpt**: optional deps `performanceRouting?: { isEnabled(): boolean }` (absent = off, D25), `catalog?`, `newRouteId?: () => string` (default `crypto.randomUUID()`); read the setting once per gate call; registry insertion-order `Map` capped at `ROUTE_RECORD_CAP`, memory only; store `RouteSpawnFacts` per chosen entry (both modes) with `decisionModel` truncated to 128 and set only with a `modelProposal`; service implements `RouteRecordReader`; tokens `LANE_CATALOG_STORE`, `ROUTING_EVIDENCE_SERVICE`; DI always provides the reader; barrel exports `RouteRecordReader`, `RoutingEvidenceService`, token names.
- **Note from B19 lane B**: register `new RoutingEvidenceService({ catalog, outcomeReader, performanceRouting })` (catalog: `get`/`refreshIfDue`; outcomeReader: the existing optional `LaneOutcomeReader`; performanceRouting: `isEnabled()`). Token, DI registration and barrel export are B25 work.
- **Depends on**: B24, B19
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, high-capability tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic + style review by a different family (DI wiring)
- **Mode / parallel**: sequential (lane-routing)
- **Lane checks**: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/route/route-record.registry.spec.ts libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts libs/backend/lane-routing/src/lib/route-decide.preflight.spec.ts libs/backend/lane-routing/src/lib/pipeline/route-off-golden.spec.ts`; `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`; `npx eslint <6 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing,ptah-electron`
- **Acceptance**: registry store, lookup, cap, unknown id, decision model only with a proposal, over-long id stored as 128 (FA7.1, FA7.3); existing gate specs and golden green without edit (D25, FA4.3)

### B26 - WU9c service-level route cases

- **Status**: COMPLETE (antigravity 88d5a24c, resumed 8e7036b8)
- **Shape / weight**: test / est. 6,900. **Actual tokens**: unavailable
- **Projects**: lane-routing (1)
- **Read set**: `W/libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts:1-300` + the last 60 lines; `.../route-decide.service.ts` deps (after B25); PLAN:886-901
- **Write set**: `W/libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts` (append a `describe`)
- **Contract excerpt**: cases: injected id factory gives `routeId`; absent `performanceRouting` = off; `isEnabled() === true` reads the catalog and uses pairs; facts stored for each chosen entry and readable by `spawnFacts(routeId, phaseId)`; setting read once per call.
- **Depends on**: B25
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, fast tier. **Fallback**: Task subagent `senior-tester`
- **Review family**: test review only
- **Mode / parallel**: may run in parallel with B27 and B28
- **Lane checks**: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts`; `npx eslint libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/lane-routing`; `npm run verify -- -t lint,typecheck -p @ptah-extension/lane-routing`
- **Acceptance**: `routeId` minted outside `score()`; off/on selection; facts lookup (FA5, FA7.1, D25)

### B27 - WU10b evidence RPC

- **Status**: COMPLETE (codex 154005ae, resumed 5fff14b4)
- **Shape / weight**: contract / est. 10,100. **Actual tokens**: unavailable
- **Projects**: rpc-handlers (1)
- **Read set**: `W/libs/backend/rpc-handlers/src/lib/handlers/capability-matrix-rpc.handlers.ts` (whole); `.../handlers/capability-matrix-rpc.handlers.spec.ts` (whole); `.../handlers/index.ts` (whole); `W/libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts:130-165`; `W/libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:165-195`; `W/libs/backend/rpc-handlers/src/index.ts` (check for handler class names); `W/libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts`; PLAN:597-603
- **Write set**: `W/libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.ts` (new); `.../handlers/routing-evidence-rpc.handlers.spec.ts` (new); `.../handlers/index.ts`; `W/libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts`; `W/libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts`; `W/libs/backend/rpc-handlers/src/index.ts` (only if it lists handler classes)
- **Contract excerpt**: method `agent:getRoutingEvidence`, params `Record<string, never>` (refuse other keys); resolve `LANE_ROUTING_TOKENS.ROUTING_EVIDENCE_SERVICE`; absent or failed -> `RpcUserError('Routing evidence is unavailable.', 'PERSISTENCE_UNAVAILABLE')` as `unavailable()`.
- **Note from B19 lane B**: the handler passes host-detected CLI rows to `service.read(rows)`; CLI detection stays out of lane-routing DI. The service rejects when persistence is known unavailable; map that to `unavailable()`.
- **Depends on**: B25, B14
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: style review by a different family (registration)
- **Mode / parallel**: may run in parallel with B26 and B28
- **Lane checks**: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.spec.ts`; `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`; `npx eslint <changed files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/rpc-handlers`; `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers,ptah-electron`
- **Acceptance**: params refused; service absent gives the user error; result shape (FA6); method in manifest for the Electron host (FA6.5 prerequisite)

### B28 - WU4b route fact lookup at spawn

- **Status**: COMPLETE (codex 28562547, resumed 2add6d45)
- **Shape / weight**: logic / est. 10,700. **Actual tokens**: unavailable
- **Projects**: vscode-lm-tools (1)
- **Read set** (prefix `W/libs/backend/vscode-lm-tools/src/lib/code-execution/`): `namespace-builders/agent-namespace.builder.ts:1-60,700-830` (spawn path; find `markSpawnReplied` at `:796`); `namespace-builders/agent-namespace.builder.spec.ts:1-150` + one spawn describe; `ptah-api-builder.service.ts` (range that builds the agent namespace, find by `rg -n "buildAgentNamespace\|AgentNamespace"`); `W/libs/backend/lane-routing/src/index.ts` (after B25); PLAN:718-721, PLAN:898-901
- **Write set**: `namespace-builders/agent-namespace.builder.ts`; `namespace-builders/agent-namespace.builder.spec.ts`; `ptah-api-builder.service.ts`
- **Contract excerpt**: resolve `RouteRecordReader` through the existing lane-routing edge (`agent-namespace.builder.ts:18`); when `request.route` is set and `spawnFacts(routeId, phaseId)?.laneId` equals the spawn lane, set `request.routeFacts`; else spawn without facts and log ids only; Ptah CLI path writes `spawnEffort` with provenance `unknown`, disposition `fallback-allowlist` when an effort was given, else `none-requested`.
- **Depends on**: B25, B9
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, balanced tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: logic review by a different family
- **Mode / parallel**: may run in parallel with B26 and B27
- **Lane checks**: `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts`; `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`; `npx eslint <3 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`; `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools,ptah-electron`
- **Acceptance**: `route` sets `routeFacts`; unknown or other lane gives none and logs ids only; Ptah CLI `spawnEffort` (FA5.1, FA7.1, FA8.4)

### B29 - WU20b composer contract pass-through

- **Status**: IN_PROGRESS (codex db4f4093)
- **Shape / weight**: contract / est. 6,300. **Actual tokens**: pending
- **Projects**: shared, rpc-handlers (2)
- **Read set**: `W/libs/shared/src/lib/types/rpc/rpc-agents.types.ts:75-100`; `W/libs/backend/rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.ts:155-190`; `W/libs/backend/rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.spec.ts` (composer options describe); `W/libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-coordinator.service.ts:100-110` (after B22)
- **Write set**: `W/libs/shared/src/lib/types/rpc/rpc-agents.types.ts`; `W/libs/backend/rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.ts`; `W/libs/backend/rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.spec.ts`
- **Contract excerpt** (TL5): `AgentGetLaneComposerOptionsResult.unsendableEfforts?: readonly string[]` with JSDoc "native values the lane cannot send; shown with a label"; handler copies `view.unsendableEfforts` only when non-empty.
- **Depends on**: B22, B27 (rpc-handlers serialization)
- **Required Skills**: nx-workspace-architect (host refused)
- **Executor**: CLI lane, fast tier. **Fallback**: Task subagent `backend-developer`
- **Review family**: style review only
- **Mode / parallel**: may run in parallel with B30
- **Lane checks**: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.spec.ts`; `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`; `npx eslint <3 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/shared,@ptah-extension/rpc-handlers`; `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/rpc-handlers,ptah-extension-webview`
- **Acceptance**: field passes through; absent when empty (FA8.5, decisions.md row 20)

### B30 - WU12 Electron settings UI

- **Status**: IN_PROGRESS (codex 22dcf71f)
- **Shape / weight**: logic (UI) / est. 11,400. **Actual tokens**: pending
- **Projects**: chat (1)
- **Read set**: `W/libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts` (whole); `.../lane-rotation-setting.component.spec.ts` (whole); `.../decision-matrix-page.component.ts` (whole, 307 lines); `W/libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts`; `W/libs/shared/src/lib/types/lane-native-values.types.ts`; PLAN:540-605, PLAN:1202-1205
- **Write set**: `W/libs/frontend/chat/src/lib/settings/ptah-ai/performance-routing-setting.component.ts` (new); `.../performance-routing-setting.component.spec.ts` (new); `.../routing-evidence.component.ts` (new); `.../routing-evidence.component.spec.ts` (new); `.../decision-matrix-page.component.ts` (mount both after `<ptah-lane-rotation-setting />`, `:92`)
- **Contract excerpt**: standalone, `OnPush`, `inject()`, signals; `ClaudeRpcService` with 5000 ms timeout; `settings:get`/`settings:set` through `SettingsSaveFeedbackService`; `@ptah-extension/ui` primitives; no Node or Electron import; Electron only (parent `isElectron`). Evidence view: rows per model, "no samples" for `score: null`, catalog status and age, funnel, badges: `native` shown as reported, `ptah-fallback` with "Ptah fallback", `unknown` as "not reported"; decision models table.
- **Depends on**: B27, B4, B11
- **Required Skills**: nx-workspace-architect, angular-frontend-patterns (both host refused)
- **Executor**: CLI lane, balanced tier, UI capable. **Fallback**: Task subagent `frontend-developer`
- **Review family**: style + logic review by a different family; visual review in Electron after B31
- **Mode / parallel**: may run in parallel with B29
- **Lane checks**: `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/performance-routing-setting.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.spec.ts`; `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`; `npx eslint <5 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/chat`; `npm run verify -- -t lint,typecheck -p @ptah-extension/chat,ptah-extension-webview`; `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- **Acceptance**: toggle shows stored value, default true, write and read-back, failure (FA6, Q3); evidence rows, "no samples", catalog failure and age, funnel, three provenance badges, decision models (FA6, FA7, FA8.3)

### B31 - WU20c composer label for unsendable Codex efforts

- **Status**: PENDING
- **Shape / weight**: logic (UI) / est. 8,600. **Actual tokens**: pending
- **Projects**: chat (1)
- **Read set**: `W/libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.ts:110-130,340-365,795-820`; `.../lane-composer/lane-composer.component.spec.ts:1-120` + the effort options describe; `W/libs/frontend/chat/src/lib/components/molecules/composer-controls/composer-effort-picker.component.ts:40-80` + template range that shows `description`; `W/libs/shared/src/lib/types/rpc/rpc-agents.types.ts:84-100` (after B29)
- **Write set**: `W/libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.ts`; `W/libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.spec.ts`
- **Contract excerpt**: `effortOptions` keeps every id of `options.efforts` in order; an id in `options.unsendableEfforts` gets `description: 'Codex reports this level; this lane cannot send it'` (fixed text, no vendor data). No filter. If A2 fails (picker hides `description`), stop and report.
- **Depends on**: B29, B30 (project serialization)
- **Required Skills**: nx-workspace-architect, angular-frontend-patterns (both host refused)
- **Executor**: CLI lane, balanced tier, UI capable. **Fallback**: Task subagent `frontend-developer`
- **Review family**: style review by a different family; visual review in Electron
- **Mode / parallel**: sequential (chat)
- **Lane checks**: `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.spec.ts`; `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`; `npx eslint <2 files>`
- **Coordinator gate**: `npm run verify -- --related -p @ptah-extension/chat`; `npm run verify -- -t lint,typecheck -p @ptah-extension/chat,ptah-extension-webview`; `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- **Acceptance**: composer shows the native Codex list unchanged and labels the unsendable values (decisions.md row 20, FA8.5)

---

## After B31

1. Visual review in Electron only: decision matrix page (toggle + evidence tables) and the Codex
   lane composer effort menu (FA6.5, decisions.md row 20). Screenshot evidence in `visual-review.md`.
2. Full gate (see "Coordinator checks"), then the phase code review (logic + style).
3. Re-check migration number on `origin/main` (V5) before push.

## Execution order and parallel groups

| Step | Batches that may run at the same time (max 3 lanes) |
| --- | --- |
| 1 | B1 (alone, commit) |
| 2 | B2, B3, B4 |
| 3 | B5, B6, B7 |
| 4 | B8, B9, B10 |
| 5 | B11, B12, B13 |
| 6 | B14, B15, B16 |
| 7 | B17, B18 |
| 8 | B19, B20 |
| 9 | B21, B22 |
| 10 | B23 |
| 11 | B24 |
| 12 | B25 |
| 13 | B26, B27, B28 |
| 14 | B29, B30 |
| 15 | B31, then visual review and full gate |

A batch with 2-3 internal lanes (B10, B13, B16, B17, B18, B19) counts each lane against the
3-lane limit. Example: at step 5, run B13's three lanes first, then B11 and B12.
Batches in one step never share a project, and they are file-disjoint.
