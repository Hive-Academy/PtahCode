# Code logic review — Batch 8 + Batch 7 minor fixes (TASK_2026_2330_2fc3)

Independent read-only review of Batch 8 (`libs/frontend/onboarding` generation
consumers) and the four Batch 7 minor fixes
(`generation-handoff.store.ts` + spec). Scope A diff taken against HEAD
`aba3dba7a5`. No source file was edited.

## Score and verdict

- **Score: 8 / 10**
- **Verdict: APPROVED** — no open Blocking or Major defect.

The migration from chat-tab lookup to Setup records is behaviourally sound. Every
Batch 8 acceptance item passes against the real contracts, all four Batch 7 minor
fixes are in and pinned by regression tests, and each failure mode this review was
asked to hunt (visiting-record vs pending hand-off, double start, attempt-scoped
stream filtering, wrong-workspace focus, recordless loops, swallowed errors) is
either handled or degrades visibly. What keeps the score below 9: the focus router
trusts a workspace switch that cannot report failure, and `openRoute` leaks a
stale `lookupError` onto the recordless view. Both are Minor.

## Checks run (focused only)

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false
  --runTestsByPath <three Batch 8 specs>` — **59 of 59 passed, 3 suites**
  (`.ptah/tmp/review-batch8-onboarding-jest.log`).
- `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false
  --runTestsByPath generation-handoff.store.spec.ts` — **14 of 14 passed**
  (`.ptah/tmp/review-batch8-handoff-jest.log`).
- Read-only inspection: `git diff HEAD -- libs/frontend/onboarding` and the whole
  changed files; `SetupRunStore` (`get`, `start`, `adopt`, `attach`, `release`,
  `whenStarted`, `bindingFor`, `isCancelling`, `workspacePath`), `bindingOf`
  (`setup-run-attempt.ts:31`, `tabId = record.id`), `GenerationWorkflowStore`
  (`bind`, `isBound`, `regenerateGuidance`, `retry`, `accept`), `GuidanceGenerationStore.bind`,
  `setStreamingEventCapped` and the reference delta-accumulation consumers,
  `IWorkspaceCoordinator` (`workspace-coordinator.token.ts:31`),
  `impl-report-batch8.md`, `fix-report-batch7-minors.md`,
  `code-logic-review-batch7.md`, `batches.md` Batch 8, and the Batch 4 legacy
  adoption (`setup-run.store.ts:666-669`).

## Five logic questions

1. **What must the code do, and does it?** Bind onboarding consumers to validated
   Setup records, render the enhance stream attempt-scoped, offer Retry for an
   interrupted record, route focus through `stepTarget`, and hand off by
   `agentRunId`. Yes — every acceptance item is implemented against the real
   store contracts, not mocked around (see tables).
2. **Where does it fail at boundaries?** Every RPC/async boundary in the page
   re-checks `destroyed` and `this.binding() === binding`. Two boundaries are
   weak: the workspace switch in the focus router (no failure signal, so a
   no-op switch is followed by a navigation that lands on a recovery screen
   while focus reported success — defect 1), and the route-identity reset in
   `openRoute`, which clears `recovery` and `binding` but not `lookupError`
   (defect 2).
3. **What state can go stale or race?** The page deliberately does not reserve a
   record on visit, so no idle record competes with a pending hand-off; the
   countdown join (`starts` map keyed by `binding.tabId`, which equals
   `record.id`) and `revision` checks keep Start-plus-countdown single-start.
   Stream filtering is keyed by `source.runId === runId` with
   `runId = record.backendRunId`, and `accept` → `reportRun` updates
   `backendRunId` on every new attempt (`generation-workflow.store.ts:365-379`),
   so old-attempt events are dropped and new-attempt events are shown once the
   record updates.
4. **What requirement is quietly unmet?** Legacy saved guidance with no Setup
   record shows the recordless idle start view instead of the saved-guidance
   panel (saved card requires `binding()`). Batch 4's `adoptLegacyTabs` plus
   reconcile cover the restored/resumable cohorts, so the residual cohort is
   small — judged acceptable, see Decisions.
5. **What remains uncertain?** The focus router receives notification
   `sessionId` values (`chat-attention-host-message-handler.service.ts:278`) and
   now resolves them as Setup record ids; the sender-side re-keying belongs to
   Batches 9-13 and is out of this write set. Electron visual confirmation is
   still open (Phase D, D9).

## Batch 8 acceptance table

| Acceptance item | Result | Evidence |
| --- | --- | --- |
| `bind()` validates `SetupRunStore.get(id)` | PASS | `generation-step.store.ts:88-101` — `runs.get(binding.tabId)`, then record-derived `bindingFor` checked for workflow and workspace; missing record → `invalid-tab`, wrong workspace → `workspace-mismatch`. Spec `generation-step.store.spec.ts:267-278` |
| No `findBoundGenerationTab`, no `GenerationWorkflowLauncherService` import (P3) | PASS | Grep over the three write-set files returns zero matches for either symbol, `TabManagerService`, `chat-state` or `chat-ui` imports. `DetailsLogComponent` replaced by the inline transcript |
| Guidance page renders `enhanceStream()` | PASS | `project-guidance.page.ts:429` iterates `wizardState.enhanceStream()`, filtering by `tabId`, `workspacePath`, workflow and `runId` (`:430-437`); spec `project-guidance.page.spec.ts:296-343` pins visible text, old-attempt/foreign-record exclusion and mismatch teardown |
| Interrupted run shows "Retry" (R2) | PASS | `project-guidance.page.ts:224-232` renders Retry when `interrupted()`; `:695-696, :726-729` bind without a backend attempt and `regenerateGuidance` routes `interrupted` to the store retry (`generation-workflow.store.ts:241-245`). Spec `:392-410` |
| Focus router uses `stepTarget` | PASS | `onboarding-focus-router.service.ts:33-38` — `stepTarget(record)` for both workflows, terminal and live, with the workspace switch first; spec `:47-83` |
| Hand-off compares `pending.agentRunId` with the Setup agent record id | PASS | `project-guidance.page.ts:752-768` — `agentRecord(record)` (parent from `record.parentId` or `gen`), then `pending?.agentRunId === agent.id`, `manual-recovery` and `autoStartedParent` guards. Specs `:371-390`, `:412-422` |

## Batch 7 minor-fix table

| Review item | Fixed | Evidence |
| --- | --- | --- |
| 1 — Unhandled rejection when the hand-off joins a store-owned retry | YES | `generation-handoff.store.ts:184-188` — `whenStarted(...).catch(...)` returns `null` with a `degradation-audit: reported` comment; the join then settles in `manual-recovery` (`:143-145`). Regression: spec `:225-237` ("offers manual recovery when a joined guidance retry rejects") asserts `started()` null, outcome `manual-recovery`, `inFlight()` false. The `starts` map join is keyed by `binding.tabId`, which equals `record.id` (`setup-run-attempt.ts:36`), so both join paths are covered |
| 2 — `manualContinue` drops the parent chain | YES | `generation-handoff.store.ts:84-107` — pending captured before `reset`, workspace match checked, parent passed through `openAndStart(parent.workspacePath, parent)`; non-matching pending continues independently. Regression: spec `:239-253` asserts `parentId` and `origin: 'analysis-result-continue'` |
| 3 — Countdown ignores a cancel awaiting confirmation | YES | `generation-handoff.store.ts:127` — `!this.runs.isCancelling(parent.id)` in `parentFor`, which both the effect (`:47-50`) and `startNow` (`:74-78`) use. Regression: spec `:166-179` ("skips the countdown while the parent awaits cancellation confirmation") |
| 5 — `failStart` silent for a non-running record | YES | `generation-handoff.store.ts:250` — `degradation-audit: preserved` comment explains the status-preserving manual-recovery outcome |

All four fixes verified against the review's original file:line references; the
store's own focused suite passes 14/14.

## Specific failure modes examined

- **Record created on page visit competing with a pending hand-off.** None. The
  page reserves a record only in `start()` (`project-guidance.page.ts:843-873`),
  which returns early while `handoff.pending()` is truthy (`:836`). The recordless
  visit path (`openRoute:626-631`) unbinds and offers the pending hand-off
  instead. The implementer's decision is sound and the spec pins it
  (`:256-273`, "creates a Setup record only when Start guidance is selected").
- **Double start on Start plus the countdown.** Handled. Start is hidden while
  `handoff.pending()`/`inFlight()` (`:233-239`) and `start()` re-checks both
  (`:833-842`); `startNow` clears the timer before starting
  (`generation-handoff.store.ts:79`); a manual Continue joins the in-flight
  `startGuidance` promise through the `starts` map. Spec
  `project-guidance.page.spec.ts:423-433` pins the no-double-start case.
- **Stream filtering dropping current-attempt or showing old-attempt events.**
  Sound. The filter requires `source.runId === runId` with
  `runId = record.backendRunId` (`:421-424`), and `reportRun` on accept updates
  `backendRunId` per attempt, so a retry switches the transcript to the new
  attempt and drops the old one. The manual delta accumulation matches the
  reference consumers (`accumulator-core.service.ts:880`,
  `agent-monitor-tree-builder.service.ts:618-632`); `setStreamingEventCapped`
  does not accumulate deltas, so the manual step is required, not duplicate.
- **Focus router navigating to the wrong workspace or step.** Step: correct —
  `stepTarget(record)` with the record's own workspace. Workspace: partially —
  see defect 1.
- **Recordless legacy route looping.** No loop found. A `tab` id with no record
  sets `missing-tab` recovery once (`:617-619`); `openLatest` falls back to
  `latestGuidance()` then `/onboarding` (`:805-812`). The `tab` subscription is
  `distinctUntilChanged` + `skip(1)` and `replaceIdentity` keeps `tab` stable, so
  no re-entry cycle exists. `openOwner`'s navigate-then-`openRecord` pair cannot
  double-bind: the subscription's `openRoute` runs first and sets the binding
  synchronously, so the `this.binding()?.tabId !== owner.id` guard
  (`:947-948`) suppresses the second call.
- **Swallowed errors.** Each catch carries a `degradation-audit:` comment
  (`:711`, `:794`; `generation-step.store.ts:179`) and routes to a visible state
  (`lookupError`, detected-stack absence, `unavailable`). The countdown join and
  `failStart` comments from Batch 7 items 1 and 5 are present.

## Defects

All defects are Minor. None blocks the batch.

1. **[Minor] The focus router does not verify that the workspace switch landed.**
   `onboarding-focus-router.service.ts:30-32` — `focus()` awaits
   `switchWorkspace(record.workspacePath)` and navigates unconditionally.
   `IWorkspaceCoordinator.switchWorkspace` returns `void | Promise<void>`
   (`workspace-coordinator.token.ts:31`); it cannot report failure and can no-op
   when the record's folder is no longer open. In that case `focus()` navigates to
   the onboarding step of a foreign-workspace record and returns
   `{ success: true, outcome: 'focused' }` while the guidance page lands on the
   `workspace-mismatch` recovery panel (`project-guidance.page.ts:642-644`), so
   the notification is marked handled but nothing opened. The spec pins the happy
   switch only (`onboarding-focus-router.service.spec.ts:80-81`). Fix: after the
   switch, re-check `record.workspacePath === this.runs.workspacePath()` (the
   store's `workspacePath` is reactive on the tab manager,
   `setup-run.store.ts:172-176`) and return
   `{ success: false, outcome: 'missing' }` when it did not land.

2. **[Minor] `openRoute` resets the route identity but not `lookupError`.**
   `project-guidance.page.ts:607-611` — `openRoute` clears `binding`,
   `boundRunId` and `recovery`, but `lookupError` is cleared only inside
   `bindRunSequence` (`:693`). If a record's lookup fails (`lookupError` true)
   and a same-page navigation then ends on the recordless route, the
   `@else if (lookupError())` branch (`:147-164`) keeps rendering the
   lookup-error panel for a route that has no record, and its Retry button
   (`retryLookup`, `:770-779`) is a no-op because `this.binding()` is null — the
   idle start view is unreachable for that page instance. No current producer
   drops `tab` on the same page (every internal navigation keeps it), so the
   trigger is narrow today, but Batch 9's completion navigation will add new
   same-page producers. Fix: `this.lookupError.set(false)` at the top of
   `openRoute`, and make `retryLookup` fall back to `openRoute(null)` when
   `binding` is null.

## Minor follow-ups

- **Notification `sessionId` re-keying is cross-batch.** The focus router now
  resolves `runs.get(sessionId)` while the attention handler still passes
  `notice.target.sessionId` (`chat-attention-host-message-handler.service.ts:278`).
  Until the senders supply Setup record ids (Batches 9-13), onboarding
  notifications cannot focus. Already disclosed in `impl-report-batch8.md`; keep
  it on Batch 9/13's acceptance.
- **Legacy saved guidance with no Setup record** (the lane's Clarifications
  Needed item): judged acceptable until a later batch — see Decisions. The
  recommended workspace-scoped read/action API in `GuidanceGenerationStore`
  should be filed as a follow-up task, not folded into this batch.
- **Start stays hidden while a foreign hand-off counts down.** The Start button
  requires `!handoff.pending()` even when the pending hand-off names another
  workspace, so an unrelated countdown can hide Start for up to 5 s. The
  condition predates Batch 8 (the old template had the same guard); if it ever
  bothers users, scope the guard to the active workspace.
- The page file is 974 lines (impl report records a `max-lines` warning). Not a
  logic concern; Batch 9 should not copy more into this file.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Legacy saved guidance with no Setup record is acceptable until a later batch, not a Major regression | Accept with follow-up, or block Batch 8 | Batch 4 already adopts restored legacy setup tabs as records on workspace activation (`setup-run.store.ts:666-669`, `adopt` at `:317-350`), reconcile adopts resumable runs, the recordless view still lets the user start guidance and regenerate the saved prompt, and the saved data itself is workspace-scoped backend state that no batch deletes. The residual cohort (guidance whose tab was never restored and never reconciled) is small and the loss is view/toggle access, not data. Batch 8's acceptance does not include legacy parity, and a workspace-scoped API is a clean later addition | Yes |
| Verdict APPROVED with defects 1-2 open | Approve, or REVISE for the focus-switch check | Both defects need an edge trigger (closed foreign workspace; a same-page producer that drops `tab` that no current code makes); each degrades to a visible, recoverable screen; every acceptance item passes and 73/73 focused tests are green | Yes |
| Treated the notification `sessionId` re-keying as a follow-up, not a Batch 8 defect | Follow-up, or batch defect | The senders are outside the write set, the gap is disclosed in the impl report, and Batches 9-13 own the wiring; HEAD had the same router already detached from tab lookup semantics | Yes |
| Score 8, not 9 | 8 or 9 | Defects 1-2 are real logic gaps in the reviewed files, and the notification wiring leaves the focus path unprovable end to end inside this batch; the hand-off migration itself, its guards and its regression coverage are exemplary, which keeps the score above 7 | Yes |

Review family: ollama-cloud (implementer family: codex)
