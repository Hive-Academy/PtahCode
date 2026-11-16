# Frontend PR review fixes

| Comment | Path:line | Verdict | Evidence or fix | Regression test |
| --- | --- | --- | --- | --- |
| 4585233554 | `chat-streaming/message-finalization.service.ts:392` | CONFIRMED-FIXED | Stats-only update now retains `previous.stopCause` at line 392. | `preserves an existing stop cause during a stats-only interrupted update` |
| 4585233562 | `chat-ui/session-budget-format.ts:74` | CONFIRMED-FIXED | Weighted tooltip now formats `budget.used` at line 75. | `uses weighted usage even when the TOKENS chip differs` |
| 4585233569 | `chat/message-bubble.component.ts:161` | CONFIRMED-FIXED | Interrupted replies without a cause show a neutral label at line 161. | `shows a neutral interruption label with partial content` |
| 4585233576 | `chat/session-auto-handoff-coordinator.service.ts:333` | CONFIRMED-FIXED | Rechecks `stillQualifies` after status RPC and releases a stale claim at line 344. | `does not send to a tab rebound while the pre-send status is pending` |
| 4585233591 | `chat/session-auto-handoff-coordinator.service.ts:504` | CONFIRMED-FIXED | Re-reads the current entry after RPC, including the catch path, at lines 513 and 545. | `keeps a delivered entry when unavailable status finishes after delivery`; `keeps a delivered entry when a stale status request rejects` |
| 4585233602 | `chat/session-auto-handoff-coordinator.service.ts:509` | CONFIRMED-FIXED | Re-reads the tab after RPC before considering resend at line 514. | `does not release a delivered entry when streaming begins during status lookup` |
| 4585233610 | `chat/session-auto-handoff-coordinator.service.ts:524` | CONFIRMED-FIXED | Tracks a delivered stream after poll exhaustion and reconciles on settlement at lines 553 and 125. | `reconciles a delivered turn after polling expires and the stream settles` |
| 4585233617 | `chat/session-budget-actions.service.ts:169` | CONFIRMED-FIXED | Destroy clears the unsent manual mark at line 169. | `releases an unsent manual mark on destroy during compaction` |
| 4585233622 | `chat/session-budget-actions.service.ts:275` | CONFIRMED-FIXED | Cancelled automatic entries no longer block manual sending at line 279. | `allows a manual wrap-up after cancelling the automatic queue` |

## Changed files

`libs/frontend/chat-streaming/src/lib/message-finalization.service.ts`, `message-finalization.service.spec.ts`; `libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.ts`, `session-budget-format.spec.ts`; `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.ts`, `message-bubble.component.spec.ts`; `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`, `session-auto-handoff-coordinator.service.spec.ts`, `session-budget-actions.service.ts`, `session-budget-actions.service.spec.ts`.

## Checks

| Exact command | Result |
| --- | --- |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.spec.ts libs/frontend/chat/src/lib/components/organisms/message-bubble.component.spec.ts` | PASS: 3 suites, 96 tests. Initial run failed two new test assertions; corrected the fixtures and reran successfully. |
| `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/message-finalization.service.spec.ts` | PASS: 1 suite, 44 tests. |
| `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.spec.ts` | PASS: 1 suite, 28 tests. |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | PASS. |
| `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.lib.json` | PASS. |
| `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json` | PASS. |
| `npx eslint libs/frontend/chat-streaming/src/lib/message-finalization.service.ts libs/frontend/chat-streaming/src/lib/message-finalization.service.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.ts libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.spec.ts libs/frontend/chat/src/lib/components/organisms/message-bubble.component.ts libs/frontend/chat/src/lib/components/organisms/message-bubble.component.spec.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.spec.ts` | PASS. |

`ptah_get_diagnostics` was attempted after edits but returned an unavailable workspace-wide TypeScript check; the focused `tsc` commands above passed.

## Decisions

All nine comments were confirmed by the cited code and its state path. Each fix stayed within an existing unit and public contracts remained unchanged. The exhausted polling case uses the existing tab signal to restart reconciliation on turn settlement, avoiding a permanent per-session timer.

## Not done

The `angular-frontend-patterns` skill loader was unavailable in this host. No browser screenshot was possible without starting a forbidden serve/dev target. No backend comments or files were touched.
