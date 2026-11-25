# NG0103 fix report (Session inspector)

The fix follows `ng0103-investigation.md`, sections 4.1 and 4.2. Nothing was committed: the orchestrator commits.

## Files

- MODIFIED `libs/frontend/core/src/lib/services/wall-clock.service.ts`
  - `injectWallClock` now wraps `active` in `computed(active)`. Only a change of the boolean releases or re-acquires the clock.
  - The public signature is unchanged.
- MODIFIED `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts`
  - The cache gate is now a `computed` boolean, `cacheClockActive`.
  - It is passed as `injectWallClock('second', this.cacheClockActive)`.
- MODIFIED `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts`
  - New `cache` computed: `parseSessionStatsCache(snapshot()?.cache)`, using the structural equality `sameSessionStatsCache` (ttl, lastRequestAt, expiresAt, idleCompactAt).
  - `inputs` now uses `cache()`. A plan-limit clock tick, or a new snapshot with an equal cache, keeps the same object.
  - The local type `SessionStatsCache` is derived from `SessionStatsEntry['cache']`, the same way the shared lib derives it, because shared does not export it.
- MODIFIED `libs/frontend/core/src/lib/services/wall-clock.service.spec.ts`
  - New test: "does not re-acquire when active() reads the clock, on its own write or on a tick".
- MODIFIED `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.spec.ts`
  - New test: "does not re-acquire the clock for a new but equal cache or on a tick".
  - It also checks that the countdown still moves (5:00 to 4:59) and that the clock is released at expiry.
- MODIFIED `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.spec.ts`
  - New test: "keeps the inputs().cache object across a plan-limit clock tick".
  - It also covers an equal cache in a new snapshot (same object) and a changed cache (new object).
  - The plan-limits `describe` now uses `limitsNow` and `mainSnapshot` signals. The existing tests in it are unchanged.

## Other `injectWallClock` callers

I grepped all callers: 24 sites across canvas, chat, chat-streaming, chat-ui, command-center, git-ui, memory-curator-ui and workspace-indexing.

- Every `active` callback is a pure boolean predicate over signals.
- The `computed` tracks the same dependencies, so acquire and release still follow every true/false change.
- Before the change, a re-run that stayed `true` only released and re-acquired. That re-acquire refreshed `now` (and `coarse`) a little early.
- Now `now` keeps ticking on the held interval instead. This is the same behaviour as the newer `injectClock` and `injectPtahClock`.
- The one place where a value can change while the gate stays true is `system-prompt-drawer`, where `regenerationStartedAt` can change from one non-null value to another. Its elapsed time is clamped with `Math.max(0, …)`, so it stays correct.

## Harness (`ng0103sim/sim2.mjs`, Angular 22.2.7, 4 s per case)

| Case | `acquire` calls | NG0103 |
| --- | --- | --- |
| Before: lambda `active` + new `cache` per tick (`lambda 1 1`) | 813 | 4 |
| Fix 4.1 alone: computed gate (`computed 1 1`) | 1 | 0 |
| Fix 4.2 alone: stable cache (`lambda 1 0`) | 10 | 0 |
| Both fixes (`computed 1 0`) | 1 | 0 |

The harness models the code's shape and does not import repo source.

## Tests (focused jest)

- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/wall-clock.service.spec.ts`
  - Result: 8/8 passed.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --moduleNameMapper='{"^marked$":"D:/projects/PtahCode/node_modules/marked/lib/marked.umd.js"}' --runTestsByPath <agents-section spec> <session-stats-source spec>`
  - Result: 2 suites, 67/67 passed.
- Red check: I temporarily put the three source files back to their `HEAD` versions, ran the same specs, then restored my versions (confirmed with `cmp`).
  - core: 1 failed (the new test: expected 1 `acquire`, received 3).
  - chat: 2 failed (agents section: 1 call expected, 3 received; stats source: "serializes to the same string", which means a new object).

## Other checks

- `npx eslint` on the 6 changed files: 0 errors.
  - 3 `no-non-null-assertion` warnings at lines 547, 575 and 610 of the agents-section spec. Those lines already existed and are not mine.
  - `enforce-module-boundaries` was skipped because there is no cached project graph.
- `check-degradation.ts`: TOTAL 0 unsuppressed sites.
- `check-ui-classes.ts`: 0 over baseline. It reports an unrelated baseline decrease in `local-tts-panel`; I did not update the baseline.
- I did not run `verify`, nx, typecheck, typecheck-templates or any build, as the user asked. CI covers these. No template was changed.

## Decisions

- I kept `injectWallClock` in the agents section and passed it the computed gate, instead of switching to `injectClock` as the diff sketch did.
  - Options: `injectClock(this.cacheClockActive)` or `injectWallClock('second', this.cacheClockActive)`.
  - Evidence: with 'second', both acquire the same `ClockService`. The spec suite mocks `WallClockService`, and the existing clock test spies on `WallClockService.acquire`.
  - Reversible: yes.
