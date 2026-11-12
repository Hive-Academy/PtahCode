# Review: TASK_2026_975_b61e core (ClockService, wrappers, app provider, gallery)

Reviewer: independent lane R (read-only). Scope: uncommitted diff of
`libs/frontend/core/src/lib/services/{clock,wall-clock}.service.ts` + specs, `services/index.ts`,
`libs/frontend/machines-ui/src/lib/services/countdown-clock.ts`,
`apps/ptah-extension-webview/src/app/app.config.ts`, `ui-gallery.component.ts` + spec,
`ui-gallery/gallery-timers-family.component.ts`. Contract: `api-contract.md` section core, `context.md`.

Verification: `npm run verify -- -t test -p core` exit 0 (Nx cache hit for the current inputs,
so the current specs pass). I did not run machines-ui or webview tests (out of the allowed command).

## Contract checklist

| Criterion | Result | Evidence |
|---|---|---|
| One 1 s `setInterval`, outside zone | PASS | `clock.service.ts:46-50` (`runOutsideAngular`, guard `interval !== null`) |
| Interval only while holders > 0 and visible | PASS | `start()` guard `clock.service.ts:47` |
| `visibilitychange` listener only while holders > 0 | PASS | add on `holders++ === 0` (`:31`), remove on last release (`:39-42`) and on destroy (`:23-27`) |
| Hidden clears, visible sets now at once and restarts | PASS | `clock.service.ts:14-20` |
| No double interval on hide/show races | PASS | `start()` is idempotent (`interval !== null`), `stop()` nulls the handle. Repeated `visible` events or acquire-while-visible cannot start a second interval. Acquire while hidden adds no interval, the listener starts it on `visible`. |
| Acquire refreshes now | PASS | `clock.service.ts:32` |
| Release idempotent, safe after root destroy | PASS | `released` flag plus `holders === 0` guard (`:36-38`) |
| core does not import `@ptah-extension/ui` | PASS | no `ui` import in core. The app is the composition root (`app.config.ts:49,199`). |
| `WallClockService` public API kept | PASS | `now(cadence)`, `acquire(cadence)`, `injectWallClock`, `WallClockCadence`, `WALL_CLOCK_COARSE_MS` exported unchanged (`services/index.ts:3`) |
| `CountdownClock` public API kept | PASS | `now`, `acquire()` kept. The one caller (`remote-approval-block.component.ts:223,328-330`) reads only signals. |
| Coarse cadence keeps old semantics | PARTIAL | value type and "changes at most every 30 s" kept. Freshness at acquire lost (M1). Wake-up rate changed (m1). |
| PTAH_CLOCK wired in the Electron root | PASS for the main window | `app.config.ts:199`. Other renderer roots do not provide it (m2). |
| Gallery: one section per variant/state, stable samples, additive registry edit | PASS | 8 sections, 8 registry links, sample times fixed at construction |

## Callers checked

`grep` for `WallClockService|injectWallClock|CountdownClock|WALL_CLOCK_COARSE_MS`: 27 call sites in
canvas, chat, chat-streaming, chat-ui, command-center, git-ui, machines-ui, memory-curator-ui,
workspace-indexing. All use `injectWallClock(cadence[, active])`, `WallClockService.now('second')`,
`CountdownClock.now/acquire`, or `WALL_CLOCK_COARSE_MS` as a number. No caller uses a removed member.
`system-prompt-drawer.component.ts:398-404` compares `tick - last >= WALL_CLOCK_COARSE_MS`. The new
coarse computed changes only when the delta is >= 30 000 ms, so this check still fires on each coarse change.

## Zone and change detection

The old `WallClockService` already set its signals from intervals outside the Angular zone, so
the `injectWallClock` callers see no change. Angular 22 (`package.json:74`) schedules change
detection from signal notifications in both zoneless and zone (hybrid scheduling) modes, and
`app.config.ts:193-195` does not set `ignoreChangesOutsideZone`. OnPush templates that read the
signals still refresh.

