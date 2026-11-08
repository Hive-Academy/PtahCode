# Batch 25 report — C10c remote sessions (Tasks 25.1, 25.2, revised Round 6)

Worktree: `.claude-worktrees/remote-workers-phase-f` (branch `feat/remote-workers-phase-f`). Nothing committed.

## Files

All under `libs/frontend/machines-ui/src/`.

Task 25.1
- CREATED `lib/components/remote-approval-block/remote-approval-block.component.ts` (+ spec): `ptah-remote-approval-block`. Modes `answerable` (4.7), `watch-only` (4.9 screen 9: no buttons), `cached` (9c). Untruncated arguments, 7c neutral denial, the decision-27 countdown and timeout copy.
- CREATED `lib/components/remote-session-list/remote-session-list.component.ts` (+ spec): `ptah-remote-session-list`. Sessions grouped by workspace, the `Driver: <label>` chip, "Unknown" while the machine is not connected (3.4), Reload, and "New session" (workspace and first message → `startSession`).
- CREATED `lib/components/reconnect-banner/reconnect-banner.component.ts`, `session-sync-chip.component.ts`, `session-sync.ts` (+ one spec): the 4.8 "Reconnected" banner (closed only by the user), the header chip "Caught up" / "Catching up..." / "Fetching missing events", and the pure `sessionSyncState()` / `replaySummary()`.
- CREATED `lib/utils/remote-session-copy.ts` (+ spec): the timeout facts restated from worker-runtime (`REMOTE_PERMISSION_TIMEOUT_SEC = 60`, `REMOTE_PERMISSION_TIMEOUT_BY = 'Worker timeout'`, a spec pins both), countdown and timeout copy, `GRANTS_COMMAND` and `locksReleaseCommand(id)` (both built from `WORKER_REMOTE_COMMAND`, imported from `@ptah-extension/worker-protocol` as Batch 24 did), the 7c copy, session state labels, and the 4.9 banners (9, 9b, stranded, 9c remote, 9d).
- MODIFIED `lib/utils/display-text.ts` (+ spec): added `displayBlockText()`, a sibling of `displayText`. It applies the same character rules and keeps `\n` and tabs (`\r\n` and `\r` become `\n`). It has no length cap and does not collapse whitespace.
- MODIFIED (additive, service) `lib/services/session-event-reducer.ts` (+ spec): new state field `timedOutPermissions` and constant `MAX_TIMED_OUT_PERMISSIONS = 20`. A `worker:permission.answered` with `by: 'Worker timeout'` moves the pending request there. A new turn, a baseline, a new log or a snapshot clears it. `MachinesStore` needed no change, because `RemoteSessionView` extends the reducer state.

Task 25.2
- CREATED `lib/components/remote-session-view/remote-session-view.component.ts` (+ spec): `ptah-remote-session-view`. It contains the header, the 4.9 banners, the stale notice, the reconnect banner, the transcript, the approval blocks and the composer.
- CREATED `lib/components/remote-session-view/remote-transcript.component.ts`: `ptah-remote-transcript`, which renders the execution trees with the chat-ui pieces.
- CREATED `lib/utils/remote-transcript.ts` (+ spec): `buildRemoteTranscript()`. It turns the flat events into `StreamingState` the way the local accumulator keys it, then calls the `@ptah-extension/chat-execution-tree` builders.
- MODIFIED `lib/components/machines-view/machines-view.component.ts` (+ spec): the machine detail now lists sessions. The new pane mode `'session'` shows the opened session with "Back to <Machine>".
- MODIFIED `index.ts`: exports the new components, the sync helpers, `displayBlockText`, the timeout constants and `MAX_TIMED_OUT_PERMISSIONS`.

No `project.json` or `package.json` change. The lib now imports `@ptah-extension/chat-ui`, `@ptah-extension/chat-execution-tree`, `@ptah-extension/chat-types` and `@ptah-extension/markdown`. All are `scope:webview` or `scope:shared` libs with an allowed type, and lint passes.

## A7 result

