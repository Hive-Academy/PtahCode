# PR1 independent logic review (timer adoption, batch 1)

Scope: the uncommitted diff in this worktree (17 files). Read-only review. I formed the view
below before I read `pr1-*-result.md`. Line numbers refer to the working-copy files.

**Verdict: FIX** (2 major, 5 minor). Score 5/10: the timestamp derivation and the agent-card
freeze are correct, but the store clock lifecycle has a real regression for consumers that do
not register a scope, and the plan-limit countdown shows wrong text for a passed reset.

## Findings

### M1 (major): the store releases the shared clock while scope-less readers still render
`libs/frontend/core/src/lib/services/plan-limits.store.ts:159` calls `stopClock()` when
`surfaceScopes.size === 0`. But `startClock()` runs in every `loadOnce()` (line 207), and
several readers call `load()` and read `now()` WITHOUT `registerScope()`:
- `libs/frontend/chat/src/lib/services/vitals/usage-vitals.view.ts:81-89` (`injectVitalsTick`,
  used by `chat-vitals.store.ts:73` and `welcome-vitals.store.ts:96`)
- `libs/frontend/dashboard/.../provider-account-card.component.ts:205`

Failure sequence: welcome vitals load (store acquires) -> chat view registers a scope -> chat
view closes (size 0, store releases) -> welcome vitals still show "resets in ..." text that
reads `planLimits.now()`, but nothing holds the clock. The text freezes until something else
acquires the clock or a new consumer injects `injectVitalsTick` (its stall check runs only at
injection time). The old code never stopped the 30 s interval (root store), so this is a
regression. Fix options: keep the coarse hold for the store lifetime (simplest, same cost as
before), or count the scope-less readers as holders (for example `injectVitalsTick` calls
`injectClock(undefined, 'coarse')`). The new spec (`plan-limits.store.spec.ts`) tests only
the registered-surface path.

### M2 (major): a passed reset shows "Resets in 0s" and announces "Expired"
`plan-limit-tile.component.ts:179-181` and `:291-293` render the countdown for any defined
`resetsAt`. `plan-limit-tiles.ts:320` copies `entry.window.resetsAt` with no check against
`ctx.now`. A passed `resetsAt` is a normal state here: `plainReset` (`plan-limit-tiles.ts:492-494`)
prints `reset <time> passed`, and the `reset-usage-unknown` and `aged` states exist for it.
The tile then shows both `reset 14:00 passed` and `Resets in 0s`. `ptah-countdown` also goes
to `expired` at first render and its polite live region announces `Expired`. A reset that is
not a deadline the user waits for must not read "Expired". Fix: emit `resetsAt` only when
`resetsAt > ctx.now` and the state is one that shows a future reset (for example not
`reset-usage-unknown`), or hide the countdown when its state is `expired` (listen to
`(expired)` or compare in the view model on each tick).

### m1 (minor): two different reset times can show on one tile
For `limit-reached`, `windowResetLine` uses `activeWindowExhaustion(window, ctx.now)?.resetsAt`
(`plan-limit-tiles.ts:499-503`), but the countdown uses `window.resetsAt` (line 320). When the
exhaustion evidence has its own reset, the line and the countdown disagree. Use the same
instant that the reset line uses. Also the countdown repeats the relative part that
`withRelative` already prints in `resetLine` (two "resets in" texts on one tile). Confirm with
the design owner that the duplicate is intended.

### m2 (minor): a11y label repeats the visible prefix
`plan-limit-tile.component.ts:180` and `:292` put the visible text `Resets in` before the
countdown AND set `label="Resets in"`. The host has `role="timer"` with `aria-label`, so a
screen reader reads "Resets in, timer, Resets in, 2h 15m". Drop one of the two (for example
mark the visible prefix `aria-hidden="true"`). The owner title reads `Ends <absolute time>`,
which is acceptable for a reset, but it is a wording point for the owner, not this batch.

### m3 (minor): plan-limit readers now recompute every second while any second-holder runs
`PlanLimitsStore.now` is now `ClockService.now` (`plan-limits.store.ts:99`). That signal ticks
at 1 s whenever any `ptah-timer` / `ptah-countdown` holds the clock, and each tile countdown
itself holds a 1 s clock (`PTAH_CLOCK.acquire()` has no granularity). So every
`planLimits.now()` reader (session stats, vitals, dashboard cards) rebuilds its view model
every second while a tile with a reset is visible or a lane runs. The old cadence was 30 s.
Values stay correct (derived from timestamps), so this is cost, not a defect. The file
comment at lines 25-27 ("at its coarse 30 s cadence") is now inaccurate. Report the missing
`granularity` on `PtahClock` as an owner gap, or derive a 30 s bucket for the store.

