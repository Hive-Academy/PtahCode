# Frontend panel fix report - TASK_2026_2325_lvrf

Scope: lane panel, dock pill, footer status, lane transcript, canvas lane tabs, inspector, prompt
announcements (`libs/frontend/**`, without the lane composer folder, `agent-delivery.store.ts` and
`lane-option-labels.ts`). Line numbers below are the line numbers in the working tree after the change.

## 1. Stop button placement

- Root cause: `libs/frontend/chat-ui/src/lib/molecules/composer-compact-bar.component.ts`. Before the
  change, the expand button ended with a `ml-auto` ChevronUp, and the 28 px Stop circle sat next to it
  with only a `gap-1` (4 px) between them. A lane turn folds the composer into this bar, so a click
  aimed at the chevron landed on Stop. In the log, the stop came 1.8 s after the turn started.
- Change: the chevron now comes first in the expand button. A vertical rule
  (`data-testid="composer-compact-stop-divider"`, line 77) separates the expand button from Stop.
  Stop is now a pill with a visible "Stop" label. It keeps `aria-label="Stop generating"` and has the
  tooltip "Stop generating: ends the current turn" (line 82). The chat composer and the lane composer
  both use this bar, so both get the fix.
- Spec: new `composer-compact-bar.component.spec.ts`. It checks the chevron position, the divider
  order, the label and tooltip, and that each button emits only its own event. Result: 3/3 pass.

## 2. Status consistency (D9, D13 and the timeline)

Root causes:
- `agent-process-manager.service.ts:3614-3651` (backend, not changed by me) stamps `stopped` and emits
  `agent:exited` before the Claude SDK process exits. `handleExit` then emits a second `agent:exited`,
  still `stopped`, 3 s after the real exit. The frontend showed `stopped` from the first event:
  `agent-monitor.store.ts` `onAgentExited` copied `info.status`.
- `agent-continue-input.component.ts` (old resumePath) returned "Continue warm session" whenever
  `supportsContinuation` was true, even when a stop had already killed the process.
- `lane-thread.ts` (completion verdict) mapped the parent delivery verdict `failed` to a red "Failed"
  card. `lane-thread-row.component.ts` kept the "Waiting for parent / Cancel" row visible for a
  pending delivery.

Changes:
- `agent-monitor.store.ts`: `MonitoredAgent` gets three new fields: `stopRequestedAt`,
  `stopAcknowledged` and `stoppedByUser`. Two new store methods: `markStopRequested` (line 1625) and
  `cancelStopRequest`. A new function, `settleStopRequest`, decides when "Stopping…" ends. It ends at
  the second `stopped` exit, on any exit that carries `exitCode`, or on any non-stopped terminal
  status. If none of these arrives, `STOP_EXIT_FALLBACK_MS` (20 s) ends it; that timer is cleared on
  exit and on destroy. A re-open clears all three fields.
- `agent-card.component.ts` `stopAgent`: calls `markStopRequested` before the `agent:stop` RPC, and
  `cancelStopRequest` when the RPC fails.
- The status word set (`agent-avatar.types.ts`) gets a new word, `stopping`. `agentStatusText` shows
  it as "stopping…". `cliLaneStatusWord` (`agent-status.ts`) returns `stopping` while a stop is
  pending, and returns `stopped` for a user stop that an older host reports as `failed`. The roster
  (`session-agent-roster.ts:170`) passes these fields through. The dock pill, the dock card, the dock
  menu, the avatar records, the compact rows and the turn-context live set all handle the new word.
- Footer (`agent-continue-input.component.ts:84-100`): shows "Stopping…" until the exit, then
  "Stopped by you". The budget stop text and the guard stop text are unchanged. "Failed" no longer
  appears for a user stop. The Stop button shows its spinner while the stop is pending.
- Resume hint: "Continue warm session" now appears only for a lane whose status is `completed`. A
  stopped, failed or timed-out lane shows "Resume CLI session …" or "Start fresh handoff".
- Transcript (`lane-thread.ts:169`, `lane-thread-row.component.ts`): a stopped completion now reads
  "Stopped by you", "Stopped" or "Stopped by Ptah budget monitor". It uses neutral info styling and a
  pause icon, never the error styling. A pending or sending parent delivery is hidden for a stopped
  completion. Deliveries that need a retry still show.

Timeline mismatches fixed:

| Timeline row | Before | After |
| --- | --- | --- |
| 12:12:53.0 Stop, process still alive until 12:13:03.2 | Pill "stopped 3m 03s", footer "Stopped" | Pill "stopping…", footer "Stopping…" until the process exit event. Then "stopped" and "Stopped by you" |
| Same moment, composer hint | "Continue warm session" on a killed process | "Resume CLI session …" or "Start fresh handoff" |
| Same moment, transcript | Pink "Failed / Waiting for parent · Cancel" card | Neutral "Stopped by you" row with no waiting/cancel prompt |
| 12:09:04.8 first Stop, output arrives at 12:09:05 and 12:09:08, exit at 12:09:11.9 | "stopped" while output still arrived | "stopping…" until the exit. The late output itself is a backend matter, see below |
| After resuming a stopped lane | View jumps to the Orchestrator | Stays on the lane (task 4) |
| Header timer counts idle time (D10) | 3m 03s including idle time | Turn duration (task 3) |

- Specs:
  - New `agent-monitor.stop-and-turn.spec.ts` (11 tests): the two-exit stop, the exitCode exit, the
    fallback timer, an RPC failure, Stop on a lane that is not live, and the pure helpers.
  - `agent-continue-input.component.spec.ts` (+4): "Stopping…", "Stopped by you", failed→stopped and
    the warm-session hint.
  - `session-agent-roster.spec.ts` (+3).
  - `lane-thread.spec.ts` (+1) and `lane-thread-row.component.spec.ts` (+1).
  - `canvas-lane-tabs.component.spec.ts`: pill "stopping…".
  - Result: all pass (see Verification).

## 3. Header timer: decision

- Root cause: `agent-monitor.store.ts` `onAgentSpawned`. The re-open branch kept `existing.startedAt`,
  and the roster used it as `SessionAgent.startedAt`. A warm lane runs every turn on one record, so
  the pill counted from the first start, idle time included.
