# Code logic review — Batch 9 (agent-generation run page, D7)

## Re-review round 2

Review family: antigravity (implementer: codex)

- Score: **8 / 10**
- Verdict: **APPROVED**

### Scope examined

- Round 2 modified files (whole files read + `git diff` verified):
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts` + `.spec.ts`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts` + `.spec.ts`
- Surrounding Batch 9 contracts verified for interactions:
  - `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts` + `.spec.ts`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts` + `.spec.ts`
  - `libs/frontend/setup-wizard/src/lib/components/agent-next-steps.component.ts`
  - `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts`
- Ignored per instructions: `analyze-workspace.page.*`, `proposal/**` (Batch 12).

### Checks run (focused, logs in `.ptah/tmp/b9-rr2-*.log`)

- `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-run.store.spec.ts generation-handoff.store.spec.ts setup-run-persistence.spec.ts` — 3 suites, 173 tests, pass (`.ptah/tmp/b9-rr2-setup-wizard-jest.log`).
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath analyze-done.page.spec.ts agent-generation-run.page.spec.ts onboarding.routes.spec.ts` — 3 suites, 14 tests, pass (`.ptah/tmp/b9-rr2-onboarding-jest.log`).
- `npx eslint` on all 12 Batch 9 files — 0 errors, 15 pre-existing warnings (`max-lines` on `setup-run.store.ts`, non-null assertions in `setup-run.store.spec.ts`) (`.ptah/tmp/b9-rr2-eslint.log`).
- `ptah_get_diagnostics` scoped to the 4 round-2 files timed out at 45 s; fell back to `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json` and `libs/frontend/onboarding/tsconfig.lib.json` — both exit 0 (`.ptah/tmp/b9-rr2-tsc-sw.log`, `.ptah/tmp/b9-rr2-tsc-ob.log`).

### Status of round 1 defects (6–8)

| Defect | Severity | Status | Evidence |
| --- | --- | --- | --- |
| 6. Legacy/sanitized completed `agent-generation` records without `guidanceHandoff` auto-start guidance | Major | **FIXED** | `setup-run.store.ts:694-718` (`restoreGuidanceHandoffs`) skips `'skipped'`/`'consumed'` (`:705-706`), marks `'consumed'` when a `project-guidance` child exists (`:709-712`), and now gates scheduling on `typeof record.guidanceHandoff === 'number'` (`:713`) plus `!handoff.pendingFor(record.id)` (`:715-716`). Legacy `undefined` records and records whose corrupt value was dropped by `parseSetupRunRecord` (`setup-run-persistence.ts:192-198`) never auto-schedule and stay eligible for manual Continue. Verified by three new non-tautological specs in `setup-run.store.spec.ts:1278-1341`: legacy completion never schedules/starts (`:1278-1289`), numeric deadline + existing child marks `'consumed'` without scheduling (`:1291-1313`), and numeric deadline without child schedules and starts once across workspace switches (`:1315-1341`). All three fail without the fix. |
| 7. `AnalyzeDonePage` rebinds `GenerationWorkflowStore` on record patches and never calls `markSeen` | Minor | **FIXED** | `analyze-done.page.ts:162-167, 175-176, 194-208` narrows `markSeen` to primitive `routedRunId` (validated against `isOnboardingIdentityValue` and `this.runs.workspacePath()`) and narrows the workflow bind effect to primitive `agentId` + `backendRunId` reading `untracked(this.agentRun)`. Patching `guidanceHandoff` or `unseen` no longer triggers `unbind()`/`bind()` or repeated `markSeen` calls, while `backendRunId` changes still rebind cleanly. Verified by `analyze-done.page.spec.ts:153-170` and `:172-193` (both fail without the fix). |
| 8. Queued guidance branch on `AnalyzeDonePage` unmounts `<ptah-agent-next-steps>` | Minor | **FIXED** | `analyze-done.page.ts:65-95` keeps `<ptah-agent-next-steps>` mounted across countdown, queued, skipped, and started states (passing `[pending]="pending && !queued"` so a 0 s countdown is suppressed) and renders the queued `role="status"` notice + record-specific Skip button alongside it. Clicking Continue inside `<ptah-agent-next-steps>` while queued safely no-ops via `GenerationHandoffStore.manualContinue` → `startNow` → `waitsForGuidance(parent)` (`generation-handoff.store.ts:138-142, 162-163`). Verified by `analyze-done.page.spec.ts:195-223`, which asserts the exact same `<ptah-agent-next-steps>` DOM element remains mounted across the queue and skip transitions (fails without the fix). |

### New defects

None.

### Non-blocking observations & remaining uncertainties

- **Queued-state UX trade-off (non-blocking)**: While `queued` is true, `<ptah-agent-next-steps>` enters its `@else` branch (`agent-next-steps.component.ts:99-119`), displaying `"Generate project guidance when you are ready."` and a no-op `"Continue to project guidance"` button directly above the queued notice. This is an explicit, reversible write-set trade-off documented in `impl-report-batch9.md` and is safe under `waitsForGuidance`; a follow-up can add a `queued` input to `AgentNextStepsComponent` if desired.
- **Pending outside-batch checks**: Renderer AOT template typecheck (coordinator-owned) and live Electron visual/screenshot inspection were not run in this read-only worktree review; `SetupRunStore.targetOf(record, 'entry')` remains verified by code inspection and page-level stub rather than a direct store unit test; Round 0 Minor 5 (O(n²) transcript replay) remains out of scope.

### Score rationale (re-review round 2)

**8 / 10 — APPROVED**: Every Major (1, 2, 6) and in-scope Minor (3, 4, 7, 8) defect from Rounds 0 and 1 is genuinely fixed with focused regression specs that would fail on the prior code, and no new logic defects were introduced. Legacy migration, live reload recovery, concurrent queueing, unseen badge clearing, and workflow binding stability are all sound and verified by passing Jest, ESLint, and library TypeScript checks. Held below 9–10 by the minor queued-state button overlap kept to avoid widening `AgentNextStepsComponent`, the lack of a direct `targetOf(..., 'entry')` unit test in `setup-run.store.spec.ts`, and pending coordinator-owned renderer template/Electron visual verification.

---

## Re-review round 1

Review family: antigravity (implementer: codex)

- Score: **7 / 10**
- Verdict: **REVISE**

### Scope examined

- Changed/new Batch 9 + Revise round 1 files (whole files read):
  - `libs/frontend/onboarding/src/lib/onboarding.routes.ts` + `.spec.ts`
  - `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts` + `.spec.ts`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts` + `.spec.ts`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts` + `.spec.ts`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts` + `.spec.ts`
  - `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts` + `.spec.ts`
- Read-only contracts verified: `setup-run.types.ts`, `setup-run-steps.ts`, `setup-run-attempt.ts`, `generation-workflow.store.ts`, `agent-next-steps.component.ts`, `project-guidance.page.ts`, `analyze-skills.page.ts` (query/review lookup), `setup-run-entry.service.ts`, `onboarding-focus-router.service.ts`, `onboarding-routes.ts` (core).
- Ignored per instructions: `home/**`, `shared/run-status-chip.*`, `analyze/analyze-workspace.page.*`, `proposal/team-builder*`.

### Checks run (focused, logs in `.ptah/tmp/b9-rr1-*.log`)

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath agent-generation-run.page.spec.ts analyze-done.page.spec.ts onboarding.routes.spec.ts` — 3 suites, 11 tests, pass.
- `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-run.store.spec.ts generation-handoff.store.spec.ts setup-run-persistence.spec.ts` — 3 suites, 171 tests, pass.
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json` and `libs/frontend/onboarding/tsconfig.lib.json` — both exit 0.
- `npx eslint` on all 12 Batch 9 files — 0 errors, 15 pre-existing warnings (`max-lines` on `setup-run.store.ts`, non-null assertions in `setup-run.store.spec.ts`).

### Status of round 0 defects

| Old defect | Severity | Status | Evidence |
| --- | --- | --- | --- |
| 1. Countdown and Skip unreachable | Major | **FIXED** (see Minors 7–8) | `analyze-done.page.ts:65-92` hosts `<ptah-agent-next-steps>` with record-keyed `pending`, `remainingSeconds`, `started`, `skipped`, `(startNow)`, `(skip)`, `(continue)`, plus a queued-state Skip control (`:68-80`). `generation-handoff.store.ts:110-126` cancels the targeted run and persists `'skipped'`. Background completion with page closed still schedules and starts guidance (`setup-run.store.ts:1228-1237`, `setup-run.store.spec.ts:1342-1377`). Regression specs (`analyze-done.page.spec.ts:117-136`, `generation-handoff.store.spec.ts:212-221`) fail without the fix. |
| 2. Reload inside 5 s window loses hand-off | Major | **PARTIAL — FIXED for live reload, regresses on migration (Major 6)** | `setup-run-persistence.ts:35-40, 192-198` persists `guidanceHandoff?: number \| 'skipped' \| 'consumed'` on `ptah.setup-runs.v1`; `generation-handoff.store.ts:96-99` preserves the persisted numeric deadline; `setup-run.store.ts:694-717` restores on workspace activation, skips `'skipped'`/`'consumed'` and parents with an existing guidance child. Reload specs (`setup-run.store.spec.ts:1249-1307`) fail without the fix. However, treating `guidanceHandoff === undefined` as eligible to auto-schedule breaks migration of old/corrupt records (Defect 6). |
| 3. Second completion inside 5 s window drops first | Minor | **FIXED** | `generation-handoff.store.ts:37-40, 83-108, 194-246` keys pending entries by `agentRunId` in `pendingByParent`, queues same-workspace chains behind a live chained guidance run (`waitsForGuidance`), and re-arms the next entry via the constructor effect when the live guidance run settles. Verified by `setup-run.store.spec.ts:1309-1340` (fails without the fix). |
| 4. Preview-required state is a dead end | Minor | **FIXED** | `agent-generation-run.page.ts:174-181, 226-231` renders a link to `runs.targetOf(record, 'entry')` (`setup-run.store.ts:283-294` -> `analyze/skills` with `tab` and `analysis` query params). Verified by `agent-generation-run.page.spec.ts:267-281` (fails without the fix). Note: `SetupRunStore.targetOf(record, 'entry')` itself is not directly unit-tested in `setup-run.store.spec.ts` (the page spec stubs `targetOf`). |
| 5. O(n²) transcript replay | Minor | **OUT OF SCOPE** | Inherited pattern from `project-guidance.page.ts`, explicitly out of scope. |

### Persistence trace (`guidanceHandoff`)

- **Key & format**: `ptah.setup-runs.v1` (`setup-run-persistence.ts:23`), schema version `1`, optional field `guidanceHandoff?: number | 'skipped' | 'consumed'` on `StoredSetupRunRecord` (`:35-40`).
- **Write / validate path**: `SetupRunStore.setGuidanceHandoff()` (`setup-run.store.ts:296-304`) patches completed `agent-generation` records and queues microtask persistence (`:1284-1291`). `serializeSetupRunIndex` -> `parseSetupRunRecord` (`setup-run-persistence.ts:192-198`) keeps finite non-negative numbers, `'skipped'`, and `'consumed'` only for `workflow === 'agent-generation' && status === 'completed'`, dropping invalid values and values on other records (verified in `setup-run-persistence.spec.ts:96-126`).
- **Read paths**:
  1. `SetupRunStore.restoreGuidanceHandoffs()` (`setup-run.store.ts:694-717`) — **migration defect (Defect 6)**.
  2. `GenerationHandoffStore.schedule()` (`generation-handoff.store.ts:96-99`) — refuses `'skipped'`/`'consumed'`, reuses numeric deadline, else creates `Date.now() + 5_000`.
  3. `AnalyzeDonePage` (`analyze-done.page.ts:86`) — `[skipped]="agent.guidanceHandoff === 'skipped'"`.
- **Migration of old records without the field**: Unsafe — see Defect 6.

### New defects

#### 6. Major — Old or sanitized completed `agent-generation` records without `guidanceHandoff` silently launch background guidance runs on workspace activation

- **Location**: `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:694-717` (`restoreGuidanceHandoffs`), interacting with `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:192-198` and `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:96-99`.
- **Problem**: `restoreGuidanceHandoffs()` skips completed `agent-generation` records only when `record.guidanceHandoff === 'skipped' || record.guidanceHandoff === 'consumed'` (or a `project-guidance` child currently exists in the workspace list). Any completed `agent-generation` record with `guidanceHandoff === undefined` and no surviving child is passed to `handoff.schedule()`, which mints a new 5 s deadline and starts a background `project-guidance` LLM run.
  - Every newly completed run under this code sets `guidanceHandoff: <deadline>` synchronously inside `patch()` -> `schedule()` -> `setGuidanceHandoff()` (`setup-run.store.ts:1228-1237`, `generation-handoff.store.ts:99`) *before* `scheduleWrite()`'s microtask persists to `localStorage`. A legitimate in-window reload therefore always carries `typeof record.guidanceHandoff === 'number'`.
  - Consequently, `guidanceHandoff === undefined` only occurs for (a) pre-migration legacy completed records already in `ptah.setup-runs.v1` whose guidance ran in a legacy chat tab, was skipped previously, or had its guidance child dismissed or evicted by `capWorkspaceRuns`, and (b) records whose corrupt `guidanceHandoff` value was dropped to `undefined` by `parseSetupRunRecord` (`setup-run-persistence.ts:192-198`).
  - On app restart or workspace switch — even when the user starts in Chat with no Done page, no countdown, and no Skip button visible — every such historical record silently fires `startBoundGuidance` and overwrites workspace project guidance.
  - Also, `setup-run.store.spec.ts:1278-1294` seeds the "already has a child" test without a numeric `guidanceHandoff` deadline, so it does not verify that an existing child blocks a persisted numeric deadline, and no test guards against legacy `guidanceHandoff: undefined` records auto-starting.
- **Fix**: In `restoreGuidanceHandoffs()` (`setup-run.store.ts:701-716`), only re-arm when `typeof record.guidanceHandoff === 'number'` (an explicit persisted pending deadline). When `parents.has(record.id)`, still mark `'consumed'`; when `record.guidanceHandoff === undefined` with no child, do not auto-schedule (the manual "Continue to project guidance" control on `AnalyzeDonePage` remains available). Add regression tests in `setup-run.store.spec.ts` covering (1) a legacy completed `agent-generation` record with no `guidanceHandoff` and no child does not schedule or start guidance on load, and (2) a completed record with a persisted numeric deadline and an existing guidance child is marked `'consumed'` without starting a second run.

#### 7. Minor — `AnalyzeDonePage` unbinds/re-fetches `GenerationWorkflowStore` on every record patch and never calls `markSeen`

- **Location**: `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:184-195`.
- **Problem**:
  1. The constructor `effect` tracks `this.agentRun()` (the whole `StoredSetupRunRecord` object). Whenever `SetupRunStore.setGuidanceHandoff()` patches `guidanceHandoff` (on Skip, Start now, or timer expiry), `agentRun()` emits a new object reference, causing `onCleanup` to call `this.workflow.unbind()` (clearing `workflow.run()` and briefly unmounting `<ptah-outcome-summary>`) followed by a redundant `wizard:get-generation-run-state` RPC via `workflow.bind()`. Compare `agent-generation-run.page.ts:347-357`, which tracks only primitive identity signals and reads `untracked(this.record)`.
  2. `AnalyzeDonePage` never calls `this.runs.markSeen(id)` for the routed `?tab=<id>` record. When an agent-generation or chained guidance run completes in the background (`unseen: true`) and the user opens `analyze/done?tab=<id>` via a notification (`OnboardingFocusRouter.focus()` does not call `markSeen`) or restored URL, the record stays `unseen: true` and the Setup attention badge remains lit while the user is viewing Done.
- **Fix**: Narrow the bind effect dependencies to primitive `agentId` and `backendRunId` (reading `untracked(this.agentRun)`), and call `untracked(() => this.runs.markSeen(id))` in an effect whenever a valid routed `tab` record in the active workspace is shown on Done.

#### 8. Minor — Queued guidance branch on `AnalyzeDonePage` unmounts `<ptah-agent-next-steps>`

- **Location**: `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:68-91`.
- **Problem**: When a second completed agent run's guidance is queued behind another live chained guidance run (`pending && seconds === 0`), the `@if` branch replaces `<ptah-agent-next-steps>` completely with the queued section, hiding the verified outcome summary (`<ptah-outcome-summary>`, `<ptah-grade-expectation>`, `<ptah-library-stale-notice>`) and Quick Start examples until the queue drains or the user clicks Skip.
- **Fix**: Keep `<ptah-agent-next-steps>` mounted while queued (e.g., render the queued notice alongside it or pass a queued input to `<ptah-agent-next-steps>`).

### Score rationale (re-review round 1)

**7 / 10 — REVISE**: Round 0's core gaps are cleanly addressed — Done hosts the countdown and Skip, background scheduling still fires with the page closed, per-record pending hand-offs queue properly without dropping concurrent runs, and `needs-input` links back to `analyze/skills` with run/analysis identity. What keeps this below 8/10 APPROVED is **Major Defect 6**: `restoreGuidanceHandoffs()` treats missing `guidanceHandoff` on legacy or sanitized records as eligible for automatic background LLM guidance runs, with no countdown/Skip visible outside Done. Not 5-6: the live reload persistence, per-record scheduling, and Done-page wiring are structurally sound and backed by genuine non-tautological specs.

---

## Round 0

Review family: ollama-cloud (implementer: codex)

- Score: **6 / 10**
- Verdict: **REVISE**

## Scope examined

- `libs/frontend/onboarding/src/lib/onboarding.routes.ts` + `.spec.ts` (diff)
- `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts` + `.spec.ts` (new)
- `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts` + `.spec.ts` (diff: the schedule hook)
- Read-only contracts: `generation-handoff.store.ts`, `generation-workflow.store.ts`,
  `setup-run-attempt.ts`, `wizard-rpc.service.ts`, `setup-run-steps.ts`,
  `project-guidance.page.ts` (pattern), `agent-next-steps.component.ts`,
  `live-run-layout.component.ts`, `onboarding-routes.ts` (core).
- Ignored per instructions: `home/**`, `shell/**` (Batch 11), `analyze-workspace.page.*`,
  `proposal/team-builder*` (Batch 12).

Whole files were read, not only changed lines. `home/setup-runs-list.component.ts` was
grepped only to confirm no other host exists for the handoff countdown.

## Checks run (focused, logs in `.ptah/tmp/b9-review-*.log`)

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false
  --runTestsByPath agent-generation-run.page.spec.ts onboarding.routes.spec.ts` — 2 suites,
  9 tests, pass.
- `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false
  --runTestsByPath setup-run.store.spec.ts` — 109 tests, pass.
- `npx eslint` on the five changed/new files — 0 errors, 1 pre-existing warning
  (`max-lines` on `setup-run.store.ts`).

## Acceptance table

| Acceptance item | Result | Evidence |
| --- | --- | --- |
| running → live transcript | PASS | `agent-generation-run.page.ts:75-106` renders a named `role="log"`; the stream is filtered by tabId, workspacePath, workflow and runId at `:297-305`. Spec `agent-generation-run.page.spec.ts:184-220` checks live update, prior-attempt and foreign-workspace isolation, Stop, attach and release. |
| failed → counts + "Retry failed items" (`wizard:retry-item`) | PASS | `:123-155` renders counts and per-item errors; `:408-461` retries each failed/rejected item serially through `rpc.retryGenerationItem` (`wizard:retry-item`, `wizard-rpc.service.ts:331-343`) and reopens the record only when the whole checkpoint reads completed (`:432-446`). Spec `:222-260` asserts serial order, `reportRun` and the done navigation. |
| interrupted → "Resume" (`resumeGeneration`) | PASS | `:156-166` Resume calls `runs.retry(id)` (`:391`), which routes to `startBound` → `requestBoundStart` → `startBoundAgents(binding, [], true)` (checkpoint resume, `setup-run-attempt.ts:416-419`). Spec `:262-268`. |
| needs-input → preview-required | PASS with gap | `:168-178` shows the preview-required state and the bind effect skips binding (`:352`), spec asserts `getBoundRunState` not called (`:270-280`). Gap: defect 4 (no affordance to where the preview is confirmed). |
| completed → `analyze/done` | PASS | `:360-368` navigates via `runs.targetOf` → `ANALYZE_DONE` (`setup-run-steps.ts:72-81`), with `tab` and `analysis` query. Spec `:282-293`. Gap: defect 1 (what the user loses by leaving immediately). |
| `markSeen` on open | PASS | attach effect `:340-346` → `SetupRunStore.attach` (`setup-run.store.ts:363-368`) → `markSeen` (`:376-380`); release on destroy. |
| `schedule(agentRecord.id, workspacePath)` exactly once per record, store layer, page closed | PASS with gap | Hook in `patch` (`setup-run.store.ts:1179-1188`), fires only on a live transition into `completed`. Only caller in the repo (grep). Store spec `:1222-1257` (background completion after `release`, guidance child actually starts after 5 s) and `:1259-1278` (two `verifyTerminal` + `reportRun` + `report` + `refresh` → schedule exactly once). Gap: defect 2 (reload inside the 5 s window loses the handoff; no test covers reload of an already-completed record). |
| Old `analyze/generate` redirect target | PASS | `analyze/agents` keeps its redirect (`onboarding.routes.ts:77-79`); no code in `libs/` or `apps/` links to `analyze/generate` beyond the route table and the step table; core's `generationWorkflowForPath` already treats `analyze/generate` URLs as agent-generation bindings (`onboarding-routes.ts:165-177`), so restored/persisted URLs land on the new page. Routes spec covers both. |

## Defects

### 1. Major — the 5 s hand-off countdown and Skip have no host anywhere

The plan's step table promises: completed → `analyze/done`, "then the guidance hand-off
(5 s countdown, or Skip)" (`implementation-plan.md:384`). After this batch:

- The run page binds only `[started]` and `(continue)` to `ptah-agent-next-steps`
  (`agent-generation-run.page.ts:180-183`). The component's `pending`,
  `remainingSeconds`, `startNow` and `skip` inputs — the countdown UI at
  `agent-next-steps.component.ts:80-96` — are never bound anywhere in the repo
  (grep: this page is the component's only user).
- The completed-status effect navigates to `analyze/done` immediately
  (`agent-generation-run.page.ts:360-368`), so even the fallback "Continue to project
  guidance" block renders only for a tick.
- `analyze-done.page.ts` has no hand-off usage at all.

Result: 5 s after completion, `GenerationHandoffStore`'s timer starts guidance in the
background (`openAndStart` with a non-null parent does not navigate,
`generation-handoff.store.ts:152-164`). The user sees no countdown and has no Skip
control; the promise "or Skip" is unreachable. Guidance a user did not ask for starts
silently.

Fix: either (a) keep the user on the run page for the completed state and bind
`handoff.pending()` / a remaining-seconds signal / `startNow` / `skip` to
`ptah-agent-next-steps`, deferring the `analyze/done` navigation until the hand-off
resolves; or (b) host the countdown on `analyze/done`. Option (a) stays inside this
batch's write set. While fixing, rebind the workflow store before rendering the
completed case so the next-steps result facts are the retried run's, not the stale
pre-retry ones (the rebind at `:448-449` runs only in the not-completed branch).

### 2. Major — a reload inside the 5 s window permanently loses the hand-off

`schedule()` is memory-only: a signal and a `setTimeout` with no persistence
(`generation-handoff.store.ts:57-65`). The store hook fires only on a live status
transition inside `patch()` (`setup-run.store.ts:1179-1188`). Consequences:

- A record that completed and was persisted as `completed` never transitions again, so
  after a reload nothing re-arms the hand-off. "Must not schedule again" holds, but
  "must not miss" does not: if the app reloads (or the Electron host restarts) during
  the 5 s countdown, the pending hand-off is gone and no code path recovers it.
- The only `manualContinue` host is the run page's completed case, which the navigation
  effect leaves immediately (defect 1), and `analyze/done` offers no chained start. The
  user's recovery is a standalone guidance start, which loses `parentId` and
  `analysisRunId` chaining.
- No test covers a reload of an already-completed record; the store spec covers only
  duplicate pushes/reports/refresh.

Fix: persist the hand-off intent — for example a `guidancePending` flag on the record
set by the hook and cleared by `skip()`/`startNow()`/`manualContinue()` — and re-arm
`schedule()` on store load for completed records that still carry it. Alternatively the
coordinator can accept the 5 s loss window explicitly and give `analyze/done` a chained
"Continue to project guidance" affordance as the recovery path. This needs a decision;
the in-memory design came from Batch 8, but the schedule caller this batch added is
what the reload requirement was attached to.

### 3. Minor — a second completion inside the 5 s window drops the first hand-off

`schedule()` calls `reset('idle')` first (`generation-handoff.store.ts:57-65`), which
clears any previous pending value and its timer. Two agent-generation records
transitioning to `completed` within 5 s of each other — plausible across two
workspaces, which the store is explicitly multi-workspace for — silently cancel the
first record's hand-off. Rare given the host's single generation slot, but the loss is
silent. Fix: key the pending hand-off by record id (a small map) or at least warn.

### 4. Minor — the preview-required state is a dead end

`agent-generation-run.page.ts:168-178` tells the user to "Review and confirm the agent
file changes before generation can start", but provides no link or button to where that
confirmation happens. A user arriving from a badge on a `needs-input` record gets text
only. The `cancelled` case links to `/onboarding/analyze/skills` (`:185-192`); the
`needs-input` case should do the same. D7's text ("shows the preview-required state")
is met literally, but the state has no exit.

### 5. Minor — transcript replay is O(n²) over the run (inherited pattern)

`transcript` (`agent-generation-run.page.ts:291-337`) rebuilds the entire transcript
from the full `generationStream()` buffer on every event. This copies
`project-guidance.page.ts:418-464` verbatim, so it is a repository pattern, not a new
deviation — but agent-generation transcripts are the longest of the workflows, and the
cost lands on the Electron renderer. Note for a follow-up; not a gate for this batch.

## Requirements the implementation quietly did not meet (summary)

- Plan "5 s countdown, or Skip": no host, Skip unreachable (defect 1).
- Batch-9 reload clause of the schedule acceptance: hand-off lost for a completion
  inside the 5 s window before a reload; untested (defect 2).

## Five logic questions

1. **How does this fail silently?** Guidance starts in the background with no countdown
   and no Skip (defect 1) — a success-looking result the user never consented to and
   cannot cancel. A reload inside the 5 s window drops the hand-off with no error or
   trace (defect 2). A second completion inside the window silently replaces the first
   hand-off (defect 3).
2. **What user action produces unexpected behaviour?** A user who opens a `needs-input`
   record from a badge lands on text with no way to reach the preview (defect 4). A
   user who dismisses the failed record from Home while a retry loop is in flight is
   safe — the page's later `report`/`reportRun` calls no-op on the missing record
   (`patch` and `observation` both null-guard). A user who leaves mid-retry is safe: the
   loop keeps running and the store still receives the completion, which is what
   schedules the hand-off with the page closed.
3. **What input data produces a wrong answer rather than an error?** A bound state with
   `status: 'completed'` and `interrupted: true` is correctly excluded from the retry
   completion guard (`:437-438`), but the record then stays `failed` while the rebound
   workflow view shows an interrupted run — a status mismatch, no error
   (`:447-451`). Low impact.
4. **What happens when a dependency fails, times out, or returns a bad shape?** Robust
   overall. One item RPC failing sets a retry error after the checkpoint re-read
   (`:423-431, :450-451`); a failing `getBoundRunState` in the retry leaves the record
   at `failed` (the read happens before the `report('running')` at `:445`, so no
   stuck-running state); navigation failure keeps the result and shows an error
   (`openRun :463-480`); `retry()` refusals restore the interrupted state with error
   copy (`setup-run.store.ts:1045-1050`). The retry path's own RPC read failure relies
   on the shared poll/push reconcile to converge, which is the store's existing
   degradation pattern.
5. **What is missing that the requirements never mentioned?** The countdown/Skip host
   (defect 1) is the case the plan mentioned but no batch owned. The reload persistence
   of the hand-off intent (defect 2) was never written down as an acceptance item; the
   brief's "must not miss" clause is the only statement of it.

## Spec quality (acceptance: behaviour, not tautologies)

The specs assert real behaviour: attach/release, transcript isolation by runId and
workspace, serial retry order with a manually settled first promise, checkpoint-gated
completion, done navigation with query identity, `getBoundRunState` never called for
needs-input. `targetOf` is the real `stepTarget`. No tautologies found. Missing cases:
no test for a retry that fails or for a reload of an already-completed record (defect
2), no foreign-tabId transcript isolation case (the filter handles it, the spec does
not pin it).

## Score rationale

6/10: the batch's own acceptance table is met with genuine, passing specs, and the
hard parts (exactly-once scheduling from the store layer across duplicate terminal
pushes, serial checkpoint-gated retry, stream isolation) are correct. What separates it
from 7-8: two Major gaps against the plan's stated behaviour — the hand-off countdown
and Skip have no host anywhere, and a reload inside the 5 s window loses the hand-off
with no recovery path. Both centre on the `schedule()` wiring this batch was created to
finish. Not 3-4: the foundation (store transition hook, retry ordering, isolation) is
sound and verified.

**Verdict: REVISE** — defects 1 and 2 need a fix or an explicit coordinator decision
before merge; 3, 4, 5 can follow.
