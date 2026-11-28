# Code logic review — Batch 7 (TASK_2026_2330_2fc3)

Independent read-only review of the Batch 7 changes: `generation-handoff.store.ts` (+spec),
`setup-generation-open.handler.ts` (+spec), `setup-run-entry.service.ts` (+spec, new),
`src/app.ts` export. `libs/frontend/onboarding` was ignored (Batch 8 is in flight there).

## Score and verdict

- **Score: 8 / 10**
- **Verdict: APPROVED** — no open Blocking or Major defect.

The change is behaviourally sound. The re-keyed hand-off, the entry port and the
handler all meet the acceptance items, and the specific failure modes this review was
asked to hunt (timer leaks, double start, stale pending, blocked-start race, D7 routes,
swallowed errors) are each either handled or pinned by a test. What keeps the score
below 9: one narrow unhandled-rejection path in the hand-off store, a lost parent chain
on the manual Continue path, and a countdown trigger that no production code wires.

## Checks run (focused only)

- `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false
  --runTestsByPath <three Batch 7 specs>` — **25 of 25 passed**, 3 suites (`.ptah/tmp/review-batch7-jest.log`).
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json` — **exit 0** (`.ptah/tmp/review-batch7-tsc.log`).
- Read-only inspection: `git diff HEAD -- libs/frontend/setup-wizard`, the whole changed
  files, `SetupRunStore` / `SetupRunAttempts` / `setup-run-steps.ts` / `setup-run-attempt.ts`
  contracts, `surface-router.service.ts:130-190`, plan components 2 and 5, `batches.md` Batch 7,
  `impl-report-batch7.md`, and a workspace grep for `tabClosed` / `openedTab` / chat-ui imports.

## Acceptance table

| Acceptance item | Result | Evidence |
| --- | --- | --- |
| Hand-off keyed by `agentRunId`; guidance starts with `SetupRunStore.start('project-guidance', …, {parentId})` | PASS | `generation-handoff.store.ts:18-22` (`GuidanceHandoff.agentRunId`), `:172-176` (`start` with `parentId`, `analysisRunId`, `origin: 'analysis-result-continue'`); spec "waits five seconds and starts a child of the Setup record" |
| No chat-ui launcher import; `tabClosed` deleted | PASS | No `@ptah-extension/chat-ui` import remains anywhere under `libs/frontend/setup-wizard/src`; a workspace grep for `tabClosed` / `openedTab` returns zero matches |
| "Agent run cancelled/dismissed" replaces "tab gone"; 5 s timer kept | PASS | `generation-handoff.store.ts:47-50` (effect skips when `parentFor` is null) + `:111-119` (`parentFor` rejects `cancelled` and wrong workflow); `dismiss` removes the record from the index (`setup-run.store.ts:488-494`) so `get()` returns null; `HANDOFF_DELAY_MS = 5_000` at `:16`, timer armed at `:64` |
| Handler calls `SETUP_RUN_ENTRY.openWorkflow(workflow, 'host')` and creates no tab | PASS | `setup-generation-open.handler.ts:50, :56-58`; the spec asserts `createTab` and `createWorkflowTabForWorkspace` are never called for accepted pushes |
| `SetupRunEntryService` picks the active run's step, else Home; `openWorkflow` never creates a second run | PASS | `setup-run-entry.service.ts:23-28` (`openSetup`: `activeRun()` → `targetOf`, else `navigateToSurface('onboarding')`); `:30-47` (`openWorkflow` only navigates; no `runs.start` call; the spec asserts `start` is not called) |

## Specific failure modes examined

- **Timer leaks.** None found. `reset` (`:97-104`) clears the timer on `schedule`, `skip`
  and `manualContinue`; `startNow` clears it at `:79`; `DestroyRef.onDestroy` (`:51-54`)
  clears it and bumps `revision` on service destruction. `schedule` arms the timer after
  setting `pending`; an immediate reactive skip cannot strand a timer because `startNow`
  (`:72-73`) returns when `pending` is null.
- **Double guidance start (countdown + manual Continue).** Handled. `manualContinue`
  clears the timer via `reset` before starting, so the countdown cannot fire afterwards.
  If the countdown start is already in flight, a later Continue joins the same
  `startGuidance` promise through the `starts` map (`:168-170`) and the store's live-run
  rule (`setup-run.store.ts:301-305`), so only one RPC start is sent. Pinned by
  "lets the user start before the deadline without sending a second start" and
  "joins an in-flight start when manual Continue is repeated".
- **Stale pending after the parent is dismissed.** Handled. `dismiss` removes the record
  (`setup-run.store.ts:488-494`), `get()` then returns null, and the effect (`:47-50`)
  skips and clears the countdown. The effect tracks the store index signal, so it also
  reacts to a cancel that lands after the deadline was set. Pinned by "skips after the
  parent is dismissed/cancelled".
- **Countdown vs blocked start.** Handled. `sendStart` (`:206-216`) resolves the backend
  owner through `SetupRunStore.resolveBlockedStart`, marks the losing run failed via
  `failStart`, and returns the owner record; revision checks (`:129`, `:148`, `:153`)
  keep a superseded attempt from touching the UI. Pinned by "opens the backend owner
  when the guidance start is blocked".
- **D7 routes.** Correct. The entry spec drives the real `stepTarget`: a live
  `agent-generation` record at `needs-input`/`preview` opens `analyze/generate` with
  `{tab, analysis}` (`setup-run-steps.ts` `RE_ENTRY`), and the no-record fallbacks
  `['analyze', 'skills']` and `['guidance']` match `entrySubPath` for parentless records.
- **Swallowed errors.** `sendStart`'s catch (`:219-225`) carries the
  `degradation-audit: reported` comment and reports a safe refusal copy (the spec asserts
  backend details do not leak). The handler's catch (`setup-generation-open.handler.ts:60-62`)
  surfaces a user-visible notice, so it is not a swallow.

## Defects

All defects are Minor. None blocks the batch.

1. **[Minor] Unhandled rejection when the hand-off joins a store-owned retry start.**
   `generation-handoff.store.ts:169` — `startGuidance`'s existing branch awaits
   `this.runs.whenStarted(existing.id)`, and `SetupRunStore.whenStarted`
   (`setup-run.store.ts:465-468`) returns `attempt.start` when one exists. That promise is
   produced by `SetupRunAttempts.start` via `sendBoundStart` (`setup-run.store.ts:1020`,
   `:1043`), which does not catch `requestBoundStart` — it can reject (a `WizardRpcError`).
   `openAndStart` (`:121-155`) has `try/finally` but no `catch`, so the rejection propagates
   through `startNow`'s fire-and-forget caller (`void this.startNow()`, `:64`) as an
   unhandled promise rejection; the outcome stays `'idle'` and the UI shows nothing.
   Trigger: the hand-off joins a live guidance run whose retry RPC throws. Fix: wrap the
   `openAndStart` body in a catch that sets `'manual-recovery'` (the same
   degradation-audit pattern as `sendStart`), or catch around the `whenStarted` join.

2. **[Minor] `manualContinue` drops the parent chain.** `generation-handoff.store.ts:84-95`
   calls `openAndStart(workspacePath, null)`, so a manual Continue creates the guidance run
   with `origin: 'independent-start'` and no `parentId` / `analysisRunId` (`:172-176`), even
   when a pending hand-off names a live agent parent. The run is then standalone for
   routing: a completed run opens `guidance` instead of `analyze/done`
   (`setup-run-steps.ts` `guidanceSubPath`) and the Home list loses the parent link. The
   old origin split was the same, but the old code had no record model in which
   `parentId` drives routes. Today no production code calls `manualContinue` (the page
   uses `startNow`), which limits the impact. Fix: when a pending hand-off exists, pass
   its parent through `openAndStart` instead of `null`.

3. **[Minor] The hand-off ignores a cancel that is still awaiting backend confirmation.**
   `generation-handoff.store.ts:111-119` — `parentFor` only rejects `status === 'cancelled'`.
   `SetupRunStore.cancel` keeps the status `running` until the backend confirms
   (`setup-run.store.ts:500+`, `cancellingIds`). If the user cancels the agent run and the
   confirmation takes longer than the 5 s deadline, the countdown still starts a guidance
   child of a run the user tried to cancel. Fix: also skip when
   `this.runs.isCancelling(pending.agentRunId)`.

4. **[Minor] No production caller of `schedule()` — the countdown never fires in the
   product.** A workspace grep (current tree and HEAD) finds `schedule` and
   `manualContinue` referenced only by the store, its spec and `src/index.ts`. Plan
   integration flow step 5 (`implementation-plan.md:690`) says a completed agent run
   schedules the chained child through `GenerationHandoffStore` "keyed by run id", but
   no batch in `batches.md` owns that wiring and no code performs it. The gap predates
   this batch (HEAD had no caller either), so it is not a Batch 7 defect, but Phase B
   closes with the hand-off trigger unwired. Fix: confirm the batch that calls
   `schedule(agentRecord.id, workspace)` on agent-generation completion, or file it.

5. **[Minor] `failStart` is silent for a non-running record.**
   `generation-handoff.store.ts:228-238` — when the record exists, has no
   `backendRunId` and its status is not `running` (for example `needs-input`), it
   returns `null` with no report and no comment. The hand-off outcome then becomes
   `'manual-recovery'` while the record keeps its prior status. That is defensible (a
   `needs-input` run must not be marked failed), but the branch is a silent outcome
   without a `degradation-audit:` note. Fix: add the comment, or report a benign
   status-preserving outcome explicitly.

## Minor follow-ups

- **Cross-batch compile break (expected, Batch 8 owns it):** `project-guidance.page.ts:581`
  still reads `pending?.agentTabId`, a field Batch 7 removed from `GuidanceHandoff`.
  The onboarding project does not typecheck against Batch 7 alone (TS2339). The
  implementer documents this in `impl-report-batch7.md`; Batch 8 (in flight) migrates the
  page. Phase B must not merge Batch 7 without Batch 8.
- Skip pressed after the countdown fired does not stop the in-flight backend start; the
  guidance run stays live in the store. This matches plan rule 5 ("leaving never cancels")
  and the pre-batch behaviour, and the spec pins it intentionally
  ("records an accepted start after Skip"). No change requested.
- `SetupRunEntryService.openWorkflow` ignores its `origin` parameter (`_origin`). The
  interface documents it as caller provenance and no consumer reads it yet; the
  implementer's decision to keep it is recorded. Revisit if a caller needs it.
- `openWorkflow` navigates to the record's step but never calls `SetupRunStore.attach`.
  That is safe for the runs it can open (live runs are `unseen: false`), and the
  implementer's decision assigns view attachment to the rendering page. Confirm the
  Batch 8/14 pages attach on `tab=<id>` so a terminal run opened later still clears the badge.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Verdict APPROVED with defect 1 left open | APPROVE, or REVISE for the unhandled-rejection path | The rejecting join needs a store-retry-owned live run plus an RPC throw, is user-recoverable (retry), and touches no persisted state; every acceptance item passes and 25/25 focused tests plus the library typecheck are green | Yes |
| Treated the unwired `schedule()` as a follow-up, not a Batch 7 defect | Block the batch, or follow up | The caller gap exists at HEAD too; Batch 7's write set and acceptance cover the store's own behaviour; the plan's flow step 5 is the owner of the wiring | Yes |
| Treated the onboarding `agentTabId` read as out of scope | Report as a batch defect, or as a cross-batch note | The review brief says to ignore `libs/frontend/onboarding` (Batch 8 lane active there); the implementer disclosed the break and Batch 8's write set contains the page | Yes |
| Score 8, not 9 | 8 or 9 | Defects 1-3 are real logic gaps in the reviewed files, but each needs a narrow race or an unwired path to manifest, and none is Major | Yes |

Review family: ollama-cloud (implementer family: codex)
