# Lane B fixes for review-ui.md

Status: done. Not committed (per brief). Changes only in `libs/frontend/ui/src/lib/time/**`.

## Changes

1. Clock holders for invalid inputs (finding 1, major)
   - `timer.component.ts`: `injectPtahClock` active = `state() === 'running'` AND
     `Number.isFinite(toEpochMs(startedAt()))`.
   - `relative-time.component.ts`: `injectPtahClock` active = `Number.isFinite(toEpochMs(value()))`
     (was: held for the whole lifetime).
   - Specs: `timer.component.spec.ts` "holds no clock for an invalid start and holds it again once
     the start is valid"; `relative-time.component.spec.ts` "holds no clock for an invalid value and
     holds it once the value is valid". Both assert holders 0 -> 1 and the recovered text.
2. Countdown live region changes only on a state change (finding 2, minor)
   - `countdown.component.ts`: `liveText` reads `urgentBelowMs` inside `untracked`, so the text is
     captured when the state enters `urgent`. A threshold change while already urgent recomputes
     `state` to the same value, so `liveText` does not recompute.
   - Spec: `countdown.component.spec.ts` "keeps the urgent announcement when urgentBelowMs changes
     while urgent" (60 s -> 120 s, text stays "Less than 1m left").
3. Time-zone semantics of strings (finding 3, minor)
   - `time-input.ts`: JSDoc on `toEpochMs` says a date-time string without `Z` or a numeric
     offset is parsed as local time (`Date.parse` semantics). Pass `Z` or an offset for a
     host-independent instant.
   - Spec: `format-relative.spec.ts` "pins an explicit Z string to its UTC epoch value on any
     host" (`'2026-01-10T12:00:00Z'` and `'2026-01-10T14:00:00+02:00'` -> same epoch ms).

## Verify

`npm run verify -- -p ui`: lint + typecheck 2/2 succeeded, test 1/1 succeeded, exit code 0.
