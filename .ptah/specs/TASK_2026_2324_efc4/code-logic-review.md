# Code Logic Review — `TASK_2026_2324_efc4`

Scope: `git diff main...HEAD -- libs apps tools` (six commits, c08d7c59a to e3cf9fa5f). Read-only static review.
No tests, builds, nx or tsc were run, as instructed. Every claim below is from reading code and the batch reports.

## Summary

| Metric              | Value   |
| ------------------- | ------- |
| Overall score       | 7/10    |
| Assessment          | REVISE  |
| Blocking issues     | 0       |
| Serious issues      | 1       |
| Moderate issues     | 5       |
| Failure modes found | 7       |

Why 7 and not 8: the deletions, Grok usage accounting and steer dormancy hold up. One stopped-lane path (Codex catalog failure) still produces the "false empty list" that the brief says must not happen. Several smaller reason-text and edge-case gaps remain. Why not 5-6: no data loss, no live regression found, and the main chat paths are unchanged.

## Five logic questions

### 1. How does this fail silently?

- Codex catalog read fails inside the adapter: `codex-app-server-lane.adapter.ts` `stoppedLaneCatalog()` catch (about line 290-300) logs a warning and returns `{ models: [], efforts: [] }`. The coordinator (`agent-message-coordinator.service.ts:541-545`) treats that as a successful read and builds `stoppedLaneView(current, [], [])`. It sets no `error`, and its reason text is the generic "Effort levels, commands and skills appear when the lane is running." The composer then shows an empty model list and no efforts, with a reason that reads as "wait for the lane to run". It is not a failure notice. This is the false empty list the brief forbids (Finding S1).
- Grok `readGrokCallUsage` (`grok-acp-profile.ts` ~line 95) returns `undefined` on a zod failure. It logs nothing, so a vendor shape change silently drops all live usage. The turn-end total still corrects the card, so the numbers stay right. Only the "live" claim in the manifest becomes untrue (Finding M2).
- Steer, `reconcileSteers(undefined)` (`claude-sdk-lane-runner.ts:429-433`) assumes "folded in" when the result frame has no `user_message_uuids`. That is a success-looking guess. See M3. It is dormant today.

### 2. What user action produces unexpected behaviour?

- Sub-agent composer: while `pending()` the textarea is `disabled`, which drops keyboard focus. After a successful send the draft is cleared with `draft.set('')` (`subagent-lane-composer.component.ts` `onSubmit`). A voice transcript that landed during the pending window is wiped with it. Minor (M5).
- Lane composer: the note "Queued for the next turn..." is set after `await this.delivery.send('queue')` from a value captured before the await (`lane-composer.component.ts` ~673-684). If the run ends during the await, the note is stale. The stopped-flip effect clears notes only on later transitions. Minor.
- The sub-agent lane header and the new composer both show Stop and Send to background. Clicking either works (shared pending signals, `subagent-lane.component.ts:278-279, 450-467`), so there is no double fire. It is plain duplication. See the recommendation under Batch 1.

### 3. What input data produces a wrong answer?

- agy model ids with an effort suffix: `acpProfileEfforts` correctly gives `[]` (antigravity profile `sessionConfig` skips `thought_level` when `MODEL_EFFORT_SUFFIX` matches). The coordinator's reason for that case says "Effort levels, commands and skills appear when the lane is running." That is false, because the live handle also returns `[]` for that model (`provider-session-lane-handle.ts:133-137`). Efforts never appear for that model (Finding M1).
- `findLaneModelOption` (`lane-composer.component.ts` ~131-156): the prefix match is `wanted.startsWith(option.id + '-')`. A recorded id `gpt-5.5-mini-2026...` picks the longest catalog id, which is right. The reverse "dated catalog id" branch needs exactly one row. A non-dated custom id such as `foo-bar` with catalog rows `foo` and `foo-bar-x` would not match falsely. No wrong check mark found by reading. Residual risk: the match is heuristic, and the precedence `pending > record.model > catalog.currentModel > observedModel` means a record whose `model` was not updated after a model change shows the old model. `observedModel` is last, so a confirmed newer model would not win. Batch 7 chose this on purpose, citing `LaneTurnSettingsStore`. It needs the live check the report already asks for.
- Grok per-call usage: `inputTokens = input + cache_read + cache_creation`. `cacheReadTokens` is not set on the increment. If Grok's turn total ever carries `cacheReadTokens` separately, the card gets it once, at turn end. No double count, but there is no live cache figure either.

