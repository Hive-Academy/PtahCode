# Frontend fix report

## Defects 3–7

| Defect | Finding and root cause | Fix | Regression test |
| --- | --- | --- | --- |
| 3 | Confirmed. A status lookup could leave a claimed, never sent `pending` entry that candidate discovery skipped; stale sweep only handled queued entries. | Authoritative `absent` releases the unsent claim and re-derives the candidate. A persistent status error keeps the visible error but enables manual wrap-up. A below-limit stage releases non-queued pending claims. | `releases a never-sent claim after authoritative absent and retries`; `cleans an unsent pending claim when the confirmed stage falls below limit`; `allows manual wrap-up after an unsent unavailable automatic claim` |
| 4 | Confirmed. Direct sends have no `clientMessageId`, so the resend gate excluded them. | A delivered direct command can resend after authoritative `absent` and an idle tab. The coordinator tracks successful submissions across claim release to cap total sends at five. | `resends a direct delivered command after authoritative absent` |
| 5 | Confirmed. Compaction after claim armed a deferral while retaining an unsent pending claim, so the candidate never re-entered. | Release the claim before arming the ten-minute deferral; compaction completion re-derives it. | `resumes a claimed deferral after compaction finishes` |
| 6 | Confirmed. A dropped manual deferral cleared its timer but retained the sent flag and manual mark. | Clear the sent flag and manual mark when the target changes. | `clears a dropped manual compaction intent when the target changes` |
| 7 | Confirmed. Stats formatting and inspector treated only `tokens` as a token budget. | Support `weighted-tokens` in suffix, tooltip routing, and inspector meter, with weighted/raw labels. The banner's raw-mode recommendation remains raw-specific. | `shows weighted tokens on the token chip with the correct tooltip`; inspector's weighted-token parameterized meter case |

## Files changed

- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts` and `.spec.ts`
- `libs/frontend/chat/src/lib/services/session-budget-actions.service.ts`, `.service.spec.ts`, and `.auto-handoff.spec.ts`
- `libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.ts` and `.spec.ts`
- `libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts` and `.spec.ts`
- This report

## Checks

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.queue.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.auto-handoff.spec.ts`: 4 suites, 68 tests passed after the final coordinator edit.
- `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.spec.ts`: 2 suites, 37 tests passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json`: failed on diagnostics outside this lane's write set, including `libs/frontend/core/src/testing/mock-rpc-service.ts` mock signatures and BigInt target errors in shared/worker protocol files. No error from this lane's changed specs was visible in the tail.
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.spec.json`: failed on the same mock signature and BigInt target diagnostics outside this lane's write set. No error from this lane's changed specs was visible in the tail.
- `npx eslint libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.ts libs/frontend/chat/src/lib/services/session-budget-actions.service.spec.ts libs/frontend/chat/src/lib/services/session-budget-actions.auto-handoff.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.ts libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.spec.ts`: passed with 0 errors and 3 existing non-null-assertion warnings in the inspector spec (lines 230, 232, 236).

## Anything not done

- A rendered UI screenshot was not obtained: build/serve/dev targets are prohibited, and this lane's write set does not permit an HTML preview artifact. The inspector change was checked against the existing meter design and its label contract in the focused component test.
- The two spec TypeScript checks remain red from cross-project diagnostics outside the allowed write set.
