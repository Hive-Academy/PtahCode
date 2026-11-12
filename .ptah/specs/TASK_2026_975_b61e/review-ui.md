# Independent UI review

## Findings

1. **Major — Invalid values keep unneeded clock holders.** `libs/frontend/ui/src/lib/time/timer.component.ts:41` and `relative-time.component.ts:21`. The timer acquires whenever `endedAt` is null, even if `startedAt` is invalid; the relative-time component always acquires, even when `value` is invalid. Both render `--` or empty text that cannot change on a tick, yet keep the shared interval alive until destruction. Countdown already guards invalid deadlines at `countdown.component.ts:51`. Make the timer's active predicate require a finite start time and make relative-time acquisition conditional on a finite value. Add holder assertions for invalid inputs and recovery when an input becomes valid.

2. **Minor — Polite announcement changes without a state change.** `libs/frontend/ui/src/lib/time/countdown.component.ts:76-80`. While `state()` remains `urgent`, changing `urgentBelowMs` from 60,000 to 120,000 changes the live text from “Less than 1m left” to “Less than 2m left.” That violates the acceptance rule that the polite region changes text only on a state change. Cache the announcement on entry to `urgent`, or define a distinct announcement state that includes the threshold and update the contract accordingly. Add a spec that changes the threshold while already urgent and observes the live region.

3. **Minor — Timezone-less strings produce host-dependent absolute times.** `libs/frontend/ui/src/lib/time/time-input.ts:8`. `Date.parse('2026-01-10T12:00:00')` interprets the date and time in the machine's local timezone, so the same string maps to different deadlines and `<time datetime>` values on machines in different zones. The API describes strings as ISO time inputs but does not clarify this behavior. Require an explicit `Z` or numeric offset for date-time strings, or document and test local-time semantics if those are intended.

## Verdict

**Changes requested.** The two clock-holder paths and the live-region update conflict with the acceptance criteria. The scoped `npm run verify -- -t test -p ui -- --testPathPatterns=time` passed (1 Nx task); its tests do not cover the cases above. Source files were not edited. Skill discovery found `angular-developer`, but this lane exposed no skill invocation mechanism, so no skill could be loaded.
