# Batches - TASK_2026_2330_2fc3

Total tasks: 30 | Batches: 14 | Complete: 0/14

Root `R` = `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` (branch
`feat/setup-background-runs`, stacked on `fix/setup-wizard-nav-skill-review`, PR #1525). Every
path below is relative to `R`; executor prompts must use the absolute form `R/<path>`. Plan
references are `implementation-plan.md` sections (component numbers) of this task folder.

## Rules for every executor and lane (repeat in each brief)

- Work only inside `R`. Never edit `.ptah/specs/**/task.md` or this file.
- Electron first: `apps/ptah-electron` host, renderer `apps/ptah-extension-webview`.
- Focused checks only, never `npm run verify`, `nx`, build, serve, dev, e2e or package targets:
  - `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
  - `npx tsc --noEmit --project <project>/tsconfig.lib.json` (apps: `tsconfig.app.json`; use
    the tsconfig the project actually has)
  - `npx eslint <changed files>`
- The coordinator alone runs `npm run verify -- --related -p <projects>`, then
  `npm run verify -- -t lint,typecheck -p <projects>`, and the full gate before push
  (`npm run verify -- -p <projects>` plus `-t typecheck-templates -p ptah-extension-webview`
  after template changes). Do not start a check of a project while a lane edits it.
- Executors never run git. The coordinator commits with scopes from `.commitlintrc.json`
  (subject <= 72 chars, body lines <= 100). `onboarding` is NOT in the scope enum; use
  `setup-wizard` for onboarding pages, plus `core`, `chat`, `chat-ui`, `chat-state`, `shared`,
  `rpc-handlers`, `agent-generation`, `cli-engine`, `electron`, `webview` as touched.
- No stubs, TODOs or placeholders. Deleted files are removed, not shimmed. No `V2` copies.
- Library direction: `setup-wizard` never imports `onboarding`; `chat`, `chat-ui`, `chat-state`
  and `core` never import `setup-wizard`. Cross-boundary access goes through `SETUP_RUN_ENTRY`
  (core) or `consumeLegacySetupTabs` (chat-state).
- Every swallowed RPC failure carries a `degradation-audit:` comment.
- Line numbers in the plan were read at `6803ce86c2`; re-read before editing.

Nx project names: `@ptah-extension/{shared,agent-generation,rpc-handlers,cli-engine,core,
chat-state,setup-wizard,onboarding,chat,chat-ui}`, `ptah-extension-webview`, `ptah-electron`.

## Plan validation

Status: PASSED WITH RISKS

Assumptions:

- A1 Electron renderer localStorage persists across restarts — VERIFIED. Only the browser-tool
  session uses a `partition` (`apps/ptah-electron/src/services/electron-browser-capabilities.ts:514`);
  the main window uses the default persistent session.
- A2 the adapter routes by binding id carried in payloads — VERIFIED. Payloads carry
  `tabBinding` (`libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts:98-101, 128`).
- A3 `analyze/agents` is the selection step and `analyze/generate` the progress step — FALSE.
  Both are `redirectTo: retiredAgentRedirect` to `analyze/skills`
  (`libs/frontend/onboarding/src/lib/onboarding.routes.ts:27-30, 75-82`), retired on purpose by
  `9065bd9ae8 fix(harness-sync,webview): retire agent onboarding steps`. Today the only
  agent-generation transcript is the chat tab this task removes. See D7 and Batch 9.
- Plan says `writeManifest` is temp-and-rename. It is a plain `fs.writeFile`
  (`libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts:339-348`).
  Batch 1 uses the same write path, as the plan instructs ("use the same mechanism"); a torn
  write is caught by the schema-checked read returning `{review: null}`.
- `generationRouteTabValidator` is defined in `apps/ptah-extension-webview/src/app/app.config.ts:53`
  and is also read by `libs/frontend/core/src/lib/routing/surface-route-persistence.ts:35,79`;
  tests in `apps/ptah-extension-webview/src/app/webview-routing.spec.ts:227,534,579`. Batch 14.
- `tab-persistence.ts` has only `tab-persistence.backoff.spec.ts`; Batch 4 creates
  `tab-persistence.legacy-setup.spec.ts`.
- The electron shell has no single component spec (feature specs `electron-shell.*.spec.ts`);
  Batch 13 creates `electron-shell.setup-badge.spec.ts`.

| Risk | Severity | Mitigation |
| --- | --- | --- |
| P1 A3 false: no Setup page hosts the agent-generation transcript once its chat tab is gone | HIGH | D7 + Batch 9 (gated: orchestrator confirms D7 before Batch 9 starts) |
| P2 Plan misses `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:182`, which lists wizard methods | MEDIUM | Task 2.3 |
| P3 `setup-wizard` (`generation-handoff.store.ts:6`) and onboarding `project-guidance.page.ts:13` import the chat-ui launcher that Batch 13 deletes | MEDIUM | Tasks 7.1, 8.2 remove those imports before Batch 13 |
| R1 backend `blocked.ownerTabId` names an old chat tab id | MEDIUM | Task 5.2 adoption + spec |
| R2 guidance after restart is `interrupted` unless `generatedAt` proves completion | LOW | Task 5.2 mapping; copy says "Retry" (Task 8.2) |
| R3 D3 product judgment (configure chat stays a chat tab) | LOW | User approved D3; Task 12.2 stores only `handoffTabId` |
| R4 localStorage cleared | LOW | Task 5.2 adoption; Batch 1/2 backend review file |
| R5 stacked branch, line drift after rebase | LOW | Coordinator re-cites lines after rebase onto `main` |
| P4 e2e fixtures `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts:354` mock only `wizard:recommend-analysis-skills` | LOW | Task 10.1 adds a `wizard:get-skill-review` fixture returning `{review:null, reviewedAt:null}` |

Edge cases:

- Duplicate start of a live workflow attaches — Task 5.2 (normative rule 1).
- Cancel waits for backend confirmation (`cancelling` chip) — Tasks 5.2, 6.2.
- Completion with no live view sets `unseen` and the badge — Tasks 5.2, 6.1, 13.3.
- Payload for an unknown binding id is adopted, not dropped — Task 6.1.
- `invalid-binding` / `workspace-mismatch` -> `failed`, user text only — Task 6.2.
- Re-run keeps the old completed record and saved results — Tasks 5.2, 12.1.
- Leaving Setup never cancels or resets — Tasks 12.1, 12.2.
- Corrupt localStorage -> empty index plus adoption — Task 5.1.
- Workspace switch pauses the shared 2.5 s poll — Task 5.2.
- Token absent (VS Code webview, tests) -> bare `/onboarding` — Task 13.3.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D7 | Agent-generation records target a real `analyze/generate` route hosting a new `AgentGenerationRunPage` (live stream, stop, errors, retry/resume, result counts). `analyze/agents` keeps its redirect; `needs-input` (preview-required) also targets `analyze/generate`, which shows the preview-required state. | (a) new `analyze/generate` page; (b) render generation inside `analyze/skills`; (c) keep a chat tab (violates context.md) | A3 false (see above); plan component 2 requires "Setup pages render `generationStream()`"; reusable setup-wizard components exist (`generation-stop-control`, `generation-errors`, `generation-source-status`, `agent-next-steps`). (a) keeps `analyze-skills.page.ts` (already large) out of it. | Yes. CONFIRMED by orchestrator 2026-11-27 (matches the approved step table). Originally gated: orchestrator confirms with the architect/user before Batch 9 because it re-opens a route a prior task retired. Batches 1-8 and 10-12 do not depend on it; Batch 3's step table uses `analyze/generate` per the plan. |
| D8 | Batch count is 14, above the requested 5-8. | fewer, larger batches / cap-respecting batches | The change spans 12 Nx projects; the 6-file / 2-project cap per batch and file-disjointness require it. Parallel groups keep wall time near 7 rounds. | Yes |
| D9 | Phases and reviews: Phase A (Batches 1-4), Phase B (5-7), Phase C (8-12), Phase D (13-14). One code-logic review per phase; style review for Phase A and B (new public API: `wizard:get-skill-review`, `SETUP_RUN_ENTRY`, `SetupRunStore`). Visual review in Electron after Phase D. | per batch / per phase | Role rule: one code-logic review per phase. | Yes |

## Execution order and parallel groups

| Round | Batches (parallel within a round) | Notes |
| --- | --- | --- |
| 1 | 1, 3, 4 | disjoint projects: shared+agent-generation / core+setup-wizard / chat-state |
| 2 | 2, 5 | rpc-handlers+surface specs / setup-wizard |
| 3 | 6 | setup-wizard |
| 4 | 7 | setup-wizard |
| 5 | 8, 10, 13 | onboarding (two lanes, disjoint files) / chat+chat-ui. Coordinator checks onboarding only after both onboarding lanes finish. |
| 6 | 9 (gated on D7), 11, 12 | onboarding, disjoint files; at most 3 lanes |
| 7 | 14 | app + core + cleanup, last |

---

## Batch 1: Shared skill-review types and storage — IMPLEMENTED

- Shape: contract
- Estimated weight (tokens): ~18k (not measured with ptah_count_tokens)
- Actual weight (lane tokens): pending
- Write set: `libs/shared/src/lib/types/rpc/rpc-setup.types.ts`, `libs/shared/src/lib/types/rpc.types.ts`,
  `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`,
  `libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts`
- Read set: `rpc-setup.types.ts:234-248`; `rpc.types.ts:1595-1610, 3885-3900`;
  `analysis-storage.service.ts:1-10, 335-348, 690-700, 770-800`; plan component 6.
- Contract excerpts: `WizardGetSkillReviewParams = { runId: string }`;
  `WizardGetSkillReviewResult = { review: WizardRecommendAnalysisSkillsResult | null; reviewedAt: string | null }`;
  file `<slugDir>/skill-review.json` = `{ version: 1, reviewedAt: ISO, analysisRunId, review }`.
- Verify (lane): jest `libs/backend/agent-generation/jest.config.ts` on the storage spec; tsc for
  `libs/shared` and `libs/backend/agent-generation`; eslint changed files.
  Coordinator: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-generation`.
- Acceptance: types exported and registered in both registry maps; `writeSkillReview` /
  `readSkillReview` resolve `slugDir` via `listValidRuns`; round-trip, invalid file -> null,
  unknown runId -> null specs pass.
- Recommended executor: CLI lane [backend TypeScript]; fallback backend-developer subagent
- Parallel-safe: yes (with 3, 4) | Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: N/A
- Review family: different from implementer
- Rationale: small contract batch other batches consume.
- Tasks: 2 | Depends on: none
- Phase: A | Phase review: code-logic + style

### Task 1.1: Shared types and registry entries — IMPLEMENTED

- Files: `rpc-setup.types.ts`, `rpc.types.ts` (entries next to `:1602` and `:3893`).
- Plan reference: component 6 bullets "New shared types", "Registry entries".
- Pattern: `wizard:recommend-analysis-skills` entries at the same lines.

### Task 1.2: AnalysisStorageService skill-review read/write — IMPLEMENTED

- Depends on: Task 1.1
- File: `analysis-storage.service.ts` and spec.
- Validation notes: read is schema-checked (version 1, matching `analysisRunId`); write uses the
  same `fs.createDirectory` + `fs.writeFile` path as `writeManifest`; never takes a workspace
  path from callers other than the handler's host root.

## Batch 2: Skill-review RPC handler and surfaces — IMPLEMENTED

- Shape: contract
- Estimated weight (tokens): ~25k
- Actual weight (lane tokens): pending
- Write set: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`,
  `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`,
  `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts`,
  `apps/ptah-electron/src/di/rpc-surface.spec.ts`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`
- Read set: `setup-rpc.handlers.ts:255-275, 985-1085`; `setup-rpc.schema.ts:25-40`;
  `setup-rpc.handlers.spec.ts:1680-1930`; both surface specs near the `wizard:recommend-analysis-skills` line.
- Contract excerpts: Batch 1 types; params zod `strictObject({ runId })`; workspace from
  `workspaceProvider.getWorkspaceRoot()` only.
- Verify (lane): jest rpc-handlers spec, electron and cli-engine surface specs by path; tsc
  rpc-handlers; eslint. Coordinator: `npm run verify -- -p @ptah-extension/rpc-handlers,ptah-electron,@ptah-extension/cli-engine`.
- Acceptance: recommend handler persists on success, not on `empty(...)` warnings, write failure
  -> `logger.warn` + result still returned; `wizard:get-skill-review` registered in the method
  list and both surface specs; schema rejection spec.
- Recommended executor: CLI lane [backend TypeScript]; fallback backend-developer
- Parallel-safe: yes (with 5) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Rationale: 3 projects exceed the 2-project cap only by one-line surface-list entries (P2).
- Tasks: 2 | Depends on: 1
- Phase: A | Phase review: code-logic + style

### Task 2.1: Persist review in `wizard:recommend-analysis-skills`; add `wizard:get-skill-review` — IMPLEMENTED
- Plan reference: component 6; schema next to `WizardRecommendAnalysisSkillsParamsSchema` (`:32`).

### Task 2.2: Handler specs — IMPLEMENTED
- Cases: persist on success, no persist on empty, get returns stored review, unknown run -> null, schema rejection.

### Task 2.3: Add the method to Electron and cli-engine RPC surface specs — IMPLEMENTED
- Plan defect P2: cli-engine was not in the plan.

## Batch 3: Core entry port, Setup run types and step table — IMPLEMENTED

- Shape: contract
- Estimated weight (tokens): ~16k
- Actual weight (lane tokens): pending
- Write set: CREATE `libs/frontend/core/src/lib/routing/setup-run-entry.ts`; MODIFY
  `libs/frontend/core/src/lib/routing/index.ts`; CREATE
  `libs/frontend/setup-wizard/src/lib/services/setup-run.types.ts`,
  `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts`,
  `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.spec.ts`
- Read set: plan components 1.1, 3 (all step tables), 5 (interface); `core/src/lib/routing/onboarding-routes.ts:20-40, 90-118`;
  `surface-routes.ts:36-44`; `rpc-setup.types.ts:22-55` (`SetupGenerationWorkflow`).
- Contract excerpts: `SetupRunRecord`, `SetupRunWorkflow`, `SetupRunStatus` (plan 1.1, plus
  optional `origin?: string`); `SetupRunEntry { attentionCount; runningCount; openSetup(); openWorkflow(workflow, origin) }`;
  `stepTarget(record): OnboardingTarget`, `nextStep(workflow, step)`; query always
  `tab=<record.id>`, plus `analysis=<analysisRunId>` when known.
- Verify (lane): jest setup-wizard `setup-run-steps.spec.ts`; tsc core and setup-wizard; eslint.
- Acceptance: table-driven spec covers every (workflow, status) cell of plan section 3; unknown
  step -> entry route + `console.warn`; ids `setup-<uuid>` pass `isOnboardingIdentityValue`;
  `onboardingGenerationTarget` NOT removed yet (Batch 14).
- Validation notes: agent-generation targets use `analyze/generate` (running, failed, interrupted,
  needs-input) and `analyze/done` (completed), per D7; cancelled -> `analyze/skills` (the
  redirect target of `analyze/agents`). Record this mapping in the spec.
- Recommended executor: CLI lane [Angular/TypeScript]; fallback frontend-developer
- Parallel-safe: yes (with 1, 4) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 2 | Depends on: none
- Phase: A | Phase review: code-logic + style

### Task 3.1: `SETUP_RUN_ENTRY` token and interface in core, exported — IMPLEMENTED
### Task 3.2: `setup-run.types.ts` and pure `setup-run-steps.ts` with spec — IMPLEMENTED
- Pattern: `onboardingGenerationTarget` (`onboarding-routes.ts:109-118`) for target shape.

## Batch 4: Chat-state legacy setup-tab hand-off — IMPLEMENTED

- Shape: logic
- Estimated weight (tokens): ~14k
- Actual weight (lane tokens): pending
- Write set: `libs/frontend/chat-state/src/lib/tab-persistence.ts`, CREATE
  `libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts`,
  `libs/frontend/chat-state/src/index.ts`
- Read set: `tab-persistence.ts:110-130, 270-300`; plan component 2 "D6 migration".
- Contract excerpts: `consumeLegacySetupTabs(): ReadonlyArray<{ tabId: string; workflow: 'setup-agent-generation' | 'setup-project-prompt'; workspacePath: string }>` — one-shot (second call returns `[]`).
- Verify (lane): jest the new spec and `tab-persistence.backoff.spec.ts`; tsc chat-state; eslint.
  Coordinator: `npm run verify -- -p @ptah-extension/chat-state`.
- Acceptance: restored tabs with those two workflows are dropped from the restored set and
  queued for the hand-off; other workflows (`harness-*`) are untouched; persisting never writes
  the two setup workflows again.
- Recommended executor: CLI lane [Angular/TypeScript]; fallback frontend-developer
- Parallel-safe: yes (with 1, 3) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 1 | Depends on: none
- Phase: A | Phase review: code-logic

### Task 4.1: Drop and hand off legacy setup tabs on restore — IMPLEMENTED

## Batch 5: SetupRunStore, persistence and skill-review RPC client — IMPLEMENTED

- Shape: logic
- Estimated weight (tokens): ~35k
- Actual weight (lane tokens): pending
- Write set: CREATE `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts` and
  `.spec.ts`, `setup-run.store.ts` and `.spec.ts`; MODIFY
  `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` and its spec,
  `libs/frontend/setup-wizard/src/index.ts` (exports; one-line edits)
- Read set: plan component 1 (all), normative rules 1-7; `wizard-rpc.service.ts:140-170, 340-420`;
  `wizard-analysis-runner.service.ts:120-200, 600-690`; `onboarding-resume.store.ts:70-135, 210-220`
  (degradation pattern, workspace lookup); `chat-state/src/lib/workflow-session-index.service.ts:1-140`
  (localStorage precedent).
- Contract excerpts: Batch 3 types; Batch 4 `consumeLegacySetupTabs`; Batch 1 types for
  `getSkillReview(runId)`.
- Verify (lane): jest the two new specs and `wizard-rpc.service.spec.ts`; tsc setup-wizard; eslint.
- Acceptance: status mapping per workflow (plan 1.3), adoption from `wizard:get-resumable-run`
  and legacy tabs, cap 20 with terminal-first eviction, corrupt storage path, microtask-debounced
  writes, one shared 2.5 s poll paused on workspace switch, `start` attaches to a live record,
  `cancel` waits for confirmation, `rerun` creates a new record and keeps the old, `dismiss` only
  terminal. No `TabManagerService` use for identity. Nothing sensitive persisted.
- Recommended executor: CLI lane [Angular signals]; fallback frontend-developer
- Parallel-safe: yes (with 2) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Rationale: 7 files, one project; index edit is a one-line export.
- Tasks: 3 | Depends on: 1, 3, 4
- Phase: B | Phase review: code-logic + style

### Task 5.1: Pure persistence (read/validate/write, `ptah.setup-runs.v1`) and spec — IMPLEMENTED
### Task 5.2: `SetupRunStore` root service and spec — IMPLEMENTED
- Depends on: 5.1, 5.3. Validation: R1 (`ownerTabId` adoption), R2 (guidance `generatedAt`), R4.
### Task 5.3: `WizardRpcService.getSkillReview(runId)` and spec; exports — IMPLEMENTED
- Notes for the phase B review:
  - `setup-run.store.ts` is 973 lines (`max-lines` 700 warning). Consider a split of the reconcile
    and poll logic into a sibling file in Batch 6.
  - An adopted `running` checkpoint with no bound run becomes `interrupted` on the first reconcile.
    This is intended (no active run means interrupted).
  - Store deviations (no navigation, `adopt`/`report`/`attach`/`release`/`reviewSkills`, backend
    `retry`/`rerun`) must be reconciled with `GenerationWorkflowStore` in Batch 6.

## Batch 6: Tab-free generation event adapter and workflow stores — IMPLEMENTED

- Result: implemented by a Claude subagent (6.1, 6.2 sources), Kimi Code (6.2 specs) and Codex
  (review fixes, rounds 1-2 plus one bounded correction). Reviews: Codex (4/10 REVISE), Kimi
  Code (5/10, 7/10 REVISE), Ollama Code on the bounded fix (8/10 APPROVED). Reports are the
  `*-batch6-*.md` files in this folder.
- Notes for the phase B review:
  - `setup-run.store.ts` is 1,2xx lines, over max-lines 700; attempt logic moved to
    `setup-run-attempt.ts`. A split needs its own step.
  - Minor: a poll reply that straddles a start click can shorten the fresh orphan grace.
  - Minor: no test holds a bound-state lookup pending across an initial start's settlement.
  - Open requirement: should a finalization correction survive a renderer reload?
  - The adapter does not route to `SetupWizardStateService`; that service is its own handler.

- Shape: logic
- Estimated weight (tokens): ~40k
- Actual weight (lane tokens): pending
- Write set: `libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts` and
  `.spec.ts` (rewrite), `generation-workflow.store.ts` and `.spec.ts`,
  `guidance-generation.store.ts` and `.spec.ts`
- Read set: adapter full file (380 lines, the rewrite target); stores; plan component 2;
  `setup-wizard-state.service.ts:135-195`.
- Contract excerpts: binding `{ tabId: record.id, workflow, workspacePath }`; push types
  `setup-wizard:generation-stream|enhance-stream|generation-complete|error`.
- Verify (lane): jest the three specs; tsc setup-wizard; eslint.
- Acceptance: adapter routes by binding id to `SetupRunStore` and `SetupWizardStateService`, no
  `StreamingHandlerService`/`MessageFinalizationService`/TabManager; unknown id adopted; stores
  lose TabManager, QueuedFollowUpStore and `canStartInChat`; spec asserts `createTab` and
  `createWorkflowTabForWorkspace` never called; `blocked.ownerTabId` attaches; mismatch -> failed.
- Recommended executor: CLI lane [Angular signals]; fallback frontend-developer
- Parallel-safe: no | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 2 | Depends on: 5
- Phase: B | Phase review: code-logic

### Task 6.1: Rewrite `GenerationRunEventAdapter` keyed by Setup run id — PENDING
### Task 6.2: Re-bind `GenerationWorkflowStore` and `GuidanceGenerationStore` to records — PENDING
- Note: `agent-next-steps.component.ts:153` injects `GenerationWorkflowStore`; keep its `run` signal API stable.

## Batch 7: Hand-off store, open handler and Setup entry service — IMPLEMENTED

- Result: Codex lane; review Ollama Code 8/10 APPROVED; Minor items 1, 2, 3, 5 fixed by a Codex
  lane; item 4 (no `schedule()` caller) moved to Batch 9. Committed with Batch 8 because
  onboarding did not typecheck with Batch 7 alone.

- Shape: logic
- Estimated weight (tokens): ~30k
- Actual weight (lane tokens): pending
- Write set: `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts` and
  `.spec.ts`, `setup-generation-open.handler.ts` and `.spec.ts`, CREATE
  `setup-run-entry.service.ts` and `.spec.ts`
- Read set: `generation-handoff.store.ts` (whole, small); handler (whole, small); plan components
  2 and 5; `core/src/lib/routing/surface-router.service.ts:140-180`.
- Verify (lane): jest the three specs; tsc setup-wizard; eslint. Coordinator after this batch:
  `npm run verify -- -p @ptah-extension/setup-wizard`.
- Acceptance: handoff keyed `agentRunId`, starts guidance via `SetupRunStore.start('project-guidance', …, {parentId})`,
  no chat-ui launcher import (P3), `tabClosed` deleted, "agent run cancelled/dismissed" replaces
  "tab gone", 5 s timer kept; handler calls `SETUP_RUN_ENTRY.openWorkflow(workflow, 'host')` and
  creates no tab; `SetupRunEntryService` picks active run step else Home, `openWorkflow` never
  creates a second run; exported from `src/index.ts` is done in Batch 14 cleanup only if not
  already exported here (export it here in `src/app.ts` if the webview imports from `/app`).
- Recommended executor: CLI lane [Angular signals]; fallback frontend-developer
- Parallel-safe: no | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 3 | Depends on: 6
- Phase: B | Phase review: code-logic + style (closes Phase B: request review after commit)

### Task 7.1: Re-key `GenerationHandoffStore` to run ids — PENDING
### Task 7.2: `SetupGenerationOpenHandler` delegates to the entry port — PENDING
### Task 7.3: `SetupRunEntryService` implementing `SETUP_RUN_ENTRY` — PENDING

## Batch 8: Onboarding generation consumers — IMPLEMENTED

- Result: Codex lane; review Ollama Code 8/10 APPROVED (with the Batch 7 Minor fixes).
- Follow-ups: legacy saved guidance with no Setup record shows the idle start view (needs a
  workspace-scoped `GuidanceGenerationStore` API); focus router does not verify the workspace
  switch landed; `openRoute` does not reset `lookupError`; `analyze-skills.page.ts:1099` still
  creates a guidance chat tab (Batch 10).

- Shape: logic
- Estimated weight (tokens): ~35k
- Actual weight (lane tokens): pending
- Write set: `libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts` and `.spec.ts`,
  `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts` and `.spec.ts`,
  `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts` and `.spec.ts`
- Read set: `generation-step.store.ts:80-105`; `project-guidance.page.ts:1-60, 340-360, 500-520`;
  `onboarding-focus-router.service.ts:40-65`; plan components 2, 3.
- Verify (lane): jest the three specs; tsc onboarding; eslint.
- Acceptance: `bind()` validates `SetupRunStore.get(id)`; no `findBoundGenerationTab`, no
  `GenerationWorkflowLauncherService` import (P3); guidance page renders `enhanceStream()`,
  copy for interrupted says "Retry" (R2); focus router uses `stepTarget`.
- Recommended executor: CLI lane [Angular]; fallback frontend-developer
- Parallel-safe: yes (with 10, 13) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 2 | Depends on: 7
- Phase: C | Phase review: code-logic

### Task 8.1: `GenerationStepStore` and focus router on Setup records — PENDING
### Task 8.2: `ProjectGuidancePage` without tab lookup or launcher — PENDING

## Batch 9: Agent-generation run page (D7, gated) — PENDING

- Shape: logic
- Estimated weight (tokens): ~22k
- Actual weight (lane tokens): pending
- Write set: `libs/frontend/onboarding/src/lib/onboarding.routes.ts` (replace only the
  `analyze/generate` redirect), CREATE `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts`
  and `.spec.ts`
- Read set: `onboarding.routes.ts:20-110`; `project-guidance.page.ts` template section (pattern);
  setup-wizard components `generation-stop-control`, `generation-errors`,
  `generation-source-status`, `agent-next-steps` (public inputs only).
- Verify (lane): jest the new spec; tsc onboarding; eslint. Coordinator: `typecheck-templates`.
- Acceptance: running -> live `generationStream()` transcript; failed -> counts and "Retry failed
  items" (`wizard:retry-item`); interrupted -> "Resume" (`resumeGeneration`); needs-input ->
  preview-required state; completed -> navigate to `analyze/done`; `markSeen` on open.
- Added acceptance (Batch 7 review item 4): no code calls `GenerationHandoffStore.schedule()`.
  On agent-generation completion, call `schedule(agentRecord.id, workspacePath)` exactly once
  per record, from a place that also runs when the page is closed (the store layer, not only
  the page). Add a test that a background completion schedules the guidance hand-off.
- Gate: do not start until the orchestrator confirms D7.
- Recommended executor: CLI lane [Angular]; fallback frontend-developer
- Parallel-safe: yes (with 11, 12) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 1 | Depends on: 8, D7 confirmation
- Phase: C | Phase review: code-logic + visual

### Task 9.1: Real `analyze/generate` route and page — PENDING

## Batch 10: Persisted skill review in the skills page — IMPLEMENTED

- Shape: logic
- Estimated weight (tokens): ~45k (analyze-skills.page.ts is large; read ranges only)
- Actual weight (lane tokens): pending
- Write set: `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` and `.spec.ts`,
  `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` and `.spec.ts`,
  `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts`
- Read set: `analyze-skills.page.ts:170-180, 510-610, 720-760, 1090-1140`; `stack-skill.store.ts`;
  plan component 6 frontend bullets and section 3 skill-review table.
- Verify (lane): jest the two specs; tsc onboarding; eslint.
- Acceptance: revisit shows persisted review with no new `wizard:recommend-analysis-skills` call;
  in-flight review promise held by `SetupRunStore` is attached, not re-requested; "Review again"
  overwrites only after success; `selection` saved on the record; guidance continuation uses
  `SetupRunStore.start('project-guidance', …)` — `tabs.createTab`, `setWorkflow` and
  `pendingGuidanceTab` removed (`:517, 1099-1110`).
- Recommended executor: CLI lane [Angular]; fallback frontend-developer
- Parallel-safe: yes (with 8, 13) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 2 | Depends on: 5, 2
- Phase: C | Phase review: code-logic

### Task 10.1: Skill-review record drives load/review/selection; e2e fixture (P4) — PENDING
### Task 10.2: Remove per-visit guidance tab creation — PENDING

- Result: implementer codex; reviewer ollama-cloud. Review 6/10 REVISE (degradation-audit sites,
  routed run-id source in continueToGuidance/retry, attachReview order) → round 1 → 9/10 APPROVED.
  Checks: lint,typecheck onboarding + webview-e2e-harness, --related onboarding,
  typecheck-templates webview, degradation audit TOTAL 0.

## Batch 11: Setup runs list on Home and removals — PENDING

- Shape: logic
- Estimated weight (tokens): ~30k
- Actual weight (lane tokens): pending
- Write set: CREATE `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.ts` and
  `.spec.ts`; MODIFY `onboarding-home.component.ts` and `.spec.ts`,
  `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.ts` and `.spec.ts`; DELETE
  `home/onboarding-resume.store.ts` + spec, `home/analysis-found-card.component.ts` + spec,
  `home/resume-banner.component.ts` + spec if left unused; `libs/frontend/onboarding/src/index.ts` if it exports them.
- Read set: `onboarding-home.component.ts:100-145, 330-345, 435-455`; `onboarding-step-link.ts:25-40`;
  `run-status-chip.component` inputs; plan component 4.
- Verify (lane): jest the three specs; tsc onboarding; eslint. Coordinator: `typecheck-templates`.
- Acceptance: one `<ul aria-label>` list, at most 5 rows + "Show all", chip text readable without
  color, primary button names the run, Dismiss on terminal rows, "Review skills" for completed
  analysis without child, `markSeen` on open; no Home-mount refresh; no `OnboardingResumeStore`.
- Recommended executor: CLI lane [Angular UI]; fallback frontend-developer
- Parallel-safe: yes (with 9, 12) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 2 | Depends on: 5 (and 8 for the focus-router consumer of the resume store, if any)
- Phase: C | Phase review: code-logic + visual

### Task 11.1: `SetupRunsListComponent` and Home wiring — PENDING
### Task 11.2: Step link on `stepTarget`; delete resume store, found card, unused banner — PENDING

- User decision 2026-11-28 on Batch 11 proposed removals: B (age hint, .gitignore hint) and C
  (static `onboardingStepLink` table kept until Batches 12/14) APPROVED. A REJECTED: a completed
  analysis saved on disk with no run record must get a Home row — add store-side adoption of
  completed disk analyses in `SetupRunStore` (store split batch or a follow-up before Batch 14).

## Batch 12: Analysis re-run and team-builder coordinator — PENDING

- Shape: logic
- Estimated weight (tokens): ~40k
- Actual weight (lane tokens): pending
- Write set: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` and `.spec.ts`,
  `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts` and `.spec.ts`
  (and `.html` if the stage binding changes), CREATE
  `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts` and `.spec.ts`
- Read set: `analyze-workspace.page.ts:760-790, 995-1040`; `team-builder-start.page.ts:95-125,
  135-140, 340-530`; `harness-chat-launcher.service.ts:130-170, 235-240`; plan component 7 and
  team-builder step table.
- Verify (lane): jest the three specs (plus `analyze-workspace.render.spec.ts`); tsc onboarding; eslint.
- Acceptance: `?rerun=1` only triggers `SetupRunStore.rerun`; `startFresh` never resets a live
  run; old completed record stays; destroy no longer aborts/resets team builder (workspace-change
  reset kept); coordinator owns install-then-launch, sets `handoffTabId` and `completed/handed-off`;
  launch failure -> `failed` at `review` with `installed` kept; Cancel -> `cancelled`; "Open
  conversation" only if the tab exists, else "The conversation was closed" (D3).
- Recommended executor: CLI lane [Angular]; fallback frontend-developer
- Parallel-safe: yes (with 9, 11) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 2 | Depends on: 5
- Phase: C | Phase review: code-logic (closes Phase C with 9, 10, 11)

### Task 12.1: Record-driven analysis page and re-run — PENDING
### Task 12.2: `TeamBuilderRunCoordinator` and page adoption — PENDING

## Batch 13: Chat-side entry: launcher, setup status, shell badge — IMPLEMENTED

- Shape: logic
- Estimated weight (tokens): ~25k
- Actual weight (lane tokens): pending
- Write set: DELETE (or thin-rewrite) `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.ts`
  and `.spec.ts`; MODIFY `libs/frontend/chat-ui/src/index.ts`,
  `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts` and `.spec.ts`,
  `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts`, CREATE
  `libs/frontend/chat/src/lib/components/templates/electron-shell.setup-badge.spec.ts`
- Read set: launcher (whole, ~100 lines); `setup-status.store.ts:90-100, 300-330`;
  `electron-shell.component.ts:355-380, 780-788`; plan component 5.
- Verify (lane): jest the specs; tsc chat-ui and chat; eslint. Coordinator: `typecheck-templates`.
- Acceptance: no remaining caller of the launcher in chat-ui/onboarding/setup-wizard (check with
  `ptah_lsp_references` after Batches 7, 8 land) -> delete it; `SetupStatusStore` injects
  `SETUP_RUN_ENTRY` (optional) and keeps `launchError` text; `openSetupHub()` calls
  `openSetup()` with fallback `setCurrentView('onboarding')`; badge `aria-label`
  "Setup: N runs need attention", running dot animates opacity/transform only, no polling.
- Recommended executor: CLI lane [Angular]; fallback frontend-developer
- Parallel-safe: yes (with 8, 10) | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Tasks: 2 | Depends on: 3, 7 (and 8 for the last launcher consumer)
- Phase: D | Phase review: code-logic + visual

### Task 13.1: Remove the launcher; `SetupStatusStore` via the port — PENDING
### Task 13.2: Shell Setup badge and `openSetupHub` delegation — PENDING
### Task 13.3: Fallback when the token is absent (VS Code, tests) — PENDING

- Result: implementer ollama-cloud; reviewer codex. 6/10 → round 1 8/10 → round 2 8/10 →
  coordinator correction (router snapshot) 8/10 → user-approved extra correction (last successful
  navigation id) 9/10 APPROVED. Launcher deleted (no callers left). Checks: lint,typecheck and
  --related chat-ui + chat; typecheck-templates passed after round 1 — re-run before the push
  (round 2 changed the back-button binding; onboarding was mid-edit by Batch 9 at commit time).

## Batch 14: App wiring, validator switch and cleanup — PENDING

- Shape: logic
- Estimated weight (tokens): ~25k
- Actual weight (lane tokens): pending
- Write set: `apps/ptah-extension-webview/src/app/app.config.ts`,
  `apps/ptah-extension-webview/src/app/webview-routing.spec.ts`
  (and `surface-message-routing.spec.ts` if its source assertions change);
  `libs/frontend/core/src/lib/routing/onboarding-routes.ts` and `.spec.ts`,
  `libs/frontend/core/src/lib/routing/index.ts`; DELETE
  `libs/frontend/setup-wizard/src/lib/services/bound-generation-tab.ts` and its export in
  `libs/frontend/setup-wizard/src/index.ts`
- Read set: `app.config.ts:45-70, 100-115, 255-285`; `webview-routing.spec.ts:220-235, 525-590`;
  `surface-route-persistence.ts:30-85`; `chat-types/src/lib/chat-types.ts:853-868`.
- Verify (lane): jest `webview-routing.spec.ts`, `surface-message-routing.spec.ts`,
  `onboarding-routes.spec.ts`; tsc webview app, core, setup-wizard; eslint.
  Coordinator: full gate over all changed projects + `typecheck-templates`.
- Acceptance: `{provide: SETUP_RUN_ENTRY, useExisting: SetupRunEntryService}`; validator checks
  `SetupRunStore.get(id)?.workflow`, not TabManager; `onboardingGenerationTarget` deleted with no
  caller; grep shows no `createWorkflowTabForWorkspace`/`findWorkflowTab` for setup workflows,
  no `OnboardingResumeStore`, no `tabClosed(`, no `findBoundGenerationTab`; `WorkflowKind` setup
  members removed only if no reader remains (`chat-view.component.ts:1584`,
  `workflow-badge.component.ts:12`), otherwise recorded as kept with reason.
- Recommended executor: CLI lane [Angular]; fallback frontend-developer
- Parallel-safe: no | Execution mode: sequential
- Subagent reason: N/A | Review family: different from implementer
- Rationale: 3 projects, justified as the cross-cutting cleanup that must run last.
- Tasks: 2 | Depends on: 5-13
- Phase: D | Phase review: code-logic (closes Phase D), then Electron visual review: nav badge,
  Home runs list, leave during generation and return to `analyze/generate`.

### Task 14.1: App config token and validator switch — PENDING
### Task 14.2: Remove `onboardingGenerationTarget`, `bound-generation-tab.ts`, dead WorkflowKind members — PENDING

### Batch verification (every batch)

- Every listed artifact exists and contains the required work (team-leader reads the files).
- The lane's focused checks pass; the coordinator runs the scoped `npm run verify` for the
  batch's projects, output tailed.
- No per-batch review; the phase's code-logic review covers the batch in the combined diff.
- The batch's listed edge cases and risks are addressed.