### m4 (minor): a fresh snapshot can be read with a `now` up to 30 s old
The diff removed `this._now.set(Date.now())` from snapshot apply (old lines ~285 and ~299).
`ClockService` refreshes `now` only on tick, acquire and visibility return. For up to 30 s after
a push, a reset that already passed can still classify as `limit-reached`, and an
`observedAt` newer than `now` gives a negative age. The stale-after-hidden case is handled:
`ClockService.visibilityChanged` sets `now` on return. Recommend a brief acquire/release (or a
public "touch" on the owner) on apply, or accept and document.

### m5 (minor): agent-card header loses right alignment when no timer renders
`agent-card-header.component.ts:175-183`. The old span was always present and carried
`ml-auto` for a non-running lane without `cliSessionId`, even when its text was empty. Now no
element renders when `timerEndedAt()` is `undefined` (non-running, no `completedAt`). The
close button and the session badge then lose their push to the right. `agent-monitor.store.ts`
sets `completedAt` for terminal statuses through `isTerminal(...)`, so this case is rare
(restored records, statuses outside `isTerminal`). Fix: render an empty
`<span class="ml-auto">` in an `@else` branch.

## Checks with no defect

- Agent timer states (`agent-card-header.component.ts:243-250`): running -> `endedAt=null`,
  live and holds the clock; completed with finite `completedAt` -> frozen, clock released;
  missing or NaN `completedAt` -> no timer (old text was also empty); aborted/error with
  `completedAt` -> frozen. `startedAt` NaN -> no timer. `startedAt` 0 while running shows a
  very large elapsed value, same as the old code (not a regression).
- Old behavior returned no text for a negative span (`completedAt < startedAt` or clock skew);
  the owner clamps to `0s`. This is a visible change the result file did not list; add it.
- Visible text changes listed in `pr1-agent-card-result.md` match the owner format:
  `5m 03s` -> `5m 3s`, `1h 02m` -> `1h 2m`, `0s` under one second, days above 24 h.
- `ptah-timer` keeps `role="timer"` with `aria-live="off"`. The polite region says `Stopped`
  once. Silent ticks hold.
- Epoch units: `PlanLimitWindow.resetsAt` is epoch ms (`plainReset` compares it to `ctx.now`,
  which is `Date.now()` based). `ptah-countdown` takes ms. Correct. `resetsAt` undefined: the
  spread at `plan-limit-tiles.ts:320` omits the key and the template guard hides the line.
- Clock holder balance in the store: `startClock` is idempotent (`clockRelease !== null`),
  `stopClock` nulls the handle, the store `DestroyRef` calls `stopClock` (line 128-131),
  and `ClockService` release is idempotent. No leak and no double release. Visibility pause
  belongs to `ClockService` (`visibilityChanged`) and applies to the store too.
- `PTAH_CLOCK` is provided as `useExisting: ClockService` in `app.config.ts:199`,
  `display-window.config.ts:60` and `git-window.config.ts`. Specs that mount the components
  now provide a fake.
- DOM and test ids: no `data-testid` removed or renamed. The plan tile adds one new `span`
  per layout. The agent-card elapsed span had no test id.
- Module boundaries: `chat-ui` and `chat` (`type:feature`) import `@ptah-extension/ui`
  (`type:ui`), which is allowed. `core` imports only its own `clock.service`. No `type:core`
  -> `type:ui` import.
- Agent role names: `git diff | grep '^+'` for the specialist role names returned no match.
- Owner files under `libs/frontend/ui/src/lib/time/*` and `clock.service.ts` are unchanged.

## Verification evidence (from result files, not re-run)

- core: 58/58 suites, 1763/1763 tests passed. chat-ui focused: 10/10 suites, 207/207 tests.
  chat focused: 18/18 suites, 327/327 tests. `typecheck-templates` passed.
- Open: chat-ui full run had 15 suites that could not load `marked` (missing worktree
  `node_modules`), and chat had `WorkspaceCoordinatorService` failures. Neither was proven to
  fail on `origin/main`. The M1 path has no test. The M2 path (past `resetsAt`) has no test.

## Decisions

- Rated M1 major, not blocker: the values recover on the next acquire, tab return or new
  vitals mount, but a visible surface can show frozen reset text indefinitely in between.
- Rated M2 major: wrong user-visible text and a wrong screen-reader announcement on a state
  that the plan-limit code treats as normal.
