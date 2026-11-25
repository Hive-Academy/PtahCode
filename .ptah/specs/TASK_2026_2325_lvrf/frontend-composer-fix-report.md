# Frontend lane composer fixes - TASK_2026_2325_lvrf

Scope: `libs/frontend/chat/src/lib/components/molecules/lane-composer/**`, plus the composer host `agent-continue-input` (resume-path cleanup, assigned by the coordinator). Line numbers marked `HEAD:` are from commit 7123c2270. Nothing was committed, pushed or stashed.

## Files

- MODIFIED `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-delivery.controller.ts`:
  - Activity-driven preview refresh (D1) and `refreshBeforeSend()`.
  - The `restart` state and the restart hint (D9). `resumePath` is removed from `LaneDeliverySources`.
  - T2: the queue fold is removed (`takeForFold`, `mergeSnapshots`, `withinTurnLimits`, the before-placement in `restore`, and the now-unused `queuedReceipts`).
- MODIFIED `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.ts`: Send now refreshes the previews first (D1), the badge model (D12), the resume tint (D11), placeholder and Send label per state (D9), effort labels (D7).
- MODIFIED `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.html`: badge markup (role, tabindex, aria-label, `ptahTooltip`), the resume button class, the Send aria-label.
- CREATED `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer-labels.ts`: pure helpers (effort option, limitations, badge label and tooltip, placeholder, Send label, resume class). They were extracted to keep the component under the `max-lines` warning (700 lines without comments or blanks).
- MODIFIED both specs in the same folder.
- MODIFIED `libs/frontend/chat-streaming/src/lib/agent-delivery.store.ts` and its spec (T2, second fold point): `mergeRecovered` is removed. Recovered or held messages wait per lane as a FIFO list, and `takeRecoveredMessage` returns the oldest.
- MODIFIED `libs/frontend/chat/src/lib/components/molecules/agent-continue-input/agent-continue-input.component.ts`: removed the `[resumePath]` binding and the `resumePath` computed. The composer's `resumePath` input is removed too.
- MODIFIED `libs/frontend/chat/src/lib/components/molecules/agent-continue-input/agent-continue-input.component.spec.ts`: removed the stub's `resumePath` input and the two host resume-path tests. The same rules are now pinned in the controller and composer specs (D9).

## Per task

### 1. D1 (frontend half): stale "Interrupt & send" preview

