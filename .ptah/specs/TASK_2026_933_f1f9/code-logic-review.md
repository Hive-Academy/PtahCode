# Code Logic Review — TASK_2026_933_f1f9

Review family: anthropic-api (implementer: antigravity)

- Score: 6.5 / 10
- Verdict: PASS WITH FIXES (no blockers, 1 major, 5 minor)
- Scope: the full uncommitted diff against `main` (HEAD). It covers the Codex async question lifecycle, the
  host attention coordinator, the harness chat launcher and its two pages, the proposal store and banner,
  the onboarding routes, redirects and resume store, the deletion preserve list, and the two Electron e2e specs.
- Method: read-only git diff and full-file reads. No build, test, lint or typecheck commands were run (this was a brief constraint).

Score rationale: the core Codex fix is correct (the question signal is now independent of the turn
controller, and close and stop clean up). That puts it above the 5–6 band. One user-visible silent
failure in the launcher and two stale-state defects in the proposal flow keep it below 8.

## Findings

### 1. Major — A launcher send failure is never shown to the user
- Location: `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts:161` (navigation),
  `:171-186` (throw). Also `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:174`
  and the same `destroyRef.destroyed` guard in `new-project-intake.page.ts` submit.
- Failure scenario: `openChatTab` calls `appState.setCurrentView('chat')` before `sendOrQueueMessage`.
  The navigation destroys the onboarding page. If the send then fails (`outcome.success === false`,
  for example a provider or auth error, or a throw), the launcher logs and rethrows. The page catch
  sees `destroyRef.destroyed === true` and drops the message. The user is in an empty chat tab that
  has a preamble but no visible turn, and gets no error. The intake attachments are also not removed,
  but they are lost with the destroyed page-scoped `ComposerAttachmentsService`.
- Fix: show the failure on the chat surface (a toast or a tab-level notice through the existing
  notification service), or put the visible message in the tab composer as a draft so that the user
  can send it again. Alternatively, send before `setCurrentView('chat')` and navigate only on success.
- Label: confirmed by reading code.

### 2. Minor — The banner can say "Applied" for a proposal that was not applied
- Location: `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts:173-180`, with the
  push reset at `:366-378`.
- Failure scenario: the user clicks Apply. The agent then pushes a new revision while `harness:apply`
  is in flight (timeout up to 60 s). The push reset at `:366-378` does nothing because the status is
  `'applying'`. Apply then sets `'applied'` with the fingerprint of the OLD captured record. The banner
  shows the NEW proposal with "Applied · N files written", but the new proposal was never written.
- Fix: after a successful apply, compare `fingerprintHarnessConfig(record.configUpdates)` with the
  fingerprint of `this.proposalFor(trimmedId)?.configUpdates`. If they differ, set the idle state (or a
  "newer proposal available" state) instead of `'applied'`.
- Label: confirmed by reading code.

### 3. Minor — The Apply button stays enabled after a successful apply and for incomplete drafts
- Location: `libs/frontend/chat/src/lib/components/molecules/harness-proposal-banner/harness-proposal-banner.component.ts:244`
  (`isApplyDisabled`), template `:68` and `:95`.
- Failure scenario: `isApplyDisabled` checks only streaming and `'applying'`. After `'applied'` the
  user can click Apply again for the same fingerprint, and `harness:apply` writes the same files a second
  time with no confirmation. A draft with `isConfigComplete === false` can also be applied. The
  template only shows a hint.
- Fix: also disable Apply when `status === 'applied'` and the fingerprint is unchanged. Ask for
  confirmation (or disable) when `isConfigComplete` is false.
- Label: confirmed by reading code.

### 4. Minor — A new turn cancels every other pending async question of the session
- Location: `libs/backend/codex-runtime/src/lib/codex-context.ts:789` (`start()` calls
  `cancelPendingUserInput()`), `:256` (`cancelPendingUserInput`).
- Failure scenario: Codex asks two `request_user_input_async` questions. The user answers the first.
  `deliverAsyncUserInputAnswer` starts a follow-up turn (when there is no live turn to steer), and
  `start()` aborts `asyncInputController`. The second question card is cancelled and its answer can no
  longer be delivered. The abort path of the question callback also cleans up the session's pending
  permission prompts, so an unrelated pending approval of the same session can also be cleared.
  This side effect is suspected and was not traced to a line in this diff.
- Fix: in `start()`, cancel pending async input only when the user starts a turn, not when the turn
  is the delivery of an async answer. Or keep one controller for each question and abort only that question.
- Label: confirmed by reading code (cancel on start). The permission-cleanup side effect is suspected.

