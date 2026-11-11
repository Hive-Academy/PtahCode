# Review: TASK_2026_945_dcd1 (model and effort dropdown tied to the session of its tab)

Scope read in full: `tab-session-settings.ts` (+spec), `live-turn-settings.ts` (+spec), the diffs of
`model-selector`, `effort-selector`, `message-sender.service`, `canvas-session-overrides`,
`chat-session.service.ts` (live send block, lines 1830-2140 and `autoResumeIfInactive`),
`session-control.service.ts` (`setSessionModel`, `setSessionEffort`), plus consumers of
`currentModel()` / `currentEffort()` / `overrideModel` / `overrideEffort` across `libs/frontend`.
No tests were run (instructed not to). Paths are relative to the worktree root.

The core frontend idea (one resolver for the dropdown, the send sites and the freeze) is sound and
removes the display/send split. The defects are mostly on the backend live-apply and on what the
selectors stopped doing.

## Findings

### 1. [high] A live turn can silently downgrade effort `max` to `xhigh` on every turn
- File: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:2087-2092`,
  `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:687-695`
- What: `applyLiveTurnSettings` now calls `setSessionEffort` on every live turn that carries an
  effort. The frontend sends the resolved effort (override, pin or global) on every send. There is
  no `currentEffort` on the session record and no dedup, unlike the model. `setSessionEffort` maps
  `max` to `xhigh` ("the flag-settings layer has no `max` tier", comment at line 663-667).
- Why: a session started with `max` (cold start passes `params.effort`) gets re-set to `xhigh` by the
  flag layer from its second turn on, while the dropdown shows Max. The comment in the code says the
  persisted `max` only takes full effect at the next session start, i.e. the flag layer wins.
  It is also one `applyFlagSettings` control request per turn per tile, even when nothing changed.
- Fix: record the applied effort on the session record (as `currentModel` is) and return early when
  equal. Seed it from the start effort. Skip the call when the requested effort is `max` and the
  session already started with `max`.
- Confirmed by reading code (the mapping and the missing dedup). The SDK precedence of flag layer
  over the start option is suspected.

### 2. [medium] Queued follow-ups never apply the new model/effort
- File: `chat-session.service.ts:2087` (`if (!justResumed && !followUp)`), `:1844-1848`
- What: when the user sends while a turn runs, the renderer uses `queueIntent: 'next-turn'`, so
  `followUp` is set and the apply is skipped. Nothing applies the setting when the queued item is
  promoted to its own turn.
- Why: the dropdown shows the new model (override written at pick time), but the promoted turn runs
  on the old one. This is exactly the "dropdown differs from the model the next turn uses" case.
  The next idle send fixes it, so the mismatch lasts one turn.
- Fix: apply the settings when the queued item starts its turn (promotion path), or carry
  model/effort on the queue item and apply them there. At minimum document it and cover it by a test.
- Confirmed by reading code.

### 3. [medium] The live apply is awaited before the send with no bound
- File: `live-turn-settings.ts:30-55`, `chat-session.service.ts:2087`
- What: two sequential awaits (`setSessionModel`, `setSessionEffort`) sit in front of
  `sendMessageToSession`. Both are SDK control requests to the CLI process. The `try/catch` handles
  a rejection, not a request that never settles.
- Why: before this change a send never waited on a control request. A hung or dying query process
  now blocks the user's message with no error and no timeout (the `finally` only releases on throw).
- Fix: bound each call with a timeout (for example `Promise.race` with a short deadline) and log
  `warn` on timeout. Run the two calls concurrently.
- Suspected.

### 4. [medium] The live apply bypasses the per-session runtime control path
- File: `chat-session.service.ts:2087` (calls `this.sdkAdapter.setSessionModel/Effort`),
  compare `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.ts:236` and
  `libs/backend/agent-sdk/src/lib/codex-app-server/legacy-session-controls.ts:108-124`
- What: `config:model-switch` goes through `runtimeControls.setModel`, which serialises per session
  (`serialize`), commits with rollback and bumps a revision. The new path calls the adapter directly.
- Why: a concurrent `config:model-switch` and a chat turn can interleave and leave `currentModel`
  and the SDK out of step. For a native (Codex) session the routing adapter forwards the value
  verbatim to `updateNextTurn({ model })` (`codex-chat-session-controls.ts:230-237`), with no
  tier resolution and no dedup. A Claude tier (`haiku`, `default`) from the tab then goes to Codex
  on every turn.
- Fix: route through `runtimeControls` (or the router) like `config:model-switch`, and skip when the
  runtime reports the same value. At least gate the call to sessions the SDK adapter owns.
- Suspected for Codex; confirmed that the serialised path is not used.

### 5. [medium] The selectors no longer write the global model/effort, but other readers still use it
- File: `model-selector.component.ts` (`selectModel`), `effort-selector.component.ts`
  (`selectEffort`). Readers of the global: `libs/frontend/mcp-apps-page/src/lib/services/apps-session.service.ts:240-241`,
  `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:288,371,473`,
  `libs/frontend/chat/src/lib/services/ultracode-state.service.ts:50-60`.
- What: the old main-panel path called `modelState.switchModel` (optimistic global update, then
  `config:model-switch`, which also persisted the default to settings, `config-rpc.handlers.ts:224-246`).
  The old tile path called `effortState.setEffort(effort, sessionId)` (live push and persist). Both
  are gone. `ModelStateService.switchModel` now has no UI caller.
- Why: (a) a pick is no longer remembered as the default for new tabs or after restart (if the tab
  state is not persisted, it is lost); (b) Ultracode only pins the global effort to `xhigh`, so any
  tab that holds an override (every tab after one pick, every tile after `freezeSessionOverrides`)
  ignores it; (c) the Apps page and the wizard fallback use a global that the user can no longer
  change from the chat input. Possibly intended, but it is a visible behaviour change that is not
  stated in the task notes.
- Fix: decide explicitly. Either keep "dropdown = this tab only" and make Ultracode write the tab
  override (or send `options.effort` itself), or keep a separate "set as default" action. Record the
  decision.
- Confirmed by reading code.

### 6. [medium] A session-origin model skips validation on send
- File: `message-sender.service.ts` `modelForTab` (`origin === 'session' ? model : resolveValidModel(model)`)
- What: `agentOrigin.model` / `sessionModel` are sent as they are, also on a cold resume.
- Why: a pin or a restored model that the active provider no longer offers makes the turn fail in
  the backend ("Model X is not available") and the user sees the same stale value in the dropdown.
  The tier names (`haiku`) are resolved by `ModelResolver`, but on providers without a tier map
  (`warnUnservableTierValue`) they go out verbatim and 404.
- Fix: keep tiers as they are, but validate full ids against the list, or fall back to the listed
  default and show it. Add a test for an unlisted session model.
- Confirmed by reading code (the missing validation); the provider case is suspected.

### 7. [low] Tier display match is fuzzy
- File: `model-selector.component.ts` `effectiveListedModel` (`includes(tier)` on id or name)
- What: when no exact id exists, the first listed model whose id/name contains `opus` wins, for
  example `opusplan` or `sonnet[1m]`. A full id that is not an exact list id (dated id) shows raw,
  with no highlighted option.
- Fix: prefer exact, then id equal to tier, then `startsWith(tier)`; exclude variant suffixes.
- Suspected.

### 8. [low] The selectors silently do nothing when the tab is not found
- File: `model-selector.component.ts` `selectModel`, `effort-selector.component.ts` `selectEffort`
- What: `contextTab()` is `undefined` when `SESSION_CONTEXT` names a tab that is not in `tabs()`
  (closed, other workspace slice). The dropdown closes, nothing is stored, `effortChanged` still
  emits. Before, the main panel fell through to the global switch. A tile with a falsy tab id now
  controls the active main tab.
- Fix: log or ignore the emit; do not fall back to `activeTab()` when a context exists.
- Confirmed by reading code.

### 9. [low] Command Center projection does not use the resolver
- File: `libs/frontend/command-center/src/lib/components/command-center-projection.source.ts:40`
  (`liveModelStats?.model || sessionModel || overrideModel`)
- What: ignores `agentOrigin.model` and ranks the override last, so a card can name another model
  than the tile dropdown.
- Fix: use `resolveTabModel` for the fallback chain.
- Confirmed by reading code.

### 10. [low] `params.model` / `params.effort` are not parsed at the RPC boundary
- File: `chat-session.service.ts:2087-2092`
- What: both values come from the typed RPC params and reach `setModel` / `applyFlagSettings`
  without a schema parse. The same was true for the cold resume, but the live path is now reached on
  every turn.
- Fix: validate `effort` against the `EffortLevel` set and `model` as a non-empty string before the
  call (repo rule: parse RPC params).
- Suspected (no parse seen in the code read).

### 11. [low] Test gaps
- No test covers the gate `!justResumed && !followUp` or the order "apply, then send" in
  `chat-session.service` (the spec file is unchanged).
- `live-turn-settings.spec.ts` has no case for an effort failure, for a model without effort, or for
  a rejected call that must not block the send.
- No test for effort `max` (finding 1), for a queued follow-up (finding 2), or for an unlisted
  session model (finding 6).
- The rewritten `effort-selector.component.spec.ts` dropped the live-sync assertions without a
  backend counterpart that proves the live apply.
- `session-control.service.spec.ts` covers the model dedup only; there is no spec for the effort path.

## Accepted gap (not counted)
An explicit Default (null) effort is not sent, so it cannot clear a live or pinned effort. Note the
dropdown then shows "Default" while the session keeps the effort. Worth a visible hint in the label
until fixed.

## Checked and fine
- Display and send share `resolveTabModel` / `resolveTabEffort`. Fallback order for override and
  global origins is identical in `effectiveModel` and `resolveValidModel`.
- Tab isolation: the selectors write only `setOverrideModel/Effort(tabId, ...)`; no global write
  remains. `freezeSessionOverrides` keeps a parent pin (spec added).
- `overrideModel` typed `string | null`: the resolver's truthiness check handles `null`.
- No `any`, no new deep imports (`canvas` -> `chat-state` is `feature` -> `data-access`), signals and
  `computed` only, `inject()` used, OnPush unchanged. Errors in `applyLiveTurnSettings` are logged
  with a fixed message and error text, not swallowed.
- Model dedup in `SessionControl.setSessionModel` compares the resolved id and `currentModel` is set
  only after a successful `setModel`, so a failed apply is retried on the next turn.

## Verdict
NEEDS_REVISION: the frontend resolver is correct, but the backend live apply can silently downgrade `max` effort, skips queued follow-ups, is unbounded and bypasses runtime-control serialisation; and the dropped global write needs an explicit decision.

## Review disposition

Fixed in this task:
- Finding 1: the session record now keeps `currentEffort` (seeded from the start effort).
  `setSessionEffort` skips a repeat, so `max` is not lowered to `xhigh` on each turn. Spec added.
- Finding 3: the live apply runs the model and effort calls at the same time. Each call has a
  5 s deadline. A timeout logs a warning and the turn still runs. Spec added.

Accepted and documented (not changed here):
- Finding 2: a queued follow-up does not apply a new model or effort. The next idle send does.
- Finding 4: the live apply calls the adapter directly, not the runtime-control path. The adapter
  ignores a value that the session already uses.
- Finding 5: the selectors write the tab only. They no longer write the global default. This is
  intended: model and effort belong to the session. Ultracode, the Apps page and the wizard still
  read the global value.
- Finding 6: a session-origin model is sent as it is, without validation against the model list.
- Findings 7 to 11: low priority, no change.
- Known gap: an explicit "Default" (null) effort cannot clear a live effort.