The old `CountdownClock` ran its interval inside the zone (`setInterval` with no
`runOutsideAngular`), which caused a zone tick every second. The new one ticks outside the zone.
`remote-approval-block` reads `now` only through `computed`/template signals, so it still refreshes.
This removes a 1 Hz zone tick, which is an improvement. The new countdown also pauses while the window is hidden.
The block has no effect that must fire at expiry while hidden. `expired()` is recomputed from a fresh
`now` at once on `visible`, so the display is correct.

## Findings

### M1 (major): coarse cadence is no longer fresh at acquire

- File: `libs/frontend/core/src/lib/services/wall-clock.service.ts:11-18,24-26`
- Evidence: the old `acquire(cadence)` did `ticks[cadence].set(Date.now())`, so a new coarse
  consumer always started from the current time. The new `acquire` refreshes only
  `ClockService.now`. The coarse computed keeps `coarseValue` until `current - coarseValue >= 30 000`.
  A component that mounts 29 s after the last coarse change reads a value 29 s old. Events that
  arrived in that window have `timestamp > coarseNow`. Relative labels ("just now", "x ago") can then show a
  negative or "future" delta on first render. Examples: `resume-notification-banner.component.ts:122`,
  `electron-welcome.component.ts:282`, `workspace-loading-state.component.ts:269`,
  `ambient-account-row.component.ts:119`, `agent-delivery.store.ts:287`. The same applies on
  `visible`: the old code refreshed coarse at once, the new code refreshes it only if the window
  was hidden for 30 s or more. The contract asks for freshness at acquire ("keep old semantics"), and the
  spec has no test for this case. The spec test at `wall-clock.service.spec.ts:69-89` asserts the
  stale value (`coarse` = 1 000 while `second` = 2 000) but always acquires at the anchor time.
- Fix: replace the side-effecting `computed` with a `linkedSignal` and reset it on a coarse acquire:

  ```ts
  private readonly coarse = linkedSignal<number, number>({
    source: this.clock.now,
    computation: (now, previous) =>
      previous && now >= previous.value && now - previous.value < WALL_CLOCK_COARSE_MS
        ? previous.value
        : now,
  });

  now(cadence: WallClockCadence): Signal<number> {
    return cadence === 'second' ? this.clock.now : this.coarse.asReadonly();
  }

  acquire(cadence: WallClockCadence): () => void {
    const release = this.clock.acquire();
    if (cadence === 'coarse') this.coarse.set(this.clock.now());
    return release;
  }
  ```

  To keep the old visible refresh too, add a `ClockService` "resumed" counter signal that the
  coarse `linkedSignal` reads as a second source. Otherwise, record in the contract that the coarse
  value can be up to 30 s stale after the window becomes visible again.
  Add spec cases: (a) acquire 'coarse' at t0 + 29 s gives `now('coarse')() === t0 + 29 s`,
  (b) clock moves backward resets coarse. This also removes the mutable field write inside
  `computed`, which is a side effect that Angular does not support in a computation.

### m1 (minor): coarse-only holders now wake the renderer every second

- File: `wall-clock.service.ts:24-26`, `clock.service.ts:46-50`
- Evidence: before, a 'coarse'-only holder ran a 30 s interval. Now every holder runs the 1 s
  interval. The coarse computed filters the value, but the producer notification still goes
  through the live computed to each template consumer. Each consumer then calls
  `markAncestorsForTraversal` and the scheduler runs an app tick every second. The tick finds no changed
  version and does not refresh the views. Unconditional coarse holders such as
  `command-center-page.controller.ts:69`, `workspace-indexing.component.ts:50`,
  `canvas-empty-board.component.ts:279` and `memory-diagnostics-accordion.component.ts:336` keep the
  renderer at 1 Hz while they are mounted. The contract asks for exactly one 1 s interval, so this is accepted
  behavior, but it is a cost regression in Electron while the window is idle.
- Fix: no code change is necessary for the contract. Record the trade-off in the PR body. If idle CPU
  matters, a later task can move long-lived coarse callers to `injectWallClock('coarse', active)`
  with a narrower `active`.

### m2 (minor): other Electron renderer roots do not provide PTAH_CLOCK

- File: `apps/ptah-extension-webview/src/app/display-window/display-window.config.ts:59`,
  `apps/ptah-extension-webview/src/app/git-window/git-window.config.ts:71`
