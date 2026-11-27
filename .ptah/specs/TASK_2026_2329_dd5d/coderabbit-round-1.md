# CodeRabbit round 1 — PR #1525

All 7 inline findings were checked against the current code. All 7 are valid and fixed.

| # | Comment | File | Verdict |
|---|---------|------|---------|
| 1 | 4720471755 | agent-sdk `structured-decision.adapter.ts:317` | valid, fixed |
| 2 | 4720471766 | cli-agent-runtime `skills-sh-api-client.ts:206` | valid, fixed |
| 3 | 4720471776 | onboarding `analyze-workspace.page.ts:794` | valid, fixed |
| 4 | 4720471783 | onboarding `analyze-workspace.page.ts:820` (+ `onboarding-resume.store.ts`) | valid, fixed |
| 5 | 4720471793 | setup-wizard `wizard-analysis-runner.service.ts:370` | valid, fixed |
| 6 | 4720471800 | setup-wizard `wizard-analysis-runner.service.ts:438` | valid, fixed |
| 7 | 4720471808 | setup-wizard `wizard-analysis-runner.service.ts:651` | valid, fixed |

## 1. Bound the fallback object scanner
- Confirmed: every restart at the next `{` rescans the rest of the text, so the work is quadratic.
- Change: `extractJsonObject` now has a work budget of `max(65 536, 8 × length)` character visits. Each
  JSON.parse of a candidate also counts against it. The function returns `null` once the budget runs out,
  and the result is `bad-output`. The raw and fenced paths did not change.
- Spec: `structured-decision.adapter.spec.ts`, "bounds the balanced-object fallback ...". It sends
  32 768 `{` followed by `}`. The old code accepted the trailing `{}`; the test expects `bad-output` in under 1 s.

## 2. One sorted pool for every search page
- Confirmed: `searchPage` fetched `offset+limit+1` rows and sorted each pool by installs. Pools of
  different sizes produced overlapping pages and gaps.
- Change: `searchPage` now always fetches the fixed 200-row upstream pool, sorts it once (it is cached
  under one key) and slices the window. `total` is known when the pool comes back with fewer than
  200 rows. `limitedByUpstream` is set when `offset+limit >= 200`. `search()` (top-N, never paged) is unchanged.
- Spec: `skills-sh-api-client.spec.ts`, new test "pages a prefix-stable but unsorted upstream without
  duplicates or gaps". It uses the reviewer's A/B/C/D/E case and expects `C,E,A,B,D`. The over-fetch test
  was updated to expect `limit=200` and the now-known total.

## 3. A saved selection is not a settled local run
- Confirmed: `loadSaved()` selects `?analysis=X` before discovery, so the
  `!hadLoaded && store.loaded() !== null` clause made `localRunSettled` true and the page skipped the
  active backend run.
- Change: that clause and `hadLoaded` are removed. Settlement is detected only by a change in the run
  generation or a new live result (`hasResult`). The store's live `loaded()` comes from that same result.
- Spec: `analyze-workspace.page.spec.ts`, "[CR3] reconnects an active backend run even when ?analysis= ...".

## 4. Adopt a finished analysis before tracking stops (page + resume store)
- Confirmed: the page and `OnboardingResumeStore.refresh()` called `syncBackendActive(false)` and dropped
  the reply's analysis.
- Change: `syncBackendActive(false, { analysis })` now adopts a completed or failed analysis when the
  runner was tracking a backend run. It uses the same workspace check and `multiPhaseResult` guard as the
  poll, which now uses the same path. The page and the store pass `resumable.analysis`. The case where the
  reply carries no analysis is covered by finding 5. Not changed: Home still creates no resume item for
  a completed analysis, because a completed analysis has nothing to resume.
- Specs: runner "[CR4] adopts the finished analysis passed to syncBackendActive(false)". The page and
  resume-store assertions now expect `(false, { analysis: null })`.

## 5. Load the completed result when backend activity ends
- Confirmed: `findLatestResumableRun` skips a completed run that has no unfinished generation, so the
  reply is `analysis: null, analysisActive: false` and the wizard stored nothing.
- Change: when the reply has no analysis, the runner calls `listAnalyses()` (newest first), picks the
  newest entry that is not active, and loads it only when it is completed. The load is guarded by run
  token, not running, not backend-active, no stored result, and the watched workspace being the current
  one. After that it applies the same workspace and lifecycle checks before adoption.
  Known limit: the newest saved analysis is taken as the finished run. The reply identifies no slug.
- Spec: runner "[CR5] loads the newest saved completed analysis when backend activity ends with analysis: null".

## 6. Retry path after polling stops
- Confirmed: after 5 errors the watcher stopped but `_backendActive` stayed true, and `retry()` and
  `launchAfterDiscovery()` could not restart it. The page stayed on "running".
- Change: on the 5th error the runner sets `backendStatusUnknown`, clears `_backendActive` (so the page
  shows the failed panel), keeps the watched workspace, and publishes a recoverable error. `retry()`
  re-checks with `getResumableRun()`:
  - active: restart the bounded watcher and clear the error
  - inactive: adopt the result (findings 4 and 5)
  - still unknown: keep the error
  It never calls `deepAnalyze`. The page's `retry()` sends the call to `runner.retry()` while the status
  is unknown, not to `resumeAnalysis()`. `reset()` and `run()` clear the flag.
- Specs: runner "[CR6] retry after lost polling re-checks the backend ..." and page "[CR6] retry re-checks
  a lost backend run instead of resuming it". Runner "[N2]" now expects `backendActive` false, the
  unknown flag, and the error.

## 7. Scope the cached result to the requested workspace
- Confirmed: the `run()` cache check accepted a stored result from any workspace.
- Change: the cached result is reused only when its recorded result workspace equals the requested
  workspace. A legacy result with no recorded workspace is reused only when its `analysisDir` is inside
  the requested workspace. Callers that pass no workspace behave as before.
- Specs: runner "[CR7] does not reuse a cached result that belongs to another workspace" and
  "[CR7] reuses a cached result for the same workspace".

## Checks (focused, per CLAUDE.md lane rules)
- `npx jest --runInBand --coverage=false --runTestsByPath`:
  - agent-sdk `structured-decision.adapter.spec.ts`: 15/15 passed
  - cli-agent-runtime `skills-sh-api-client.spec.ts`: 24/24 passed
  - setup-wizard `wizard-analysis-runner.service.spec.ts`: 37/37 passed
  - onboarding `analyze-workspace.page.spec.ts` + `onboarding-resume.store.spec.ts`: 48/48 passed
  - `analyze-workspace.render.spec.ts`: passed in the earlier run of 66/66
- `npx tsc --noEmit`:
  - `tsconfig.lib.json` of all four projects: clean
  - agent-sdk and cli-agent-runtime `tsconfig.spec.json`: clean
  - onboarding `tsconfig.spec.json`: 16 errors, the same count as the stashed baseline. They are in
    other spec files (and the existing `.click` errors at page spec lines ~1036/1056); none come from this change.
  - setup-wizard `tsconfig.spec.json`: 14 baseline errors, all in `generation-run-event-adapter.spec.ts`.
- `npx eslint <changed files>`: 0 errors. 4 warnings, all on lines this change did not touch (max-lines, member accessibility).
- Not run, per instructions: `npm run verify`, nx, `typecheck-templates` (no template change).
