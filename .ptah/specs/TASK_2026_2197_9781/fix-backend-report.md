# Backend fix report — TASK_2026_2197_9781

## Defects

1. **Confirmed.** `endRecord` recorded `user-stop` before `deregister`, which cleared it. The cause is now recorded after deregistration; the old cause is cleared first, and both the stream and hook can read it after session end. Regression: `keeps user-stop for both consumers after session end and clears an earlier cause`.
2. **Confirmed.** The spawner starts turn and session interrupts together. `endRecord` now retains a current turn's cause during `parent-stop` teardown, so the aborted turn stream and `session:turnFailed` hook can read the same cause after end. Parallel start remains intact for host shutdown timing. Regressions: `keeps a parallel host stop for both consumers after parent session end`; `starts the host turn interrupt before session end and retains its cause for consumers`.
8. **Confirmed.** Empty identity returned authoritative `absent`. It now returns `unavailable`; a complete lookup with no record still returns `absent`. Regression: `returns unavailable when identity cannot be resolved`.
9. **Confirmed.** The boundary tap stored a sample under the raw SDK id while the transformer could consume under the tab id. The tap now stores one sample with both owner and SDK aliases, and consumption removes every alias. Session end, budget release and adapter disposal clear pending samples. Regression: `uses a compaction sample across SDK id rekey and clears it on session end`.

Also corrected `SdkAdapterEvents.clearStopCause` to clear the hook's pending copy after the stream has already consumed its copy; regression: `clears the remaining hook cause after the stream consumes its copy`.

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts` and `.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-adapter-events.service.ts` and `.spec.ts`
- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts` and `.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts` and `.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`

`session-spawner.service.ts` needed no edit: the session-control fix preserves its cause while retaining its required concurrent interrupt start.

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts`: 219/219 passed.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`: 205/205 passed.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-adapter-events.service.spec.ts libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts`: 255/255 passed.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed.
- `npx eslint` on the nine changed TypeScript files listed above: 0 errors, 10 warnings (file length, unused assignment and non-null assertions in existing code).

## Not done

- The new regression tests were added after the fixes and were not run against the pre-fix code. Their assertions target the previously broken outcomes, but pre-fix failure was not recorded.
- No build or workspace-wide checks were run, per task rules.
- Scoped `ptah_get_diagnostics` for four changed source files was unavailable after its 45-second TypeScript timeout; the four focused `npx tsc` checks above passed as fallback.
