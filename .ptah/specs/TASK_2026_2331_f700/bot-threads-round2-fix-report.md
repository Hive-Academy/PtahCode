# PR #1521 round 2 fixes

Verified against `fix/live-session-resolver` at `9aa72bcb9`. All three findings are still valid.

## PRRT_kwDOPngTds69CxbV

**Fixed.** `invalidateAccountRoute` aborted records in place, and `findMatches` counted them by tab and SDK session ID. Both lookup paths now exclude aborted records. Distinct live registrations for the same SDK ID still produce multiple matches.

- Fix — `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts:492`
- Regression — `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.spec.ts:80`

## PRRT_kwDOPngTds69CxbX

**Fixed.** The resume branch kept the stored permission for non-plan parents. It now uses the same parent ceiling and adapter capability fallback as fresh requests while retaining the existing plan branch.

- Fix — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:62` and `:120`
- Regression — `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts:179`

## PRRT_kwDOPngTds69CxbZ

**Fixed.** The stop arm records adapter success before attempting the acknowledgement-store write. If that write fails, the next stop attempt can persist success and proceed to tab retirement even after the live row disappears. The durable success marker survives a service restart and is cleared at acknowledgement completion. A rejected adapter close with a missing live row still fails closed and leaves the durable acknowledgement in `closePending`.

- Fix — `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:519` and `:1245`
- Durable marker — `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts:35`
- Regression — `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts:207`
- Existing failed-close coverage — `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts:138`

## Decisions

- Applied the liveness filter at the registry's multi-match lookup. The regression recreates the retained, aborted record directly.
- A process exit before any write recording adapter success leaves only the pending marker. In that case recovery remains fail-closed because the durable record cannot establish the adapter outcome.
- The untracked `bot-threads-round2.md` review input predated this work. No other pre-existing changes were visible in the opening status.
- No extra source files were opened. No matching skill was required for this backend-only change.
- Used Ptah symbol reads and searches for source inspection and native PowerShell and Python for report and source writes.

## Checks

Logs are under `.ptah/tmp/round2-*.log`. Checks ran sequentially.

- `npx.cmd jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts` — 3 suites, 74 tests passed. The first run passed 73 tests and exposed a missing flush in the new recovery fixture. The successful rerun includes that fixture correction.
- `npx.cmd jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.spec.ts` — 1 suite, 79 tests passed.
- `npx.cmd jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts` — 1 suite, 7 tests passed.
- `npx.cmd eslint libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts` — exit 0 for 7 files. ESLint reported 0 errors and 8 warnings on existing code. The Nx project-graph-dependent rule was skipped because the cache was unavailable.
- `npx.cmd tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` — passed, 0 diagnostics.
- `npx.cmd tsc --noEmit --project libs/backend/platform-cli/tsconfig.lib.json` — passed, 0 diagnostics.
- `npx.cmd tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json` — passed, 0 diagnostics.

Total focused Jest coverage was 160 passing tests across 5 suites. TypeScript passed for all 3 scoped projects. The TypeScript commands emitted no output, so their log files record the captured exit codes.
