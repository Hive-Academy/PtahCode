# Review fix report — TASK_2026_933_f1f9

Nothing was run (no lint, typecheck or test). The coordinator runs `npm run verify`.

## Fixed

### 1. Launcher send failure visible (major)
- File: `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts` (`openChatTab`, catch block ~L171-190).
- Kept the earlier lane's edit after review. On failure or throw after the tab exists: logs, calls
  `ComposerRestoreService.restore(tabId, [visibleMessage])` (draft back in the tab composer), calls
  `ActionBannerService.showError(message, tabId)` (the chat banner already used for send errors), then rethrows.
  A preparation RPC failure still creates no tab and shows the error on the form (unchanged).
- `libs/frontend/chat/src/lib/services/index.ts`: exports `ComposerRestoreService` (and the proposal store symbols). Both
  services were already public in the chat barrel path; no new lib dependency for onboarding (it already imports `@ptah-extension/chat`).
- Spec: `harness-chat-launcher.service.spec.ts` — providers for both services; send-failure test asserts
  `showError` and `restore`; new tests for a throw and for no chat error on a preparation failure. Call order tests unchanged.
- Not checked (cannot run lint): the eager-bootstrap rule `checkDynamicDependenciesExceptions`. No new chat entry point was added.

### 2. Stale "applied" state
- `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts` (`applyProposal`, success branch).
  After success it compares the applied fingerprint with the current proposal. If different → `IDLE_HARNESS_APPLY_STATE`; return value stays `true`.
- Spec: `harness-chat-proposal.store.spec.ts` ("goes idle instead of applied when a newer proposal arrives…").

### 3. Apply button stays enabled
- `.../molecules/harness-proposal-banner/harness-proposal-banner.component.ts`: `isApplyDisabled` also true when
  status is `'applied'` with an unchanged (or unknown) fingerprint, and when `isConfigComplete === false`. The "Draft" hint stays.
- Spec: `harness-proposal-banner.component.spec.ts` (two new tests).

### 4. Async questions survive an answer-delivery turn
- Kept the earlier lane's edits (`codex-runtime.types.ts`, `codex-context.ts`, `codex-chat-adapter.ts`), reviewed:
  `start()` cancels pending async input only when `preservePendingUserInput` is not set; the adapter's delivery turn sets it;
  `interrupt` cancels pending input; `close()` aborts both controllers and clears the handler.
- Spec: `codex-context.spec.ts` ("keeps a second pending userInputAsync question answerable…", also covers user turn cancel and `close()`), and
  adapter spec for the follow-up turn. I did not run them.

### 5. Failed answer delivery gives a visible notice
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts`: the earlier lane only logged. I added
  `deliverUserInputAnswerWithNotice` + `publishAnswerFailureNotice`. On failure it publishes a short assistant
  text message ("Your answer could not be delivered to Codex. Send it again as a message.") through the existing
  `ports.publish` session stream (same event shape as the existing `failureNotice`), skipped for the gateway consumer or an untracked session, and rethrows so the context still logs.
  No new message type, no `libs/shared` change.
- Spec: `codex-chat-adapter.spec.ts` ("publishes a visible notice when delivery of an async answer fails").

### 6. Canvas tab workspace
- The launcher already used `this.workspaceRoot() || null` in `openChatTab` (the stopped lane did this; `requestCanvasTab`
  takes `string | null`, not `undefined`, so I kept `|| null`).
- Spec: "binds the canvas tab to the checked workspace when the active tab has no path".

### Lint gate (ui-class-audit)
- `harness-proposal-banner.component.ts`: Apply button now `button[ptahButton] variant="primary" size="xs" [busy]="isApplying()"`
  (`PtahButtonDirective` from `@ptah-extension/ui` added to `imports`). Interpolated class removed; `FOCUS_RING` const and `focusRing` field removed;
  static focus-ring and spacing classes (`gap-1 px-2.5 focus-visible:…`) kept because the directive gives none.
  The `loading loading-spinner` span was removed (the directive only dims the button; the text "Applying…" stays).
  `[disabled]`, click handler and `data-testid` kept; `aria-busy` now comes from the directive (`'true'` when busy).
  The rest of the file has no other raw `btn`/`alert`/`badge`/`loading` class.

## Not fixed
- None. Residual: the permission-cleanup side effect in finding 4 stays "suspected", not traced.
- Risk: `ptahButton` + `[disabled]`: the directive also blocks activation when busy; not verified by a run.

## Nx projects to verify
- `@ptah-extension/codex-runtime`
- `@ptah-extension/agent-sdk`
- `@ptah-extension/chat` (also `typecheck-templates` for `ptah-extension-webview` because of the banner template change)
- `@ptah-extension/onboarding`
- Plus lint/audit gate for `ui-class-audit` on the chat project.

## Decisions
- Reuse `ActionBannerService.showError` + `ComposerRestoreService.restore` (existing chat channels) over a new toast.
- Finding 5 channel: the session text stream (`ports.publish`), because no other existing notice channel exists in the adapter.
- Treat an `'applied'` state with an unknown fingerprint as already applied (store resets it on change).
- Finding 6: keep `|| null` for type compatibility.
