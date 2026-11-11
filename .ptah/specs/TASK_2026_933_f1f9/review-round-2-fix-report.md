# PR 1084 — CodeRabbit review round 2: fix report

Status: DONE (changes are not committed)

| # | File:line | Verdict | Change / reason | Spec |
|---|-----------|---------|-----------------|------|
| 1 | `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:749` | VALID | `publishAnswerFailureNotice` published the notice stream while a turn was live. The stream teardown in the broadcaster forced the live turn idle. When the session is busy, the notice now waits in `peerQueue` and publishes after the turn releases the session. The publish failure is logged through a new `warnNoticeFailed` helper (`codex-answer-notice-failed`). | `codex-chat-adapter.spec.ts`: "publishes a visible notice when delivery of an async answer fails" now asserts no publish before `finishTurn` and the notice after the drain. |
| 2 | `codex-chat-adapter.ts:784` | VALID | The steer catch treated every rejection as "turn no longer active" and queued a new turn. Now only `CodexRequestRejectedError` with code `codexTurnNoLongerActive` queues the answer. Every other error throws `failure(error, 'steer')`, so the caller shows the failure notice. | New test "shows the failure notice and starts no new turn when Codex refuses a steer for a live turn" (`startTurn` called 1 time). |
| 3 | `codex-chat-adapter.ts:789` | VALID | A queued answer started a new turn after the user pressed Stop. The adapter keeps one `AbortController` for each session (`WeakMap<Session, AbortController>`). `interruptSession` aborts it before `controls.interruptSession`. The queued run checks the signal, logs `codex-user-input-cancelled` and starts no turn. | New test "discards a queued async answer when the user stops the turn before delivery". |
| 4 | `libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts:206` | VALID | `mergeParsedHarnessUpdates` merged the keys of `prompt.enhancedSections` and `claudeMd.customSections`. The backend `merge-harness-config-updates.ts` replaces a supplied map. A supplied map now replaces the previous map. | `harness-chat-proposal.store.spec.ts`: "replaces supplied prompt and CLAUDE.md section maps instead of merging their keys". |
| 5 | `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts:355` | VALID | Hydration used the live record's config updates when the live record won, but took `isConfigComplete` from the older proposal. One `liveWins` condition now selects both the updates and `isConfigComplete`. | New test "keeps completeness from the newer live revision when hydration returns an older proposal". |
| 6 | `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts:102` | VALID | A launch continued after the user left the start page. `launchNewProject` and `launchTeamBuilder` accept `options.signal`. After the RPC, an aborted signal throws the exported `HarnessChatLaunchCancelledError` before any tab is created. Both start pages create an `AbortController` for each launch. They abort it in `back()` and in `DestroyRef.onDestroy`, and they show no error for a cancelled launch. | Launcher spec: "stops before it opens chat when the start page was left during preparation". Page spec: "cancels a pending launch on Back and shows no error". |
| 7 | `harness-chat-launcher.service.ts:155` | VALID | `openChatTab` read `workspaceRoot()` again after the RPC, so a workspace switch during preparation bound the tab to the wrong workspace. The launch is now pinned to the `root` that was checked. After the RPC, a changed root throws "The workspace changed while the chat was being prepared. Start again." The pinned `root` goes to `openChatTab` as `workspacePath`. | Launcher spec: "rejects a preparation result when the workspace changed during the RPC". |
| 8 | `harness-chat-launcher.service.ts:164` | VALID | The `requestCanvasTab` result was ignored (`void`), so a tab that the canvas refused still got the first message. The launcher now calls `requestCanvasTab(..., { timeoutMs: 10_000 })`, calls `setCurrentView('chat')`, and then awaits the result. On `false` it closes the tab with `closeTab(tabId, true)`, logs the error, shows a neutral banner with no tab ID, and throws. It does not send and does not call `removeSent`. | Launcher spec: "closes the tab and sends nothing when the canvas does not adopt it". The existing "binds the canvas tab..." assertion now includes `{ timeoutMs: 10_000 }`. |
| 9 | `harness-chat-launcher.service.ts:190` | VALID, NOT FIXED (out of scope) | After a failed first send, only the text is restored (`composerRestore.restore(tabId, [visibleMessage])`). `ComposerRestoreService.restore(tabId, texts)` takes text only. The attachments stay in the start page's `ComposerAttachmentsService`, which the view switch probably destroys. A fix needs an attachment restore API in `libs/frontend/chat/src/lib/services/composer-restore.service.ts` and in the chat composer that reads it. Those files are not in the allowed scope, so I did not edit them. | None. |

## Files changed

- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts`
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts`
- `libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts`
- `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts`
- `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.spec.ts`
- `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts`
- `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts`
- `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
- `.ptah/specs/TASK_2026_933_f1f9/review-round-2-fix-report.md` (this report)

No template changed, so `typecheck-templates` was not run.

## Verification

All commands ran from the worktree root, one at a time.

| Command | Result |
|---------|--------|
| `npm run verify -- -t test -p agent-sdk -- --testPathPatterns=codex-chat-adapter.spec` | First run: 1 failed, 119 passed (the new Stop test). After the fix: 1 task succeeded, 120 passed. |
| `npm run verify -- -t test -p chat -- --testPathPatterns=harness-chat-proposal` | 1 task succeeded. |
| `npm run verify -- -p onboarding` | lint + typecheck: 2 tasks succeeded. test: 1 task succeeded. Exit code 0. |
| `npm run verify -- -p agent-sdk,chat` | lint + typecheck: 4 tasks succeeded. test: 2 tasks succeeded. Exit code 0. |
| `npm run verify -- -t test -p agent-sdk,chat,onboarding -- --output-style=static` (cache replay to read counts) | agent-sdk: 228 suites passed, 2 skipped. 5767 tests passed, 5 skipped. chat: 357 suites passed. 6386 tests passed, 2 skipped. onboarding: 50 suites passed. 600 tests passed. |

The flaky `subagent-budget-monitor.spec.ts` did not fail in these runs.

## Decisions

- F1: A message-only publish port, which does not end the turn, would be a cleaner fix. It needs changes in rpc-handlers (`codex-chat-host-ports.ts` and `ChatStreamBroadcaster`). That is out of scope, so the notice waits for idle through the existing `peerQueue`.
- F3: The cancellation lives in the adapter, not in the codex-context question handler, because `setUserInputAnswerHandler` gets no abort signal. Stop always goes through `adapter.interruptSession`, so the adapter can abort reliably.
- F6: A cancelled launch throws `HarnessChatLaunchCancelledError`. The pages ignore it on purpose, because the user chose to leave. The check runs after the RPC. The RPC itself cannot be cancelled with the current `ClaudeRpcService.call` API.
- F6: Each launch has its own controller. A Back navigation that a guard cancels therefore does not block the next submit.
- F8: The launcher closes the refused tab with `closeTab(tabId, true)`, not `forceCloseTab`. The tab has no session yet, and `closeTab` runs the normal close cleanup. The banner text is neutral ("Could not show the new chat on the canvas. Try again.") because the cause can be the tile cap, a workspace mismatch or a timeout.
- F8: After the view switch, the start page is probably destroyed. Its draft text cannot be kept without a cross-page draft store. The attachments stay in the page service because `removeSent` is not called.
- F9: Not fixed. The fix needs `composer-restore.service.ts` and the chat composer, which are outside the allowed files. Recommend a follow-up that adds attachment restore to `ComposerRestoreService`.
