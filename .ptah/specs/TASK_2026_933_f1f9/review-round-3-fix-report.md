# Review round 3 fix report

| Finding | Verdict | Files changed | Spec added |
| --- | --- | --- | --- |
| Codex answer cancellation | Fixed | `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts`, `codex-chat-turn-stream.ts`, `codex-chat-adapter.spec.ts` | Stop before stream admission starts no answer turn. |
| Proposal hydration revision | Fixed | `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts`, `harness-chat-proposal.store.spec.ts` | Older push during hydration cannot replace newer RPC proposal. |
| First chat turn workspace | Fixed | `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts`, `harness-chat-launcher.service.spec.ts`; `libs/frontend/chat/src/lib/services/message-sender.service.ts`, `message-sender.service.spec.ts`; `libs/frontend/chat-types/src/lib/chat-types.ts` | Captured root passes through launch and sender to `chat:start`. |

## Verification

`npm run verify -- -p agent-sdk,chat,onboarding,chat-types` — exit code 0. All 8 lint/typecheck tasks passed; all 3 available test targets passed (`chat-types` has no test target). Test logs: 635 suites passed, 2 skipped; 12,757 tests passed, 7 skipped. The first run failed because two existing onboarding assertions expected the old options shape; those assertions were updated and the second run passed.

`git diff --check` — exit code 0.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` — exit code 0 after final edits. It reported 218 existing unsuppressed sites within baseline; no baseline changed.

## Decisions

- Finding 1 was real: the peer queue checks cancellation before `publishUntilAdmitted` schedules publication, while the generator starts the native turn later. The answer signal now reaches the turn stream and is checked before `startTurn`; cancelled admission ends normally.
- Finding 2 was real: a push arrival counter could make an older `updatedAt` win over hydration. The store now compares `updatedAt` and removes the unused counter.
- Finding 3 was real: `MessageSenderService` read the current root after service readiness. `SendMessageOptions.workspacePath` carries the launch root through existing dispatch options. This needs three production files for finding 3.
- Applied the `angular-frontend-patterns` skill to the frontend services. No rendered UI changed.

## Open

No review finding remains open. `HANDOFF.md`, `review-round-3-findings.md`, and `review-round-4-findings.md` in this task directory were changed or added by another actor during this work; I did not modify them.

## Round 4

| Finding | Verdict | Files changed | Spec added |
| --- | --- | --- | --- |
| A. Failure notice during live turn | Fixed | `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts`, `codex-chat-adapter.spec.ts`; `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts`, `codex-chat-host-ports.spec.ts` | Notice is delivered while the native turn stays busy, and host delivery bypasses the broadcaster. |
| B. Fallback steer error | Already fixed | None | Existing steer refusal spec. |
| C. Failed first send attachments | Fixed | `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts`, `harness-chat-launcher.service.spec.ts`; `libs/frontend/chat/src/lib/services/composer-attachments.service.ts`, `composer-restore.service.ts`, `composer-restore.service.spec.ts`, `components/molecules/chat-input/chat-input.component.ts` | Failed send queues captured files and images; restore merge preserves later composer edits. |

Verification: `npm run verify -- -p agent-sdk,chat,onboarding,rpc-handlers` — exit code 0 on the final state. All 8 lint/typecheck tasks and 4 test targets passed. Jest logs: agent-sdk 228 suites passed, 2 skipped; 5,768 tests passed, 5 skipped. Chat 358 suites passed; 6,389 tests passed, 2 skipped. Onboarding 50 suites and 601 tests passed. RPC handlers 242 suites passed; 6,447 tests passed, 8 skipped. Total: 878 suites passed, 2 skipped; 19,205 tests passed, 15 skipped.

Degradation audit: `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0; 218 existing unsuppressed sites within baseline.

### Decisions

- A was real: the normal `ports.publish` path calls the broadcaster (`codex-chat-host-ports.ts:556-558`), whose stream teardown settles the active turn. The adapter now calls `publishNotice` (`codex-chat-adapter.ts:733-766`); the host emits only `CHAT_CHUNK` events, including `message_complete`, without broadcaster cleanup (`codex-chat-host-ports.ts:559-568`).
- B was already fixed: only `CodexRequestRejectedError` with `code === 'codexTurnNoLongerActive'` reaches the new-turn fallback (`codex-chat-adapter.ts:812-824`). Other steer errors throw through `this.failure(error, 'steer')` (`codex-chat-adapter.ts:815-820`). No code changed for B.
- C was real: failed first sends restored text alone. The failure path now restores captured files and images (`harness-chat-launcher.service.ts:219-233`), while the chat composer consumes and merges those attachments with later edits (`chat-input.component.ts:1777-1789`, `composer-restore.service.ts:16-57`).

No Round 4 finding remains open. `git diff --check` exited 0.
