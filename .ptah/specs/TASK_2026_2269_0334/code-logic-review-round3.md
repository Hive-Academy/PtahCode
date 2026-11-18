# Code logic review, round 3 — TASK_2026_2269_0334

Scope: only the round-2 correction (`review-fix-report-round2.md`) in
`analyze/analyze-skills.page.{ts,spec.ts}` and `proposal/team-builder-start.page.{ts,html,spec.ts}`.
Paths are relative to `libs/frontend/onboarding/src/lib`.

## Verdict: APPROVED

N1, N2 and N3 are corrected in the analysis host. Three new findings are minor or low. None
blocks delivery. Score 7/10: the N2 paths are correct and tested, and the N1 test checks the real
`document.activeElement`. The score is not 8 because the team-builder host still has the N1
focus gap, and the installed-state focus path is not tested.

## N1–N3

| Finding | Status | Evidence |
| --- | --- | --- |
| N1 focus after a failed install (analysis) | Corrected | `analyze/analyze-skills.page.ts:398-411`: `afterNextRender` gets `{ injector: this.injector }` (`:129`). This is valid outside an injection context, so each call path (`:385`, `:393`, `:437`, template cancel) is safe. The hook is bound to the component `DestroyRef` and also has a `destroyed` guard (`:402`), so it cannot focus after destroy. `analyze/analyze-skills.page.spec.ts:465-522` asserts `document.activeElement` and `dialog.open === false` for cancel, partial and rejected install. The shim at `:493-502` models modal inertness. The lane's mutation run with `queueMicrotask` failed 3 tests. |
| N2 install success, then navigation or launch fails | Corrected | Analysis: `skillsInstalledState` is set before navigation (`analyze/analyze-skills.page.ts:388`). `install()` returns early when installed (`:350`). `preview()` goes to navigation (`:309`). The installed panel (`:41-62`) has no install action and shows a true message (`:433-435`). `leaving` is reset in `finally` (`:440`). Spec `:527-577` covers rejection and `false`, with no second install RPC. Team builder: `install()` returns early when installed (`team-builder-start.page.ts:352`). A launch failure sets stage `review` and a true message (`:476-481`). The template then shows the installed panel with Back and "Continue to team builder" (`team-builder-start.page.html:98-105`). A double click is safe because stage `launching` replaces the panel (`html:89`) and `launchChat` has a guard (`ts:426-432`). |
| N3 read-only `loadError` | Corrected | `analyze/analyze-skills.page.ts:130-133` and `team-builder-start.page.ts:134-137`: private writable, public `asReadonly()`. All writes go through host methods. Spec `analyze-skills.page.spec.ts:617` and the team-builder launch-retry test assert that no `set` exists. The new `skillsInstalled` uses the same pattern. I found no other change to the public API, except the new read-only `skillsInstalled`. |

## New findings

### R1 — minor — the team-builder host keeps the N1 focus gap

- Location: `proposal/team-builder-start.page.ts:348`, `:405`, `:416` (`queueMicrotask`), and `:481`.
- Scenario: the user starts an install and it fails. The microtask runs while the `<dialog>` is
  still open and the review wrapper is `inert` (`team-builder-start.page.html:109`), so
  `returnFocus.focus()` has no effect in a browser. After a successful install, a launch failure
  (`:481`) does not restore focus at all. The focused element was in the removed `launching` view,
  so focus goes to `body`.
- Correction: use the same `afterNextRender(..., { injector })` pattern as the analysis host. After a
  launch failure in the installed state, focus the "Continue to team builder" button.

### R2 — low — each failed navigation retry leaves one more "Project guidance" tab

- Location: `analyze/analyze-skills.page.ts:417-418` (code that existed before this correction,
  but the new retry path makes it repeat).
- Scenario: the install succeeds, `navigate()` returns `false` or rejects, and the user clicks
  "Continue to Project guidance" again. Each attempt calls `createTab` before `navigate`, and the
  `catch` (`:429-438`) does not close the tab. N retries leave N tabs that are not used.
- Correction: create the tab one time and keep its id for the retries, or close the tab in the
  `catch`.

### R3 — low (test) — the installed-state focus path is not tested

- Location: `analyze/analyze-skills.page.spec.ts:465` (`['cancel', 'partial', 'throw']`) and `:510`.
- Scenario: the `success: scenario === 'navigation'` branch at `:510` is dead code. No test asserts
  that focus goes to `[data-testid="guidance-continue"]` after a navigation failure in the
  installed state (`analyze-skills.page.ts:405`). The retry test `:527-577` does not check focus.
- Correction: add a `navigation` case to the table that expects the `guidance-continue` button as
  `document.activeElement`, or remove the dead branch.

## Information (no change necessary)

- In the team builder, Back (`team-builder-start.page.html:100`) followed by "Review skills" calls
  `loadReview()`. That call clears `skillsInstalled` (`team-builder-start.page.ts:145`) and the
  selection. The user can then select and install the same skills again. This is a new review that
  the user starts, not an automatic retry.
- The primary labels come from the unchanged `proposal/skill-selection-rail.component.ts:97-98`.
  Each label is one string. The new strings in the changed files are contiguous. The changed
  launch status uses `…` (`team-builder-start.page.ts:141`). "Installing skills..."
  (`team-builder-start.page.html:107`) was there before this correction and is outside this scope.

## Checks

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <analyze-skills.page.spec.ts> <team-builder-start.page.spec.ts>`:
  exit 0, 2 suites, 39 tests passed (`.ptah/tmp/round3-review-jest.log`).

## Not checked

- No rendered check in Electron. N1 and R1 come from the code and from the `<dialog>`/`inert`
  focus rules.
- I did not check that Angular schedules a render when `afterNextRender` is the only change. Each
  call path also sets a signal, so a render occurs.
- I did not run `tsc`, `typecheck-templates`, `nx` or the full gate. The coordinator runs them.
- I did not review the shared components, the store or the backend again.