### 4. What happens when a dependency fails?

- Codex `stoppedLaneCatalog`: failure is swallowed (see Q1). A timeout of the coordinator's 5 s bound (`LANE_TURN_OPTIONS_TIMEOUT_MS`) against the adapter's 8 s read throws through `bounded` into the coordinator catch at `agent-message-coordinator.service.ts:552-559`. That path sets `error: TURN_OPTIONS_ERROR` and is honest. So the same cause gives two different outcomes depending on which timer fires first.
- Grok frames for another session or outside a prompt: dropped by the guard at `acp-session-runtime.ts:646-651` (`promptInFlight && currentTurnId && sessionId !== undefined && params.sessionId === sessionId`). Correct. A frame whose `params.sessionId` is missing is also dropped, which is the safe direction.
- Steer enqueue failure: `claude-sdk-lane-runner.ts:462-471` removes the pending uuid and rethrows. Correct.

### 5. What is missing that the requirements never mentioned?

- No log or counter when `readGrokCallUsage` rejects a frame (M2).
- No test that proves a `usageProgress` increment followed by a cancelled turn leaves the durable row at the partial sum. By reading it does: `step.turnTotal` is stored in `tracked.outcomeUsage` (`agent-process-manager.service.ts:2094`). That seems the right behaviour, but nothing pins it.
- The sub-agent lane panel still has the old scroller with a sticky composer (see M4).

## Focus-by-focus results

### 1. Batch 2 deletions: clean

- A repo-wide search over `apps libs tools docs scripts .github` and the top-level `*.md` files for `agent:continue`, `subagent:interrupt`, `interruptSubagentSession`, `resumeAgentWithMessage`, `.continueAgent` and `SubagentInterrupt` returns zero hits. That covers `apps/ptah-cli`, `libs/backend/cli-engine`, `tools/mcp-bench`, the replay fixtures and sanitizer, the docs and the RPC allowlists (`rpc.types.ts` `RPC_METHOD_ENTRIES` and `host-source-registry.baseline.ts` are both edited). The shared `AgentContinueErrorCode` has no remaining consumer in `libs/shared`, `libs/frontend` or `apps`.
- The remaining `interruptSession` hits are the `IAgentAdapter` chat-adapter methods (`sdk-agent-adapter.ts:2245`, provider-session controls and the routing adapter). Those are the `chat:abort` path and are untouched by the diff.
- `AgentContinueError` and `AgentProcessManager.continueConversation` are kept in cli-agent-runtime and used by the coordinator. The kept symbols are correct.
- The `SubagentMessageDispatcher` header now says three operations, but the bullet list still has `sendToSubagent`, `stopSubagent` and `backgroundTask`, so the count matches.
- Main chat Stop (`chat:abort`) is not in the diff.

### 2. Batch 3 Grok live usage: correct

