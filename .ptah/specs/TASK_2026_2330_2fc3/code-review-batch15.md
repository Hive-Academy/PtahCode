# Code Review — Batch 15 (`TASK_2026_2330_2fc3`: `SetupRunStore` Split)

Review family: antigravity (implementer: codex)

## Summary

| Metric | Value |
| --- | --- |
| Score | **9 / 10** |
| Verdict | **APPROVED** |
| Blocker defects | 0 |
| Major defects | 0 |
| Minor defects | 4 |

**Assessment:** The split of `SetupRunStore` (1,293 lines) and `setup-run-attempt.ts` (479 lines) into `setup-run.store.ts` (694 physical lines / 638 non-blank) plus 8 plain-class/pure modules under `libs/frontend/setup-wizard/src/lib/services/setup-run/` is strictly behavior-preserving, cleanly layered, and completely acyclic. Every member from both `HEAD` files is accounted for, all moved workflow bodies (bound-run, analysis, skill-review, guidance hand-off, and record field mapping) preserve exact semantics, signal/effect ordering and `DestroyRef` timer teardown are unchanged, `SetupRunAttempt` is now encapsulated behind `Readonly<AttemptState>` with zero direct mutations outside `SetupRunAttempts`, and the public API (`setup-run.store.ts`, `src/index.ts`, `src/app.ts`) and `setup-run.store.spec.ts` remain unchanged.

---

## Checks Run

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Jest (`services/`) | `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --testPathPatterns='services/'` | **PASS** — 17 suites, 538 tests passed (`rc=0`) | `.ptah/tmp/b15-review-jest.log` |
| ESLint (`services/`) | `npx eslint libs/frontend/setup-wizard/src/lib/services` | **PASS** — 0 errors, 47 pre-existing warnings in untouched files; **0 errors and 0 warnings** across `setup-run.store.ts`, all 8 `setup-run/*.ts` files, and all 5 modified sibling files (`max-lines` warning cleared) | `.ptah/tmp/b15-review-eslint.log` |
| TypeScript diagnostics | `ptah_get_diagnostics` scoped to `setup-run.store.ts` + all 8 `setup-run/*.ts` files | **PASS** — 0 diagnostics in all 9 requested files (pre-existing sibling spec/ES2020 BigInt diagnostics only) | tool output |
| Degradation audit | `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | **PASS** for `libs/frontend/setup-wizard` — 0 sites (only 1 unrelated site in `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:675` from Batch 12) | `.ptah/tmp/b15-review-degradation.log` |
| Public surface & sibling diffs | `git diff` on `src/index.ts`, `src/app.ts`, `setup-run.store.spec.ts`, and 5 sibling services; `git grep setup-run-attempt` | **PASS** — `src/index.ts`, `src/app.ts`, and `setup-run.store.spec.ts` have 0 diff; all 5 sibling services changed only their import path to `./setup-run/setup-run-binding`; no stale `./setup-run-attempt` imports remain | tool output |

---

## Defects

### 1. [Minor] `setup-run.store.ts` sits at 694 physical lines (638 non-blank) with limited headroom ahead of Batch 16

- **Location:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:1-694`
- **Evidence:** Batch 15 clears ESLint's 700-line `max-lines` ceiling (`skipBlankLines: true, skipComments: true`, ~580 counted lines) and keeps every collaborator under the 450-line target (`setup-run-bound.coordinator.ts` is the largest at 434 total / 411 non-blank). However, `setup-run.store.ts` itself exceeds the 450-line target and sits 6 physical lines under 700 right before Batch 16 adds dismissal markers, disk-analysis adoption, and saved-analysis discovery.
- **Concrete fix:** Non-blocking for Batch 15 (the facade is cohesive and mirrors sibling `setup-wizard-state.service.ts` at 604 lines). In Batch 16, place discovery/dismissal logic in a dedicated collaborator under `setup-run/` (e.g., `setup-run-discovery.coordinator.ts`) and, if new public facade members push `setup-run.store.ts` close to 700 ESLint lines, extract the index/persistence mutations (`apply`, `patch`, `insert`, `forget`, `remove`, `setCancelling`, `scheduleWrite`, `:600-693`) into a `setup-run/setup-run-index.ts` helper.

### 2. [Minor] Public method `resolveBlockedStart` is stranded in the middle of the private methods section

