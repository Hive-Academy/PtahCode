# Batch A report

## Files changed

- `libs/shared/src/lib/types/session-budget.types.ts`: token measure contract and setting.
- `libs/shared/src/lib/types/session-budget.types.spec.ts`: setting key, values, and default assertions.
- `libs/shared/src/lib/types/sdk-hook.types.ts`: stop cause on the failed-turn renderer payload.
- `libs/shared/src/lib/types/rpc.types.ts`: handoff status method in the method registry and method allowlist.

The existing `libs/shared/src/index.ts` wildcard exports for `session-budget.types.ts`, `sdk-hook.types.ts`, and `rpc.types.ts` expose the new names without an index edit.

## Exact shared contracts

- `export type SessionBudgetTokenMeasure = 'weighted' | 'raw'`
- `SessionBudgetConfig.tokenMeasure: SessionBudgetTokenMeasure` (required, readonly)
- `SESSION_BUDGET_SETTINGS.tokenMeasure = { key: 'sessionBudget.tokenMeasure', kind: 'enum', values: ['weighted', 'raw'], default: 'weighted' }`
- `SessionBudgetMeasure` adds `'weighted-tokens'`; `'tokens'` remains the raw measure.
- `export interface SessionBudgetEnumSetting<T extends SessionBudgetUnit | SessionBudgetTokenMeasure = SessionBudgetUnit>` has `values: readonly T[]` and `default: T`.
- `export type TurnStopCause = 'user-stop' | 'parent-steer' | 'runtime-cap' | 'host-stop' | 'internal-abort'`
- `SdkTurnFailedPayload.stopCause?: TurnStopCause` (readonly). This is the shared `session:turnFailed` payload used by the renderer. `src/index.ts` already re-exports it.
- `RpcMethodRegistry['session:handoffStatus']` has `params: { sessionId: string; tabId: string }` and `result: { state: 'absent' | 'starting' | 'recorded' | 'closePending' | 'closeCompleted' | 'unavailable'; successorSessionId: string | null }`. The method is also in the registry allowlist.

`SESSION_BUDGET_SETTINGS.autoHandoffAtLimit.default` remains `true`.

## Checks

- Scoped Ptah diagnostics on changed shared files: 0 errors, 0 warnings.
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/session-budget.types.spec.ts`: 17 tests passed.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: passed.
- `npx eslint` on the four changed files: exit 0, 3 existing warnings in `rpc.types.ts` (2 unused imports, file length); module boundary rule skipped because no cached project graph.

## Consumer compile breaks and follow-up

- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-config.provider.ts:33` TS2741: default config lacks required `tokenMeasure`.
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-config.provider.ts:125` TS2741: resolved config lacks required `tokenMeasure`.
- `SdkTurnFailedPayloadSchema` in `libs/shared/src/lib/types/sdk-hook.schemas.ts` does not yet accept `stopCause`; Zod currently strips this optional field during renderer parsing. The abort propagation batch must arrange ownership of that shared schema and its parser-equivalence coverage before relying on the field in UI. It was outside Batch A's write set.

## Decisions

- Put `TurnStopCause` on `SdkTurnFailedPayload`: `session:turnFailed` is the existing shared payload emitted for a failed or aborted SDK turn and consumed by the renderer. Alternative was a new message type. Evidence: `sdk-hook.types.ts` payload comment and `messages/payload-map.ts` mapping. Reversible.
- Keep the two enum settings strongly typed with generic `SessionBudgetEnumSetting<T>`: alternative was widening `default` to both enum unions, which broke existing unit readers. Evidence: scoped consumer diagnostics. Reversible.
- No handoff banner state type was added: the plan places the claim state in the frontend `session-auto-handoff.service.ts`, while the shared RPC result carries durable state. Alternative was a redundant shared state type. Evidence: approved plan section 3. Reversible.
