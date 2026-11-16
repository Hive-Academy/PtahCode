# Batch X report

## Failures

| Failure | Classification | Root cause and fix |
| --- | --- | --- |
| A1: nine provider cases | Stale expectation | Shared default is 150,000 at `libs/shared/src/lib/types/advanced-settings.types.ts:210`; provider reads it via `FILE_BASED_SETTINGS_DEFAULTS` at `libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.ts:123`. Updated absent, null, and invalid-value expectations. Added an explicit valid 200,000 check. Removed unused second default from `idle-compaction.types.ts:11`; `rg` found no consumers. |
| A2: idle rekey | Stale expectation | First `turn-context` after a boundary records a baseline without arming (`idle-session.reducer.ts:186-190`). The test now supplies a baseline before the growth reading and retains its claim-release, old-ID, and timer assertions. |
| A3: interrupt hook | Stale expectation | `session-control.service.ts:170` passes the new preserve-stop-cause flag. The no-cause test now checks `(sessionId, false)`. The callback still occurs after success, and a supplied cause passes `true`. |
| B: held automatic handoff | Real defect | `follow-up-queue.service.ts:463` checked legacy `fired`, while queued claims are `pending`. The queue now matches the pending claim by client message ID, withdraws a stale command, and releases its claim at line 445. The test keeps the no-send assertion and verifies release. Removed unused `fired` union member. |
| C: RPC budget fixture | Stale fixture | `chat-session-budget.spec.ts:85-96` omitted required `tokenMeasure`; added `'raw'` to match raw-token assertions. `rg handoffAfterCompactions:` across `libs` and `apps` found no other `SessionBudgetConfig` spec literal missing it; the agent SDK provider expectation already has `'weighted'`, and the stage spec uses a different type. |

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction-hook-handler.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.types.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-budget.spec.ts`
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts`
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.spec.ts`
- `libs/frontend/chat/src/lib/services/session-auto-handoff.service.ts`

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction-hook-handler.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts` — 3 suites, 140 tests passed.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.spec.ts` — 1 suite, 45 tests passed, including the added claim-release assertion.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-session-budget.spec.ts` — 1 suite, 3 tests passed.
- `npx tsc --noEmit --project <project>/tsconfig.<kind>.json` — passed for both `lib` and `spec` kinds in `libs/shared`, `libs/backend/agent-sdk`, and `libs/backend/rpc-handlers`, and for `libs/frontend/chat/tsconfig.lib.json`.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` — failed with errors in `libs/frontend/core/src/testing/mock-rpc-service.ts` mock signatures and BigInt literals under a pre-ES2020 target in shared/worker-protocol files. The tailed output did not identify a changed file; this check remains failing.
- `npx eslint libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction-hook-handler.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.types.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-session-budget.spec.ts libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff.service.ts` — passed without output.
- `npx eslint libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.spec.ts` — 0 errors, 40 existing non-null-assertion warnings.
- `git diff --check` — no whitespace errors. `rg 'handoffAfterCompactions:' libs apps --glob '*.spec.ts' --glob '*.ts'` — checked other literals.

## Not done

- The chat spec TypeScript configuration remains failing for the errors above; fixing the shared test mock and target configuration is outside the named failures and write set.
- No Nx, workspace-wide, build, serve, dev, e2e, package, or git mutation commands were run.