- Root cause: `HEAD:lane-delivery.controller.ts:241-244`. `previewKey` refreshes the previews only when `stopped`, the record `status` or a preview mode changes. A tool start inside a running turn changes none of these, so `now.mode` stayed `interrupt-resume` for the whole turn.
- Change:
  - A second effect watches an activity key of the lane record: `streamRevision`, `segments.length` and `stdout.length`. It changes with each streamed event (tool start or end included) and with nothing else. While the lane runs, an activity change schedules a throttled background refresh: at most one per `ACTIVITY_REFRESH_MS` (1000 ms). Activity inside the window joins the pending trailing refresh.
  - Each composer has one timer, which is cleared on destroy.
  - A failed background refresh keeps the last previews and shows no error. The next refresh or Send now surfaces the failure.
  - No backend field is needed. A future steer-availability field arrives through the same previews.
  - Before each Send now decision while running (Ctrl/Cmd+Enter and the queued card's Send now / Interrupt & send), `refreshBeforeSend()` reads both previews. The steer or loss-dialog choice then uses fresh data. A failed refresh stops the send and shows "Message options unavailable. Try again."
  - A queue send does not refresh first. Its delivery does not depend on steer availability, and a refresh would add two RPCs before every queued message.
- Tests: the controller spec covers the throttle and burst coalescing, no refresh without new activity, no refresh on a lane with no running turn, a silent background failure, and the timer cleared on destroy. It also covers `refreshBeforeSend` while running, with a failure, and when stopped. The component spec covers: a refreshed preview that turns steer on sends now without the dialog; a refreshed interrupt preview opens the dialog; a failed refresh does not send. The existing turn-loss tests now wait for the refresh.

### 2. D12: "1 limited" badge

- Root cause: `HEAD:lane-composer.component.ts:525`. `limitedReasons` counted `approvalReason()`, the explanation shown in the approval chip ("Set at spawn ... bypassPermissions ..."). It counted on every lane that reports an approval mode, so an unrestricted lane showed "1 limited". The badge had only a `title` (`HEAD:lane-composer.component.html:264`): no accessible name and no tooltip.
- Change:
  - `laneLimitations()` lists the limited controls by name: Model, Effort, Images, Approval and Send now. Approval counts only when the mode is `unknown` or not reported.
  - The badge is no longer shown when nothing is limited.
  - The badge is now `role="note"`, `tabindex="0"` and has `aria-label` (for example "2 controls are limited on this lane: Model, Send now"). It has a `ptahTooltip` with "Control: reason" for each entry, which keyboard focus also opens. It has no `title`.
- Tests: no badge for a yolo lane with everything supported. Checked: label, role, tabindex, no `title`, and the tooltip text on focus. An unknown approval mode counts. The image-limit test asserts the new label.

### 3. D11: red resume button on finished lanes

- Root cause: `HEAD:lane-composer.component.html:190`. Resume session used `stopButtonClass` (`COMPOSER_STOP_BUTTON_CLASS`, `bg-error/15 text-error`) for every non-running lane.
- Change: `resumeButtonClass()` uses the primary tint (`RESUME_BUTTON_CLASS`: the same 28 px circle with `bg-primary/15 text-primary hover:bg-primary/25`). The error class stays for `failed` or `timeout`. A `failed` record with `stoppedByUser` (from the other frontend agent's in-progress monitor change) counts as a user stop and gets the primary tint.
- Tests: `completed` and `stopped` give primary. `failed` gives error. `failed` with `stoppedByUser` gives primary.

### 4. D9: stopped vs idle wording

- Root cause:
  - `HEAD:lane-delivery.controller.ts:224-229`. Without a resume (`!usesResume`) the hint always said "Start fresh handoff", even for a finished lane that continues its live session.
  - With a resume it echoed the host's `resumePath`. The host (`agent-continue-input.component.ts`, `resumePath`) returned "Continue warm session" for any `supportsContinuation` lane, including a user-stopped one whose process exits.
  - The placeholder (`HEAD:lane-composer.component.ts:531`) and the Send aria-label always said "Resume".
- Change: the controller derives `restart` from the queue preview and the lane record that the composer already reads through `agentId`:

  | State | Condition |
  | --- | --- |
  | `resume` | `usesResume` is true. This is a cold spawn, so it is never warm. |
  | `warm` | `status === 'completed'`, `supportsContinuation`, and the continuation has not expired. |
  | `fresh` | Anything else. |
  | `checking` | No preview yet. |

  | State | Hint | Placeholder | Send label |
  | --- | --- | --- | --- |
  | `warm` | "Send: continues the warm session" | "Continue X with a message…" | "Continue with message" |
  | `resume` | "Resume with message: Resume CLI session <8 chars>" or "... Resume saved conversation" | "Resume X with a message…" | "Resume with message" |
  | `fresh` | "Send: starts a fresh handoff" | "Message X to start a fresh handoff…" | "Send message" |

  The note after a send says "continues" or "resumes" to match.
- Host cleanup (coordinator instruction): the host's `resumePath` computed and binding are gone, and so is the composer's `resumePath` input. The composer is the only place that names the restart path.
- Tests: in the controller, warm (completed), resume (stopped with `supportsContinuation`: never warm, names the session), resume without a session id, and fresh (stopped without resume, or continuation expired). In the component, placeholder, hint and Send label for warm and for the user-stopped case, where the host label says "Continue warm session".

### 5. D7: "(Opus tier)" on Codex and agy efforts

- Root cause: `HEAD:lane-composer.component.ts:351`. `effortOption` reused main chat's `COMPOSER_EFFORT_OPTIONS`, whose X-High and Max descriptions say "(Opus tier)" (`composer-effort-picker.component.ts:91,99`).
- Change: `laneEffortOption(id, claude)` strips the suffix unless the record's `cli === 'claude'`. Main chat is unchanged.
- Tests: a Codex lane has no "Opus" in any description. A Claude lane keeps both suffixes.

### 6. T2: two queued messages folded into one echo

- Root cause: `HEAD:lane-delivery.controller.ts:359-378`. A queue send cancelled the earlier queued message and sent one combined message (`${earlier.text}\n${draftText}`). The backend then had one pending message with one `echo` (`agent-message-router.service.ts` `flushPending`, `echoDelivered(..., next.echo, ...)`), so the transcript showed one bubble and the composer showed one queued card.
- Decision (coordinator, on the user's parity target "identical to main chat"): stop folding. This **overrides** the `TASK_2026_2320_lnpar` parity inventory row "Coalesce a new draft into the earlier queued message" (marked keep). Main chat keeps each queued prompt separate (`QueuedPromptRecord`).
- Change:
  - `send('queue')` now sends the draft alone and never cancels the earlier queued message. Each message gets its own receipt, queued card, turn and echo. The backend queue (`MAX_PENDING_MESSAGES = 8`) delivers them in order.
  - Removed: `takeForFold`, `mergeSnapshots`, `withinTurnLimits` (only the fold used it), the `'before'` placement in `restore`, and `queuedReceipts` (only the fold used it).
  - Withdraw, Send now on a queued card, the per-message restore on refusal, and the limit hold are unchanged.
  - Second fold point, found by the panel agent: `HEAD:agent-delivery.store.ts` `mergeRecovered`, called from `holdForComposer`. It merged messages held or recovered for a lane composer into one (texts joined, attachments merged, later model and effort won).
    - The store now keeps one list per lane, and `takeRecoveredMessage` returns the oldest message. Each keeps its own text and turn.
    - The controller's recovered-message effect drains the list in order and restores each message into the draft with its own snapshot.
    - The composer has a single draft, so restored texts still sit one after the other in the field. They are no longer merged into one message upstream of it, and no settings are merged.
- Tests:
  - Controller: the fold `describe` (4 tests), the fold image-limit test and the "coalesces ... both snapshots" test are replaced by "sends a second queued message on its own": no cancel, two sends, each with its own snapshot.
  - Component: the three coalescing tests are replaced by "queues each message on its own, with its own card": two sends, no cancel, two Withdraw cards. The lane-at-limit test now expects the second message alone.
  - Store: three merge tests are now separation tests: two recoveries are returned as two messages, each with its own turn; text-only and turn recoveries come back in order; a held message stays apart from a waiting one.
  - Controller: new test "takes every waiting recovered message, oldest first, each with its own turn".

### 7. D4 (frontend half): "Images need a running lane." on a stopped Claude lane

- Finding:
  - The composer does not decide this itself. Its image gate (`HEAD:lane-composer.component.ts:389`, `imagesUnsupportedReason`) reads only `turnInput.images.state` from the preview or record capabilities. That is the backend's `restoredImages()`, which honours the manifest's `images.onResume`.
  - In screenshot `31-t4b-sent.png` the text is the red delivery error under the card, not the status-line gate ("... Remove the image to send."). So the refusal came back from the send. It comes from the backend planner `turnInputRefusal()` (`agent-delivery-planner.ts`, `if (plan.usesResume) return unsupported('Images need a running lane.')`), which refuses on any resume and ignores `onResume`. That is the backend agent's half.
- Change: none was needed in the composer.
- Test: a new component spec mounts a stopped Claude lane with `usesResume: true` and `images: { state: 'supported', onResume: true }`. It shows no "Can't send" mark, Send is enabled, and the send carries the image. The existing Copilot test still covers the opposite case (unsupported shows the lane's reason).

## Verification

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <lane-composer.component.spec.ts> <lane-delivery.controller.spec.ts> <agent-continue-input.component.spec.ts>`: 3 suites, 118 tests passed (final run). The count fell from 126 because the fold tests were removed.
- `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/agent-delivery.store.spec.ts`: 52 passed. The marked mapper was not needed.
- `npx eslint` on the lane-composer and agent-continue-input folders and on `agent-delivery.store.ts` and its spec: exit 0, no warnings. A `max-lines` warning (736 lines) appeared before the helper extraction and is gone now.
- `npx tsx tools/ui-class-audit/check-ui-classes.ts`: exit 0, "0 token count(s) over baseline". It lists unrelated decreases in other files. Baseline not updated.
- `npx tsx tools/degradation-audit/check-degradation.ts`: exit 0, "TOTAL 0 unsuppressed site(s)".
- `npx tsc --noEmit -p libs/frontend/chat/tsconfig.lib.json` (extra, for my files only): no errors in the lane-composer or agent-continue-input files. `npx tsc --noEmit -p libs/frontend/chat-streaming/tsconfig.lib.json`: clean. One unrelated error: `session-inspector/inspector-agent-list.ts(27,7)`, where `stopping` is missing from the `AgentStatusWord` record. It comes from another agent's in-progress status change.
- Not run, per the brief: `npm run verify`, nx, builds, `typecheck-templates`. CI must compile the changed template (`lane-composer.component.html`: `ptahTooltip`, `resumeButtonClass()`, `sendLabel()`).

## Decisions

- Preview refresh trigger: the record's activity key, not the record object identity. Unrelated monitor updates rebuild records, and the existing spec "ignores unrelated updates" pins that. Reversible.
- Queue sends are not refreshed first: only Send now depends on steer availability. Reversible.
- The badge tooltip joins reasons with spaces because the tooltip panel renders one paragraph, so newlines would not show. Reversible.
- The resume button gets a new local class (primary tint), not a new shared primitive. Reversible.
- T2: queued messages are no longer folded (coordinator decision). This overrides the parity-inventory keep row. Reversible from git history.

## For other owners

- Backend owner: the D4 planner refusal (above). Nothing is needed for T2.
- The panel agent's edits to `agent-continue-input` (`stopBusy`, "Stopping…", `stoppedByUser`, the terminal-status test id) are kept. Only the `resumePath` binding, the computed and its tests were removed.
- Lane panel and transcript owner: no T2 change needed. Separate messages already produce separate user segments.

## Addendum: D1 with the host's `steerAvailable` signal

The backend added `AgentOutputDelta.steerAvailable?: boolean`. It is sent only on the delta where the value changed.

- Path, without touching `agent-monitor.store.ts`:
  - `libs/frontend/chat/src/lib/services/agent-monitor-message-handler.service.ts`: on `agent-monitor:output`, a delta whose `steerAvailable` is a boolean calls `AgentDeliveryStore.onSteerAvailability(agentId)` right away. The delta is still batched into the monitor store as before.
  - `libs/frontend/chat-streaming/src/lib/agent-delivery.store.ts`: new `onSteerAvailability(agentId)` and `steerChange(agentId)`. They keep a per-lane counter, and lanes the monitor no longer knows drop out, as with the previews. The value itself is not stored: the previews stay the one source of the steer or interrupt mode.
  - `lane-delivery.controller.ts`: a new effect refetches both previews immediately (background, silent on failure) when the lane's `steerChange` counter moves while a turn runs.
- Unchanged and still active: the throttled activity refresh, as a fallback for hosts without the field, and the refresh before Send now.
- Tests:
  - Handler: a `steerAvailable` delta reports at once and the delta is still batched.
  - Store: per-lane counting and pruning.
  - Controller: an immediate refetch on each change, and none for a lane with no running turn.
  - The two composer spec mocks gained `steerChange`.
- **Blocker for CI (outside my files):** `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-flat-header.spec.ts`, test "keeps card mode header and its actions", fails with `this.store.steerChange is not a function`. Its `AgentDeliveryStore` mock renders a lane composer and does not include `steerChange`. I tried to add `steerChange: () => 0` to the mock; the permission check denied it as outside my ownership. That spec's owner needs the same one-line change. The other five specs with that mock pass: agent-card-unified, cli-agent-output, stats-accumulation, stdout-visibility and inspector-agents-section.
- Verification:
  - jest (chat): lane-composer, controller, agent-continue-input and handler specs, 4 suites, 163 passed.
  - jest (chat-streaming): `agent-delivery.store.spec.ts`, 53 passed.
  - eslint: clean on all changed files.
  - tsc: chat-streaming and chat are clean.
  - UI class audit: 0 over baseline. Degradation audit: 0 unsuppressed sites.

## Addendum: logic review M2, M3, M4 (`code-logic-review.md`)

- **M2: out-of-order preview responses** (`agent-delivery.store.ts` `previewMessage`).
  - Each request records a sequence number under `agentId:delivery`.
  - When the answer arrives, it is stored only if it is still the latest request for that key; an older answer that arrives late is returned to its caller but not stored.
  - Entries are removed when the latest request settles, so the map holds only requests in flight.
  - Specs: a late older `now` answer does not overwrite a newer one; `queue` and `now` are sequenced independently.
- **M3: activity refresh despite `steerAvailable`** (`lane-delivery.controller.ts`).
  - New `reportsSteer(agentId)` (the store's `steerChange(agentId) > 0`). For a lane that reported once, the activity effect returns early, and a refresh already pending skips its fetch when it fires.
  - Lanes that never report keep the 1 s throttled fallback.
  - Specs: no activity refresh after a report; a pending one is skipped when the first report arrives.
- **M4: a stale error blocked Send now** (`lane-composer.component.ts` `prepareNow`, controller `refreshBeforeSend`).
  - `loadPreviews` returns whether both previews answered. `refreshBeforeSend()` returns that result and clears the error on success. `prepareNow` uses the return value, not `error()`.
  - After the await, `requestNow` rechecks `imagesBlocked()`, `attachmentLimitText()` and pending reads. A block stops the send, and the status line shows its reason: "… Remove the image to send." or the limit text, the same priority as before the press. A pending read shows the loading note.
  - The `loadPreviews` catch now carries a `degradation-audit: reported` marker, because it returns `false`.
  - Specs: in the controller, a failed refresh returns false with an error, and the next successful refresh returns true and clears it. In the composer, a Send now after a failed refresh goes through once a refresh works; an image added during the refresh blocks the send and shows the reason.
- Verification:
  - jest (chat): lane-composer, controller, agent-continue-input and handler specs, 4 suites, 168 passed (controller 52 after the audit marker).
  - jest (chat-streaming): `agent-delivery.store.spec.ts`, 55 passed.
  - eslint: clean.
  - tsc: chat-streaming and chat are clean.
  - UI class audit: exit 0. Degradation audit: 0 unsuppressed sites.
- Still open, outside my files: the `agent-card-flat-header.spec.ts` mock needs `steerChange: () => 0` (see the previous addendum).
