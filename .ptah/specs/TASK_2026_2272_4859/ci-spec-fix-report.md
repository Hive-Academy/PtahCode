# CI spec fix

Cause: (a), wrong expected result in the test. The original assertion at `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts:138` expected `{ i1: ['c1'] }`. The completer answer `{ i1: 'c1' }` was valid. `libs/backend/lane-routing/src/lib/pipeline/model-call.ts:160` parses a string record, and line 216 reads the choice by question key. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:108` reads that answer, maps candidate IDs to labels, and line 137 returns `{ items: Object.fromEntries(entries) }`.

The setup default does not win. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts:19` sets the default, and line 23 returns the same completer from dispatch. The test replaces its implementation. Although opening reports system-one, the mocked dispatch uses the structured completer.

There is no current 250 ms wait defect in this service. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:37` uses the total deadline. Lines 84 and 97 reserve the return margin inside that budget. `libs/backend/lane-routing/src/lib/routing-constants.ts:117` sets the total to 3000 ms; line 118 sets the margin to 250 ms. The test's saved 60000 ms target is bounded to 2750 ms. A 1000 ms answer is inside both active budgets.

Change: the delayed mock now returns `{ i1: 'c2' }` after 1000 ms. The assertion at `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts:136` expects `{ items: { angular: { order: ['b', 'a'] } } }`. This proves that the delayed choice changes the input ranking and differs from the setup default. Removed an unused local binding. Prettier also normalized the existing dispatch mock layout. No other test behavior changed. The service has no final diff.

## Checks

Confirmed `libs/backend/lane-routing/jest.config.ts`, `tsconfig.spec.json`, and `tsconfig.lib.json` exist before running checks. All commands ran from the worktree root.

- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - Baseline: `Test Suites: 1 failed, 1 total`; `Tests: 1 failed, 12 passed, 13 total`; exit 1. The received result matched the public contract.
  - Corrected test: `Test Suites: 1 passed, 1 total`; `Tests: 13 passed, 13 total`; exit 0.
  - After restoring the temporary cap: `Test Suites: 1 passed, 1 total`; `Tests: 13 passed, 13 total`; exit 0.
  - Final run after formatting: `Test Suites: 1 passed, 1 total`; `Tests: 13 passed, 13 total`; exit 0.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`
  - No output; exit 0.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`
  - No output; exit 0.
- `npx eslint libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - No output; exit 0, including final run after formatting.
- `npx prettier --check libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - First run: `Code style issues found in the above file. Run Prettier with --write to fix.`; exit 1.
- `npx prettier --write libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts 143ms`; exit 0.
- `npx prettier --check libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - Final: `All matched files use Prettier code style!`; exit 0.

## 250 ms regression proof

Temporarily edited only `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:37`, replacing `DECISION_REQUEST_TIMEOUT_MS` with `DECISION_RETURN_MARGIN_MS` for the outer deadline.

Command: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts -t 'accepts an answer that arrives within the total budget'`

Result: `Expected: {"items": {"angular": {"order": ["b", "a"]}}}`; `Received: null`. `Test Suites: 1 failed, 1 total`; `Tests: 1 failed, 12 skipped, 13 total`; exit 1.

Edited the deadline back to `DECISION_REQUEST_TIMEOUT_MS` without git writes. The full spec then passed. Read-only git diff confirmed no service diff.

## Scope and tools

Only the spec and this requested report remain as this lane's changes. The pre-existing `.ptah/specs/TASK_2026_2272_4859/status.md` was not touched. No install, Nx, verify, build, serve, e2e, or git write commands ran.

Ptah workspace analysis confirmed the supplied worktree. Scoped Ptah diagnostics reported `Errors: 0 | Warnings: 0`. Codex skill discovery/loading was unavailable; exposed skill tools were harness search/create tools. Used native PowerShell reads and explicit lane checks as fallback. No remaining task requirement is unmet.