### 5. Minor — A failed async answer delivery loses the answer with no notice to the user
- Location: `libs/backend/codex-runtime/src/lib/codex-context.ts:1001-1015` and `:996`,
  `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:689-699`.
- Failure scenario: the user answers an async question while the session is closing, blocked,
  compacting or replaced. `deliverUserInputAnswer` throws `CodexChatAdapterError('unavailable','followUp')`.
  `deliverAsyncUserInputAnswer` catches the error and only calls `warnDenialFeedback('failed', ...)`. The
  question card is already resolved in the UI, so the user believes that the agent received the answer.
- Fix: send a visible notice to the chat session (for example a system or status message) when
  the delivery fails. Or put the answer text in the composer so that the user can send it again.
- Label: confirmed by reading code.

### 6. Minor — The canvas tab can be bound to a different workspace from the one that was checked
- Location: `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts:151`
  (compare with `:46-49`).
- Failure scenario: `workspaceRoot()` falls back to `vscode.config().workspaceRoot` when
  `tabs.activeWorkspacePath` is undefined. The launch guard passes on that fallback. `openChatTab` then
  sends `this.tabs.activeWorkspacePath` (undefined) to `requestCanvasTab`, so the canvas adoption has no
  workspace while the preamble was prepared for the fallback root.
- Fix: use `const workspacePath = this.workspaceRoot() || undefined;` in `openChatTab`.
- Label: confirmed by reading code.

## Decisions

- Decision: classify finding 1 as major, not blocker. Options: blocker / major. Evidence: the tab
  state still goes idle in `message-sender.service.ts:700-740`, so the chat is not stuck, but the
  error text is lost. Reversible: yes.
- Decision: do not report F4-C (close the Codex session after turn 1) as missing. Evidence:
  `endSessionIfTokenMatches` for Codex always returns false, so the broadcaster does not close the
  session. Reversible: yes.

## Checked and found correct

- `asyncQuestionSignal()` combines only `contextController` and `asyncInputController`. A turn
  end no longer aborts an open async question (this is the main bug of the task).
- `close()` aborts both controllers and clears `userInputAnswerHandler`. The adapter clears the
  handler on session close (`codex-chat-adapter.ts:581`, `codex-chat-session-controls.ts:114`). The stop
  path cancels pending input only when the session is not busy.
- The adapter sets the answer handler in the single `publishSession` path (`codex-chat-adapter.ts:443-444`),
  so the resume path is covered. A rejected steer falls back to the peer queue.
- `HostAttentionCoordinator`: `resolvedRequests` and the generation check after `await metadata.get`
  stop a late claim from bringing back a resolved request. `drop(key, expectedGeneration)` does not
  remove a newer generation.
- The proposal store is registered at bootstrap through `provideHarnessChatProposalStore()` in
  `app.config.ts`. The hydrate merge uses a version guard. The double-apply guard is at store `:148`.
- The banner is OnPush and uses only text interpolation (no `[innerHTML]`). It mounts only when the
  chat view is not read-only.
- The routes: flat `new-project` and `team-builder` routes. Legacy paths go to `/onboarding` through
  `onboardingHomeRedirect`. The focus router returns null for harness workflows, so the chat focus handles them.
- The resume store no longer reads the deleted harness records. Its catch blocks have
  degradation-audit comments. The new catch blocks in `codex-context.ts` and the intake page also have them.
- Stale references: a grep for the deleted symbols, selectors and routes found only the intentional
  negative guards in `unit5-message-routing.spec.ts`.
- Electron e2e `new-project-question-routing.spec.ts`: the selectors exist
  (`onboarding-path-link-new-project` from `path-tile.component.ts:67`, `#project-what` from
  `new-project-intake.page.ts:130`, `ptah-question-card[data-request-id]` from
  `chat-view.component.html:204`). The mocked RPCs `harness:initialize` and `harness:start-new-project`
  are in `libs/shared/src/lib/types/rpc.types.ts`.
- `tasks/message-handlers-eager.spec.ts`: the removed harness test matches the removed
  `HarnessWorkflowMessageHandler`. The remaining TasksStore test is unchanged in behavior.
- The prompt text in `harness-constants.ts:219` and `harness-workflow-prompt.service.ts:80` is
  provider-neutral. The team builder sends the intent as the visible message, not in the preamble.

Remaining uncertainty: I did not confirm that the `getCallerSdkSessionId()` value in the
`proposeConfig` broadcast equals the chat tab's `resolvedSessionId()` for Codex sessions. If they differ, the banner
will not show for Codex tabs. An Electron run with a Codex session can confirm this.
