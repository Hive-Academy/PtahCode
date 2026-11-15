# Test report — round 7

## Tests added

Added four service-level cases in `session-handoff.service.spec.ts`: an unreadable newer document blocks an old `closePending` successor; a readable newer successor refuses the old caller; a current `closePending` successor closes once and persists `closeCompleted`; and a rejected completion write still reports `closed` after the closer succeeds. The cases use the existing service harness, closer, flushed predecessor setup, and a two-document storage fake modeled on the store spec.

## Results

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts` — **FAIL**: 109 passed, 1 failed. Both other suites pass, including all four new cases. The existing `session-handoff-ack.service.spec.ts:203` expects `retryable-failure` after a successful close whose completion write fails; the fixed source returns `closed`. This expectation is outside the authorized edit file.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — **PASS**.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — **PASS**.
- `git diff --check` — **PASS**.
- Scoped `ptah_get_diagnostics` — unavailable because its TypeScript check was still running after 45 seconds; the explicit spec `tsc` command passed.

## Regression reasoning

Before the source fix, case A's partial lookup would select the stale `closePending` record, skip the guarded transition, and call the closer, so its status and no-close assertions would fail. Case D would catch the rejected `compareAndSet` in the outer handler and return `retryable-failure`, so its `closed` assertion would fail. Case B checks readable replacement behavior and case C checks the valid `closePending` path.

## Decisions

- Kept the existing ack-service expectation untouched. Updating it would be appropriate for the new `closed` contract, but this lane is restricted to `session-handoff.service.spec.ts`; this decision is reversible in a follow-up edit.
