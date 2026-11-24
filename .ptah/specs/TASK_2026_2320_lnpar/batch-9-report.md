# Batch 9 report: F3 shared queued message list

Executor: frontend-developer subagent (Claude). Skills loaded: angular-frontend-patterns, angular-developer.
Worktree: `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity` (base HEAD 536e0b01f). No git run.

## Task 9.1: QueuedMessageListComponent; wrapper adopts it: done

### Files

- CREATED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\queued-follow-ups\queued-message-list.component.ts`.
  Presentational `ptah-queued-message-list` (standalone, OnPush). Exports `QueuedMessageView` and `QueuedSendNowAction`.
- CREATED `...\queued-follow-ups\queued-message-list.component.spec.ts`: 8 tests.
- MODIFIED `...\queued-follow-ups\queued-follow-ups.component.ts`. The wrapper keeps the store, the
  `FollowUpQueueService` calls and the pending set. It maps entries to views and renders the list.
- MODIFIED `...\queued-follow-ups\queued-follow-ups.component.spec.ts`: asserts the note ink. Adds an
  "in-flight action disables both buttons" test.

### Contract as built

- Inputs: `items: readonly QueuedMessageView[]` and `sendNowAction: QueuedSendNowAction`
  (`{ label: 'Send now' | 'Interrupt & send'; hint; state: 'available' | 'unavailable' | 'hidden'; reason? }`).
- `QueuedMessageView`: `id, content, statusLabel, note?, withdrawable, senderNote?`, plus `busy` and
  `sendable` (see Decisions).
- Outputs: `withdraw` (item id) and `sendNow` (item id). `sendNow` is not emitted while the state is `unavailable`.
- Markup is the old card. Testids are kept: `queued-follow-up-item`, `queued-follow-up-status`,
  `queued-withdraw`, `queued-follow-up-send-now`. New testids: `queued-sender-note` and `queued-send-now-reason`.
- Shared fix (decisions.md 9): "Queued" changed from `text-primary` to `text-base-content`, and the note from
  `text-warning` to `text-state-need`. The `state-need` colour is defined in
  `apps/ptah-extension-webview/tailwind.config.js:34`. The clock icon stays primary.
- `unavailable`: the primary xs button keeps its label. It has `aria-disabled="true"` and no click handler,
  and it stays focusable. `aria-describedby` points at a line under the actions that reads
  "Send now unavailable: <reason>". `ptah-button.css` already styles `[aria-disabled='true']` as disabled.
- `withdrawable: false`: Withdraw is replaced by the `senderNote` text, for example "Sent by the parent session".

### Main chat behaviour

Only the contrast fix changes what main chat looks like. The wrapper maps:
- `busy = phase === 'submitting' || pending`
- `sendable = phase === 'queued'`
- state is `available` when `canSendNow`, otherwise `hidden`
- label and hint come from `isClaudeSession`, with the same strings as before

The disable rules and the titles match the old template exactly:
- Withdraw is disabled when the item is submitting or pending.
- Send now is disabled when the item is not queued or is pending.
- The title is the hint when the item is queued, otherwise the status label.

The aria-labels and the 100-character preview are also unchanged. The withdraw and sendNow calls and the
double-click guard (`track`) are unchanged too. Ids are resolved back to the entry in the current list.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Add `busy` and `sendable` to `QueuedMessageView` | (a) two per-item flags; (b) list keeps its own pending set | Plan "Failure behaviour: a pending action disables the item's buttons". Only the host knows when an async action ends, so the flags are needed to keep main chat's per-item disable rules exactly | yes |
| Input named `sendNowAction`, outputs `withdraw` and `sendNow` | Plan names both an input and an output `sendNow` | A class cannot have two members with one name, and aliasing trips `no-input-rename` | yes (rename only) |
| The component writes "Send now unavailable: " and the caller passes only the cause | caller passes the full sentence vs component prefixes it | design-spec 6.1 example line; capability reasons are cause sentences | yes |
| No barrel export | export from `libs/frontend/chat` index now vs when needed | lane composer (Batch 11) is in the same lib and can import relatively; the wrapper had no export either | yes |

## Verification (one check at a time)

- `npm run verify -- --related -p @ptah-extension/chat` gave exit 0, "1 task: 1 succeeded" and
  "lock released after 39.5s, exit code 0". The Nx output was not inlined, so a focused run follows.
  Log: `.ptah/tmp/w4-b9-related.log`.
- `npm run verify -- -t test -p @ptah-extension/chat -- --output-style=static "--testPathPatterns=(queued-follow-ups|queued-message-list|agent-follow-up-queue)"`
  gave exit 0: "Running target test for project @ptah-extension/chat", "Test Suites: 3 passed, 3 total",
  "Tests: 28 passed, 28 total". The 3 suites are the two queued specs and
  `libs/frontend/chat/src/lib/services/agent-follow-up-queue.service.spec.ts`, which closes the Batch 7 gap in
  executor-notes. Log: `.ptah/tmp/w4-b9-tests.log`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/chat` gave exit 0, "2 tasks: 2 succeeded".
  Log: `.ptah/tmp/w4-b9-lint.log`.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview` gave exit 0, "1 task: 1 succeeded" and
  "lock released after 40.6s, exit code 0". Log: `.ptah/tmp/w4-b9-templates.log`.
- No run was killed for low memory. Build, serve and e2e were not run. The visual review is the Phase P2
  review's job (Electron, both Anubis themes).

## Risks and hand-off

- Phase P2 review is due: code-logic, style, and visual. The visual check covers the main chat queued card in
  both Anubis themes, to confirm the `text-base-content` and `text-state-need` ink.
- Batch 11 (lane composer) builds `QueuedMessageView`s from the lane queue. It must set `busy` and `sendable`
  and pass `state: 'unavailable'` with a `reason` when the lane has no Send now.
- Out of scope, not touched: none.