- **Location:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:590-598`
- **Evidence:** `public resolveBlockedStart(...)` sits between `private reconcileRecord` (`:567-587`) and `private apply` (`:600-621`). In `HEAD`, it sat immediately after `private sendBoundStart`; now that `sendBoundStart` moved to `SetupRunBoundCoordinator`, `resolveBlockedStart` breaks the public/private grouping of the facade.
- **Concrete fix:** Move `resolveBlockedStart` (`:589-598`) up directly after `whenStarted` (`:384-386`) so all seven bound-run coordination delegates (`reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted`, `resolveBlockedStart`) are grouped together above the private methods.

### 3. [Minor] Sibling-coordination delegates on `SetupRunStore` remain unmarked `@internal`

- **Location:** `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:357-386, 590-598`
- **Evidence:** The seven internal bound-run coordination delegates (`reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted`, `resolveBlockedStart`), noted in Phase B style review Finding 4, remain exposed without `@internal` JSDoc tags alongside consumer commands (`start`, `attach`, `cancel`, `retry`, `rerun`, `dismiss`).
- **Concrete fix:** Add `/** @internal ... */` JSDoc annotations to those seven delegate methods so onboarding consumers are guided toward `GenerationWorkflowStore` / `GenerationRunEventAdapter` rather than calling attempt-coordination plumbing directly.

### 4. [Minor] `applyReportFields` widens `StoredSetupRunRecord` to `SetupRunRecord` in its type signature

- **Location:** `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-record.ts:6-10`
- **Evidence:** `SetupRunStore.apply` (`setup-run.store.ts:606-607`) calls `applyReportFields(record, update)` inside `patch(id, (record: StoredSetupRunRecord) => ...)`. While `{ ...record }` preserves `guidanceHandoff` at runtime (matching `HEAD:1168`) and TypeScript currently accepts it because `StoredSetupRunRecord`'s additional property is optional, typing the function solely in terms of `SetupRunRecord` drops the subtype information.
- **Concrete fix:** Make `applyReportFields` preserve the input subtype:
  ```ts
  export function applyReportFields<T extends SetupRunRecord>(
    record: T,
    update: SetupRunReport,
  ): T {
    const next: T = { ...record };
    ...
  ```

---

## Member-Placement & Behavior Preservation Audit

### A. Old `setup-run.store.ts` (`HEAD`, 1,293 lines)

| Old Member (`HEAD:line`) | Disposition | New Location | Behavior Parity Check |
| --- | --- | --- | --- |
| `SETUP_RUN_POLL_INTERVAL_MS` (`:90`) | Moved & re-exported | `setup-run/setup-run-poll.ts:2`, re-exported at `setup-run.store.ts:69` | Identical value (`2500`) and module export. |
| `SetupRunStartOptions` (`:93-101`) | Kept | `setup-run.store.ts:73-81` | Identical interface. |
| `SetupRunReport` (`:104-113`) | Moved & re-exported | `setup-run/setup-run-host.ts:14-23`, re-exported at `setup-run.store.ts:70` | Identical interface and module export. |
| `LIVE_STATUSES` (`:115-118`) | Moved | `setup-run/setup-run-host.ts:49-52` | Identical. |
| `FAILURE_COPY` (`:121-124`) | Moved | `setup-run/setup-run-host.ts:55-58` | Identical. |
| `ORPHAN_GRACE_MS` (`:126`) | Moved | `setup-run/setup-run-host.ts:60` | Identical (`2 * SETUP_RUN_POLL_INTERVAL_MS`). |
| `isLive` (`:128-130`) | Moved | `setup-run/setup-run-host.ts:62-64` | Identical. |
| `newestFirst` (`:132-134`) | Kept | `setup-run.store.ts:83-85` | Identical. |
| `newRunId` (`:136-138`) | Moved | `setup-run/setup-run-host.ts:66-68` | Identical. |
| `browserStorage` (`:140-147`) | Kept | `setup-run.store.ts:87-94` | Identical (preserves `degradation-audit` marker). |
| Injected deps (`rpc`, `runner`, `wizardState`, `tabs`, `vscode`, `injector`, `storage`) (`:151-157`) | Kept | `setup-run.store.ts:98-104` | Identical. |
| Signals & tracking (`_index`, `_cancelling`, `liveThisSession`, `viewing`, `writeQueued`, `reconcileSequence`) (`:159-175`) | Kept | `setup-run.store.ts:106-114` | Identical. |
| `attempts` (`:161`) | Kept (passed into `bound`) | `setup-run.store.ts:162, 166` | Justified: `setup-run.store.spec.ts:1942-1943, 1960` asserts on `store['attempts']`. Store performs zero operations on it. |
| `runnerSeen` (`:166`) | Moved | `setup-run/setup-run-analysis.coordinator.ts:19` | Identical lifecycle (`syncFromRunner`, `cancel`). |
| `reviews` (`:170-173`) | Moved | `setup-run/setup-run-skill-review.coordinator.ts:8-11` | Identical lifecycle (`reviewSkills`, `reconcile`). |
| Public signals (`workspacePath`, `runs`, `attentionCount`, `runningCount`, `cancellingIds`) (`:178-205`) | Kept | `setup-run.store.ts:117-144` | Identical computed graphs and readonly exposure. |
| `pollNeeded` (`:207-211`) | Kept (delegates predicate to `bound.shouldPoll`) | `setup-run.store.ts:182-184` | Reads exact same signals (`this.runs()` and `this.attempts.delivery()`). |
| `poll` (`:213-225`) | Moved | `setup-run/setup-run-bound.coordinator.ts:42, 52-58` | Identical interval, `needed` callback (`() => this.pollNeeded()`), and tick body. |
| `constructor` (storage load, 3 `effect`s, `DestroyRef`) (`:227-253`) | Kept (effects/destroy delegate to `bound` & `analysis`) | `setup-run.store.ts:186-214` | Exact same effect order, signal reads, `untracked` boundaries, and `DestroyRef.onDestroy(() => this.bound.stopPoll())`. |
| `runsFor`, `activeRun`, `get`, `targetOf`, `setGuidanceHandoff`, `isCancelling` (`:258-309`) | Kept | `setup-run.store.ts:217-268` | Identical. |
| `start` (`:318-351`) | Kept | `setup-run.store.ts:275-308` | Identical. |
| `adopt` (`:358-383`) | Kept + record builder extracted | `setup-run.store.ts:315-326`, `setup-run/setup-run-binding.ts:169-188` | Identical validation, normalization, fields, and `liveThisSession`/`insert` order. |
| `attach`, `release`, `markSeen`, `report` (`:386-411`) | Kept | `setup-run.store.ts:329-354` | Identical. |
| `reportRun`, `startInitial`, `reporterFor`, `reportStream`, `verifyTerminal`, `whenStarted` (`:414-495`) | Delegated (public API preserved) | `setup-run.store.ts:357-386` → `setup-run/setup-run-bound.coordinator.ts:95-178` | Identical bodies; direct promise forwarding on `verifyTerminal` avoids extra microtask hop. |
| `bindingFor`, `setStep`, `setSelection`, `dismiss` (`:498-520`) | Kept | `setup-run.store.ts:389-411` | Identical. |
| `cancel`, `retry`, `rerun` (`:527-627`) | Kept dispatch; workflow actions delegated | `setup-run.store.ts:418-518` → `analysis`, `bound`, `skillReview` | Identical switch branches, `setCancelling` `finally` guard, and catch suppressions. |
| `reviewSkills` (`:637-679`) | Delegated (public API preserved) | `setup-run.store.ts:528-533` → `setup-run/setup-run-skill-review.coordinator.ts:18-60` | Identical body, race guard, error rollback, and `finally` cleanup; direct promise forwarding. |
| `refresh`, `activate`, `adoptLegacyTabs`, `reconcile`, `reconcileRecord` (`:682-761`) | Kept dispatch; per-workflow reconcile delegated | `setup-run.store.ts:536-587` | Identical sequence guard, workspace guard, activation order (`adoptLegacyTabs` → `restoreGuidanceHandoffs` → `reconcile`), and `team-builder` reload interruption. |
| `restoreGuidanceHandoffs` (`:694-718`) | Moved | `setup-run/setup-run-bound.coordinator.ts:180-204` | Identical logic; lazy `GenerationHandoffStore` lookup supplied via `getHandoff` callback (`setup-run.store.ts:170`). |
| `reconcileAnalysis`, `adoptAnalysis`, `syncAnalysisFromRunner`, `runAnalysis`, `cancelAnalysis` (`:763-828, :957-1024`) | Moved | `setup-run/setup-run-analysis.coordinator.ts:28-163` (`reconcile`, `adopt`, `syncFromRunner`, `run`, `cancel`) | Line-by-line identical. |
| `adoptResumableGeneration`, `reconcileBound`, `observeRun`, `cancelBound`, `startBound`, `sendBoundStart`, `resolveBlockedStart` (`:831-915, :1026-1157`) | Moved (`resolveBlockedStart` delegated on facade) | `setup-run/setup-run-bound.coordinator.ts:207-433`, facade at `setup-run.store.ts:590-598` | Line-by-line identical. `clearPending`/`assignOwner` identity checks are strictly safer for detached attempts and identical for active ones. |
| `reconcileReview`, `readStoredReview`, `applyReviewed` (`:917-954`) | Moved | `setup-run/setup-run-skill-review.coordinator.ts:62-103` (`reconcile`, `readStoredReview`, `applyReviewed`) | Line-by-line identical. |
| `apply` (`:1161-1211`) | Split: field mapping extracted, lifecycle transitions kept | `setup-run.store.ts:600-621`, `setup-run/setup-run-record.ts:6-41` | Identical validation, `[SetupRunStore]` warn text, `team-builder` copying, terminal settlement, `unseen`, `liveThisSession`, and `cancelling` transitions. |
| `patch` (`:1213-1239`) | Kept; completion hand-off check delegated | `setup-run.store.ts:623-640`, `setup-run/setup-run-bound.coordinator.ts:81-92` | Identical update, `scheduleWrite()`, and post-write handoff scheduling condition. |
| `insert`, `forget`, `remove`, `setCancelling`, `scheduleWrite` (`:1241-1292`) | Kept (`forget` delegates attempt cleanup to `bound.forget`) | `setup-run.store.ts:642-693` | Identical cap eviction, cleanup, and microtask write coalescing. |

### B. Old `setup-run-attempt.ts` (`HEAD`, 479 lines — deleted)

| Old Member (`HEAD:line`) | Disposition | New Location | Behavior Parity Check |
| --- | --- | --- | --- |
| `BOUND_WORKFLOW`, `isBound`, `bindingOf`, `workflowOfBinding`, `RUN_FAILURE_COPY`, `LIFECYCLE_STATUS`, `isRunLifecycle`, `isTerminalLifecycle`, `matchesBinding`, `isRunBinding`, `FOREIGN_WORKSPACE_COPY`, `START_REFUSED_COPY`, `startRefusalCopy`, `hasCommittedGuidance`, `FinalizationState`, `isFinalizationCorrection`, `verifiedRunStatus` (`:22-170`) | Moved | `setup-run/setup-run-binding.ts:18-166` | Identical (including symmetric `matchesBinding` path normalization). `RUN_FAILURE_COPY` exported for `setup-run-attempt.ts`. |
| `SetupRunAttempt` (`:173-179`) | Moved & hardened | `setup-run/setup-run-attempt.ts:22-30` | Internal mutable `AttemptState`; exported as `Readonly<AttemptState>`. |
| `SetupRunAttempts` (`:181-390`) | Moved & encapsulated | `setup-run/setup-run-attempt.ts:32-273` | All existing methods identical; added `clearPending`, `assignOwner`, `isPending`, `hasPendingInitialStarts`, `startPromise`, `resolveTargetId`. Zero external mutations or field reads remain. |
| `readBoundState`, `requestBoundStart`, `reconcileGuidanceOutput` (`:392-443`) | Moved | `setup-run/setup-run-attempt.ts:275-326` | Identical (including `degradation-audit` comments). |
| `SetupRunPoll` (`:446-479`) | Moved | `setup-run/setup-run-poll.ts:5-38` | Identical. |

---

## Architecture, Naming & Facade Assessment

- **Dependency graph (acyclic):** Strictly layered with zero new cycles:
  - Layer 0: `setup-run-poll.ts`, `setup-run-binding.ts`
  - Layer 1: `setup-run-host.ts` (→ `setup-run-poll`), `setup-run-attempt.ts` (→ `setup-run-binding`)
  - Layer 2: `setup-run-record.ts` (→ `setup-run-host`), `setup-run-analysis.coordinator.ts` (→ `setup-run-host`), `setup-run-skill-review.coordinator.ts` (→ `setup-run-host`), `setup-run-bound.coordinator.ts` (→ `setup-run-attempt`, `setup-run-binding`, `setup-run-host`, `setup-run-poll`)
  - Layer 3: `setup-run.store.ts` (root `@Injectable` facade; lazy DI lookup for `GenerationHandoffStore` preserved via `GuidanceHandoffScheduler` structural interface, preventing any cycle from `setup-run/` back to `generation-handoff.store.ts` or `setup-run.store.ts`).
- **Naming & layering parity with `setup-wizard-state.service.ts`:** Matches the sibling `./setup-wizard/` convention directly — one `@Injectable({ providedIn: 'root' })` signal-owning facade at the service root delegating domain orchestration to plain-class collaborators constructed with `new` in a dedicated `./setup-run/` subfolder, communicating back via a narrow contract interface (`SetupRunRecordHost`, parallel to `WizardInternalState`).
- **Facade size (694 lines):** Reasonable for Batch 15's behavior-preserving scope — all workflow logic is out of the root file and only signals, effects, persistence/index CRUD, and top-level dispatch remain. Track Minor #1 in Batch 16 so new discovery/dismissal features go into a collaborator rather than regrowing the root file past 700 lines.
