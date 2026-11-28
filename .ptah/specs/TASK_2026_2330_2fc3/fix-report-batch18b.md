# Fix Report — Batch 18B Round 1 (`TASK_2026_2330_2fc3`)

Addressed all findings from `.ptah/specs/TASK_2026_2330_2fc3/code-logic-review-batch18b.md` (both Majors and the trivial Minor), strictly within `libs/frontend/onboarding/src/lib/proposal/**`. All Batch 12 F14–F17 behaviors, Batch 17b reply `workspacePath` attribution and `cancelled: true` non-launch invariants, and prior Batch 18B fixes are preserved.

---

## Per-Finding Changes and Regression Specs

### 1. Major — Guidance load failure on post-install interrupted recovery can dispatch chat without guidance

- **Root cause:** `loadReview()` set `guidanceLoaded = true` before checking `guidance.isSuccess()`, returned `void`, and left `continueInterrupted()`, `continueWithoutAttachments()`, and `launchChat()` able to clear the review error and dispatch chat even when `wizard:recommend-skills` failed, `wizard:get-project-guidance` returned an unsuccessful response, or `wizard:get-project-guidance` rejected.
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:188-191,1160,1167-1171,1184,1226-1244,1259,1299,1323`: replaced the untyped `guidanceLoaded` boolean with current-record signal state `guidanceLoadedFor` (`{ loaded, recordId }`) and `hasLoadedGuidanceFor(recordId)` so guidance validity is scoped to the active record and accepts a successful zero-fact response while rejecting unloaded or stale-record state.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:411-553`: changed `loadReview()` to return `Promise<boolean>` (`true` only on a non-stale, successful `wizard:get-project-guidance` response with a valid `facts` array, including zero facts). On `!guidance.isSuccess()` or rejected guidance call, keeps `guidanceLoadedFor` unloaded (`loaded: false`), sets `guidanceNote` and `state.setError('Could not load project guidance.')` (for installed recovery or rejected guidance; preserves `'Could not load skill recommendations.'` when recommendations fail), persists `guidanceLoaded: false`, and returns `false`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:672-715`: in `launchChat(fromInstall = false)`, before clearing errors or calling `coordinator.launch()`, requires `hasLoadedGuidanceFor(currentRecordId)` when `skillsInstalled() && !fromInstall`. If unloaded, retries `loadReview({ preserveSelection: true, recordId })` and aborts dispatch if the load fails, becomes stale, or now triggers `blockForOwnerDecision()` / `missingAttachments()`. This keeps the enabled **Continue to team builder** button (`team-builder-start.page.html:213`) actionable for retry while never dispatching chat without a successful current-record guidance response.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:744-779,801-843`: gated `continueWithoutAttachments()` and `continueInterrupted()` on `loadReview()` returning `true` and `hasLoadedGuidanceFor(recordId)` before calling `launchChat()`.
- **Regression spec (verified failing before fix, passing after):**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:2251-2399` — `does not dispatch chat when guidance fails (unsuccessful | rejected | recommendations) on reloaded post-install interrupted recovery and stays actionable for retry`. Verifies all three failure paths (unsuccessful guidance response, rejected guidance call, and failed recommendations): asserts `setupRuns.retry` runs, `sendOrQueueMessage` is not called, error is displayed, **Continue to team builder** stays enabled, clicking it while guidance still fails still blocks chat, and once guidance recovers (tested with both a zero-fact response and real facts), clicking it dispatches chat.

---

### 2. Major — Retrying an interrupted record before cancellation reply settles drops confirmed installed skills

- **Root cause:** `recordStoppedInstall()` only persisted confirmed writes when `record.status` was `'cancelled'` or `'interrupted'`. Switching away from workspace A -> B, returning to A, and clicking **Continue** (`setupRuns.retry`) immediately transitions the same record to `'needs-input'`, causing the delayed backend reply from the stopped install attempt to be discarded.
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:133-138,228`: added `StoppedInstallAttempt` and `stoppedInstalls: Map<string, StoppedInstallAttempt>` keyed by `installRunId` to track each stopped install attempt against its `(installRunId, recordId, workspacePath, intent)`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:474-482,742-895`: preserved previously confirmed `installed` names across retries of the same record, registered stopped attempts in `stoppedInstalls` on both the aborted-while-pending (`result === null`) and settled-after-inactive paths, and cleaned up `stoppedInstalls` on non-success or error settlement.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:920-953`: updated `recordStoppedInstall(installRunId, result)` to consume the tracked `StoppedInstallAttempt`, verify malformed guards and normalized `workspacePath` attribution against both `attempt.workspacePath` and `installRecord(attempt.recordId, result.workspacePath)`, merge confirmed skill names into `record.teamBuilder.installed` (and any active execution for the same record/workspace) via `setupRuns.report(attempt.recordId, { teamBuilder: { intent, installed } })` without altering `status`, `step`, `error`, or `installCompleted`, and without launching chat.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:371-379`: preserved `record.teamBuilder?.installed ?? []` on same-record `submit()` instead of overwriting confirmed partial installs with `[]`.
- **Regression specs (verified failing before fix, passing after):**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1691-1778` — `reconciles confirmed partial installs when an interrupted record is retried before the cancelled install reply settles (18B F2)`. Covers switch A -> B, return to A, retry same record (`needs-input`), then delayed backend settlement carrying `/ws/` and `installed: ['owner/repo/qa-one']`; asserts `status: 'needs-input'` and `step: 'review'` are preserved, confirmed skill is recorded, `hasCompletedInstall` stays `false`, and neither `createTab` nor `sendOrQueueMessage` is called.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:2401-2501` — `reconciles confirmed partial installs on the page when continuing an interrupted run before the cancelled install reply settles`. Covers the full mounted page flow (`install()` -> switch A -> B -> return to A -> `continueInterrupted()` -> late install settlement) and asserts `runRecords()[0]` and `page.state.installed()` retain `['owner/repo/one']` with `status: 'needs-input'` and zero chat dispatch.

---

### 3. Minor — Global 20-entry sidecar cap could evict an indexed live record's checkpoint

- **Change (trivial fix implemented):**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:1644-1658`: in `savePersistedEntry()`, when `persistedRecovery.size > MAX_RECOVERY_ENTRIES`, only evict entries (other than `recordId`) whose `SetupRunStore` record is absent, `completed`, or `cancelled`, protecting live recoverable entries (`running`, `needs-input`, `failed`, `interrupted`) across >20 workspaces from eviction.
- **Regression spec (verified failing before fix, passing after):**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1653-1689` — section (4) of the F9 sidecar test seeds 21 indexed `needs-input` records across 21 workspaces, saves drafts for all 21, reloads from `localStorage`, and asserts the oldest live workspace (`setup-tb-live-0`) retains its `selectedIds`, `ownerDecision`, `installCompleted`, and `hadAttachments`.

---

## Checks Run

| Check | Exact Command | Result | Log |
| --- | --- | --- | --- |
| Pre-fix red run (new specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` | **FAIL (EXIT 1)** — 5 new assertions failed on pre-fix code (63/63 existing passed) | `.ptah/tmp/b18b-r1-red.log` |
| Focused Jest (`proposal/` specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill.store.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts` | **PASS (EXIT 0)** — 6/6 suites, **102/102 tests passed** | `.ptah/tmp/b18b-r1-jest.log` |
| TypeScript (`onboarding` lib) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | **PASS (EXIT 0)** — 0 errors | `.ptah/tmp/b18b-r1-tsc.log` |
| ESLint (changed TS/spec files) | `npx eslint libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` | **PASS (EXIT 0)** — 0 errors, 2 pre-existing `max-lines` warnings | `.ptah/tmp/b18b-r1-eslint.log` |
| Ptah Diagnostics (scoped) | `ptah_get_diagnostics` on the 4 changed TS/spec files | **PASS** — 0 diagnostics in all 4 requested files | — |

### Notes
- File ownership strictly respected: only files under `libs/frontend/onboarding/src/lib/proposal/**` were modified.
- Host skill catalogue did not list `ui-ux-designer` or `angular-frontend-patterns`.