- No double count. The projector emits `usageScope: 'message'` increments (`cli-segment-projector.ts:101-114`). `LaneUsageNormalizer.accept` adds them to the running sum. The turn-end segment carries the handle's default scope `'turn'` (`provider-session-lane-handle.ts:655`) and becomes `total - sum` (`lane-usage-normalizer.ts` `turn` branch). The report's fixture replay (sum 69024/473, correction 0) agrees with my reading. `totalTokens` is absent on increments, so the turn total supplies all of it once. `settleTurn` is called at turn start (`agent-process-manager.service.ts:3427`).
- Durable row: `tracked.outcomeUsage = step.turnTotal` after each segment. For message-scope steps `turnTotal = add(sum, increment, usage)`, so a cancelled turn keeps the partial sum. It is not doubled at turn end because the turn branch replaces it with the provider total.
- The `usageProgress` event is dropped for other sessions and outside a prompt (see Q4).
- Main chat: `flat-stream-projector.ts:260-266` returns `[]`. The comment now sits inside the case body, so the `no-fallthrough` problem is fixed and the `default: never` check still covers every other event. `provider-session-turn-stream.ts:221` reads only `event.type === 'usage'`, so main chat sums nothing from `usageProgress`. `acp-replay-collector.ts` is non-exhaustive.
- zod failure path: `safeParse` failure returns `undefined`, so no increment and no throw. See M2 for the missing log line.
- One cross-check: `profile.extensions.usage` is a profile-wide hook, so main-chat Grok sessions also run it and emit events that nobody reads. Harmless cost.

### 3. Batch 4 stopped-lane efforts: one Serious, two Moderate

- Derived lists match live lanes: Grok and agy both go through `acpProfileEfforts` (`provider-session-lane-handle.ts:127-137`), which the live handle's `profileEfforts()` now also calls (`:574-578`) with `options.model`. Same function, so same lists. Before, the live call also passed `...options`; `AcpSessionConfigInput` is `Pick<model, reasoningEffort>`, so no other option field was read by either profile.
- Grok `max`: `EFFORT_LEVELS` is `['low','medium','high','xhigh','max']` (`ai-provider.types.ts:184`), and Grok maps any effort to `reasoning_effort` (`grok-acp-profile.ts` `sessionConfig`). The live `applyTurnSettings` validates against the same `profileEfforts()` (`:541`), so `max` is accepted by the live lane's validator. Whether the Grok CLI accepts it is answered at `session.setEffort` (`:546`) with a refusal path, which is handled.
- agy suffix: gets none, as required. See M1 for the reason text.
- Codex uses only the live catalog (`codexAdvertisedEfforts`, no static fallback). The live handle keeps its `CLI_REASONING_EFFORT_VALUES` fallback (`codex-app-server-lane.adapter.ts` `listTurnOptions`), so a stopped lane and a running lane can differ when the catalog advertises none. This was a stated decision. See S1 for the failure case.
- Coordinator reason text: correct for Grok and for agy without a suffix. Wrong for agy with a suffix (M1) and misleading for a Codex failure (S1).

### 4. Batch 5 Claude steer: correct, dormant

- Dormancy: `claude-sdk-lane-runner.ts:693` spreads `steer` and `supportsSteer` only when `manifestSteer?.state === 'supported'`. Both manifests return `unsupported` (`claude-cli.adapter.ts:105`, `ptah-cli-registry.ts:391-394`), and the two call sites read those same manifests (`claude-cli.adapter.ts:360`, `ptah-cli-registry.ts:1061`). Any other caller leaves `manifestSteer` undefined, which is also dormant. The wiring does not enable steer.
- (a) Folded-in: `reconcileSteers(undefined)` clears the map and returns. See M3.
- (b) Cleanup: pending uuid deleted before rethrow. Correct. If `named.enqueue` rejects after the CLI already received the message, the caller sees a failure for a delivered steer. That is an at-least-once edge, acceptable while dormant.
- (c) Anchor: the anchor is `inFlight[last]` at push time, and `supportsSteer` needs `turnRunning()`, so it is never `undefined`. `reconcileSteers` runs before `inFlight.shift()` (`:385-386`). The placeholder goes after the anchor (or at index 1 if the anchor is gone) and the head then shifts, so the placeholder becomes the next head. If the anchor was folded into the same frame, it is still in `inFlight` at reconcile time and is dropped afterwards, so the placeholder stays ahead of the later turns. I traced `[H, X, Y]` with a steer anchored on X and found no deadlock.
- Early settle risk: if two steers are missed and the CLI runs them as two turns, only one placeholder exists, and the second steer's result frame settles a real turn early. The comment states this assumption. Dormant, so it is not a defect today.

### 5. Batch 7 visual fixes

