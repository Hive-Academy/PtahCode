# Lane B result: ui `time` owners

Status: done. Not committed (per brief).

## Files

New, `libs/frontend/ui/src/lib/time/`:

- `clock.token.ts`: `PtahClock`, `PTAH_CLOCK` (no default factory), `injectPtahClock(active?)`.
- `time-input.ts`: `PtahTimeInput`, `toEpochMs` (NaN for invalid), plus `toIsoString` (null for invalid).
- `format-duration.ts`: `DurationStyle`, `formatDuration`, plus `toIsoDuration` ("PT75S").
- `format-relative.ts`: `formatRelative`, `formatAbsolute`.
- `timer.component.ts` (`ptah-timer`), `countdown.component.ts` (`ptah-countdown`),
  `relative-time.component.ts` (`ptah-relative-time`).
- `time.styles.ts`: `PTAH_TIME_STYLES`, `PTAH_COUNTDOWN_STYLES` (inline component styles, tokens only).
- `fake-ptah-clock.ts`: test double `FakePtahClock` (writable `time`, `holders`, `provide()`).
  Not exported from the barrel.
- `index.ts` and specs: `format-duration.spec.ts`, `format-relative.spec.ts`,
  `timer.component.spec.ts`, `countdown.component.spec.ts`, `relative-time.component.spec.ts`,
  `time-a11y.spec.ts`.

Changed:

- `libs/frontend/ui/src/index.ts`: added `export * from './lib/time';`.
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`: added `'time'` to `TOKEN_ONLY_DIRS`.

## Decisions

- `injectPtahClock(active)` wraps `active` in a `computed`, so a tick that does not change the
  boolean does not release and re-acquire. Same effect/onCleanup/untracked pattern as
  `injectWallClock`.
- Styles are inline (`styles: [...]`, emulated encapsulation), so the app `styles.css` needs no
  import. The live region uses a local `.ptah-time-live` visually hidden rule (rem, no px).
- Countdown tone: urgent `--ptah-state-warn`, expired `--ptah-state-err`. Color transition uses
  `--ptah-duration-fast`; under `prefers-reduced-motion: reduce` it is `transition: none;
  animation: none`. No keyframes.
- Countdown text rounds remaining up to the second ("0:01" until expiry, "0:00" = expired).
- `expired` fires once per deadline value, also when the deadline is past at first render and
  after a jump of `now` past the deadline. A new deadline value can fire again.
- Invalid deadline: text "--", state `running`, no clock hold, no emit. Invalid start: "--".
- Timer: `endedAt !== null` = frozen; frozen value does not read `now`. `datetime` is an ISO
  duration `PT<n>S`. Title "Started <abs>" / countdown "Ends <abs>".
- Additive exports beyond the contract: `toIsoString`, `toIsoDuration`, `PtahTimerState`,
  `PtahCountdownState`. All contract names are unchanged.

## Verify

`npm run verify -- -p ui`: lint + typecheck 2/2 succeeded, test 1/1 succeeded, exit code 0.
`typecheck-templates` for the webview was not run (no template change outside `ui`; Lane A owns
the gallery).
