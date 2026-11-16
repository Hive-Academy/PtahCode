# Batch G report

## Files changed

- `libs/frontend/chat/src/lib/services/session-auto-handoff.service.ts`: pending, delivered, recorded, completed, failed, and cancelled entries; attempt count, queue identity, and status error. The legacy `fired` type member remains for an existing read in `chat-store/follow-up-queue.service.ts`, which is outside this batch's write set; new code never writes it.
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts` and `.spec.ts`: authoritative-stage triggering, status RPC reconciliation with bounded backoff, settled-delivery resend, five-attempt cap, compaction deferral and timeout, timer cleanup, and focused status/deferral tests.
- `libs/frontend/chat/src/lib/services/session-budget-actions.service.ts` and `.service.spec.ts`, `.queue.spec.ts`, `.auto-handoff.spec.ts`: shared manual/automatic claim, manual compaction deferral, banner label, retry action, and updated mocks/expectations.
- `libs/frontend/chat/src/lib/components/molecules/notifications/session-budget-banner.component.ts` and `.spec.ts`: presentational label input and retry output, preserving the measure-aware title and tooltip from the existing edits.
- `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` and `.html`: wired the label and retry action to the actions service.

## State machine

| State | Event | Next state | Side effect |
| --- | --- | --- | --- |
| absent | authoritative limit and auto enabled | pending | claim, probe, query status, queue command |
| pending | queue receipt delivered or steered | delivered | reconcile durable status |
| pending or delivered | status starting | unchanged | poll; no resend |
| pending or delivered | status recorded or closePending | recorded | poll for completion; no resend |
| recorded | status closeCompleted | completed | stop polling |
| delivered | settled command, idle tab, status absent, fewer than five sends | pending | query again before resend |
| delivered | settled command, idle tab, status absent, fifth send | failed | show manual retry |
| pending or delivered | status unavailable or RPC failure | unchanged | show status error; no resend |
| pending | compaction open | pending | defer intent, wake at ten minutes |
| pending | compaction still open at ten minutes | failed | show retry; no send |
| pending | cancelled or session binding changed | cancelled or dropped | clear timers |

A **settled delivered command** is a queued command whose `QueuedFollowUpStore.onSettled` callback returned `delivered` or `steered`, followed by the predecessor tab leaving `streaming`. The coordinator requires that receipt's `clientMessageId` before resending. A direct send has no queue receipt, so its absent status is polled without an automatic resend.

## UI strings

`Wrap-up requested`; `Handoff recorded`; `Handoff completed`; `Handoff failed`; `Retry handoff`; `Wrap-up requested · Status unavailable`. The existing `Wrap up & hand off`, queued notice, title, and tooltip remain.

## Checks

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.queue.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.auto-handoff.spec.ts libs/frontend/chat/src/lib/components/molecules/notifications/session-budget-banner.component.spec.ts` — 5 suites, 83 tests passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — passed.
- `npx eslint libs/frontend/chat/src/lib/services/session-auto-handoff.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.queue.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.auto-handoff.spec.ts libs/frontend/chat/src/lib/components/molecules/notifications/session-budget-banner.component.ts libs/frontend/chat/src/lib/components/molecules/notifications/session-budget-banner.component.spec.ts libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` — 0 errors, one existing max-lines warning in chat-view; Nx boundary rule skipped because no cached project graph.

## Decisions

- Auto eligibility uses `sessionBudget.stage === 'limit'`; the live estimate remains display-only.
- Manual intent marks the shared wrap-up claim while compacting, then rechecks the binding before sending. A manual retry clears a failed automatic claim.
- Status polling uses delays of 0, 5, 15, 30, then 60 seconds, bounded to 12 subsequent polls. `recorded` keeps polling for `closeCompleted`.
- Existing modified files outside this batch were left untouched. The banner had concurrent edits before this batch; its measure-aware title and tooltip were preserved.

## Not done

- Rendered screenshot inspection: the allowed commands prohibit build/serve/dev, and no rendered Angular artifact is available in the worktree. UI labels were verified through the component tests.
- The legacy `fired` type member could not be removed without changing `chat-store/follow-up-queue.service.ts`, which this batch expressly forbids. It is retained only for source compatibility and is never produced by the new store.