- Decision: while a turn runs, the pill shows that turn's running time. When the lane is idle or
  stopped, it shows the last turn's duration (turn start to `completedAt`). The inspector "Time"
  column reads the same row, so it agrees with the pill.
- Change: new field `MonitoredAgent.turnStartedAt`. A fresh card and a replacement card set it to the
  record start. The re-open branch (line 1820) calls `reopenedTurnStart`, which uses the host's
  `lastActivityAt` stamp (the same value as the backend's `tracked.turnStartedAt`) when a new
  `turnSeq` or a non-live card starts a turn. A duplicate spawn of the same turn keeps the known start.
  A restored card falls back to `startedAt`. The roster uses `turnStartedAt ?? startedAt` (line 175).
- Specs: in `agent-monitor.stop-and-turn.spec.ts` and `session-agent-roster.spec.ts`.

## 4. D3: sending to a stopped lane jumps to the Orchestrator

- Root cause: resuming a stopped lane spawns a new agent id. `onAgentSpawned`/`findReplacementCard`
  replaces the old card with the new one. The canvas selection still held `cli:<oldId>`, so
  `effectiveCanvasLaneKind` (`canvas-lane-view.component.ts:41-57`) and
  `CanvasLaneTabsComponent.selectedKey` found no agent and fell back to `orchestrator`.
- Change: `AgentMonitorStore` records the old id → new id link when it replaces a card (line 1874). It
  keeps at most 200 links, oldest dropped first, in a signal. `currentAgentId(id)` follows the chain.
  `CanvasDetailService.laneKeyFor` (`canvas-detail.service.ts:28-46`) turns a stored `cli:` key into
  the current id, so the dock, the lane view and the rail all stay on the resumed lane.
- Spec: `canvas-detail.service.spec.ts` "keeps the user on a resumed lane whose agent id changed", and
  the store spec "follows a resumed lane to the card that replaced it". Both pass.

## 5. D5: image thumbnails in the user echo - blocked on the backend/shared contract

- Root cause: the echo node receives only text. `agent-message-router.service.ts:196-198`
  (`userEchoSegment`) builds `{ type: 'user', content: body, sentAt }`. `CliOutputSegment`
  (`libs/shared/src/lib/types/agent-process.types.ts`) has no image field.
  `AgentMonitorTreeBuilderService` (`agent-monitor-tree-builder.service.ts:487-496`) can copy only
  `content` and `sentAt` into the echo node. The sent images exist only in the composer and delivery
  store before the send; `agent-delivery.store.ts` keeps them only for unsent recovered messages.
- Not changed: drawing thumbnails needs the image data on the echo, which only the backend/shared
  owner can add. Writing frontend code against a field that does not exist yet would be guessing.
- Needed (backend/shared owner): add `images?: readonly InlineImageAttachment[]` to
  `CliOutputSegment`, set only on `user` segments, and pass `turn.images` into `userEchoSegment` in
  `echoDelivered`. Cap the data size if needed, or send small thumbnails. After that, the frontend
  change is small and in my area: carry `segment.images` on the echo node in the tree builder and
  draw it in `laneTranscriptMessages` and `message-bubble`, which today only shows a count badge
  (`imageCountLabel`).

## 6. Stale "Permission: …ptah_agent_spawn … Needs your attention." node

- Root cause: `libs/frontend/notification-center/src/lib/notification-announcer.component.ts`. The
  screen-reader live regions kept the last announced text forever. When an item was resolved, it was
  removed only from the `announced` set, so its text stayed in the DOM.
- Change: each region remembers the identity of the text it shows. `dropResolved` (line 74) clears a
  region whose item is no longer open, removes queued text for resolved items, and cancels a write
  that is in flight.
- Spec: `notification-announcer.component.spec.ts` "removes the announcement of a permission once it
  is answered". 2/2 pass.

## 7. Grok hover tooltip stays open after tab clicks

- Root cause: `canvas-lane-tabs.component.ts` closed the hover card only on `pointerleave` or blur,
  through a 220 ms idle check that also bails while `tabHoveredKey` matches. A click re-renders the
  chips: the selected chip switches between the pill and circle templates. So the `pointerleave` that
  closes the card never fires, and the card stays open (`31-t4b-sent.png`).
- Change: a tab click, a pointerdown anywhere (`document:pointerdown`), or the window losing focus
  (`window:blur`) now calls `dismissCard()` (lines 105-106 and 494-507). It closes the card, forgets
  the hovered chip and cancels any pending open timer.
- Spec: `canvas-lane-tabs.component.spec.ts` "closes a hover card on a click anywhere and when the
  window loses focus, with no pointerleave". Pass.

## 8. Inspector shows `claude-fable-5-2` while the pill says Haiku 4.5

- Root cause: `inspector-session-stats.component.ts` `modelNames`. The Models tile summary used the
  first entry of `snapshot.modelUsageList`, which is in first-use order. For a session that started
  on fable and later moved to Haiku, that entry is the session's first model, not its current one.
  The AGENTS Orchestrator row already showed Haiku 4.5. The "claude-fable-5-2 +2" text was this
  summary.
- Change (line 384): the summary now starts with the session's current model (`liveModelStats.model`,
  else `snapshot.model`), followed by the other models it used.
