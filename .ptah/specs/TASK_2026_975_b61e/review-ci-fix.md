# Review: Lane A CI clock fix (uncommitted diff)

Reviewer: independent, read-only. No source file was edited.

Scope: `git diff` of `libs/frontend/core/src/lib/services/clock.service.ts`, `clock.service.spec.ts`,
`wall-clock.service.ts`, `wall-clock.service.spec.ts`, `index.ts`.

## Verdict

**APPROVE.** The logic meets the stated contract. No blocker and no medium finding.
Three low findings and two info notes follow. None of them blocks the CI fix.

## Contract check

| Requirement | Result | Evidence |
|---|---|---|
| At most one interval | Pass | `syncInterval()` calls `stop()` before each `setInterval` (`clock.service.ts:61-69`). `interval` and `intervalDelay` change together. |
| 1000 ms while any second holder exists | Pass | `delay` expression, `clock.service.ts:62`. |
| 30_000 ms while only coarse holders exist | Pass | Same line. `CLOCK_COARSE_MS = 30_000`. |
| No interval at zero holders or while hidden | Pass | `delay === null` path. `visibilityChanged` calls `stop()` when hidden. |
| Delay switches when the holder mix changes | Pass | `acquire` and `release` both call `syncInterval()`. Equal delay is a no-op, so a second holder that joins a second holder does not restart the interval. |
| `now = Date.now()` on acquire, tick, and return to visible | Pass | `clock.service.ts:20-24`, `:42`, interval callback. |
| Release is idempotent per handle and per granularity | Pass | `released` flag per closure. Per-granularity zero guards prevent negative counts. |
| `PtahClock.acquire()` with no argument is the 1 s path | Pass | Default `granularity = 'second'`. `libs/frontend/ui/src/lib/time/clock.token.ts:21,38,42` calls `acquire()` with no argument. |
| Visibility listener is not leaked | Pass | Added when the total goes 0 to 1, removed when it goes 1 to 0, and removed on `DestroyRef` when the total is not 0. |
| Hidden to visible with a mixed holder set | Pass | `stop()` sets `intervalDelay = null`, so `syncInterval()` always starts the correct delay on return. The new spec "pauses coarse and second intervals while hidden" covers this. |

## Consumer specs (read, not edited)

All six consumer components use `injectWallClock('coarse', ...)` only. No component or child in
these test beds acquires a second holder. The first and only `setInterval` call therefore has delay
30_000.

| Spec | Requirement | Result |
|---|---|---|
| `git-ui/.../stash-popover.component.spec.ts:245-296` | `findIndex` for delay 30_000, age moves after 30 s, `clearInterval(handle)` on destroy | Pass. The `active` path releases on destroy, count goes to 0, `stop()` clears the handle. |
| `git-ui/.../history-timeline.component.spec.ts:221-258` | Same pattern with `shown` input | Pass. |
| `chat/.../overview-tab.component.spec.ts:455-510` | `ageTimers` filters `ms === 30000`. Exactly one timer. No timer without a record. Clear when the record goes | Pass. Release when `shownCheck()` becomes null clears the handle. |
| `canvas/.../canvas-empty-board.component.spec.ts:97-124` | First returned interval is 30_000. Day stays `2026-10-30` at +29_999 ms. Day is `2026-10-31` at +30_000 ms | Pass. Start 23:59:45, acquire sets the coarse value to the start time. At +30_000 ms the tick sets now to 00:00:15. `now - previous = 30_000` is not `< 30_000`, so the linkedSignal takes the new value. No tick fires at +29_999 ms. |
| `workspace-indexing/.../workspace-indexing.component.spec.ts:377-395` | First returned interval is 30_000. Label holds at +29_999 ms and changes at +30_000 ms | Pass, same reasons as canvas. |
| `memory-curator-ui/.../memory-diagnostics-accordion.component.spec.ts:322-362` | `findIndex` 30_000, children read `now()` equal to `Date.now()` before and after one coarse tick | Pass. Children receive the parent coarse signal. They do not acquire their own clock. |

Note: Lane A reports that the chat and canvas suites cannot start in this worktree because
`node_modules/marked/lib/marked.umd.js` is missing. This review confirms them by reading only. CI
must give the final pass result for those two suites.

## Findings

### L1 (Low): WallClock coarse reading can lag up to about 60 s after the last second holder leaves

