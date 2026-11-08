# Batch G report

## Claude completed-turn telemetry

- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:655` emits one normalized telemetry record at the completed-turn result. It reports actual model-usage deltas, token buckets, and the turn's cost delta. Multiple billed models use the `mixed-model` marker with aggregate usage; no requested alias or init model is used as a billed model. A result without usage emits one unavailable record. An unchanged cumulative snapshot produces no synthetic zero usage.
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.spec.ts:953` covers one model, mixed models, cumulative usage, and missing usage. The Claude adapter forwards the runner's segments without remapping; its code did not need a separate mapping path.

## Manager size and budget behavior

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-deadline.ts:6` holds session-record lookup, resumed budget construction, deadline arming, and warning/stop handling extracted from `agent-process-manager.service.ts:831,1339,1468`. `lane-budget-deadline.spec.ts:1` covers remaining-time arming and rearming. The manager is **3,848 lines**, versus **3,849** in origin/main. No `resolveModel` call site changed.

## Composition

- `apps/ptah-electron/src/di/codex-lane-composition.ts:115`, `apps/ptah-electron/src/di/codex-runtime-composition.ts:239`, and `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:300` resolve their workspace provider once per composition scope. The Phase 2 Electron lane factory caches the provider at its first lane use because the port is registered later in composition. Settings values remain fresh through `getConfiguration` on each read. `apps/ptah-electron/src/di/codex-runtime-composition.spec.ts:63,121` supplies the newly required workspace port in scope tests.

## Verification

- Ptah diagnostics initially found 0 errors and 0 warnings on the changed runtime files. A final repeat timed out twice while the TypeScript check was running; the completed project typechecks below provide the verification result.
- `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: lint/typecheck passed (14/14 tasks); tests passed for shared, cli-agent-runtime, codex-runtime, cli-engine, and platform-cli. Platform-core failed only its two known tests (`control-endpoint.spec.ts`, `kernel-session-driver-lock.spec.ts`). Electron initially failed because the runtime composition specs omitted the provider fixture and the lane factory resolved it before Phase 2 completed.
- `npm run verify -- -p ptah-electron` after those fixes: lint/typecheck 2/2 passed; tests 11/11 tasks passed.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no FAIL; no baseline increase.

## Decisions

- Mixed-model usage is reported under a sentinel model ID because the telemetry schema requires `modelId`, while the SDK reports more than one billed model. The alternative was dropping real totals as unavailable; the existing stream-loop model-delta rule and the task's real-usage requirement support the sentinel. Reversible.
- The Electron Phase 2 lane factory caches the workspace provider on first lane use. Eager resolution at registration caused missing-port failures before platform composition finished; caching preserves one resolution per factory and fresh setting values. Reversible.

## Remaining gaps

- Only the two pre-existing platform-core test failures remain in the requested full verification set. Ptah diagnostics remained unavailable on the final retry, while Nx typecheck passed.