- Note: if the SDK session really still runs on its original model (F9: "the SDK orchestrator session
  keeps its original model"), `liveModelStats.model` reports that model, and it is then correct to
  show it. That would be a backend model-switch defect, not a display one.
- Spec: `inspector-session-stats.component.spec.ts` "leads the models summary with the session's
  current model". Pass.

## 9. T2: one echo for two queued messages - the split belongs outside my area

- Data path: the lane composer's `lane-delivery.controller.ts` (the queue send comment) and the
  delivery store's `mergeRecovered` (`agent-delivery.store.ts:255-278`) fold earlier queued text into
  one message. The backend then gets one message and echoes it as one `user` segment whose body has
  two lines. The transcript cannot tell two messages from one message with a line break, so splitting
  it in the transcript would break real multi-line messages.
- Needed (composer/delivery owner): either queue each message as its own delivery, which gives one
  turn and one echo each, or keep one turn but send the parts as separate `echo` entries. Backend
  side: `RouteTurnInput.echo` would become a list, each recorded by `recordAgentNote`. Once the
  segments arrive separately, the transcript already renders one bubble per `user` segment.

## Backend contract requests (for the backend agent)

1. Stop (D9): either emit the post-exit `agent:exited` with the process `exitCode` set on the info
   (in `handleExit`'s already-terminal branch, `tracked.info.exitCode = code`), or emit only one
   `agent:exited` after the process is gone and include `exitCode`. The frontend ends "Stopping…" on
   the first exit that carries `exitCode`, or on the second `stopped` exit. The 20 s fallback covers
   a stop that never gets a process exit.
2. Late output after Stop (first Stop at 12:09:04.8, assistant output at 12:09:05 and 12:09:08):
   output deltas that arrive after the stop are still applied, because the store does not drop
   output for a stopped card. Drop them in the backend, or ask the frontend to drop them.
3. D5 images on the user echo segment (see task 5).

## Verification

All checks were run as the focused commands allowed for this task. Logs are in `.ptah/tmp/fe-*.log`.

- `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath agent-monitor.stop-and-turn.spec.ts`:
  11/11 pass.
- The same config with `agent-monitor.store.spec.ts` and `agent-monitor.empty-session-id.spec.ts`:
  240/240 pass.
- `npx jest --config libs/frontend/chat-ui/jest.config.ts ...` (inspector-session-stats and the five
  agent-avatar specs): 54/54 pass. `composer-compact-bar.component.spec.ts`: 3/3 pass.
- `npx jest --config libs/frontend/canvas/jest.config.ts ...` (all 7 canvas-detail specs,
  canvas-rail-board, orchestra-canvas, canvas-focus-area): 302 tests. The first run had 1 failure:
  my new pill spec lacked a `TestBed.tick()` for the width measure. I fixed the spec and re-ran that
  test, which passed. The other 301 passed.
- `npx jest --config libs/frontend/chat/jest.config.ts --moduleNameMapper=<marked umd> ...`
  (agent-continue-input, lane-thread, lane-thread-row, lane-transcript, session-agent-roster,
  agent-card-unified, agent-card-flat-header, chat-input streaming-fold and command-center-lock,
  compact-session specs): 167/167 pass. The roster spec after its additions: 8/8 pass.
- `npx jest --config libs/frontend/notification-center/jest.config.ts ...`: 2/2 pass.
- `npx eslint <the 31 changed frontend files>`: 0 errors. There are 27 warnings: non-null assertions
  in existing specs, and the existing max-lines warning on `agent-monitor.store.ts`.
- `npx tsx tools/ui-class-audit/check-ui-classes.ts`: exit 0, "0 token count(s) over baseline".
  The baseline was not edited.
- `npx tsx tools/degradation-audit/check-degradation.ts`: exit 0, "TOTAL 0 unsuppressed site(s)".
- Not run (excluded by the task): nx/verify, typecheck, typecheck-templates, builds. Template changes
  were in the compact bar, lane tabs, dock card/menu, continue input and thread row. Each one was
  compiled by its component spec under jest-preset-angular. CI runs `typecheck-templates`.
- My Python edits had turned the edited files' line endings into CRLF. I converted them back to LF,
  matching the repository.

## Decisions

- Status word: I added `stopping` to the shared `AgentStatusWord` instead of a lane-only label, so the
  dock pill, the avatar, the inspector rows and the accessible labels all agree. Reversible.
- "Stopping…" ends at the second `stopped` exit, an exit that carries `exitCode`, or a 20 s fallback.
  Evidence: in `agent-process-manager.service.ts`, `stop()` emits an exit and `handleExit` emits a
  second one 3 s after the real exit. Reversible.
- Timer: the running turn's time while it runs, and the last turn's duration when idle or stopped.
- Stopped completions hide only pending or sending parent deliveries. Deliveries that failed or need
  a retry stay visible.

## Follow-up: backend contracts wired (coordinator round 2)

### D5: image thumbnails in the user echo (was blocked, now done)
- Contract: the backend now sets `CliOutputSegment.images` (`InlineImageAttachment[]`) on `user` echo segments. Only live deltas carry the bytes; persisted output drops them.
- New file `chat/.../transcript/lane-echo-images.ts`:
  - `laneEchoImages(segments)` joins each echo segment to its echo message by send time and body. This key is used because the tree builder's `seg-user-<i>` index is taken over a filtered segment array, so it does not match the lane's own index.
  - Validation where the data enters: only `image/png`, `image/jpeg`, `image/gif` and `image/webp` are drawn, and the data must be base64. SVG and anything else is dropped.
  - At most 6 thumbnails per message. The last thumbnail's alt text says how many more were not shown.
  - Validated results are cached per segment object in a `WeakMap`, so a delta does not re-scan old images.
  - The images are bound to `<img [src]>` as `data:` URLs, which Angular's own URL sanitizer accepts. No sanitizer bypass is used.
- `lane-transcript.component.ts`: a user message with images gets a right-aligned strip of 64 px thumbnails under the bubble (`data-testid="lane-echo-images"`, `role="list"`, each image has alt and title text).
- Limits:
  - A reloaded lane shows the echo text only, because the backend does not persist the bytes.
  - When a provider echoes the prompt itself, the transcript drops the host echo and shows the provider's message instead. That message has no images, so no thumbnails appear there. Claude SDK lanes do not echo their prompt, so they are not affected.
- Specs: new `lane-echo-images.spec.ts` (4 tests) and `lane-transcript.component.spec.ts` "shows the images the user sent under the echo bubble".

### Stop verdict `'stopped'`
- `lane-thread.ts`: a parent delivery verdict of `stopped` now reads "Stopped": neutral styling, pause icon, and no "Waiting for parent" prompt. A user stop still reads "Stopped by you".
- `lane-event-row.component.ts` `verdict()`: added a `stopped` case that returns "Stopped". It was falling through to "Unverified".
- `lane-event-row.presentation.ts`: `verdict === 'stopped'` now counts as a stop, so the chip is "Stopped" with neutral tone and the summary is "Stopped after …". It never reads "Failed", even when the status line is missing.
- No other exhaustive switch over the verdict exists in my area. tsc on the libs is clean.
- Specs: `lane-thread.spec.ts` (host `stopped` verdict), and `lane-event-row.presentation.spec.ts` (a `[undefined, 'stopped']` row in the stop table, plus a case with no status line).

### Stop exit contract
- `settleStopRequest` already ends "Stopping…" on any `stopped` exit that carries `exitCode`. It also ends on a second `stopped` exit, and the 20 s fallback is unchanged.
- New spec for the exact host sequence: a stamped stop with no `exitCode` keeps "Stopping…"; the next exit (`status: 'stopped'`, `exitCode: 1`) clears it, and the card keeps `stoppedByUser`.

### Verification (round 2)
- `npx tsc --noEmit -p libs/frontend/{chat,chat-ui,chat-streaming,canvas}/tsconfig.lib.json`: 0 errors in each of the 4 libs.
- `tsconfig.spec.json` checks the specs only and already has many errors from before this task (chat 388, chat-streaming 160, chat-ui 20, canvas 15): branded `AgentId` strings, mock casts, ES targets. I fixed the errors in the lines I added, which brought chat down to 385 and chat-streaming to 159. The errors left in the spec files I touched are on lines that existed before.
- Jest:
  - chat-streaming `agent-monitor.stop-and-turn.spec.ts`: 12/12.
  - chat: lane-echo-images, lane-transcript, lane-thread, lane-thread-row and all lane-event specs: 104/104.
- `npx eslint` on the round-2 files: 0 errors and 8 warnings, all existing non-null assertions.
- ui-class audit: 0 over baseline. degradation audit: 0 unsuppressed sites.

## Follow-up: logic review S1 and S2 (round 3)

### S1: a refused Stop left the card on "Stopping…"
- Root cause: `agent-card.component.ts` `stopAgent` read `result.success`, which is only the transport flag. `agent:stop` (`agent-rpc.handlers.ts:1575-1596`) reports a refused or failed stop as `{ success: false, error }` inside a successful call. `cancelStopRequest` therefore never ran.
- Change:
  - `stopAgent` now treats the stop as accepted only when `result.isSuccess() && result.data.success`. A host error, a transport error or a thrown call becomes the error text; the catch is marked with a `degradation-audit: reported` comment.
  - On success it calls `confirmStopRequest`. On failure it calls `cancelStopRequest(agentId, error)`.
  - `cancelStopRequest` now always clears `stopRequestedAt`, `stopAcknowledged` and `stoppedByUser`, and stores the reason in the new field `MonitoredAgent.stopError`. The next Stop or a re-open clears that field.
  - The lane footer (`agent-continue-input.component.ts`) shows "Stop failed: <reason>" (`role="alert"`, `data-testid="lane-stop-error"`). The panel variant shows it only when its footer block is visible.

### S2: no fallback before the first exit; starting lanes and terminal lanes
- Change in `agent-monitor.store.ts`:
  - `markStopRequested` arms the 20 s fallback when Stop is pressed. A lost exit event, or a stop the host settles without an exit (the `releaseSubprocess` branch), can no longer leave the card on "Stopping…".
  - The fallback keeps running across the stamped exit, and any settled stop clears it.
  - If the fallback fires while the lane is still live, it also clears `stoppedByUser`, because the stop never took.
  - `settleStopRequest` now also reads the card's own status. The single `stopped` exit of a lane stopped while `starting` (`agent-process-manager.service.ts:3585-3603`) ends the stop at once.
  - A stop of a lane whose turn already ended is cleared by the `completed` or `failed` exit, which is not `stopped`.
  - `confirmStopRequest` (after an accepted RPC) clears a pending stop on a card that is already terminal and not `stopped`, and releases its timer.

### Specs (round 3)
- `agent-monitor.stop-and-turn.spec.ts`: 15/15 pass. New tests:
  - a lane stopped while starting ends on its single exit;
  - the fallback armed at Stop with no exit at all (it ends at 20 s and clears the user-stop mark);
  - the fallback across the stamped exit;
  - a stop of a lane whose turn already ended (no timer left over);
  - a refused stop (pending stop and mark cleared, `stopError` kept, no timer; the next Stop clears the reason);
  - `settleStopRequest` cases for `starting` and `running`.
- `agent-card-unified.spec.ts` "Stop result (logic review S1)": a host refusal inside a successful RPC, a transport error and an accepted stop.
- `agent-continue-input.component.spec.ts` "shows why a Stop failed".

### Verification (round 3)
- Jest, chat project: agent-card-unified, agent-card-flat-header, agent-continue-input and session-agent-roster specs, 29/29 pass.
- Jest, canvas: `canvas-lane-view.component.spec.ts`, 25/25 pass.
- `npx tsc --noEmit -p libs/frontend/{chat,chat-streaming}/tsconfig.lib.json`: 0 errors.
- Spec tsconfigs:
  - chat: 385 errors, unchanged from round 2 and none in the lines I added.
  - chat-streaming: 160 errors. The one new error since round 2 is in `agent-delivery.store.spec.ts`, which is outside my area.
- eslint on the changed files: 0 errors, 1 warning (the existing max-lines warning on the store).
- ui-class audit: 0 over baseline. degradation audit: 0 unsuppressed sites.

## Round 4: composer lines, single scroll container, stale tool row, model pill, models tile

### 1. No lines under the composer
- Root cause: `lane-composer.component.html` drew up to three blocks under the composer card: the options error with Retry, the delivery error and the stale-options notice; then a status line with the mode hint (for example "Resume with message: Resume CLI session 06d21aa3") and the "N limited" badge. `agent-continue-input.component.ts` added two more lines under that: the orange terminal status ("Stopped · Interrupted by host restart") and the stop error.
- Change:
  - **Composer** (`lane-composer.component.html` / `.ts`): nothing renders under the card any more.
  - **Lane state chip:** a toolbar chip next to the approval chip (`laneState` input, `data-testid="lane-state-chip"`) shows a short label: Stopping…, Stopped, Interrupted, Budget stop, Failed, Timed out or Stop failed. The full detail is in its `ptahTooltip` and in an `sr-only` suffix. An error chip is `role="alert"`; any other chip is `role="status"`.
  - **"N limited" badge:** moved into the toolbar.
  - **Send:** the mode hint (resume, continue, queue, steer) is now Send's `title` and its `aria-describedby` text. The placeholder still says "Resume … with a message…".
  - **Inside the card, above the toolbar:**
    - `lane-composer-alert`: the options error (`role="alert"`, with Retry), the delivery error (`role="alert"`) and the stale-options notice (`role="status"`, with Retry).
    - `lane-composer-notice`: a polite live region for what the user must fix before sending ("… Remove the image to send.", the attachment limit) and the last action's note. It is empty most of the time.
  - **Gated-control reasons:** these are no longer repeated in a status line. Each control's own `title` and `aria-describedby` already carry the reason (`ComposerGatedControlDirective`).
- `agent-continue-input.component.ts`: the new `laneStateChip(agent)` builds the chip. Its order is: Stop failed (err), then Stopping…, then the terminal status with the host's reason. When there is no composer card (Stop or Resume shown alone), the chip sits on the same row as the button. The footer lines are gone.

### 2. Lane panel is a single scroll container
- Root cause: `canvas-lane-view.component.ts` made the host `overflow-auto` for every non-orchestrator lane, and the lane block and panel were `h-full` with the questions stacked above them. Anything taller than the panel (the footer lines, a question card) made the host scroll as well as the transcript, so two scrollbars appeared.
- Change:
  - The host is always `overflow-hidden`, and the tab panel is always a flex column.
  - The lane block is `flex-1 min-h-0`, and question cards in it are `shrink-0`.
  - The CLI panel is `flex-1 min-h-0 overflow-hidden` instead of `h-full`.
  - The background-agent strip, which is not a panel, scrolls in its own `min-h-0 overflow-y-auto` box.
  - The transcript (`lane-scroller`) stays the only scroller, and the composer is pinned below it.
- Other hosts of the same composer: the agent card panel (`agent-card`, card presentation) already bounds its output with `flex-1 min-h-0 overflow-hidden`, and the composer sits under it. The sub-agent lane uses its own composer. Neither had a line under the composer after the change above.

### 3. A tool row of a terminal lane that keeps running
- Root cause: `agent-monitor-tree-builder.service.ts` `finalizeOrphanedTools` handled only tools still `streaming`, and turned them into `error` ("Failed"). It left `pending` tools, and `streaming` message/text/agent nodes, untouched. Those kept the turn live, with its "running" rows and a timer that kept counting.
- Change: for a lane that no longer runs, `finalizeOrphanedTools(nodes, endedAt)` now does the following:
  - A `streaming` or `pending` tool becomes `interrupted`. Its final elapsed time is set to `endedAt - startTime` when the tool has no duration of its own.
  - A `streaming` agent node becomes `interrupted`.
  - Any other `streaming` node becomes `complete`, so its turn is no longer live.
  - `cli-agent-output` takes a new `endedAt` input, and `agent-card` binds it to `agent().completedAt`.

### 4. Model pill reads "claude default"
- Finding: both causes apply.
  - **This lane (likely):** I could not inspect the lane from the screenshot, so this is inferred. It was stopped by a host restart and rebuilt from history; if it was spawned before the backend fix, its reference has no `model` and its record has no `observedModel`. The backend now reports the SDK init model as the catalog's `currentModel`, but only after the lane runs again.
  - **Frontend defect:** the composer read the catalog once at mount. A resumed lane learns its model from the system init after that read, so the pill stayed on "claude default" until the user opened the model menu.
- Change: in `lane-composer.component.ts`, when a turn settles (the status leaves running or starting) and no model is known (no record `model`, `observedModel` or catalog `currentModel`), the composer re-reads the catalog once. The pill then names the init model.

### 5. Inspector "models used" tile
- The tile's summary now leads with the current model and counts the rest as earlier ones: "Haiku 4.5 +2 earlier".
- Its tooltip reads "Current model: Haiku 4.5. Earlier in this session: claude-fable-5-2, …".
- `session-model-breakdown` takes a new `currentModel` input. Each row is labelled "current" or "earlier in this session".
- "Current" is the live stats model, else the snapshot model. When neither is known, the summary keeps the plain "+N".

### Specs (round 4)
- `lane-composer.component.spec.ts`: 66 pass.
  - The `statusText` helper now reads the in-card note, else Send's tooltip.
  - Updated: the resume path is on Send (title and description); nothing renders under the card; a gated control's reason is on the control; the stale notice is in the card with `role="status"`.
  - New: the state chip in the toolbar (status and alert roles), and the catalog re-read when the model is unknown (D8).
- `agent-continue-input.component.spec.ts`: 13 pass. Covers the chip for each state, no line under the composer, the chip beside Stop/Resume, a stop error announced, and `laneStateChip` failed→stopped.
- `agent-monitor-tree-builder.service.spec.ts`: covers interrupted with the final elapsed time, `pending` tools, streaming messages ended, and recursion.
- `cli-agent-output.component.spec.ts`: an orphaned tool is now `interrupted`, not `error`.
- `canvas-lane-view.component.spec.ts`: the host is `overflow-hidden` for lanes too; the lane block is `flex-1 min-h-0` without `h-full`; the CLI panel is `flex-1 overflow-hidden`.
- `inspector-session-stats.component.spec.ts`: "+1 earlier" with its tooltip, and the breakdown rows labelled current or earlier.

### Verification (round 4)
- Jest:

  | Project | Specs | Result |
  | --- | --- | --- |
  | chat | lane-composer and agent-monitor-tree-builder | 113/113 |
  | chat | agent-card unified, flat-header and truncation; cli-agent-output; lane-transcript; lane-delivery.controller | 100 tests: one `cli-agent-output` expectation failed (it still expected `error`); updated it and re-ran that spec, 25/25 |
  | chat | agent-continue-input | 13/13 |
  | canvas | canvas-lane-view and canvas-focus-area | 37/37 |
  | chat-ui | inspector-session-stats, session-model-breakdown and session-stats-summary | 75/75 |

- `npx tsc --noEmit -p libs/frontend/{chat,chat-ui,canvas}/tsconfig.lib.json`: 0 errors.
- eslint on all changed frontend files: 0 errors, 7 warnings (existing non-null assertions and max-lines).
- ui-class audit: 0 over baseline in both audits. degradation audit: 0 unsuppressed sites.
- Not run: typecheck-templates and the Electron visual check (excluded). The layout fix should be confirmed in Electron: one scrollbar, and the composer pinned at the bottom of the lane panel.

## Round 5: live re-check F2 (frontend half), F3, F4

### F3: a running Grok lane showed no composer, only a stray Stop
- Root causes:
  1. `agent-monitor.store.ts` `onAgentSpawned`: the card built for a first spawn (the `fresh` branch) dropped `potentialCapabilities`, `effectiveCapabilities` and `effectivePolicy`. Only the re-open and replacement branches copied them.
  2. `agent-continue-input.component.ts` `visible()` mounts the composer for a running lane only when one of these holds: `supportsContinuation`, a `cliSessionId`, or the resolved messaging capabilities (steer or continuation supported). A new Grok (ACP) lane has none of these until its first turn ends. The view then fell back to the lone Stop button ("stray stop square"), and the composer appeared once the turn ended.
- Change:
  - The first-spawn card now keeps the three capability fields.
  - `visible()` reads `effectiveCapabilities ?? potentialCapabilities`. The Grok adapter manifest declares `continuation: supported` (`grok-cli.adapter.ts:192-197`), so a running Grok lane mounts the composer as Claude does.
  - If the host sends neither capability set on the spawn, the old behaviour remains. The backend should make sure the spawn payload carries `potentialCapabilities`.
- Specs:
  - `agent-monitor.stop-and-turn.spec.ts`: a first spawn keeps its capabilities.
  - `agent-continue-input.component.spec.ts`: the composer mounts for a running ACP lane from its declared capabilities.

### F4: `/context` + Enter inserted `/compact`
- Root cause: `composer-input.controller.ts` `matchCommands` filtered by "name or description contains the query" and kept the source order. `compact` comes first, and its description mentions context, so it took the first row. The lane composer's grouped lists and the main chat's `/` list both go through this one function.
- Change: a new exported function, `rankCommandMatches(commands, query)`.
  - Ranking tiers, in order: exact name, name prefix, name contains, description contains, then fuzzy (the query's letters appear in the name in order).
  - Ties keep the source order. A leading `/` is ignored. An empty query keeps every command.
  - `matchCommands` uses it, so main chat and lanes share it.
- Spec: `composer-input.controller.spec.ts` "rankCommandMatches (F4)". It covers the exact match first for `context` and `/context`, the prefix/contains/fuzzy order, and the empty query.

### F2 (frontend half): resuming a restored lane leaves the view on the old tab
- What already reaches the frontend:
  1. `AgentProcessInfo.resumedFromAgentId` on the resume's spawn. The monitor already replaces the old card on it and records the old id → new id link. The backend sets it in `agent-process-manager.service.ts` `resumedFromField` (around line 3810), but only when the named id is a record the manager tracks. Otherwise it falls back to the record found by session.
  2. `AgentDeliveryReceipt.actualAgentId` ("Resolved lane after a cold resume", set in `agent-message-coordinator.service.ts:274`) on the receipt of the user's message. This one reaches the frontend in every case where the message itself resolved to a new lane, a restored lane included. It is held in `AgentDeliveryStore.receipts()`, keyed by both ids.
- Change: `canvas-detail.service.ts` `currentLaneKey` follows both links, with a hop limit.
  - First the monitor's replaced-card link (`currentAgentId`).
  - Then the newest user receipt addressed to the old id whose `actualAgentId` is a different lane. This link is followed only once the monitor holds that card. A parent's receipt never moves the view.
  - The dock, the lane view and the rail all read `laneKeyFor`, so the view stays on the conversation the user sent from.
- Limit: once a restored card has a resolved successor, choosing that old card in the dock also shows the new lane. It is the same conversation.
- If the backend adds a dedicated alias field later, `currentLaneKey` is the one place to read it.
- Spec: `canvas-detail.service.spec.ts` "follows a cold resume of a restored lane through the user receipt it resolved (F2)". It checks: no move before the card exists; the move after it exists; the newest user receipt wins; a parent receipt is ignored.

### Verification (round 5)
- Jest:
  - canvas: all 29 canvas suites, 617/617.
  - chat-streaming: stop-and-turn and agent-monitor.store, 239/239.
  - chat: agent-continue-input, lane-composer, all chat-input specs and composer-input.controller, 267/267 and 21/21.
- `npx tsc --noEmit -p libs/frontend/{chat,chat-streaming,canvas}/tsconfig.lib.json`: 0 errors.
- eslint on all changed frontend files: 0 errors, 11 warnings (existing non-null assertions and max-lines).
- ui-class audits: 0 over baseline. degradation audit: 0 unsuppressed sites.
- Not run (excluded): typecheck-templates and the Electron check. F2 and F3 need a live re-check: a restored lane resumed from its tab, and a new Grok lane while it runs.

## Round 6: final live check (F3 still failing, inspector current model, over-eager follow, last-run model) and PR 1512 review

### 1. F3: a running Grok lane still showed only a red Stop square
- Real render path: canvas lane view → `ptah-agent-continue-input` (`variant="composer"`). When `visible()` is false for a running lane, that component draws its lone Stop button (`COMPOSER_STOP_BUTTON_CLASS`, the red square), and no `ptah-lane-composer` is mounted. That is why no lane textarea was in the DOM.
- Runtime data, from the code; the log has no payloads. For a Grok spawn, `agent-process-manager.service.ts:1883-1897` sets:
  - `potentialCapabilities` = the Grok manifest (`continuation: supported`);
  - `effectiveCapabilities` = `resolveEffectiveLaneCapabilities(info, potential, sdkHandle)`, a snapshot taken at spawn.
- For an ACP handle, `supportsContinuation()` is `session.isSetupComplete() && !!session.getSessionId() && …` (`provider-session-lane-handle.ts:465-471`). At spawn the session is not set up yet, so the snapshot says `continuation: unsupported`. The spawn also has `supportsContinuation: false` and no `cliSessionId`.
- Root cause:
  - My round-5 `visible()` read `effectiveCapabilities ?? potentialCapabilities`. The effective snapshot is present, so it shadowed the declared manifest, and every condition was false until the first exit.
  - Claude works because its handle continues at spawn (`supportsContinuation: true`).
  - Resumed Grok lanes fail the same way.
- Fix (`agent-continue-input.component.ts`): a running lane takes messages when either the effective snapshot or the declared manifest says steer or continuation is supported (`takesMessages(effective) || takesMessages(potential)`). The composer's delivery previews still decide what a send does.
- Spec: "mounts the composer for a running Grok lane shaped like the real spawn payload". It uses:
  - a manifest with interrupt, continuation and resume supported;
  - an effective `live-handle` snapshot with everything unsupported;
  - `supportsContinuation: false`, no session id.
  It expects the composer with lane controls, and no lone Stop.

### 2. Inspector "models used": `claude-fable-5-2` marked current
- Root cause: "current" was `liveModelStats.model`. `deriveLiveModelStats` picks that by cost (or a sticky pick) among the latest turn's models, so it can name an older model the session no longer selects.
- Fix:
  - `SessionStatsInputs` gets `currentModel`. `session-stats-source.ts` fills it from the model pill's own rule: `resolveTabModel(tab ?? activeTab, ModelStateService.currentModel())`, which is tab override, then session model, then global pick.
  - The inspector uses `currentModel || liveModelStats.model || snapshot.model`. It maps that model to the usage row that is the same model: same id, the id plus a date suffix, or a tier alias such as `haiku` after the vendor prefix; never the vendor word alone. That row is marked "current".
  - Names go through `resolveModelDisplayName`; a raw id shows only when the catalog does not know it.
- Specs:
  - inspector: the pill model wins over a cost-ranked older pick; `sameModel` cases.
  - `session-stats-source.spec.ts`: the tab override wins over the global pick. The existing suites got `ModelStateService` and `TabManagerService` providers.

### 3. Follow too greedy (F2 side effect)
- Root cause: round 5 resolved every read of the selected lane through two links: the receipts' `actualAgentId` and the monitor's successor chain. Any click on an old card that had such a link jumped to the newest lane.
- The 4m37s and 9m59s lanes probably both landed on the 9s Opus child through those links (I could not confirm from the log): the stopped orphan through the receipt of the "Reply OK." resume, and the older lane through a link to the 4m37s lane, which itself led to the child. The mapping followed real links, but following chains on every read was wrong.
- Fix (`canvas-detail.service.ts`):
  - `laneKeyFor` redirects only when the selected card no longer exists. In that case it follows the monitor's replaced-card link (D3, a lane stopped in this app run). A card that exists is never redirected, so an explicit click always shows that lane.
  - The new method `followAfterSend(tabId, agentId)` registers one follow when the user sends from a lane view. `canvas-lane-view` calls it through a new `messageAccepted` output of `agent-continue-input`, which relays the composer's `accepted`.
  - An effect then moves the view once, when the resumed card appears. It uses the monitor link, or the newest of the user's own receipts created after the send (with 5 s skew) whose `actualAgentId` is on screen.
  - The follow is dropped if the user picked another lane meanwhile, or after 2 minutes.
- Specs:
  - an explicit pick with existing links stays put;
  - a follow after a send: an old receipt is ignored; the view waits for the card, then moves once; a parent receipt is ignored; going back by hand stays;
  - a follow is dropped when the user moved away.

### 4. Pill "claude default" on an orphan whose last turn ran Opus
- Root cause: the pill used `record.model`, the catalog's `currentModel` and `observedModel`. A restored lane spawned before the backend fix has none of these, but its output segments can carry `usage.model`.
- Fix: new exported `laneLastRunModel(record)` in `lane-composer.component.ts`. It returns `observedModel`, else the folded usage model, else the newest usage segment's model, and never the multi-model id. It is used for the pill, the compact bar label and the catalog re-read check.
- Specs: the pill names Opus 5.5 from a usage segment on a stopped lane; `laneLastRunModel` cases.
- Limit: if the restored card has no usage segments (history not loaded), the model is unknown on the frontend and the pill stays on the default.

### PR 1512 review (CodeRabbit), verified against the code
- **(a) Fixed.** Send now (`requestNow`, `requestQueuedNow`) awaits `prepareNow()`. Both now capture the lane id before the await and abort when the composer shows another lane after it. Spec: "drops Send now when the lane changes while its previews refresh".
- **(b) Fixed.** The controller's recovered drain took every waiting message and appended each to the draft, so the text was combined and only one turn's model or effort applied.
  - It now restores only the oldest message, and only into an empty draft and tray. The rest stay queued in the store.
  - The next one loads after the draft is sent or cleared.
  - The in-card note says how many wait ("N recovered messages wait. Each loads here, one at a time, when the draft is empty.").
  - Specs: one-at-a-time with its own files, and never merged into a user's draft (controller spec, 2 tests replaced).
- **(c) Fixed.** The rail filter in `canvas-lane-tabs.component.ts` now keeps `stopping` lanes (`isRunningAgentWord || waiting || stopping`), and `stopped` stays excluded. The clock filter is unchanged: a stopping lane's time is frozen. Spec: "keeps a stopping lane in the rail until its process exits, and drops a stopped one".

### Verification (round 6)
- Jest:

  | Project | Specs | Result |
  | --- | --- | --- |
  | canvas | canvas-detail.service, canvas-lane-tabs, canvas-lane-view | 93/93 |
  | chat | lane-composer, lane-delivery.controller, agent-continue-input | 136/136 |
  | chat | session-stats-source | 19/19 |
  | chat-ui | inspector-session-stats | 22/22 |

- `npx tsc --noEmit -p libs/frontend/{chat,chat-ui,canvas}/tsconfig.lib.json`: 0 errors.
- eslint on all changed frontend files: 0 errors, 19 warnings (existing non-null assertions and max-lines).
- ui-class audits: 0 over baseline. degradation audit: 0 unsuppressed sites.
- Not run (excluded): typecheck-templates and an Electron re-check. F3 should be re-checked live with a new and a resumed Grok lane.

## Round 7: host notices in lane transcripts

The backend now emits host notices as `CliOutputSegment` `{ type: 'info', content, hostNotice: true, sentAt }`, for example "Grok ran /context and returned no output.".

- Root cause:
  - In a stream lane, `cli-agent-output.component.ts` merged into the event tree only those segments the event stream lacks: `error`, `user`, unverified-peer `info` and, with no text deltas, `text`. Every other `info` segment, a host notice included, was dropped.
  - In a segments-only lane, `agent-monitor-tree-builder.service.ts` turned every `info` into an untimed fenced text node, which also left the notice without a place in time.
- Change:
  - **Tree builder:** an `info` segment with `hostNotice === true` becomes a timed node (`seg-notice-<i>`, the exported `LANE_HOST_NOTICE_NODE_PREFIX`, `startTime = sentAt`, plain content). Other `info` segments keep their current handling.
  - **`cli-agent-output`:** host notices are now part of the segment set merged into the event tree. `withUserEchoes` places them by `sentAt`, exactly like user echoes. Other `info` lines (usage) stay hidden there. A notice, like an echo, is not provider output, so it never suppresses the stdout fallback.
  - **`laneTranscriptMessages`:** a notice node becomes a `system` message, `<lane>:notice:<node>`, at its send time among the bubbles (exported `isLaneNoticeMessage`).
  - **`LaneTranscriptComponent`:** a notice is a neutral muted row with its time (`data-testid="lane-host-notice"`), not a bubble. Turn contexts and live-turn detection use only the bubbles, so a notice never joins or reopens a turn.
  - Live and persisted segments take the same path.
- Other paths:
  - The SDK sub-agent lane renders SDK trees with no CLI segments, so notices never reach it and nothing changes there.
  - The stdout fallback is unaffected, as covered by the spec below.
- Specs:
  - tree builder: a notice node versus a plain info node;
  - `cli-agent-output`: the notice placed between two replies by `sentAt` while a usage line stays hidden, and the stdout fallback kept when the notice is the only node;
  - `lane-transcript-messages`: a `system` notice message between two bubbles;
  - `lane-transcript`: the row is rendered with its time, and no bubble.

### Verification (round 7)
- Jest, chat project: cli-agent-output, lane-transcript-messages, agent-monitor-tree-builder, lane-transcript, agent-card-unified and lane-thread specs, 126/126 pass.
- `npx tsc --noEmit -p libs/frontend/chat/tsconfig.lib.json`: 0 errors.
- eslint on the 8 changed files: 0 errors, 2 warnings (existing).
- ui-class audits: 0 over baseline. degradation audit: 0 unsuppressed sites.
- Not run (excluded): typecheck-templates and the Electron check.

## Round 8: last live check items and PR 1512 review round 2

### 1. An image-only message could not be sent
- Root cause: `lane-delivery.controller.ts` `queueDisabled` and `nowDisabled` required trimmed draft text, so Send stayed disabled and Enter did nothing with only images staged.
- Change:
  - A message needs text or staged images (`hasContent`), as main chat's `chat-input` requires (`!content && images.length === 0` refuses).
  - Whether the lane takes images stays the composer's gate: `imagesBlocked` keeps Send disabled, with its reason, on a lane that refuses images.
  - A staged file alone is still not a message.
  - The send passes `''` as the text with the images in `turn.images`. A held message (`holdForLane`) with only attachments is kept, not dropped.
- **Backend dependency:** `agent-message-coordinator.service.ts:217` still throws "Message must not be empty." for an empty `message`. Until the backend accepts an empty message whose `turn.images` is non-empty, the send is refused and the composer shows that error. The backend agent needs to relax that check for image-only turns.
- Specs:
  - controller: an image-only send is enabled and sends `''` with the images; a file alone is not enough;
  - composer: Send is enabled and Enter sends an image-only message.

### 2. Nits
- **Host notice row:** the row's text and time ran together. `.chat-msg-slot` sets its own display, so the flex layout never applied. The slot now wraps an inner flex `<p>` with `gap-x-2` and a "·" separator before the time. The spec checks text, separator, time.
- **Fable shown as a raw id:** the shared `formatClaudeModelDisplayName` knows only opus, sonnet and haiku.
  - New `sessionModelDisplayName` (`chat-ui/.../session/session-model-name.ts`): the catalog name first, then the shared formatter, then a readable form of any Claude-style id (`claude-fable-5-2` → "Fable 5.2"; dated ids too). Other ids stay raw.
  - Used by the inspector tile, the models breakdown and the stats summary.
  - Spec: `session-model-name.spec.ts`; inspector expectations updated.
  - The shared formatter could learn the family the same way (backend/shared owner).
- **Compact bar while stopping:** the folded bar reads "Stopping…" when the lane state chip is Stopping…, instead of "Claude is working…". Spec added.

### PR 1512 review, round 2 (verified against the code)
- **(3) `canvas-detail.service.ts`: fixed.** The follow effect dropped a pending follow only on its next run, so a user who picked another lane and came back before that run could still be moved. `selectLaneFor` now clears the tab's pending follow as soon as an explicit pick names another lane. Spec: pick away, pick back, the resumed lane appears, and the view stays.
- **(4) `canvas-lane-view.component.ts`: fixed.** Pending questions were `shrink-0` blocks above the panel, so tall ones could push their controls out of reach. They now sit in one area, `data-testid="lane-pending-questions"`, `max-h-[45%] shrink-0 overflow-y-auto`, and the transcript stays the main scroller. Spec added.
- **(5) `lane-delivery.controller.ts` recovered messages: fixed.** The drain skipped a recovered message with no text even when it carried files or images. It now restores a message that has text or attachments; a held message with only attachments is kept too. Spec: an attachments-only recovered message is restored.
- **(6) `lane-delivery.controller.ts` foreground preview refresh: fixed.** `refreshBeforeSend` returned true even when another read had superseded its own, so the store held other or older previews than the ones it read.
  - `loadPreviews` now returns `current`, `stale` or `failed`. It is `current` only when this composer started no newer read meanwhile (`previewLoadSeq`) and the store holds this call's own answers.
  - `refreshBeforeSend` reads again, up to 3 times, until its answer is current. Otherwise it fails with "Message options are still changing. Try again."
  - Spec: a superseded first read makes it read again; a never-current read fails with the reason.

### Verification (round 8)
- Jest:

  | Project | Specs | Result |
  | --- | --- | --- |
  | chat | lane-composer, lane-delivery.controller, lane-transcript, agent-continue-input | 150/150 |
  | canvas | canvas-detail.service, canvas-lane-view | 39/39 |
  | chat-ui | session-model-name, inspector-session-stats, session-model-breakdown, session-stats-summary | 81/81 |

- `npx tsc --noEmit -p libs/frontend/{chat,chat-ui,canvas}/tsconfig.lib.json`: 0 errors.
- eslint on the 17 changed or new frontend files: 0 errors, 6 warnings (existing).
- ui-class audits: 0 over baseline. degradation audit: 0 unsuppressed sites.
- Not run (excluded): typecheck-templates and the Electron check.
