# Code Style Review — Phase B (`TASK_2026_2330_2fc3`, Batches 5, 6, 7)

## Re-review round 1

Review family: antigravity (implementer: ollama-cloud)

| Metric | Value |
| --- | --- |
| New score | **7 / 10** (up from 6 / 10) |
| Verdict | **REVISE** (findings 2 & 3 deferred and non-blocking; 1 new Major defect introduced in finding 6's `matchesBinding` change) |
| In-scope findings checked | 1, 4, 5, 6, 7, 8 (diff: `git diff -- libs/frontend/setup-wizard`, 10 files) |
| New defects | 1 Major (#13), 1 Minor (#14) |

### Checks Run

All logs written to `.ptah/tmp/style-rr1-*.log`:

- **Degradation audit:** `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts 2>&1 | grep setup-wizard` — **0 matches** (`.ptah/tmp/style-rr1-degradation.log`; the only 2 repo-wide failures are in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:697,909`).
- **Typecheck:** `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json` — **exit 0** (`.ptah/tmp/style-rr1-tsc.log`).
- **ESLint:** `npx eslint` on all 10 changed files — **0 errors, 1 warning** (`max-lines` 1040 > 700 on `setup-run.store.ts:859`, deferred finding 2; down from 39 warnings; `.ptah/tmp/style-rr1-eslint.log`).
- **Jest:** `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath` across all 8 Phase B service specs (`setup-run.store`, `setup-run-persistence`, `setup-run-steps`, `setup-run-entry.service`, `generation-workflow.store`, `guidance-generation.store`, `generation-handoff.store`, `generation-run-event-adapter`) — **8 suites, 308 tests passed** (`.ptah/tmp/style-rr1-jest.log`).
- **Removed barrel exports:** `ptah_code_search_symbols` returned 0 symbols (empty SQLite index); fallback `git grep` across `libs/` and `apps/` confirms zero importers of `SETUP_RUN_POLL_INTERVAL_MS` or `TERMINAL_SETUP_RUN_STATUSES` outside `libs/frontend/setup-wizard/src/lib/services/` (relative imports only).

### Status of In-Scope Findings (1, 4, 5, 6, 7, 8)

| Finding | Severity | Status | Evidence |
| --- | --- | --- | --- |
| **1** (`degradation-audit` violations) | Blocking | **RESOLVED** | Removed invalid/orphaned prefixes at `generation-handoff.store.ts:250` and `setup-run-attempt.ts:436`; added valid `// degradation-audit: optional-capability - ...` markers at `setup-run.store.ts:140` and `setup-run-persistence.ts:308`. `check-degradation.ts` prints nothing for `setup-wizard`. |
| **4** (public API surface) | Major | **RESOLVED** (core barrel fixes; `@internal` sub-item deferred) | `src/app.ts:8` exports `SetupRunStore` (component-free); `src/index.ts:2-5` exports `WizardRpcError`; `src/index.ts` drops `SETUP_RUN_POLL_INTERVAL_MS` and `TERMINAL_SETUP_RUN_STATUSES` (verified 0 external importers in `libs/` or `apps/`). Marking the 7 sibling-coordination methods `@internal` / extracting a coordinator remains deferred to the Finding 2/3 store-split batch (non-blocking). |
| **5** (`SetupRunEntryService` hardcoded routes) | Major | **RESOLVED** | `setup-run-steps.ts:102-123` exports `entrySubPathFor(workflow, chained = false): SubPath` (kept internal to the lib, not added to `src/index.ts`) and delegates `entrySubPath(record)` to it; `setup-run-entry.service.ts:9,45-48` calls `entrySubPathFor(requested)`. Route behavior unchanged (`agent-generation` -> `['analyze', 'skills']`, standalone `project-guidance` -> `['guidance']`). |
| **6** (watchdog teardown, terminal arrays, binding normalization) | Major | **REVISE** (see Defect #13) | **Watchdog teardown resolved:** `generation-workflow.store.ts:98-101` registers `inject(DestroyRef).onDestroy(() => this.clearWatchdog())`, matching sibling stores. **Terminal arrays resolved:** private `isTerminal` helpers and all 4 duplicate arrays deleted across `generation-workflow.store.ts` (`:470,493,538,543,551,555,565`) and `guidance-generation.store.ts` (`:121,125,172,189`), all delegating to `isTerminalLifecycle`. **Path normalization regressed (Defect #13):** `matchesBinding` only normalizes its second argument (`actual`), while `bind()` stores unnormalized `binding`, breaking `sameBinding(binding)` reflexivity on any path with trailing separators or whitespace. |
| **7** (type precision & `no-useless-assignment`) | Major | **RESOLVED** (see Minor #14) | Explicit return types added to `SetupRunStore.resolveBlockedStart` (`setup-run.store.ts:1082-1089`), `SetupRunAttempts.observation` (`setup-run-attempt.ts:300-314`), and `requestBoundStart` (`setup-run-attempt.ts:407-412`). `let cancelled: boolean;` (`generation-workflow.store.ts:505`) clears `no-useless-assignment`. `startGuidance` (`generation-workflow.store.ts:228-235`) now checks `error instanceof WizardRpcError && !!error.code?.startsWith('SETUP_')` first; keeping the `error.message` fallback is **justified** (see below). Only the non-discriminated union on `requestBoundStart` remains (logged as Minor #14). |
| **8** (`public` accessibility modifiers) | Minor | **RESOLVED** | Added `public` to all public members/methods in `generation-workflow.store.ts` and `guidance-generation.store.ts`, clearing all 37 accessibility warnings (0 errors, 0 warnings on both files). The 5 pre-existing warnings in `wizard-rpc.service.ts:145-228` remain out of scope for this fix batch. |

### Judgment on `startGuidance` Fallback Decision (`impl-report-phase-b-style-fix.md`, Decision #1)

**Accepted.** In `generation-workflow.store.ts:228-236`, checking `error instanceof WizardRpcError && !!error.code?.startsWith('SETUP_')` first properly uses the typed error thrown by `WizardRpcService.startBoundGuidance` (`wizard-rpc.service.ts:82-87, 223`), while retaining `message.startsWith('SETUP_') || message.includes('Update Background models and retry.')` preserves behavior for `generation-workflow.store.spec.ts:549-558` (which rejects with a plain `Object.assign(new Error(...), { code: 'SETUP_MODEL_INVALID' })`) and any unmapped transport rejection. This matches original Finding 7's own guidance (*"keeping the fallback check only if needed for non-`WizardRpcError` mocks"*).

### New / Remaining Defects

#### 13. [Major] Asymmetric `matchesBinding` breaks `sameBinding(binding)` reflexivity and silently drops updates on unnormalized `workspacePath`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-attempt.ts:80-90`
  - `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:110, 127, 534, 577`
  - `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:79, 81, 157, 272`
- **Evidence:** `matchesBinding(expected, actual)` only normalizes `actual.workspacePath`:
  ```ts
  expected.workspacePath === normalizeSetupWorkspacePath(actual.workspacePath)
  ```
  That worked in `SetupRunStore` because `expected` always came from `bindingFor(record)` whose `workspacePath` was already normalized at record creation (`setup-run.store.ts:338`). However, neither `GenerationWorkflowStore.bind(binding)` (`generation-workflow.store.ts:127`) nor `GuidanceGenerationStore.bind(binding)` (`guidance-generation.store.ts:81`) normalizes `binding.workspacePath` before storing `this.bindingValue.set(binding)` (and callers such as `libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts:84` pass caller-supplied `binding` directly to `this.guidance.bind(binding)`).
  - On already-normalized paths (e.g. `'/workspace'`, `'/'`), behavior matches the old `===`.
  - On **any unnormalized path** (e.g. `'/workspace/'`, `'C:\\repo\\'`, `' /workspace '`, or `''`) — the exact input class Finding 6's normalization was meant to handle — `this.sameBinding(binding)` evaluates `matchesBinding(this.bindingValue(), binding)` as `'/workspace/' === '/workspace'` → **`false`** (a binding fails to match itself).
  - **Impact:** Unlike the old `===` (which returned `true` when comparing identical unnormalized bindings), every async guard (`startAgents`, `startGuidance`, `regenerateGuidance`, `retry`, `reject`, `track`, `refresh`, `flushStop`, `adopt`, `refreshCommitted`, `setEnabled`, `loadContent`, `download`) and `applyRun` silently discards responses, errors, and run states; re-calling `bind(sameBinding)` also misses the no-op guard (`generation-workflow.store.ts:110`, `guidance-generation.store.ts:79`) and resets the store. Existing specs missed this only because their fixtures use already-normalized `'/workspace'`.
- **Fix:** Normalize both sides inside `matchesBinding` (`setup-run-attempt.ts:80-90`) so equality is reflexive and symmetric, while rejecting blank/invalid paths (`null`):
  ```ts
  export function matchesBinding(
    expected: SetupGenerationTabBinding | null,
    actual: SetupGenerationTabBinding,
  ): boolean {
    const expectedWorkspace = normalizeSetupWorkspacePath(expected?.workspacePath);
    return (
      expected !== null &&
      expectedWorkspace !== null &&
      expected.tabId === actual.tabId &&
      expected.workflow === actual.workflow &&
      expectedWorkspace === normalizeSetupWorkspacePath(actual.workspacePath)
    );
  }
  ```
  Add a focused regression test in `generation-workflow.store.spec.ts` and `guidance-generation.store.spec.ts` binding a trailing-slash `workspacePath` (e.g. `'/workspace/'`) and verifying `bind` deduplication and `applyRun`/`refresh` acceptance.

#### 14. [Minor] `requestBoundStart` still returns a non-discriminated union requiring `'refusalCode' in response`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-attempt.ts:403-427`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:1042`
- **Evidence:** Adding the explicit return type `Promise<WizardSubmitSelectionResponse | EnhancedPromptsRunWizardResponse | { refusalCode: string } | null>` improves static checking, but preserves the duck-typed `'refusalCode' in response` check in `setup-run.store.ts:1042` rather than the discriminated union recommended in Finding 7.
- **Fix:** Optional here (non-blocking) or fold into the Finding 2/3 store-split batch: return `{ kind: 'response'; response: WizardSubmitSelectionResponse | EnhancedPromptsRunWizardResponse } | { kind: 'refused'; code?: string }` from `requestBoundStart` and switch on `response.kind`.

---

## Original Review (Round 0)

Review family: antigravity (implementer families: claude, codex, kimi-code)

## Summary

| Metric          | Value |
| --------------- | ----- |
| Overall score   | **6 / 10** |
| Verdict         | **REVISE** |
| Blocking issues | 1 |
| Major issues    | 6 |
| Minor issues    | 5 |
| Files reviewed  | 12 (`src/index.ts`, `src/app.ts`, and 10 services under `libs/frontend/setup-wizard/src/lib/services/`) |
| Commits reviewed | `7c8fbe0f73` (Batch 5), `aba3dba7a5` (Batch 6), `libs/frontend/setup-wizard` diff of `92f8636f22` (Batch 7) |

**Checks run:** `npx eslint` on all 12 Phase B files (logged to `.ptah/tmp/eslint-phase-b-style.log`): **0 errors, 44 warnings** (`max-lines` on `setup-run.store.ts`, `no-useless-assignment` on `generation-workflow.store.ts:486`, and 42 `@typescript-eslint/explicit-member-accessibility` warnings across `generation-workflow.store.ts`, `guidance-generation.store.ts`, and `wizard-rpc.service.ts`). Static audit of `tools/degradation-audit/check-degradation.ts` + `baseline.json` (`{}`), Nx module boundaries, `tsconfig.base.json`, `app.config.ts`, and `.commitlintrc.json`.

**Score rationale:** Phase B lands the right architectural direction — zero Nx boundary violations, complete removal of `@ptah-extension/chat-ui` imports from `setup-wizard`, an acyclic intra-library service graph, zero `any`, clean pure persistence/step modules, and proper use of the `SETUP_RUN_ENTRY` core port. It scores **6/10** rather than **7/10** because four concrete `degradation-audit` violations fail the repo's zero-baseline gate (Blocking), `setup-run.store.ts` sits at 1,037 counted / 1,226 total lines (148% of the 700-line ceiling) while sharing mutable `SetupRunAttempt` internals across two files, `setup-run-attempt.ts` has accumulated five unrelated concerns, `SetupRunEntryService` duplicates route definitions, `GenerationWorkflowStore` leaks a watchdog timer on destroy, and `src/app.ts` / `src/index.ts` omit two planned public exports (`SetupRunStore`, `WizardRpcError`) while leaking internal constants. It stays above **5/10** because the foundations and boundaries are sound and every fix is localized.

---

## Findings

### 1. [Blocking] Four `degradation-audit` violations fail the repository's zero-baseline gate

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:250`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-attempt.ts:418`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:139-141`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:307-310`
- **Evidence:** `tools/degradation-audit/baseline.json` is `{}` (0 permitted violations). Against the AST rules in `tools/degradation-audit/check-degradation.ts`:
  1. `generation-handoff.store.ts:250` places `// degradation-audit: preserved - manual recovery keeps non-running statuses such as needs-input intact.` above an `if` statement. `preserved` is not a valid kind (`SUPPRESSION_BODY_RE` at `check-degradation.ts:106-107` accepts only `optional-capability | reported`), and any `// degradation-audit:` line not attached to a `CatchClause` or `.catch(...)` call is recorded in `allMarkerLines` and reported as `orphaned-suppression` (`check-degradation.ts:496-500, 664-672`).
  2. `setup-run-attempt.ts:418` places `// degradation-audit: optional-capability - an unavailable guidance status keeps the last known status` inside `if (status.error) { ... return null; }` with no enclosing `catch`/`.catch()`, triggering `orphaned-suppression`.
  3. `setup-run.store.ts:139-141` (`browserStorage()`) has `} catch { return null; }` with no `throw`, no `.error(...)`, and no `degradation-audit:` marker, triggering `catch-return-sentinel` (`check-degradation.ts:534-549`).
  4. `setup-run-persistence.ts:307-310` (`writeSetupRunIndex`) has `} catch { console.warn(...); return false; }`. Because `console.warn` is not `.error(...)` (`isErrorCall` at `check-degradation.ts:186-192`) and `return false` is a literal boolean return without a suppression comment, it triggers `catch-return-sentinel`.
- **Fix:**
  - Remove the `degradation-audit:` prefix from `generation-handoff.store.ts:250` and `setup-run-attempt.ts:418`, turning both into plain explanatory comments.
  - Add valid `// degradation-audit: optional-capability - <reason>` comments inside the `catch` blocks at `setup-run.store.ts:139` and `setup-run-persistence.ts:307`.

---

### 2. [Major] `setup-run.store.ts` exceeds the 700-line ceiling (1,037 counted / 1,226 total lines) and combines four workflow coordinators

- **Location:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:1-1226` (ESLint `max-lines` warning at `:858`: `File has too many lines (1037). Maximum allowed is 700`)
- **Evidence:** `SetupRunStore` owns four distinct concerns in one class:
  1. Signal state, persistence debounce, read selectors, and record mutations (`:145-384, :475-493, :1104-1225`).
  2. Bound-run (`agent-generation` / `project-guidance`) push/poll/retry/cancel/blocked-owner orchestration (`:201-219, :387-473, :777-861, :972-1100`).
  3. Analysis workflow reconciliation and `WizardAnalysisRunner` signal synchronization (`:709-774, :903-970`).
  4. Skill-review promise caching, RPC calls, and reconciliation (`:164-167, :610-652, :863-900`).
  - Its direct neighbor `SetupWizardStateService` (`libs/frontend/setup-wizard/src/lib/services/setup-wizard-state.service.ts:102-110`) solved the exact same growth issue by keeping signals and public API on the root service while delegating domain logic to plain-class collaborators in a `./setup-wizard/` subfolder.
- **Fix:** Split `setup-run.store.ts` along workflow boundaries into plain-class collaborators under `libs/frontend/setup-wizard/src/lib/services/setup-run/` as detailed in **Proposed Split of `setup-run.store.ts`** below, keeping `SetupRunStore`'s public API unchanged and every file under 450 lines.

---

### 3. [Major] `setup-run-attempt.ts` bundles five unrelated concerns and leaks mutable attempt state across `SetupRunStore` and sibling stores

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-attempt.ts:20-166, 169-265, 377-459`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:465-468, 821-837, 975, 1039, 1065, 1057-1072`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-entry.service.ts:8`
  - `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:7, 217-235`
  - `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:12-15, 322-339, 369-375`
- **Evidence:**
  1. **Grab-bag module:** `setup-run-attempt.ts` exports (a) binding/workflow mapping (`isBound`, `bindingOf`, `workflowOfBinding`, `matchesBinding`, `isRunBinding`), (b) lifecycle/status verification & UI copy (`LIFECYCLE_STATUS`, `isRunLifecycle`, `isTerminalLifecycle`, `FOREIGN_WORKSPACE_COPY`, `startRefusalCopy`, `hasCommittedGuidance`, `isFinalizationCorrection`, `verifiedRunStatus`), (c) `SetupRunAttempts` state machine, (d) bound RPC wrappers (`readBoundState`, `requestBoundStart`, `reconcileGuidanceOutput`), and (e) `SetupRunPoll`. As a result, `setup-run-entry.service.ts:8` imports `workflowOfBinding` and `generation-handoff.store.ts:7` imports `startRefusalCopy` from an "attempt" file that has nothing to do with entry navigation or handoff copy.
  2. **Leaky mutable internals between `SetupRunStore` and `SetupRunAttempts`:** `SetupRunStore` directly mutates `SetupRunAttempt` fields (`attempt.pending = false` at `:830, :1039`; `attempt.ownerId = owner.id` at `:1065`) and directly reads internal flags (`attempt?.pending`, `attempt?.pendingInitialStarts`, `attempt?.start`, `attempt?.ownerId` at `:467, :821, :824, :834, :975`) while `SetupRunAttempts` mutates and prunes on those exact same fields (`setup-run-attempt.ts:193, 198, 207, 211, 213, 225, 234, 250, 255-265`). Both files must stay in lockstep to preserve attempt-pruning invariants.
  3. **Duplicated start/blocked choreography across three stores:**
     - The `rejection?.reason === 'blocked' && rejection.ownerTabId` → `resolveBlockedStart` → self-vs-other-owner branching is repeated across `setup-run.store.ts:1057-1072`, `generation-workflow.store.ts:322-339`, and `generation-handoff.store.ts:225-235`.
     - Constructing the `'starting'` placeholder `SetupGenerationRunState` from `SetupGenerationAccepted` is duplicated verbatim in `generation-workflow.store.ts:369-375` and `generation-handoff.store.ts:217-223`.
- **Fix:**
  - Extract pure binding, lifecycle, status-verification, and copy helpers into `setup-run/setup-run-binding.ts` and `SetupRunPoll` into `setup-run/setup-run-poll.ts`, leaving `setup-run-attempt.ts` (moved to `setup-run/setup-run-attempt.ts`) focused solely on attempt tracking.
  - Make `SetupRunAttempt` fields `readonly` externally and add explicit methods on `SetupRunAttempts` (`clearPending(attempt)`, `setOwner(attempt, ownerId)`, `isPending(id)`, `hasPendingInitialStarts(id)`, `resolveTargetId(id)`).
  - Extract a small `toStartingRunState(binding, accepted)` helper in `setup-run-binding.ts` so `GenerationWorkflowStore` and `GenerationHandoffStore` share one shape.

---

### 4. [Major] Public API surface mismatches across `src/app.ts`, `src/index.ts`, and `SetupRunStore`

- **Locations:**
  - `libs/frontend/setup-wizard/src/app.ts:1-7`
  - `libs/frontend/setup-wizard/src/index.ts:8-28`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:387-468, 608, 1081`
  - `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:58, 627-629`
- **Evidence:**
  1. **`SetupRunStore` missing from `src/app.ts`:** `apps/ptah-extension-webview/src/app/app.config.ts:100-111` intentionally imports strictly from the narrow `@ptah-extension/setup-wizard/app` entry to keep ~208 kB of setup-wizard components out of the initial bundle. `implementation-plan.md:252-253, 489-491` specifies exporting `SetupRunStore` from `src/app.ts` so `app.config.ts` can switch `generationRouteTabValidatorToken` from `TabManagerService` to `SetupRunStore` in Batch 14. Batch 7 added `SetupRunEntryService` to `src/app.ts:7` (which already transitively loads `SetupRunStore` with zero UI components), but omitted `SetupRunStore`.
  2. **`WizardRpcError` missing from `src/index.ts`:** Both `SetupRunStore.reviewSkills` (`setup-run.store.ts:608`) and `WizardRpcService.recommendAnalysisSkills` (`wizard-rpc.service.ts:627-629`) document that callers should catch `WizardRpcError` and inspect `.code`. External consumers in `libs/frontend/onboarding` (e.g., `analyze-skills.page.ts` in Batch 10) cannot import `WizardRpcError` because `src/index.ts` does not export it.
  3. **Internal constants leaked in `src/index.ts`:** `SETUP_RUN_POLL_INTERVAL_MS` (`index.ts:10`) and `TERMINAL_SETUP_RUN_STATUSES` (`index.ts:18`) have zero callers outside `setup-wizard` (and `SETUP_RUN_POLL_INTERVAL_MS` is only used by `setup-run.store.ts` and `setup-run.store.spec.ts`). Consumers already have `isTerminalSetupRunStatus`.
  4. **Internal sibling-coordination plumbing on public `SetupRunStore`:** Seven public methods — `reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted`, and `resolveBlockedStart` (`setup-run.store.ts:387-468, 1081`) — have zero callers outside `libs/frontend/setup-wizard/src/lib/services/`. Exposing them unmarked alongside consumer commands (`start`, `attach`, `cancel`, `retry`, `rerun`, `dismiss`) invites onboarding pages to bypass `GenerationWorkflowStore` / `GenerationRunEventAdapter` and couple to internal attempt machinery.
- **Fix:**
  - Export `SetupRunStore` from `libs/frontend/setup-wizard/src/app.ts`.
  - Export `WizardRpcError` from `libs/frontend/setup-wizard/src/index.ts`.
  - Remove `SETUP_RUN_POLL_INTERVAL_MS` and `TERMINAL_SETUP_RUN_STATUSES` from `libs/frontend/setup-wizard/src/index.ts` (tests inside `setup-wizard` already import directly from relative paths).
  - Mark the seven internal bound-run coordination methods `@internal` (or route sibling services through an internal `SetupBoundRunCoordinator` service not re-exported from `src/index.ts`).

---

### 5. [Major] `SetupRunEntryService` hardcodes workflow entry routes instead of delegating to `setup-run-steps.ts`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-entry.service.ts:44-46`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts:103-115`
- **Evidence:** `implementation-plan.md:334-335` defines `setup-run-steps.ts` as the single route table used by every entry point. `setup-run-steps.ts:103-115` already defines `entrySubPath(record)` (`agent-generation` → `['analyze', 'skills']`, standalone `project-guidance` → `['guidance']`), yet `SetupRunEntryService.openWorkflow` re-declares the same tuple inline:
  ```ts
  const entry =
    requested === 'agent-generation' ? ['analyze', 'skills'] : ['guidance'];
  return this.router.navigateToSurface('onboarding', entry);
  ```
  Any future route adjustment (such as D7 changing the agent-generation entry route) has to be updated in two places or silently diverges.
- **Fix:** Export `entrySubPathFor(workflow: SetupRunWorkflow, chained = false): readonly string[]` from `setup-run-steps.ts` (reused by `entrySubPath`) and call `entrySubPathFor(requested)` in `SetupRunEntryService.openWorkflow`.

---

### 6. [Major] Unreleased watchdog timer, 4x duplicated terminal-status arrays, and unnormalized binding checks in `GenerationWorkflowStore` & `GuidanceGenerationStore`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:55, 91-94, 430, 455, 516-520, 563-576`
  - `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:73-76, 123, 156-158, 173, 196-198, 278-285`
- **Evidence:**
  1. **Missing timer teardown:** `GenerationWorkflowStore` schedules `this.watchdog = setTimeout(...)` (`:430, :455`) but registers no `DestroyRef.onDestroy(() => this.clearWatchdog())`. Every other timer-owning service in this area releases its timer on destroy (`SetupRunStore:246`, `GenerationHandoffStore:51-54`, `WizardAnalysisRunner:196`).
  2. **Duplicated terminal lifecycle literals:** Both stores already import from `./setup-run-attempt`, which exports `isTerminalLifecycle`. Despite that, `generation-workflow.store.ts:572-576` re-declares `['completed', 'cancelled', 'failed', 'timed-out']` on a weakly typed `status: string` parameter (instead of `SetupGenerationRunLifecycle` / `SetupGenerationTerminalStatus`), and `guidance-generation.store.ts` hardcodes the exact same 4-element literal array **three separate times** (`:123`, `:173`, and `:197`) — even duplicating its own `this.isTerminal` method at `:123` and `:173`.
  3. **Drifting workspace-path comparison:** `matchesBinding` (`setup-run-attempt.ts:78-88`) normalizes trailing path separators via `normalizeSetupWorkspacePath`. Both `generation-workflow.store.ts` (`:91-94, :516-520, :563-570`) and `guidance-generation.store.ts` (`:73-76, :156-158, :278-285`) compare `workspacePath` with raw `===` instead of reusing `matchesBinding`, creating subtle inconsistency across trailing-slash paths.
- **Fix:** Add `inject(DestroyRef).onDestroy(() => this.clearWatchdog())` in `GenerationWorkflowStore`; replace all four hardcoded terminal arrays with `isTerminalLifecycle`; replace `sameBinding` and inline binding comparisons with `matchesBinding`.

---

### 7. [Major] Type precision gaps: missing explicit return types, duck-typed start results, string-parsed RPC errors, and `no-useless-assignment`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:1041, 1081-1084`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-attempt.ts:297-301, 390-409`
  - `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:176-180, 212-219, 486`
- **Evidence:**
  1. **Omitted return types & duck-typing:** `SetupRunStore.resolveBlockedStart` (`setup-run.store.ts:1081-1084`), `SetupRunAttempts.observation` (`setup-run-attempt.ts:297-301`), and `requestBoundStart` (`setup-run-attempt.ts:390-394`) omit explicit return types. `requestBoundStart`'s inferred union forces `setup-run.store.ts:1041` to branch via `'refusalCode' in response` instead of a discriminated union.
  2. **String matching instead of typed `WizardRpcError`:** `generation-workflow.store.ts:212-219` parses `error.message` (`message.startsWith('SETUP_') || message.includes('Update Background models and retry.')`) even though `WizardRpcService.startBoundGuidance` (`wizard-rpc.service.ts:82-87`) throws a typed `WizardRpcError` with `.code` (and `generation-handoff.store.ts:242` and `setup-run-attempt.ts:405` already branch via `error instanceof WizardRpcError`).
  3. **Dead initializer:** `generation-workflow.store.ts:486` initializes `let cancelled = false;` then overwrites it in both `try` and `catch`, producing ESLint `no-useless-assignment`.
- **Fix:**
  - Add explicit return types to `resolveBlockedStart`, `observation`, and `requestBoundStart`; make `requestBoundStart` return a discriminated union `| { kind: 'response'; response: WizardSubmitSelectionResponse | EnhancedPromptsRunWizardResponse } | { kind: 'refused'; code?: string }`.
  - In `generation-workflow.store.ts:212-219`, check `error instanceof WizardRpcError && error.code?.startsWith('SETUP_')` (keeping the fallback check only if needed for non-`WizardRpcError` mocks).
  - Change `let cancelled = false;` to `let cancelled: boolean;` at `generation-workflow.store.ts:486`.

---

### 8. [Minor] Missing `public` accessibility modifiers across `generation-workflow.store.ts` and `guidance-generation.store.ts`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:59-88, 116, 123, 141, 187, 230, 261, 407, 414` (20 ESLint warnings)
  - `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:61-106, 141, 200, 229, 245, 263` (17 ESLint warnings)
  - `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:145, 163, 180, 209, 228` (5 pre-existing ESLint warnings)
- **Evidence:** `libs/frontend/setup-wizard/eslint.config.mjs:45-48` configures `@typescript-eslint/explicit-member-accessibility: ['warn', { accessibility: 'explicit' }]`. Every newly written Phase B class (`SetupRunStore`, `SetupRunAttempts`, `SetupRunPoll`, `GenerationRunEventAdapter`, `GenerationHandoffStore`, `SetupGenerationOpenHandler`, `SetupRunEntryService`) and both new `WizardRpcService` methods (`getSkillReview`, `recommendAnalysisSkills`) include `public`, whereas new Phase B methods added to `generation-workflow.store.ts` (`bindRecord`, `regenerateGuidance`, `retry`) and `guidance-generation.store.ts` (`bindRecord`) omit it.
- **Fix:** Add explicit `public` modifiers on public members in `generation-workflow.store.ts` and `guidance-generation.store.ts` to bring ESLint warnings to 0 on Phase B files.

---

### 9. [Minor] Orphaned and stale comments in `generation-workflow.store.ts`, undocumented ignored `_origin`, and missing `reported` annotations on non-sentinel catches

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:21, 174, 210, 238-240`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-entry.service.ts:32`
  - `libs/frontend/setup-wizard/src/lib/services/setup-generation-open.handler.ts:60`
- **Evidence:**
  - `generation-workflow.store.ts:21` leaves an orphaned JSDoc `/** Record copy for a start the backend refused for this workspace. */` above `export type GenerationViewState` (left behind when `FOREIGN_WORKSPACE_COPY` moved to `setup-run-attempt.ts`).
  - `generation-workflow.store.ts:238-240` carries a stale comment (`// Interim gap until Batch 8 binds onboarding pages to records:`), even though Batch 8 landed in `92f8636f22`.
  - `setup-run-entry.service.ts:32` accepts `_origin: string` from `SetupRunEntry.openWorkflow` and discards it with no comment explaining that `openWorkflow` only navigates to the entry step without creating a record (unlike `implementation-plan.md:499` which mentions carrying `origin` on record start).
  - `generation-workflow.store.ts:174, 210` and `setup-generation-open.handler.ts:60` swallow caught errors into UI state without a `// degradation-audit: reported - ...` comment (not flagged by `check-degradation.ts` because they have no literal return, but inconsistent with `guidance-generation.store.ts:149, 224, 237, 258, 273` and `batches.md:31`).
- **Fix:** Remove line 21, update or remove lines 238-240, add a one-line comment explaining `_origin` in `SetupRunEntryService.openWorkflow`, and add `// degradation-audit: reported - ...` on the three caught failures.

---

### 10. [Minor] Duplicated pure predicates and needless `as` casts in `setup-run-persistence.ts`, `setup-run-steps.ts`, and `setup-run.store.ts`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:44-59, 65-79`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts:117-119`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:111-126`
- **Evidence:**
  - `isStepOf` (`setup-run-steps.ts:117-119`) is identical to `isSetupRunStepOf` (`setup-run-persistence.ts:74-79`).
  - `isWorkflow` and `isStatus` (`setup-run-persistence.ts:65-71`) cast `value as SetupRunWorkflow` / `value as SetupRunStatus` against parallel arrays `WORKFLOWS`/`STATUSES`; `Object.hasOwn(SETUP_RUN_STEPS, value)` (after `typeof value === 'string'`) eliminates both the cast and the duplicate workflow list, and `ReadonlySet<unknown>` eliminates the `STATUSES` cast.
  - `LIVE_STATUSES` / `isLive` (`setup-run.store.ts:111-126`) duplicates `!isTerminalSetupRunStatus(record.status)` used in `setup-run-attempt.ts:346`, `generation-handoff.store.ts:179`, and `setup-run-entry.service.ts:40`.
- **Fix:** Move `isSetupRunStepOf` (and `isLiveSetupRunStatus` if desired) into `setup-run.types.ts`, reuse it in `setup-run-steps.ts` and `setup-run-persistence.ts`, and drop the `as` casts in `isWorkflow`/`isStatus`.

---

### 11. [Minor] Directly exposed writable signals on `GenerationWorkflowStore` and `GuidanceGenerationStore`

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts:59-61, 68` (`runMismatch`, `lookupExhausted`, `acceptedRun`, `startError`)
  - `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts:66-67` (`content`, `actionFailed`)
- **Evidence:** `SetupRunStore`, `GenerationHandoffStore`, `GenerationPreviewStore`, and `WizardAnalysisRunner` expose every public signal via `.asReadonly()`. These six properties expose raw `WritableSignal`s, letting any consumer mutate store state externally. (`libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts:179, 182, 583` currently calls `.set()` on `workflow.startError` and `guidance.content` in test setup.)
- **Fix:** Back these six signals privately and expose `.asReadonly()`, updating those three spec lines in `project-guidance.page.spec.ts` to use store methods or a fake store.

---

### 12. [Minor] Raw message-type literals in `GenerationRunEventAdapter` and inconsistent plain-object guards

- **Locations:**
  - `libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts:75-76, 93-105, 115-120`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-attempt.ts:93-94`
  - `libs/frontend/setup-wizard/src/lib/services/setup-generation-open.handler.ts:66-67`
- **Evidence:**
  - `generation-run-event-adapter.ts` types `readPush(type: string, ...)` and repeats the four `'setup-wizard:*'` literals in both `readPush` and `handledMessageTypes`, whereas sibling `setup-wizard/wizard-message-dispatcher.ts:37-47` anchors its list to `readonly WizardMessageType[]` from `@ptah-extension/shared` so a renamed message type fails compilation.
  - `generation-run-event-adapter.ts:75`, `setup-run-attempt.ts:93`, and `setup-generation-open.handler.ts:66` narrow `unknown` via `!value || typeof value !== 'object'` without `!Array.isArray(value)` (unlike `setup-run-persistence.ts:61-63`), relying on downstream property checks to reject arrays.
- **Fix:** Type `handledMessageTypes: readonly WizardMessageType[]` (or derive from a typed `const` tuple) in `GenerationRunEventAdapter` and share a small `isRecord(value: unknown): value is Record<string, unknown>` helper (with `!Array.isArray(value)`).

---

## Proposed Split of `setup-run.store.ts`

Following the exact sibling precedent in `libs/frontend/setup-wizard/src/lib/services/setup-wizard/` (see `setup-wizard-state.service.ts:102-110`), keep `SetupRunStore` as the single `@Injectable({ providedIn: 'root' })` coordinator that owns all writable signals and preserves its public API byte-for-byte, and extract plain-class collaborators under `libs/frontend/setup-wizard/src/lib/services/setup-run/`.

```text
libs/frontend/setup-wizard/src/lib/services/
├── setup-run.types.ts                         (~105 lines)  record types, SETUP_RUN_STEPS, isTerminalSetupRunStatus, isSetupRunStepOf
├── setup-run-steps.ts                         (~175 lines)  stepTarget, nextStep, entrySubPathFor
├── setup-run-persistence.ts                   (~305 lines)  localStorage read/validate/cap/write
├── setup-run.store.ts                         (~380 lines)  @Injectable root facade, signals, effects, index CRUD, top-level dispatch
└── setup-run/
    ├── setup-run-host.ts                      (~45 lines)   SetupRunRecordHost interface (breaks cycle), newRunId, FAILURE_COPY
    ├── setup-run-binding.ts                   (~175 lines)  pure binding/lifecycle/status/copy helpers + toStartingRunState (moved from setup-run-attempt.ts)
    ├── setup-run-poll.ts                      (~45 lines)   SetupRunPoll shared timer (moved from setup-run-attempt.ts)
    ├── setup-run-attempt.ts                   (~220 lines)  SetupRunAttempts encapsulated tracker + bound RPC wrappers (readBoundState, requestBoundStart, reconcileGuidanceOutput)
    ├── setup-run-bound.coordinator.ts         (~290 lines)  bound workflow (agent-generation + project-guidance) reconcile, start, cancel, push/verify, poll
    ├── setup-run-analysis.coordinator.ts      (~160 lines)  analysis workflow runner-sync, reconcile, adopt, run, cancel
    └── setup-run-skill-review.coordinator.ts  (~110 lines)  skill-review promise cache, RPC, reconcile
```

### Exact Method & Field Placement

| Target file | Fields & helpers | Methods moved / kept | Est. ESLint lines |
| --- | --- | --- | --- |
| `setup-run.store.ts` (public facade, unchanged public API) | `rpc`, `runner`, `wizardState`, `tabs`, `vscode`, `storage`, `_index`, `_cancelling`, `liveThisSession`, `viewing`, `writeQueued`, `reconcileSequence`, `workspacePath`, `runs`, `attentionCount`, `runningCount`, `cancellingIds`, `pollNeeded`, plus instances of `bound`, `analysis`, `skillReview` coordinators | **Kept:** `constructor` (storage load, 3 `effect`s, `DestroyRef`), `runsFor`, `activeRun`, `get`, `targetOf`, `isCancelling`, `start`, `adopt`, `attach`, `release`, `markSeen`, `report`, `setStep`, `setSelection`, `dismiss`, `cancel`, `retry`, `rerun`, `refresh`, `activate`, `adoptLegacyTabs`, `reconcile`, `reconcileRecord`, `apply`, `patch`, `insert`, `forget`, `remove`, `setCancelling`, `scheduleWrite`, `browserStorage`. **1-line delegates (public API preserved):** `bindingFor`, `reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted`, `resolveBlockedStart`, `reviewSkills`. | ~340 |
| `setup-run/setup-run-host.ts` | `SetupRunRecordHost` interface (`get`, `runsFor`, `workspacePath`, `isCancelling`, `setCancelling`, `insert`, `apply`, `patch`, `adopt`, `markLiveThisSession`, `isLiveThisSession`, `onRecordSettled`), `FAILURE_COPY`, `ORPHAN_GRACE_MS`, `newRunId` | Pure contract + helpers; no imports of `SetupRunStore`. | ~45 |
| `setup-run/setup-run-binding.ts` | `BOUND_WORKFLOW`, `RUN_FAILURE_COPY`, `LIFECYCLE_STATUS`, `FOREIGN_WORKSPACE_COPY`, `START_REFUSED_COPY` | `isBound`, `bindingOf`, `workflowOfBinding`, `isRunLifecycle`, `isTerminalLifecycle`, `matchesBinding`, `isRunBinding`, `startRefusalCopy`, `hasCommittedGuidance`, `isFinalizationCorrection`, `verifiedRunStatus`, `toStartingRunState`. Imported by `setup-run-entry.service.ts`, `generation-handoff.store.ts`, `generation-workflow.store.ts`, `guidance-generation.store.ts`, `generation-run-event-adapter.ts` instead of `setup-run-attempt.ts`. | ~165 |
| `setup-run/setup-run-poll.ts` | `SetupRunPoll` | `ensure`, `stop`, `poll`. | ~40 |
| `setup-run/setup-run-attempt.ts` | `SetupRunAttempt` (readonly externally), `SetupRunAttempts` | `get`, `startInitial`, `start`, `hold`, `forget`, `settle`, `evidence`, `orphaned`, `hasFinalizationFailure`, `observation`, `canObserve`, `shouldPoll`, `pushed`, `fallback`, plus new encapsulating methods `clearPending`, `assignOwner`, `isPending`, `hasPendingInitialStarts`, `resolveTargetId`, and RPC wrappers `readBoundState`, `requestBoundStart`, `reconcileGuidanceOutput`. | ~230 |
| `setup-run/setup-run-bound.coordinator.ts` | `attempts: SetupRunAttempts`, `poll: SetupRunPoll`, `rpc`, `host` | `shouldPoll`, `ensurePoll`, `stopPoll`, `reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted`, `resolveBlockedStart`, `reconcileBound`, `observeRun`, `cancelBound`, `startBound`, `sendBoundStart`, `adoptResumableGeneration`, `settle`, `forget`. | ~270 |
| `setup-run/setup-run-analysis.coordinator.ts` | `runnerSeen: Set<string>`, `runner`, `wizardState`, `rpc`, `host` | `syncFromRunner` (was `syncAnalysisFromRunner`), `reconcile` (was `reconcileAnalysis`), `adopt` (was `adoptAnalysis`), `run` (was `runAnalysis`), `cancel` (was `cancelAnalysis`). | ~140 |
| `setup-run/setup-run-skill-review.coordinator.ts` | `reviews: Map<string, Promise<WizardRecommendAnalysisSkillsResult>>`, `rpc`, `host` | `reviewSkills`, `reconcile` (was `reconcileReview`), `readStoredReview`, `applyReviewed`. | ~95 |

**Why this split works:**
- Zero public API change (`SetupRunStore` keeps every signal and method signature; `setup-run.store.spec.ts` passes unmodified).
- Every file sits between 40 and 340 ESLint lines — less than half the 700-line ceiling.
- Dependency direction stays strictly acyclic: `setup-run.types` ← `setup-run-host` / `setup-run-binding` / `setup-run-poll` ← `setup-run-attempt` ← `setup-run-*.coordinator` ← `setup-run.store`.
- Mirrors `setup-wizard-state.service.ts` + `./setup-wizard/*` right next door, so any developer who knows `setup-wizard` recognizes the layout immediately.

---

## Five Style Questions

### 1. What breaks when requirements change in six months?
- Adding a sixth Setup workflow (or renaming an onboarding route) currently requires touching `setup-run.types.ts`, `setup-run-persistence.ts` (`WORKFLOWS` array), `setup-run-steps.ts`, `setup-run-entry.service.ts:44-45` (hardcoded routes), and multiple `switch` statements inside a 1,226-line `setup-run.store.ts`. Because `SetupRunEntryService` hardcodes `['analyze', 'skills']` and `['guidance']` separately from `setup-run-steps.ts`, a route change breaks entry navigation silently.
- Adding a new `SetupGenerationRunLifecycle` terminal status breaks `generation-workflow.store.ts:575` and three separate inline arrays in `guidance-generation.store.ts:123, 173, 197` even though `setup-run-attempt.ts:56-76` has an exhaustive `satisfies Record<SetupGenerationRunLifecycle, SetupRunStatus>` map.
- Changing how `SetupRunAttempt` tracks pending/owner state can break pruning invariants because `setup-run.store.ts:830, 1039, 1065` mutates `attempt.pending` and `attempt.ownerId` directly instead of going through `SetupRunAttempts`.

### 2. What would a new team member misread here?
- Why `SetupRunEntryService` (`setup-run-entry.service.ts:8`) and `GenerationHandoffStore` (`generation-handoff.store.ts:7`) import `workflowOfBinding` and `startRefusalCopy` from `setup-run-attempt.ts` when neither service deals with attempts.
- Why `SetupRunStore` exposes `reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted`, and `resolveBlockedStart` alongside `start`/`cancel`/`retry`/`rerun` — without `@internal` or separation, a page author will assume onboarding pages are supposed to call them.
- The orphaned JSDoc at `generation-workflow.store.ts:21` ("Record copy for a start the backend refused for this workspace") directly above `GenerationViewState`, and the stale "Interim gap until Batch 8" comment at `generation-workflow.store.ts:238-240`.
- Why `// degradation-audit: preserved - ...` at `generation-handoff.store.ts:250` looks like a valid repo suppression when `tools/degradation-audit` rejects it.

### 3. What does this cost to maintain that a simpler shape would not?
- Reviewing or editing any single workflow in `SetupRunStore` requires reading around ~900 unrelated lines of other workflows and keeping track of 4 different private tracking collections (`attempts`, `liveThisSession`, `runnerSeen`, `reviews`) and their cross-cutting cleanup in `apply`/`forget`.
- Maintaining three copies of the `blocked` + `ownerTabId` resolution sequence (`setup-run.store.ts:1057-1072`, `generation-workflow.store.ts:322-339`, `generation-handoff.store.ts:225-235`) and two copies of `'starting'` placeholder construction (`generation-workflow.store.ts:369-375`, `generation-handoff.store.ts:217-223`) multiplies every protocol change across three files.
- Maintaining 44 ESLint warnings across Phase B files adds permanent noise to `eslint` output and obscures real future warnings.

### 4. Where is this inconsistent with how the same problem is solved elsewhere in the repo?
- **Oversized root store decomposition:** `SetupWizardStateService` (`libs/frontend/setup-wizard/src/lib/services/setup-wizard-state.service.ts:102-110`) extracted plain-class collaborators into `./setup-wizard/`; `SetupRunStore` grew to 1,226 lines in a single file with one misc helper file (`setup-run-attempt.ts`).
- **Timer cleanup:** `SetupRunStore:246`, `GenerationHandoffStore:51-54`, and `WizardAnalysisRunner:196` register `DestroyRef.onDestroy`; `GenerationWorkflowStore` schedules `this.watchdog` (`:430, :455`) without one.
- **Explicit accessibility modifiers:** New Phase B files follow `libs/frontend/setup-wizard/eslint.config.mjs:45-48`, while `generation-workflow.store.ts` and `guidance-generation.store.ts` leave 37 public members unmarked.
- **Degradation audit discipline:** `tools/degradation-audit/check-degradation.ts` enforces strict `optional-capability | reported` markers on `catch`/`.catch()` only; Phase B mixes valid markers with two non-catch markers (one with invented kind `preserved`) and two unmarked sentinel catches.
- **Narrow bootstrap barrel:** `apps/ptah-extension-webview/src/app/app.config.ts:100-111` imports all bootstrap setup-wizard services from `@ptah-extension/setup-wizard/app`; `src/app.ts` adds `SetupRunEntryService` but omits `SetupRunStore`.

### 5. What would you have done differently, and why is that better rather than merely other?
- Split `SetupRunStore` into `./setup-run/` coordinators and separate `setup-run-binding.ts` from `setup-run-attempt.ts` during Batch 6 instead of letting `setup-run-attempt.ts` absorb unrelated binding/copy/poll helpers while `setup-run.store.ts` crossed 1,200 lines. That keeps each file single-responsibility, eliminates leaky mutation of `SetupRunAttempt` fields, and gives sibling services clean imports (`setup-run-binding.ts`) without depending on attempt internals.
- Export `entrySubPathFor` from `setup-run-steps.ts` and `SetupRunStore` / `WizardRpcError` from `src/app.ts` / `src/index.ts` right when their consumers/docs were written, preventing route drift and downstream barrel friction in Batches 10 and 14.

---

## File-by-File

### `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts`
Score **5/10** — 1 blocking (`:139-141`), 3 major (`:1-1226`, `:821-837/:1039/:1065`, `:387-468/:1081`), 1 minor (`:111-126`). Clean Nx boundaries (reads only `tabs.activeWorkspacePath` and `consumeLegacySetupTabs`), strict TypeScript with no `any`, and clear normative-rule documentation, but at 1,037 ESLint lines it aggregates four workflow coordinators, mutates `SetupRunAttempt` internals directly, misses a `degradation-audit:` marker in `browserStorage()`, and leaves `resolveBlockedStart` without an explicit return type.

### `libs/frontend/setup-wizard/src/lib/services/setup-run-attempt.ts`
Score **5/10** — 1 blocking (`:418`), 2 major (`:20-459`, `:297-301/:390-409`), 1 minor (`:93-94`). Well-typed validation helpers (`satisfies Record<...>`) and clean `SetupRunPoll`, but acts as a five-concern catch-all whose name misleads importers, exposes mutable `SetupRunAttempt` fields to `SetupRunStore`, lacks explicit return types on `observation` and `requestBoundStart`, and has an orphaned `degradation-audit:` comment inside an `if` branch at `:418`.

### `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts`
Score **7/10** — 1 blocking (`:307-310`), 0 major, 1 minor (`:44-59, :65-71`). Pure, well-bounded, zero Angular dependencies, strict field whitelisting and safe corruption handling; only held back by the missing `degradation-audit:` comment on `writeSetupRunIndex`'s `catch { console.warn(...); return false; }` and two avoidable `as` casts in `isWorkflow`/`isStatus`.

### `libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts`
Score **8/10** — 0 blocking, 0 major, 1 minor (`:75-76, :93-120`). Clean, focused 153-line rewrite that eliminates `TabManagerService`, `StreamingHandlerService`, and `MessageFinalizationService` cleanly, passes ESLint with 0 warnings, and keeps clear delegation to `SetupRunStore` and `GenerationWorkflowStore`; only minor nit is using raw message-type string literals instead of `WizardMessageType` and omitting `!Array.isArray` in `readPush`.

### `libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts`
Score **5/10** — 0 blocking, 3 major (`:55/:430/:455`, `:91-94/:516-520/:563-576`, `:176-180/:212-219/:322-339/:369-375/:486`), 3 minor (`:59-88`, `:21/:238-240`, `:59-61/:68`). Successfully removed `TabManagerService` and `QueuedFollowUpStore` and delegates retry/rerun/cancel to `SetupRunStore`, but lacks `DestroyRef` cleanup for `watchdog`, duplicates `blocked` handling and `'starting'` placeholders, parses `error.message` instead of `WizardRpcError`, carries 21 ESLint warnings (including `no-useless-assignment` at `:486`), and leaves orphaned/stale comments.

### `libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts`
Score **6/10** — 0 blocking, 1 major (`:73-76, :123, :156-158, :173, :196-198, :278-285`), 2 minor (`:61-263`, `:66-67`). Clean `degradation-audit: reported` discipline on all 5 `catch` blocks and clean removal of tab coupling, but repeats `['completed', 'cancelled', 'failed', 'timed-out']` three times instead of using `isTerminalLifecycle`, uses unnormalized `workspacePath ===` checks, exposes two writable signals directly, and emits 17 missing-accessibility ESLint warnings.

### `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts`
Score **6/10** — 1 blocking (`:250`), 1 major (`:7, :217-235`), 0 minor. Cleanly re-keyed from tabs to `agentRunId`, drops the `@ptah-extension/chat-ui` launcher import, properly tears down its timer via `DestroyRef.onDestroy` (`:51-54`), and passes ESLint with 0 warnings; held back by the invalid/orphaned `// degradation-audit: preserved - ...` marker on an `if` statement at `:250` and duplicated start/blocked handling.

### `libs/frontend/setup-wizard/src/lib/services/setup-generation-open.handler.ts`
Score **8/10** — 0 blocking, 0 major, 2 minor (`:60`, `:66-67`). Concise 77-line handler that drops `@ptah-extension/chat-ui`, injects `SETUP_RUN_ENTRY` optionally with a safe fallback to `/onboarding`, uses `MESSAGE_TYPES.SETUP_GENERATION_OPEN`, and passes ESLint with 0 warnings.

### `libs/frontend/setup-wizard/src/lib/services/setup-run-entry.service.ts`
Score **7/10** — 0 blocking, 1 major (`:44-46`), 1 minor (`:32`). Clean, minimal implementation of `SetupRunEntry` with 0 ESLint warnings and clean dependency direction; loses a point for hardcoding `['analyze', 'skills']` / `['guidance']` instead of calling `setup-run-steps.ts` and importing `workflowOfBinding` from `setup-run-attempt.ts`.

### `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` (Phase B additions)
Score **8/10** — 0 blocking, 0 major, 1 minor (5 pre-existing accessibility warnings at `:145-228`). The two Phase B methods (`getSkillReview` at `:607-620`, `recommendAnalysisSkills` at `:631-644`) are clean, properly typed with no `as` casts, use `public`, reuse `WIZARD_RPC_TIMEOUTS` (`SKILL_REVIEW_MS: 75_000`), and throw typed `WizardRpcError`s (pending export of `WizardRpcError` in `src/index.ts`).

### `libs/frontend/setup-wizard/src/index.ts` & `libs/frontend/setup-wizard/src/app.ts`
Score **6/10** — 0 blocking, 1 major (`app.ts:1-7`, `index.ts:8-28`), 0 minor. Cleanly keeps `app.ts` component-free, but `app.ts` omits `SetupRunStore`, `index.ts` omits `WizardRpcError`, and `index.ts` leaks internal `SETUP_RUN_POLL_INTERVAL_MS` and `TERMINAL_SETUP_RUN_STATUSES`.

---

## Pattern Compliance

| Repository rule or nearby convention | Status | Evidence |
| --- | --- | --- |
| `@nx/enforce-module-boundaries` (0 errors, no `eslint-disable`) | PASS | `npx eslint` 0 errors across all 12 files |
| No `@ptah-extension/chat-ui` or `@ptah-extension/onboarding` imports in `setup-wizard` | PASS | `git grep` confirms 0 hits in `libs/frontend/setup-wizard/src/` |
| Cross-lib imports via `@ptah-extension/<lib>` barrels (no deep `src/` paths) | PASS | Verified across all 12 files |
| Dependency direction: `core` port `SETUP_RUN_ENTRY`, acyclic intra-lib DAG | PASS | `setup-run-entry.service.ts:1-16`, `setup-generation-open.handler.ts:6-11, 23` |
| No `TabManagerService` for run identity; read only for `activeWorkspacePath` | PASS | `setup-run.store.ts:174`, `setup-generation-open.handler.ts:40` |
| `@angular-eslint/use-injectable-provided-in` & `inject()` DI style | PASS | All 7 services/stores/handlers use `@Injectable({ providedIn: 'root' })` + `inject()` |
| Zero `any` / `@ts-ignore` in new/modified code | PASS | `git grep` confirms 0 hits |
| Commit subjects & scopes satisfy `.commitlintrc.json` | PASS | `7c8fbe0f73`, `aba3dba7a5`, `92f8636f22` (`feat(setup-wizard): ...`, ≤ 72 chars) |
| `tools/degradation-audit` zero-baseline suppression rules | **FAIL** | `generation-handoff.store.ts:250`, `setup-run-attempt.ts:418`, `setup-run.store.ts:139`, `setup-run-persistence.ts:307` |
| ESLint `max-lines` ≤ 700 (skipBlankLines, skipComments) | **FAIL** | `setup-run.store.ts:858` (1,037 lines) |
| Every timer has a `DestroyRef` release path | **FAIL** | `generation-workflow.store.ts:55, 430, 455` (missing `DestroyRef.onDestroy`) |
| Single route table in `setup-run-steps.ts` | **FAIL** | `setup-run-entry.service.ts:44-46` hardcodes routes |
| Narrow `/app` bootstrap barrel exports required app-config services | **FAIL** | `libs/frontend/setup-wizard/src/app.ts` omits `SetupRunStore` |
| `@typescript-eslint/explicit-member-accessibility` | **FAIL** (warn) | 37 warnings in `generation-workflow.store.ts` & `guidance-generation.store.ts` |

---

## Maintenance Debt

- **Introduced:** One 1,226-line root store (`setup-run.store.ts`), a 5-concern helper file (`setup-run-attempt.ts`) with mutable shared state, 4 `degradation-audit` gate violations, 37 accessibility warnings + 1 `no-useless-assignment` warning, 3x duplicated `blocked` start resolution, 4x duplicated terminal-lifecycle arrays, and a hardcoded route copy in `SetupRunEntryService`.
- **Retired:** Removed `@ptah-extension/chat-ui` (`GenerationWorkflowLauncherService`), `TabManagerService`, `QueuedFollowUpStore`, `StreamingHandlerService`, and `MessageFinalizationService` coupling from generation/guidance event routing, workflow stores, handoff store, and open handler — shrinking `generation-run-event-adapter.ts` from ~380 lines to 153 lines and breaking the `setup-wizard → chat-ui` edge completely.
- **Net:** **Positive architecturally, negative locally in `setup-run.store.ts` / `setup-run-attempt.ts` until split and cleaned up.** Fixing Findings 1–7 turns this into a clean net reduction in long-term maintenance cost.

---

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| 1 | Do not flag missing `{ provide: SETUP_RUN_ENTRY, useExisting: SetupRunEntryService }` in `app.config.ts` or the still-present `bound-generation-tab.ts` export in `index.ts:7` as Phase B findings. | Flag now / defer per batch plan | `batches.md:522-539` explicitly assigns `app.config.ts` wiring and `bound-generation-tab.ts` deletion to Batch 14 after all consumers migrate. | Yes |
| 2 | Classify flat `SetupRunRecord` (rather than a workflow-discriminated union) as acceptable under the agreed plan rather than a Major finding. | Flag as Major type-precision gap / accept agreed contract | `implementation-plan.md:150-165` explicitly specifies the flat `SetupRunRecord` interface with optional workflow-specific fields. | Yes |
| 3 | Rate directly exposed writable signals (`startError`, `content`, etc.) on `GenerationWorkflowStore` and `GuidanceGenerationStore` as Minor rather than Major. | Major / Minor | Existing `project-guidance.page.spec.ts:179, 182, 583` already calls `.set()` directly on those signals, so changing them is a small cross-lib spec touch rather than a Phase B regression. | Yes |
| 4 | Propose splitting `setup-run.store.ts` into plain-class collaborators under `./setup-run/` rather than multiple `@Injectable()` Angular services. | Multiple `@Injectable` services / plain-class collaborators under `./setup-run/` | Sibling `setup-wizard-state.service.ts:102-110` + `./setup-wizard/*` establishes the plain-class collaborator pattern in this exact directory, avoids DI surface churn, and preserves `SetupRunStore`'s public API and spec suite untouched. | Yes |

---

## Verdict

- **Recommendation:** **REVISE**
- **Confidence:** **HIGH**
- **Key concern:** Four `degradation-audit` violations fail the repo's zero-baseline gate, and `setup-run.store.ts` (1,037 counted lines) + `setup-run-attempt.ts` need structural separation before Phase C/D build more consumers on top of them.
- **What a 10/10 version would do differently:**
  1. Pass `tools/degradation-audit` with zero violations (no orphaned markers on `if` statements, no unmarked sentinel catches).
  2. Split `SetupRunStore` into `./setup-run/` workflow coordinators (`< 400` lines per file) and separate pure binding/copy/poll helpers out of `setup-run-attempt.ts` with encapsulated `SetupRunAttempt` mutations.
  3. Export `SetupRunStore` from `src/app.ts` and `WizardRpcError` from `src/index.ts`, drop internal constants (`SETUP_RUN_POLL_INTERVAL_MS`, `TERMINAL_SETUP_RUN_STATUSES`) from `src/index.ts`, and mark internal sibling plumbing `@internal`.
  4. Delegate `SetupRunEntryService` entry routes to `setup-run-steps.ts`, add `DestroyRef` cleanup for `GenerationWorkflowStore.watchdog`, reuse `isTerminalLifecycle`/`matchesBinding`/`WizardRpcError`, and clear all 44 ESLint warnings.
