# Batch 6 bounded fix

TASK_2026_2330_2fc3

## Fix

Source paths below are relative to `libs/frontend/setup-wizard/src/lib/services/`.

- `generation-workflow.store.ts:157` and `generation-workflow.store.ts:200` route the initial agent and guidance RPCs through the attempt tracker. Existing public method signatures are unchanged.
- `setup-run.store.ts:395` registers the start for a matching live record. `setup-run-attempt.ts:190` records it before sending the RPC, clears earlier missing-state evidence, and releases it when the RPC settles.
- `setup-run.store.ts:824` guards null results while an initial start is pending, including a lookup that begins during the start and returns after it settles. Valid observations still update the record. The first eligible null reply after settlement starts the existing five-second grace.

## Regression tests

- `setup-run.store.spec.ts:1326` — keeps an initial agents start running across null polls and records the accepted run.
- `setup-run.store.spec.ts:1326` — keeps an initial guidance start running across null polls and records the accepted run.
- `setup-run.store.spec.ts:1377` — interrupts only after a fresh grace when an initial start resolves without run evidence.

The acceptance tests check the record after each of four null polls over ten seconds and verify that the accepted running state carries the returned run ID. The no-evidence test checks that the record remains running through two more polls after settlement and becomes interrupted on the third.

## Checks

| Check | Result | Log |
| --- | --- | --- |
| Focused Jest | Exit 0. 4 suites passed, 194 tests passed, 0 snapshots. | `.ptah/tmp/batch6-bounded-jest.log` |
| Setup Wizard library TypeScript | Exit 0. 0 diagnostics. | `.ptah/tmp/batch6-bounded-tsc.log` |
| ESLint on six changed files | Exit 0. 0 errors and 36 existing warnings, including the store's max-lines warning. | `.ptah/tmp/batch6-bounded-eslint.log` |
| Scoped Ptah diagnostics | 0 errors in requested files. 8 BigInt target errors in unchanged shared and worker-protocol files. | |
| `git diff --check` | Exit 0. | |

## Decisions

- Track only initial starts associated with a matching live record, which is the scope of orphan reconciliation. Keep the attempt tracking logic in `setup-run-attempt.ts` and use the existing poll and run-evidence paths.
- Include the optional Minor follow-up 1 in the existing test “requires a known stream kind and its fields before adoption or delivery” at `generation-run-event-adapter.spec.ts:700`. The accepted-kind loop now covers all seven kinds on enhance streams.
- Keep Minor follow-up 2 outside this correction.
- The Ptah dependent index did not include this worktree's files. Reviewed Setup Wizard references with `rg` as the fallback.