- File: `libs/frontend/core/src/lib/services/wall-clock.service.ts:15-21` together with
  `clock.service.ts:57` (release path).
- Evidence: While a second holder exists, `ClockService.now` ticks every 1 s and the coarse
  linkedSignal moves only when 30 s have elapsed. Thus at release time R the coarse value can be
  up to about 29 s old. The new coarse interval starts at R, so the next tick is at R + 30 s. Between
  those times, the coarse reading can be up to about 59 s old. A coarse display such as "Xm ago" can
  lag by up to one extra step during this transition. The same compound lag already applies after
  hidden to visible, and the class comment documents it.
- Fix (optional): Accept and extend the class comment to include the cadence switch. Alternatively,
  in `WallClockService`, refresh the coarse value when the cadence returns to coarse-only. This
  needs a hook from `ClockService` and is not necessary for this CI fix.

### L2 (Low): The coarse filter threshold equals the tick period

- File: `wall-clock.service.ts:18-19` (`now - previous.value < WALL_CLOCK_COARSE_MS`).
- Evidence: For a coarse-only holder the interval period is also 30_000 ms. If a real browser
  fires the interval 1 ms early, the filter holds the old value for one more period (60 s). Fake
  timers never fire early, so the specs do not show this. Chromium usually fires late, not early,
  so the real risk is small.
- Fix (optional): Use a small tolerance, for example `< WALL_CLOCK_COARSE_MS - 1_000`. The canvas and
  workspace-indexing specs still pass with this tolerance because no tick occurs before +30_000 ms.
  In the mixed case the coarse value then moves at 29 s instead of 30 s, which is acceptable.

### L3 (Low, pre-existing, not in this diff): `injectWallClock` does not wrap `active` in `computed`

- File: `wall-clock.service.ts:40-43`. Compare `clock.service.ts:83-86`, which uses `computed(active)`.
- Evidence: `overview-tab.component.ts:281` passes `() => this.shownCheck() !== null`. When
  `shownCheck` changes from one record to another record, the effect runs again. It releases and
  acquires again. The count goes to 0 and back to 1, so the interval stops and starts again and the
  coarse value refreshes. The behavior is correct but it causes avoidable timer churn. The overview
  spec "runs no timer without a record" still passes.
- Fix (optional, separate change): Wrap `active` in `computed` the same as `injectClock`.

### I1 (Info): The changed backward-clock spec uses a negative epoch

- File: `wall-clock.service.spec.ts:125-127`.
- Evidence: `jest.setSystemTime(-50_000)` then one coarse tick gives `-20_000`. The change is
  correct: a coarse-only holder now ticks every 30 s, not every 1 s, so the old one-second check is
  no longer valid. The test still proves that a backward jump replaces the held value. A positive
  time below 31_000 (for example `5_000`, then expect `35_000`) would read more clearly. No change
  is required.

### I2 (Info): Acquire after root `DestroyRef` destruction

- File: `clock.service.ts:27-34`.
- Evidence: After destroy, the counts reset to 0. A later stale release returns early, which is
  correct. A new `acquire` on a destroyed root service adds a listener again. This occurs only at
  application teardown and is not a practical risk.

## Points checked and found correct

- Double intervals on switch: none. `stop()` runs before every new `setInterval`.
- Leaked listener: none in normal life cycle.
- Wrong delay after hidden to visible with a mixed set: none. The delay comes from the current counts.
- Negative counts: none. Per-granularity zero guards and the per-handle `released` flag prevent them.
- Coarse linkedSignal staleness: acquire of `'coarse'` refreshes it immediately. Remaining lag is
  described in L1 and L2.
- `index.ts` exports `CLOCK_COARSE_MS` and `ClockGranularity`. `WALL_CLOCK_COARSE_MS` keeps its value
  30_000 through `CLOCK_COARSE_MS`.
- New core specs: "uses one coarse interval and switches cadence" checks `jest.getTimerCount() === 1`
  after each switch and confirms each old handle is cleared. This directly proves the
  at-most-one-interval rule.

## Verification run by this reviewer

- `npm run verify -- -t test -p core`: 1 task succeeded (Nx cache hit for the current working-tree
  inputs), exit code 0.
- Consumer suites were not run by this reviewer (the task allowed only the core test target).