- Canvas layout: the CLI panel class drops `overflow-y-auto` (`canvas-lane-view.component.ts:80-90`), the transcript div owns the scroll (`:179-185`, `data-testid="lane-scroller"`), the composer sits in `[sessionComposer]`. `ChatSessionLayoutComponent` projects those slots in order (`chat-session-layout.component.ts`). The only code that finds a scroller is `findScrollingAncestor` in `cli-agent-output.component.ts:224` and `subagent-lane.component.ts:363`. The first walks ancestors for `overflow-y`, so it finds the new div. The glass selector `[data-glass-surface='chrome']:has(> ptah-chat-session-layout)` still matches, because the layout stays the direct child of the chrome panel. Not verifiable without rendering: the layout host is `flex-1 min-h-0`, so a panel with `h-full` must give it a definite height. The old class `!flex-none min-h-full` is gone, which is consistent.
- Model label: the order is stable across the three sources and `mixed-model` is skipped. See Q3 for the residual staleness of `record.model`.
- Status line clearing: the effect clears on `stopped` flips only (`lane-composer.component.ts` ~590-598). Stale-note race noted in Q2.
- `emptyLabel`: input default `''`; `displayName` is now `selectedOption()?.name || selectedId() || emptyLabel()`. For main chat `emptyLabel` is never bound, so an unselected pill is `''` as before. One behaviour change: `||` instead of `??` means an option whose `name` is the empty string now falls through to the id. Main chat catalogs do not have empty names, so I count it as harmless.

### 6. Batch 1 sub-agent composer

- Every control: text, voice, Send, Stop (`stoppable`), Send to background (`canBackground`) work. Attach, Model and Effort are gated through `ComposerGatedControlDirective` and `disabledReason`, with reasons from `SUBAGENT_GATED_REASONS`. Native Codex passes `context = null`, so the composer shows no Stop or background button and the lane header keeps its disabled Stop with the reason (`subagent-lane.component.ts:143`). Consistent.
- Modes, delivery and generation guard: `mode()`, `onSubmit`, `steer`, `followUp` and the generation reset effect are unchanged in behaviour. The guard still protects `pending` and the draft against a late reply for another agent.
- Duplicates: the header pair (`subagent-lane.component.ts:90-116`) and the composer pair call the same `onStop` / `onBackground` handlers and share the pending signals. Recommendation: remove the header pair. Reasons: (1) the composer is always visible, sticky at the bottom in the flat presentation (`mt-auto sticky bottom-0`, `:242`) and `shrink-0` below the scroller otherwise, so the header buttons add no reach; (2) the CLI lane composer and main chat already put Stop and Send to background in the toolbar, so the composer position matches the other lanes; (3) two identical icon buttons with different accessible names ("Stop X" and "Stop generating") confuse screen-reader users and test selectors. Keep the native-Codex disabled Stop with its reason, which is the only place that explains why Stop is unavailable. If the owner wants to keep a header action, keep Stop only (a header Stop is the usual place to reach it when the lane is collapsed) and remove Send to background. My first choice is to remove both.

## Serious issues