- **`@ptah-extension/chat` is not usable.** `MessageBubbleComponent` injects `ChatStore` (TabManager state). `ExecutionNodeComponent` and `ToolCallItemComponent` are not exported from the barrel. Batch 26 will also make `chat` (the electron shell's tab badge) depend on machines-ui, so importing `chat` here would create a cycle.
- **Fallback used:** the `@ptah-extension/chat-execution-tree` builders (`buildMessageNode` and the rest, with a local `BuilderDeps` wired like `ExecutionTreeBuilderService`). Rendering reuses the presentational pieces from `@ptah-extension/chat-ui`: `ToolCallHeaderComponent`, `ToolInputDisplayComponent`, `ToolOutputDisplayComponent` and `ThinkingBlockComponent`. Text renders through `MarkdownBlockComponent` from `@ptah-extension/markdown`.
- **Host tokens these pieces need:** `SURFACE_ACTIVE` (thinking, tool input, code output) and `FILE_LINK_OPENER` (tool header). The view provides its own `FILE_LINK_OPENER`. A remote path is never opened on this machine; the view shows "<path> is on <Machine>. Open it there." instead. **Batch 26 must provide `SURFACE_ACTIVE` on the Machines route** (`surfaceActiveFor('machines')`, the way the Tasks route does), and markdown rendering must be in scope (app-level `provideMarkdownRendering`).

## Specs per state

| Component | States pinned |
| --- | --- |
| approval block | 4.7 pending: badge, title, Tool and Arguments, Allow once and Deny, hint. D8: a 5 000-character argument is shown whole, the RLO character is stripped, the block scrolls horizontally, and `<img>` stays text. Emits the decision. Decision 27: "Denied automatically in 42 s" counts down, and at expiry the buttons are disabled with "No answer within 60 s — the worker denied this request." The countdown interval stops at expiry and on destroy. The `timedOut` input shows the same copy with no timer. `timeoutAt: 0` stays pending with no timer. 7c: neutral `role=alert` copy naming `<WORKER_REMOTE_COMMAND> grants`, buttons disabled. An offline machine disables the buttons and gives the reason. 4.9 watch-only: no buttons, `tabindex=0`, "Answer this request at Horus…". 9c cached: read-only and not claimed pending. |
| session list | Loads workspaces and sessions when connected. Workspace path headers, state labels, Open names ("…, driven by Horus keyboard, watch only") and the driver chip. Offline: loads nothing, shows "Unknown", never "failed", no New session. Load error `role=alert` with Try again. New session: placeholder "Message Claude on Horus", Start disabled until there is text, calls `startSession` and opens the result. |
| reconnect banner / chip | A gap reads "Fetching missing events"; an attach or replay reads "Catching up..."; otherwise "Caught up"; snapshot and detached show nothing. Banner text: "Replayed 37 events from #1204 to #1241 … No gaps, duplicates removed." only once complete. Nothing is claimed while the replay runs. The banner closes only on the user's action. The chip has no button, and its marker has `motion-reduce:animate-none`. |
| session view | Attaches on open and detaches on destroy. Header "on Horus · <path>", "Claude on Horus", user bubble. Composer 4.6: Send needs text; with a turn in flight the input stays enabled, the placeholder is "(a turn is in progress)", Send is disabled, the live region says "Claude is responding", and Stop is enabled. A sent message clears the draft. A refused send keeps the draft. 9: watch-only banner, `Driver:` chip, "Showing the last saved state", "Saved up to … Newer activity is not shown.", native-disabled input, Send and Stop with `aria-describedby`, Refresh re-attaches. 9b: the release command for this session. 9c: `role=alert`, `DRIVER_LOCK_UNAVAILABLE`, "Not available", the empty-history text, no owner text and no `SESSION_DRIVER_LOCK_UNAVAILABLE` anywhere. 9c cached: "Cached from …", read-only block. 9d: "Horus keyboard finished…", chip "Idle", composer enabled with the draft kept, Close. Approvals: answer → `respondPermission`; 7c copy. A timed-out request shows the timeout copy. 3.4 offline: stale notice, never "failed", Send disabled with the reason. 4.8: offline → online shows the replay banner and the gap chip, then the complete numbers. File links are never opened locally. |
| reducer | A timeout answer moves the request to `timedOutPermissions`; the next turn clears it. An answer by someone else is not a timeout. |
| transcript util | Root messages in order. A tool node carries its parsed input and its result. A5: history plus the live copy gives the same shape as one copy. Empty input gives no items. |
| machines view | Open from the list shows the session view; Back detaches and shows the list again. |

## Verification

Command: `npm run verify -- -p @ptah-extension/machines-ui`.

- First run: lint and typecheck, **2 tasks succeeded**. Test: **1 failed**. 17 of 18 suites and 202 of 207 tests passed. The 5 failures were the timer-count assertions in the approval-block spec: `jest.getTimerCount()` also counted Angular's own timeouts (Batch 24 hit the same brittleness).
- Fix: the spec now tracks the block's own `setInterval`/`clearInterval` calls.
- Re-run (`npm run verify -- -t test -p @ptah-extension/machines-ui`): **1 task succeeded, 18 suites, 207 tests passed**, exit code 0. Lint and typecheck had already passed on the same sources; only the spec changed after that run.

A grep confirms no literal bidi or zero-width characters in `libs/frontend/machines-ui/src`. The writing tool turned `‮`-style escapes into literal characters again, so the specs now build such characters with `String.fromCodePoint`.

No screenshots: the visual review in Electron comes after Batch 26.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| A7 fallback: chat-execution-tree builders plus chat-ui presentational pieces | import from `@ptah-extension/chat`; builders plus chat-ui; own renderer | `message-bubble.component.ts:149` injects `ChatStore`; the chat barrel does not export `ExecutionNodeComponent`; Batch 26 adds a chat → machines-ui edge | Yes |
| The view provides its own `FILE_LINK_OPENER`, which never opens remote paths locally | inherit the app opener; no-op; notice | Tool paths belong to the remote machine; the app opener (`FileLinkRouterService`) opens local files | Yes |
| The timeout state lives in the reducer (`timedOutPermissions`); a new turn clears it | component-local memory; reducer field | The pending request is removed on `worker:permission.answered`, so the notice needs a record that survives re-renders; a small additive change | Yes |
| The 60 s and `'Worker timeout'` values are restated in the renderer, with a spec pinning them | import worker-runtime | A webview lib may not import backend libs (task instruction) | Yes (moving them to `libs/shared` would remove the duplicate) |
| The countdown uses `timeoutAt` as the worker's deadline; `timeoutAt: 0` keeps "Stays pending, like a local request." | always assume 60 s | Decision 27: the forwarded `timeoutAt` is the deadline; older workers send 0 | Yes |
| 9c shows the remote-client copy and `DRIVER_LOCK_UNAVAILABLE`, not `SESSION_DRIVER_LOCK_UNAVAILABLE`, and no `ref` | show the RPC code; invent a ref | Design 4.9 9c (G-D approved): the Machines view is always the remote client. `machines-rpc.handlers.ts:22` sends fixed text with no ref. The batch's "`SESSION_DRIVER_LOCK_UNAVAILABLE` fix text" is met by the fix sentence ("Try again… check the Ptah log on <Machine>") and Refresh | Yes |
| The 9b and stranded fix line shows `${WORKER_REMOTE_COMMAND} locks release <session id>` | only 9b | Round 6 copy names the stranded fix line; `worker-host/dispatch.ts:134` defines `locks release <sessionId>` | Yes |
| The 7c grants command is `${WORKER_REMOTE_COMMAND} grants` | `workspace list` | `dispatch.ts:107` (`grants` lists the access); design 4.7 asks for the grants list | Yes |
| Holder kinds come from the label suffixes `(not responding)` and `(release pending)` | a new field | The remote client receives only the label (W8); the suffixes come from `kernel-session-driver-lock.ts:22,132` | Yes |
| The replay banner counts from `last` at reconnect to `last` now, and says "No gaps" only when caught up | wait for an end-of-replay signal | Main re-attaches itself (`machine-connection.ts`), and no end-of-replay marker reaches the renderer | Yes |
| The session list and view are wired into `machines-view` (pane mode `'session'`) | leave unwired for Batch 26 | Batch 24 left "remote session list, New session and the session view" to this batch; the shell and routes stay Batch 26 | Yes |
| Local idiom for form fields (`[value]` + `(input)`), no FormsModule | FormsModule | `add-machine-pane.component.ts` uses native events | Yes |
| Own caret (`animate-pulse motion-reduce:animate-none`) instead of chat-ui `TypingCursorComponent` | reuse TypingCursor | TypingCursor's blink ignores reduced motion; design 4.6 requires it to stop | Yes |

## Not done / open

- `permission:auto-resolved` and `permission:session-cleanup` still do not clear pending requests. Their payloads are not typed in `libs/shared`: only the names exist in `message-constants.ts:252-253`, and the chat handler casts `{ id, toolName }` and `{ sessionId }` (`chat-message-handler.service.ts:1019-1056`). Per the instruction, this stays as it was.
- 4.8 transcript dividers ("Connection lost 14:07:02", the dashed "Replayed" box, "Reconnected … live") are not drawn. The reducer keeps no positional reconnect marks; this needs a reducer-level marker in a later batch.
- 4.9 "when the session list reloads" re-check: the view re-checks on Refresh and on window focus; a list reload does not re-attach an open view.
- 4.9 9d crossfade is not implemented: the banner swaps instantly, which is also the reduced-motion rule.
- 4.7 Phase 2 states ("Already answered", "You allowed this") are out of Phase 1.
- Batch 26: provide `SURFACE_ACTIVE` on the Machines route; the shell, tab, badge and app config remain Batch 26.
