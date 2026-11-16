# Backend PR review fixes

| Comment id | Path:line | Verdict | Evidence or fix summary | Regression test |
|---|---|---|---|---|
| 4585216432 | agent-sdk/session-budget-config.provider.ts:109 | DEFERRED | Fresh writes omit tokenMeasure; persist weighted in frontend first-save path while preserving explicit legacy raw. | None |
| 4585216442 | agent-sdk/session-control.service.ts:146 | CONFIRMED-FIXED | Timeout/rejection clear only owned active record and preserve teardown; service.ts:147,191,329. | keeps a parallel host stop when the turn interrupt times out |
| 4585233436 | agent-sdk/idle-compaction.service.ts:399 | CONFIRMED-FIXED | Config reads now inside fire lookup try; service.ts:399. | keeps the group alive when configuration fails during fire |
| 4585233443 | agent-sdk/idle-session.reducer.ts:190 | CONFIRMED-FIXED | Baseline requires latest turn without activity; reducer.ts:187. | ignores stale and activity-tainted readings for the post-boundary baseline |
| 4585233453 | agent-sdk/idle-session.reducer.ts:413 | CONFIRMED-FIXED | Rekey retains compactBoundaryObserved; reducer.ts:415. | keeps the boundary armed on rekey and clears it on release |
| 4585233480 | agent-sdk/sdk-adapter-events.service.ts:149 | DEFERRED | Peek intentionally leaves pending cause for separate failure hook; turn-scoped lifetime requires redesign across event producers/consumers. | None |
| 4585233489 | agent-sdk/session-budget-config.provider.ts:190 | DEFERRED | Registered defaults mask unset tokenMeasure; needs explicit stored-value API or write-path migration across libraries. | None |
| 4585233496 | agent-sdk/session-budget.service.ts:290 | CONFIRMED-FIXED | Completion retained until first figure; service.ts:291,388. | uses a completion received before the first authoritative figure |
| 4585233500 | agent-sdk/session-control.service.ts:360 | CONFIRMED-FIXED | Teardown clears only while old record owns tab; service.ts:363. | does not clear a replacement record stop cause during old teardown |
| 4585233514 | cli-agent-runtime/session-handoff-ack.store.ts:239 | CONFIRMED-FIXED | Authoritative lookup rejects invalid candidate state; store.ts:187. | rejects a schema-degraded candidate during authoritative status lookup |
| 4585233523 | cli-agent-runtime/session-handoff.service.ts:273 | CONFIRMED-FIXED | Known in-memory handoff returns unavailable on absent storage result; service.ts:271. | does not report absence for a known in-flight handoff with no persisted record |
| 4585233529 | cli-agent-runtime/session-spawner.service.ts:1259 | CONFIRMED-FIXED | Safety-net interruption forwards runtime-cap; service.ts:2233,2415. | max-successions test checks runtime-cap interrupt |
| 4585233536 | rpc-handlers/session-handoff-rpc.handlers.ts:98 | CONFIRMED-FIXED | Trim and resolve workspace before exact-root lookup; handlers.ts:98. | normalizes a stored workspace before looking up handoff status |

## Changed files

- libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.ts
- libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.spec.ts
- libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.ts
- libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.spec.ts
- libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts
- libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts
- libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts
- libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.spec.ts
- libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts
- libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts
- libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts
- libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts
- libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts
- libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.succession.spec.ts
- libs/backend/rpc-handlers/src/lib/handlers/session-handoff-rpc.handlers.ts
- libs/backend/rpc-handlers/src/lib/handlers/session-handoff-rpc.handlers.spec.ts

## Checks

- npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.spec.ts — passed, 161 tests.
- npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts — passed, 59 tests after replacement regression.
- npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.succession.spec.ts — passed, 266 tests.
- npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/session-handoff-rpc.handlers.spec.ts — passed, 24 tests.
- npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json — passed.
- npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json — passed.
- npx eslint libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.succession.spec.ts libs/backend/rpc-handlers/src/lib/handlers/session-handoff-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/session-handoff-rpc.handlers.spec.ts — passed with 0 errors, 33 warnings.
- npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts — passed; no project over baseline (220 unsuppressed sites total).
- npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json — passed after status validation change.

## Not done

- Deferred items require frontend changes or a cross-library lifetime/storage contract.
## Decisions

- Treat a known live handoff without a persisted record as unavailable. Options: absent or unavailable. The in-memory reservation proves absence cannot be confirmed; reversible.
- Restrict invalid-document rejection to authoritative status lookup. Options: reject all complete reads or only status. Existing recovery-write tests require permissive recovery; reversible.

