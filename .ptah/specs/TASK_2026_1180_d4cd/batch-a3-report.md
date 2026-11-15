## Changes

- Fixed derived provider API 100% reset text in the dashboard and chat UI by passing the classification context into `activeWindowExhaustion`.
- Let inactive estimated or expired exhaustion fall through to the fresh 100% provider reading in `window-state.ts`.
- Replaced the post-spawn zero-wait microtask race with an explicitly tracked settlement holder. The pending lookup continues in the background.
- Finding 2 remains open; see Decisions.

## Tests

- Added a fresh provider API 100% reset assertion for each frontend surface.
- Added a regression for an estimated exhaustion beside a fresh 100% provider reading.
- Updated the bounded lookup settlement regression to use the explicit holder.

## Check results

- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath .../window-state.spec.ts`: 1 suite, 29 tests passed.
- Dashboard focused Jest: 1 suite, 55 tests passed.
- Chat UI focused Jest: 1 suite, 56 tests passed.
- vscode-lm-tools focused Jest: 2 suites, 35 tests passed.
- `npx tsc --noEmit --project <lib>/tsconfig.lib.json`: shared, dashboard, chat-ui, and vscode-lm-tools all passed (exit 0).
- `npx eslint <changed files>`: exit 0, 0 errors, 2 pre-existing warnings (chat-ui non-null assertion at line 194; dashboard file length).
- `ptah_get_diagnostics` after edits: unavailable on first scoped call because the TypeScript check exceeded 45 seconds; the four project type checks above passed.

## Decisions

- Finding 2: The ledger has a synchronous `snapshotFor(ownerKey)` and `PlanUsageService` retains its expired cache entry, but the two spawn dispatchers only receive `PtahAPI.agent.limits`, which returns a Promise. Its implementation in `agent-namespace.builder.ts` calls the async lane limit lookup. There is no synchronous last-known value on this contract, and reaching the ledger or cache from vscode-lm-tools requires a new port, RPC, or DI exposure. Options: (1) expose a last-known owner snapshot through an approved existing boundary and block on active non-estimated evidence (recommended for a later change), or (2) accept that a known exhausted lane may spawn when a fresh lookup exceeds the 4-second wait after the 30-second cache TTL. The task forbids building a new read path, so this item was stopped without source changes. Reversible: yes.
- Settlement tracking uses the existing pre-lookup Promise and a small holder. It changes only the pending post-spawn peek and needs no transport changes. Reversible: yes.

## Extra reads

- Read `review-batch-a.md`, `plan-usage.service.ts`, `plan-limit-ledger.service.ts`, `code-execution/types.ts`, `agent-namespace.builder.ts`, and both dispatcher lookup paths to assess finding 2.
- Ptah symbol index returned zero hits, so native `rg` was used for that symbol search. No skill-loading tool was listed for the assigned Angular skill; existing repository patterns were followed.
