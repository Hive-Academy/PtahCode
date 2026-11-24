# Batch 7 report: F4 lane turn state store (chat-streaming)

Task 7.1: implemented. No git operations were run.

## Files

- CREATED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-streaming\src\lib\lane-turn-settings.store.ts`: `LaneTurnSettingsStore` (`providedIn: 'root'`).
- CREATED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-streaming\src\lib\lane-turn-settings.store.spec.ts`: 12 tests.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-streaming\src\lib\agent-delivery.store.ts`: `sendMessage(..., turn?)`, `recoverQueuedMessage`, 4 reason texts.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-streaming\src\lib\agent-delivery.store.spec.ts`: a `turn snapshot` block with 8 tests.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-streaming\src\index.ts`: exports the store, its 3 text constants and its types.

## What was built

- **`LaneTurnSettingsStore`.** State is kept per agent id and only in renderer memory. The store does not inject `TabManagerService` (Risk 1).
  - **Catalog.** `loadCatalog(agentId)` calls `agent:getLaneComposerOptions` with a 15 s timeout. It is used when a dropdown opens and by Retry.
  - **Catalog states.** The catalog moves `idle -> loading -> ready | error`. Only one read runs per lane; a second call returns the same promise.
  - **Error cases.** The `error` state is used in three cases: the RPC fails, the RPC throws, or the result has its `error` field set. `errorDetail` holds the reason.
  - **Refresh.** Refreshing a `ready` catalog keeps it `ready` with `refreshing: true`. If the refresh fails, the old options are kept.
  - **Pending picks.** `pickModel`, `pickEffort`, `clearPending`, `pending` and `turnSettings` (which returns `undefined` when nothing is pending).
  - **Clearing picks.** A pick is cleared when the agent record confirms it. The model clears when the record's `model` or `observedModel` equals the pick. The effort clears when the record's `reasoningEffort` equals it. This runs on each pick and in a root `effect` on `AgentMonitorStore.agentsById()`.
  - **Pruning.** The same effect drops the pending entry, catalog and in-flight read of any lane the monitor no longer tracks. This keeps the maps from growing without limit.
  - **A-TL1.** `turnInput(agentId)` returns one of three states. It is `checking` until a preview returns. It is `reported` when the preview, or else the record, has a `turnInput` section. It is `unreported` with "Lane did not report its options." when a preview came back without one.
  - **`isChecking(agentId)`.** True while the first catalog load runs or while `turnInput` is still `checking`. Batch 11 uses it to set `aria-disabled` on controls.
  - **Exported text.** `LANE_OPTIONS_CHECKING_TEXT` ("Checking lane options…"), `LANE_OPTIONS_ERROR_TEXT` ("Could not load lane options.") and `LANE_OPTIONS_UNREPORTED_TEXT`.
- **`AgentDeliveryStore`.**
  - `sendMessage` takes `turn?: LaneTurnRequest` as a 6th parameter. The `turn` field is spread into the RPC payload only when it is given.
  - `recoverQueuedText(): Promise<string>` keeps its signature and behaviour (E53). It now delegates to the new method.
  - New `recoverQueuedMessage(agentId, messageId): Promise<{ text; turn? }>` (D21). `turn` is omitted for a text-only body.
  - `REASON_TEXT` has 4 new entries:
    - `turn-options-refused`: "lane refused the model or effort"
    - `turn-input-unsupported`: "lane cannot take this attachment or command"
    - `attachments-unavailable`: "attachments no longer held"
    - `attachments-capacity`: "attachment storage full"

## Acceptance evidence (specs)

- **Lane pick leaves the tab overrides unchanged.** A fake `TabManagerService` holds tabs with `overrideModel` and `overrideEffort`. The test picks a model, picks an effort and clears them. The tabs are deep-equal to before, and `setOverrideModel`, `setOverrideEffort` and `updateTab` are never called.
- **`loading -> ready`.** The test checks the in-flight dedupe, `isChecking` while loading, and the RPC params with the timeout.
- **`loading -> error`, then Retry.** Retry goes through `loading` and ends `ready`. Other tests cover a result with its `error` field set, a thrown transport error, and a failed refresh that keeps the old options.
- **`REASON_TEXT`.** An `it.each` covers the 4 new codes in `receiptStatus` text.
- **A-TL1.** The tests cover `checking` before a preview, `unreported` after a preview with no section, and `reported` from the record or the preview.
- **Recovery and send.** `recoverQueuedText` still resolves a string. `recoverQueuedMessage` resolves `{text, turn}`, omits `turn` for a text-only body, and rejects when the body is missing. `sendMessage` sends `turn` only when one is given.

## Verification

- `npm run verify -- --related -p @ptah-extension/chat-streaming`, logged to `.ptah/tmp/w3-b7-related.log`.
  - The first run failed: `structuredClone is not defined` in the jest environment (1 failed, 52 passed). I replaced it with a spread copy.
  - The re-run passed: `NX 1 task: 1 succeeded`, `lock released after 26.6s, exit code 0`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/chat-streaming,@ptah-extension/chat`, logged to `.ptah/tmp/w3-b7-lint-typecheck.log`.
  - Result: `NX 4 tasks: 4 succeeded, 2 cached`, `exit code 0`.
- `agent-follow-up-queue.service.spec.ts` (chat project) was not run separately. Batch 8 is editing `chat` at the same time, and the run rules forbid a test run there now. The file and its `recoverQueuedText` call are unchanged, the signature and return type are unchanged, and the chat typecheck above passed. The coordinator should include it in the chat test gate.
- No run was killed for low memory. Both runs waited in the verify queue for a while ("waiting for memory", "waiting on queued pid").

## Decisions

- **Refresh does not go back to `loading`.** Options: drop back to `loading` (this disables the pickers each time a dropdown opens) or stay `ready` with `refreshing`. I chose to stay `ready`. Evidence: the plan says the catalog is "refreshed on dropdown open", and `loading` disables gated controls (Req 1.8). Reversible.
- **A result with `error` set becomes the `error` state.** The result contract (`rpc-agents.types.ts`) says a failed lookup returns empty lists with `error` set, and the design maps that to "Could not load lane options." with Retry. Reversible.
- **Confirmation for the model pick.** It accepts either `model` or `observedModel` (the plan says "model/reasoningEffort and observedModel match"). The effort pick uses `reasoningEffort` only. Reversible.

## Risk handling

- **Risk 1 (tab leak).** The store has no tab dependency, and a spec pins that tab state does not change.
- **A-TL1.** Absent sections are treated as described above. Until Batch 22 adds the backend handler, the RPC fails and the catalog sits in `error`, which is expected.
- **Long-lived cost.** There is one root effect, with no timers and no per-item observers. Entries of gone lanes are pruned.

## Out-of-scope observations

- `MonitoredAgent` in `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-streaming\src\lib\agent-monitor.store.ts` carries `model` but not the new `reasoningEffort` or `observedModel` from `AgentProcessInfo`. The store reads those fields through a structural type, so it works once they exist. Until `agent-monitor.store.ts` copies them from `info` (spawn and replacement paths, around `:1700-1775`), only the `model` confirmation fires. A pending effort, or a model confirmed only by `observedModel`, stays pending until the lane composer clears it. This file is outside the Batch 7 write set, and Batch 14 (header `observedModel ?? model`) needs the same fields. Recommendation: add the copy in a chat-streaming batch, before or with Batch 14.
