# Review fix 4 — pending discovery fairness

## Change

- Added optional `pendingPasses` to the Zod discovery key. Saved keys without it remain valid.
- A full 4 MiB pending slice increments the count. On the fourth consecutive pending pass, the service saves the file path without `pending` or the counter, allowing exclusive `startAfter` discovery to continue on the next pass. The file's byte cursor remains stored for the next sweep.
- A pending scan that finishes or uses less than the byte budget, and a missing pending file, clear the counter with the pending flag.

## Tests

- Added a continuously growing file beside another file: the other file is scanned by pass 5, and the growing file is scanned again on the following sweep.
- Added coverage for a saved pending key without `pendingPasses` and for deletion of a pending file.
- Updated the existing pending-key expectation for the initial count.

## Verification

- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — passed; 1 suite, 11 tests.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json` — exit 0. The equivalent local compiler invocation also exited 0.
- `npx eslint libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — exit 0.
- `git diff --check` — exit 0.

No migration or new table. No commit, push, or PR.
