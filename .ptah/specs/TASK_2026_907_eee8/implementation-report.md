## Changes

- `libs/backend/agent-sdk/src/lib/helpers/claude-certified-launch.ts:93-116,181-202`: classify bare, display, and sized Ultra as a personal subscription; document Pro/Max/Ultra.
- `libs/backend/agent-sdk/src/lib/helpers/claude-certified-launch.spec.ts:330-393`: cover Ultra personal login, family variants, and qualified Ultra refusal.
- `libs/backend/auth-providers/src/lib/accounts/claude-account-status.ts:4,59`: allow Ultra for class P.
- `libs/backend/auth-providers/src/lib/accounts/claude-account-status.spec.ts:87-135`: cover Ultra class P and Ultra Team class O.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.accounts.spec.ts:505`: update an existing refusal fixture from newly valid `ultra` to `Ultra Team`.

## Step 4 findings

- Repo search found the only family comparisons in `claude-certified-launch.ts` and `claude-account-status.ts`; both now allow Ultra.
- `claude-sdk-lane-runner.ts:674-677` consumes `claudePersonalLoginPassed()` and needs no separate family branch.
- `session-query-executor.service.ts:726,1203` checks the init message's API key source (`none`/`oauth`), independent of subscription family; no source change needed. Its account test fixture did need updating.

## Verification

- Command: `npm run verify -- -p @ptah-extension/agent-sdk,@ptah-extension/auth-providers`; rerun header confirmed exactly these two projects.
- Lint/typecheck: 4 of 4 tasks passed on both runs.
- Final rerun: agent-sdk test passed (227 suites, 5,717 tests; 2 suites and 5 tests skipped). Auth-providers test failed (89 suites and 2,652 tests passed; 1 suite and 2 tests failed; 1 suite and 10 tests skipped).
- First test run: agent-sdk 5,716 passed, 1 failed, 5 skipped; auth-providers 2,652 passed, 2 failed, 10 skipped. See Problems.
- `git diff --check`: passed.

## Decisions

- Kept `Ultra Team` outside the personal family, matching `Max Team` behavior.
- Updated one additional test because its `ultra` unknown-word fixture directly contradicted the new accepted family.

## Problems

- Initial agent-sdk failure: `session-query-executor.accounts.spec.ts`, “tripwire refuses unknown subscription word before the gate opens”; first error: `Received promise resolved instead of rejected`. Fixed by changing the fixture to `Ultra Team`.
- Both runs' auth-providers failure: `codex-account-usage.service.spec.ts` (2 tests); first failing test is “keeps live updates for two homes and owners separate” at line 481, first error `expect(received).toBe(expected) // Object.is equality` (owner keys differ). The second test at line 503 expects uppercase `D:\\...` but receives lowercase `d:\\...`. Both are unrelated to Claude subscription classification.
- Skill discovery through Ptah found no installed local skill matching this backend fix.