- Evidence: `PTAH_CLOCK` has no default factory (`libs/frontend/ui/src/lib/time/clock.token.ts:24-25`).
  Only `app.config.ts:199` provides it. No component in these windows uses `ptah-timer`,
  `ptah-countdown` or `ptah-relative-time` today. The T2+ adoption tasks will add those owners to
  shared libraries, for example git-ui, and those owners can render in the git window. They will then
  throw `NullInjectorError` at runtime, and the unit tests will not detect it because specs provide a fake clock.
- Fix: add `{ provide: PTAH_CLOCK, useExisting: ClockService }` to both window configs now, or
  record this as a required step in the adoption plan.

### m3 (minor): spec gaps

- `clock.service.spec.ts`: no test that a `visible` event with zero holders does nothing.
  This case cannot occur because the listener is removed, but a test locks the removal. There is no test
  that a second `visible` event while visible keeps one interval, and no test for release after root
  destroy (`TestBed.resetTestingModule()` then `release()` must not throw or make `holders` negative).
  No test covers `injectClock` (both forms), and no test checks that the `active` computed does not
  re-acquire on unrelated ticks.
- `countdown-clock.spec.ts` is unchanged. It still passes against the wrapper by design.
  It has no test for the new behavior (pause while hidden). It does not provide a
  `DOCUMENT` mock, so it depends on the jsdom `document.hidden === false`. This is acceptable.
- Fix: add the cases above to `clock.service.spec.ts` and add one hidden case to `countdown-clock.spec.ts`.

### n1 (nit): `CountdownClock` keeps a `Set` of releases only for its own destroy

- File: `countdown-clock.ts:8-17`
- Evidence: both services are `providedIn: 'root'` and share the same injector. `ClockService`
  already clears its interval and listener on destroy, and its releases are safe after destroy.
  The `Set` and the `DestroyRef` hook add state with no observable effect.
- Fix: optional. Reduce `acquire()` to `return this.clock.acquire();`. Keep the `Set` only if a
  spec depends on it. The current spec "stops its interval when its injector is destroyed" passes
  through `ClockService`'s own destroy hook.

### n2 (nit): `injectClock` duplicates `injectPtahClock`

- File: `clock.service.ts:61-73` vs `libs/frontend/ui/src/lib/time/clock.token.ts:32-45`
- Evidence: the bodies are identical. This is necessary because of D1 (core cannot import ui).
- Fix: none. A one-line comment that cross-references the other function helps keep the two in sync.

### n3 (nit): gallery spec configures PTAH_CLOCK in a file-level `beforeEach`

- File: `ui-gallery.component.spec.ts:8-10`
- Evidence: the hook is outside the `describe` block and uses the real `ClockService`, so the
  spec runs a real 1 s interval with the jsdom document. It works because other
  `configureTestingModule` calls merge providers. A fake clock is more deterministic and does not leave a timer.
- Fix: use the fake clock provider from `libs/frontend/ui/src/lib/time/fake-ptah-clock.ts` if it is
  exported, inside the `describe` block.

## Gallery

- `gallery-timers-family.component.ts:12-35`: 8 sections: timer running, frozen, compact;
  countdown running, urgent, expired; relative past, future. The IDs match the 8 new registry
  links in `ui-gallery.component.ts`. The registry edit, imports and template are additive only.
- `:39-46`: sample times are fixed once at construction. The urgent sample (12 h left,
  `urgentBelowMs` 24 h) stays urgent for 12 h. The expired sample stays expired. The running
  sample (7 days) stays non-urgent under the default threshold. The states are stable.
- No raw colors or ad-hoc classes. Only `ptah-gallery-section` and the owner components are used.
- Section title `"Timer: compact format"` (`:18`) differs from the registry label
  `"Timer: compact"`. This is cosmetic. Make them the same if the gallery spec compares them.

## Verdict

**APPROVE WITH CHANGES.** The `ClockService` core meets every contract rule (one interval outside the zone,
holder and visibility gating, no double-interval race, idempotent release, no core-to-ui import), and
no public API changed. Fix M1 before the push: the coarse cadence lost freshness at acquire, which
the contract explicitly keeps. Add a spec for it. m1 to m3 can go in the PR or be recorded as follow-ups.