### S1. Codex stopped-lane catalog failure returns a false empty list with a misleading reason

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts` (`stoppedLaneCatalog` catch, about lines 290-300) and `libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-coordinator.service.ts:541-545` with `stoppedLaneView` (`:126-141`).
- Scenario: a stopped Codex lane is opened while the binary is missing, the home is unreadable, or the catalog read errors. The adapter swallows it and returns empty lists. The coordinator cannot tell that from a catalog that advertises nothing.
- Impact: the composer shows no models and no efforts and says "Effort levels, commands and skills appear when the lane is running." The user is told to start the lane, when the real cause is a failed read. `StoppedLaneCatalog`'s own doc says "Never rejects: a failed read gives empty lists", so the contract builds in the problem. The brief's requirement is an honest reason.
- Fix: let `StoppedLaneCatalog` carry a result state, for example `{ models, efforts, failed?: true }`, or let it reject and rely on the coordinator catch, which already sets `error: TURN_OPTIONS_ERROR` and keeps cached lists. The simplest change is to rethrow from `stoppedLaneCatalog` after the warn (keeping `listModels()` as the warn-and-empty wrapper it was), so the coordinator reports `error`. Add a coordinator spec for a failing `stoppedLaneCatalog`.

## Moderate and minor issues

- M1. `agent-message-coordinator.service.ts:134-139`: `stoppedLaneView` picks its reason only from `efforts.length`. For an agy model with an effort suffix, efforts never appear even when the lane runs, so "Effort levels ... appear when the lane is running" is wrong. Fix: when the adapter returned a derived (empty) list for a known model, say "This model has a fixed effort level." or similar, or drop "Effort levels" from the text for adapters that implement `laneEfforts`.
- M2. `grok-acp-profile.ts` `readGrokCallUsage`: a failed `safeParse` is silent. Add one debug-level log per session (not per frame) so a vendor shape change is visible. The `usage` hook has no logger parameter (`acp-vendor-profile.ts` `usage?(method, params)`), so the runtime at `acp-session-runtime.ts:652` would need to log when a `response_completed`-like method returns `undefined`, or the hook signature gains the logger.
- M3. `claude-sdk-lane-runner.ts:429-433`: no uuids in the result frame is treated as "all folded". On an older CLI that does not fold, the missed steer's own result frame settles the next real turn early. Dormant now. Before Batch 6 flips the manifest, either require `user_message_uuids` for `supported` or pin the assumption with a live check in L4.
- M4. The sub-agent lane (`subagent-lane.component.ts:241-250`) still has the composer `sticky bottom-0` inside the lane scroller in the flat presentation. It has the same root cause as B1 (transcript rows scroll under the composer), and Batch 7 recorded it as out of scope. Track it as a follow-up.
- M5. `subagent-lane-composer.component.ts` `onSubmit`: `draft.set('')` after success drops text added while pending (voice). Compare the draft against the sent text and clear only when equal. The disabled-while-pending textarea also loses focus.
- Minor: `lane-composer.component.ts` ~673-684 stale "Queued for the next turn..." note after a run ends during the await (see Q2).
- Minor: the coordinator's 5 s bound against the Codex adapter's 8 s read means the cold-start catalog read (a spawned app-server) can exceed 5 s every time, so the stopped Codex composer shows the error path often. Existing behaviour, but it is now the only source for Codex efforts, so its impact grew.

## Failure modes

### Codex catalog read fails on a stopped lane

- Trigger: binary missing, home unreadable, catalog error.
- Symptom: empty model and effort lists with the "appear when the lane is running" text.
- Evidence: `codex-app-server-lane.adapter.ts` catch in `stoppedLaneCatalog`; `agent-message-coordinator.service.ts:541-545`.
- Current handling: logged, then success-looking empty result.
- Recommendation: S1.

### Effort-suffixed agy model

- Trigger: lane record model with an effort suffix.
- Symptom: reason says efforts will appear later.
- Evidence: `antigravity-acp-profile.ts` `sessionConfig`; `agent-message-coordinator.service.ts:134-139`.
- Current handling: empty list with the generic text.
- Recommendation: M1.

### Grok usage frame shape drift

- Trigger: Grok changes `response_completed` fields.
- Symptom: no live usage, correct totals at turn end, manifest still says `live`.
- Evidence: `grok-acp-profile.ts` `readGrokCallUsage`.
- Current handling: silent skip.
- Recommendation: M2.

### Steer folded-in guess (dormant)

- Trigger: older CLI, no uuids, steer not folded.
- Symptom: a real turn settles early.
- Evidence: `claude-sdk-lane-runner.ts:429-433`.
- Current handling: assumes folded.
- Recommendation: M3, before the manifest flip.

### Two steers missed (dormant)

- Trigger: two missed steers run as two CLI turns.
- Symptom: one placeholder only; a real turn settles early.
- Evidence: `claude-sdk-lane-runner.ts:435-439`.
- Current handling: documented one-turn assumption.
- Recommendation: insert one placeholder per missed steer, or verify coalescing in L4.

### Draft wiped after pending (sub-agent composer)

- Trigger: voice transcript appended during a send.
- Symptom: transcript lost on success.
- Evidence: `subagent-lane-composer.component.ts` `onSubmit`.
- Current handling: unconditional clear.
- Recommendation: M5.

### Sub-agent lane composer sticky inside scroller

- Trigger: a long sub-agent transcript.
- Symptom: rows scroll under the composer.
- Evidence: `subagent-lane.component.ts:241-250`.
- Current handling: none (out of scope in Batch 7).
- Recommendation: M4.

## Data flow (Grok live usage)

1. Grok sends `_x.ai/session_notification` `response_completed` — OK (zod-parsed, silent on failure, M2).
2. `acp-session-runtime.ts` `extNotification`: session and prompt guard — OK.
3. `profile.extensions.usage` maps the counters; the model falls back to `sessionModel()` — OK.
4. `usageProgress` event, then `projectToCliSegments` makes a `message`-scope info segment — OK. The main chat projector returns `[]` — OK.
5. `LaneUsageNormalizer.accept`: increment is added to the sum — OK.
6. Prompt response: `usage` event with `'turn'` scope; increment is `total - sum` — OK, no double count.
7. `tracked.outcomeUsage = turnTotal` for the durable row — OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Delete `agent:continue` and `subagent:interrupt` end to end | COMPLETE | None found. |
| Grok live usage without double count | COMPLETE | Silent parse failure (M2). |
| Stopped-lane efforts match live lanes | PARTIAL | Codex fallback differs by decision; failure reporting (S1); reason text (M1). |
| Claude steer fixes, steer stays dormant | COMPLETE | M3 and the two-steer assumption to settle before Batch 6. |
| Visual fixes B1, M1-M4, S2-S5 | COMPLETE (static) | Needs Electron re-measure, as the report says. Sub-agent lane still has B1 (M4). |
| Sub-agent composer controls work or are gated with reasons | COMPLETE | M5, duplicates with the header. |

Implicit requirements not addressed: logging for the Grok parse failure, and a regression test for a cancelled turn with partial live usage.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Grok frame for another session | YES | session id guard | none |
| Grok frame during `session/load` replay | YES | `promptInFlight` and `currentTurnId` guard | none |
| Cancelled Grok turn with partial usage | YES (by reading) | durable row keeps partial sum | no test |
| Grok `max` effort | YES | same `EFFORT_LEVELS` filter as live | CLI may refuse; refusal path exists |
| agy suffixed model | YES (list) / NO (reason) | profile rule | M1 |
| Codex catalog advertises none | YES | `[]` and reason | live differs (fallback) |
| Codex catalog read fails | NO | empty lists, no error | S1 |
| Steer enqueue fails | YES | uuid removed, rethrown | none |
| Steer result without uuids | PARTIAL | assumed folded | M3 |
| `mixed-model` as selected model | YES | skipped in both resolvers | none |
| Stopped flip clears the note | YES | effect on transitions | stale note after await |
| Main chat `emptyLabel` | YES | default `''` | none |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH (static reading only; no tests run, nothing rendered)
- Top risk: a failed Codex catalog read on a stopped lane is shown as an empty list with a "start the lane" reason (S1).
- What a robust implementation would add:
  - Make `stoppedLaneCatalog` report failure (rethrow or a `failed` flag) and test it in the coordinator spec.
  - Correct the reason text for lanes whose efforts are fixed to none (agy suffix).
  - Log Grok usage parse rejections once per session.
  - Remove the duplicate Stop and Send to background buttons from the sub-agent lane header; keep the native-Codex disabled Stop and its reason.
  - Clear the sub-agent draft only when it still equals the sent text.
  - Before the steer manifest flip: require uuid support and handle several missed steers, then check both in L4.
  - Apply the transcript and composer slot layout to the sub-agent lane panel.
  - Run `typecheck-templates` for `ptah-extension-webview` in CI, since the lane view, lane composer and picker templates changed.
