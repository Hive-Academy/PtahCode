# Code Logic Review (final, whole PR) — `TASK_2026_2320_lnpar`

Scope: `git diff origin/main...HEAD -- libs apps tools` at head 46488d5d4 (PR #1501). Read-only review; no tests, builds or `nx` were run. Earlier per-phase findings are not repeated unless a fix regressed them.

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 7/10     |
| Assessment          | REVISE   |
| Blocking issues     | 0        |
| Serious issues      | 2        |
| Moderate issues     | 6        |
| Failure modes found | 8        |

The seams hold up on the main paths: the composer payloads match the strict zod schemas, attachment storage is wired through DI, and usage increments are not double counted in the card. The Serious items below are user-visible gaps that the phase reviews could not see. None loses data.

## Five logic questions

1. Silent failure. A refused attachment-capacity send shows the raw code `attachments-capacity` as the error text (S1). A stopped lane after a host restart shows an effort picker disabled with "reports no reasoning effort levels" while the backend capability says effort is supported (S2). The lane catalog error discards the cached lists the backend returned (M5).
2. Unexpected user action. Pick a model, queue a message, then use Send now: every steer is refused as `turn-options-refused` until the queued turn starts, because the pick is never cleared on send (M1). Pasting more than 8 images or attaching more than 32 files gives only "Could not send your message. Try again." (S3 below, merged into M2).
3. Wrong answer from data. None found in the usage path. `cumulative` is now per turn: the snapshots reset in `settleTurn`. That is correct for Codex, the only emitter, but the shared doc still says "whole session so far" (M6).
4. Dependency failure. `getLaneComposerOptions` times out (5 s) or the adapter lookup throws. The handler returns `error` with the cached lists, and the renderer drops those lists (M5). Image holding without a store is refused with text. A failed `getQueuedMessageBody` aborts Edit and keeps the queued message (OK).
5. Missing from the requirements. Nothing in the renderer uses `receipt.rawDelivery`. A raw `/command` delivery therefore shows "Ack unavailable (no MCP)" (M3). Image and file count limits are not mirrored in the UI.

## Failure modes

### S1. Raw reason code shown as the capacity error
- Trigger: the host attachment store is full (64 MiB cap), then the user sends an image.
- Symptom: the composer error reads literally `attachments-capacity`.
- Evidence: `agent-message-coordinator.service.ts:585` sets `detail: 'attachments-capacity'`; `lane-delivery.controller.ts:349` and `:432` show `outcome.detail ?? 'Could not send...'`. `REASON_TEXT` in `agent-delivery.store.ts:154` is only used for receipts, and the controller never reads `reasonCode`.
- Current handling: the draft and attachments stay. The text is unhelpful, not lost.
- Recommendation: put a sentence in `detail` (for example "Held attachments are using all attachment storage. Remove an image or wait for earlier messages to finish."), or map `reasonCode` to text in the store.

### S2. Restored or stopped lane: effort and commands come only from an in-process cache
- Trigger: the host restarts, or the lane is stopped, and its lineage has no cached catalog.
- Symptom: the effort picker is disabled with "<cli> reports no reasoning effort levels." and `/` lists no commands or skills, although `restoredTurnInput` (`agent-effective-capabilities.ts`, `restoredTurnInput`) declares model, effort, files, commands and skills as supported for a cold resume.
- Evidence: `agent-message-coordinator.service.ts:518` returns `efforts: cached?.efforts ?? []` and `commands: cached?.commands ?? []`; `remember()` runs only on a live handle's success (`:505`). The UI reason is built at `lane-composer.component.ts:693`.
- Impact: the UI shows a disabled control with a reason that contradicts the backend capability, and "Resume with a different effort" is impossible after a restart.
- Fix: serve efforts from the manifest or adapter statically for cold lanes, or change the reason to "Effort levels load when the lane is running".

### M1. A pending pick survives a send and blocks later steers
- Trigger: pick a model or effort, send it as a queued message, then Send now.
- Evidence: `LaneTurnSettingsStore.pending` is cleared only when the record confirms (`lane-turn-settings.store.ts` `unconfirmed`/`reconcile`). `clearPending` (`:139`) has no production caller, only specs. `turnInputRefusal` refuses model or effort on `plan.mode === 'steer'` (`agent-delivery-planner.ts`). `nowDisabled` ignores the pick (`lane-delivery.controller.ts`, `nowDisabled`).
- Symptom: Send now is refused until the queued turn starts. The error text does show, so it is not silent.
- Fix: disable or annotate Send now while a pick is pending, or send the pick only with the queued message and clear it on acceptance.

### M2. Image and file counts are validated only by the host
- Evidence: `agent-message-rpc.handlers.ts:51-52` allow at most 32 files and 8 images. `composer-attachments.service.ts` has only a per-image size cap. The queue fold in `lane-delivery.controller.ts` (`mergeSnapshots`) can add the counts of two messages.
- Symptom: the strict schema rejects the RPC, and the store throws. The UI shows "Could not send your message. Try again." for a deterministic failure, and Retry cannot succeed.
- Fix: cap in the tray, or surface the schema message. Skip the fold when the merge would exceed the limits.

### M3. Raw `/command` receipts are mislabelled
- Evidence: `AgentDeliveryReceipt.rawDelivery` is projected (`agent-message-envelope.projection.ts:46`) and parsed (`schemas.ts:106`), but nothing in the renderer reads it. `agent-delivery.store.ts:478` labels `ackState: 'unavailable'` as "Ack unavailable (no MCP)".
- Impact: a raw provider command on an MCP-capable lane is described as having no MCP.
- Fix: label it "Sent as a provider command" when `rawDelivery` is true.

### M4. Recover or Retry after the composer already restored the message
- Evidence: `processReceipt` restores text, files, images and the pick into the composer when a receipt fails, and drops the entry (`lane-delivery.controller.ts`, `processReceipt`). The thread row still offers Recover text and Retry (`agent-delivery.store.ts:441-450`). `recoverIntoComposer` merges with `\n`, and recovered images get fresh ids, so they duplicate.
- Backend side: `getMessage` releases the held images of a failed message on the first read (`agent-message-coordinator.service.ts:482`), so a later Retry sends text only or fails with `attachments-unavailable`. That failure is surfaced, not silent.
- Note: the text duplication existed before this PR. The image and file duplication is new.
- Fix: hide Recover once the controller restored the receipt, or de-duplicate by content.

### M5. A catalog error drops the cached lists
- Evidence: `agent-rpc` handler `composerOptions` (`agent-message-rpc.handlers.ts`) returns cached `models`, `efforts` and `commands` plus `error`. `lane-turn-settings.store.ts:200` treats any `error` as a failed read and stores no options on a first load.
- Impact: a 5 s timeout on a stopped lane shows "Could not load lane options." and an empty picker, where the backend had sent usable cached models.
- Fix: keep `options` when the list is non-empty, and show the error beside them.

### M6. Shared usage-scope doc contradicts the code
- Evidence: `agent-process.types.ts:691` says `cumulative` is "the whole session so far". `lane-usage-normalizer.ts` resets snapshots per turn and treats it as turn-scoped (`settleTurn`).
- Impact: a future adapter that emits a session-wide cumulative will double count at each turn start. Only Codex emits it today (`codex-lane-events.ts:226`, turn-scoped).
- Fix: correct the doc, or add a session-scope value.

## Serious issues
- S1 and S2 above.

## Moderate and minor issues
- M1 to M6 above.
- Minor: `LaneTurnSettingsStore.clearPending` is dead outside specs (`lane-turn-settings.store.ts:139`).
- Minor: `@` file picks in a lane are not gated by `turnInput.files.state`. The backend refuses with a reason, which is shown.
- Minor: Retry on a `turn-options-refused` or `turn-input-unsupported` failure will be refused again. The classifier marks these terminal for the scheduler, but the chip still offers Retry.

## Data flow

1. Composer send builds `LaneTurnRequest` from `toTurnRequest`. Fields are `model`, `reasoningEffort`, `files` (paths) and `images` (`{data, mediaType}`), which match the strict `turnSchema` and `imageSchema`. OK, with the count caps in M2.
2. `agent:sendMessage` runs `turnInputRefusal` (OK), `holdImages` (S1 text), `envelopeTurnOf` (image bytes never stored) and `store.put`, with release on every early exit. OK.
3. Dispatcher flush re-checks the turn input and fails with `turn-options-refused` or `turn-input-unsupported` plus `lastError` (200 chars). The receipt schema accepts it, and the controller shows `lastError`. OK.
4. Recovery: `agent:getQueuedMessageBody` returns `{text, turn}`, and `snapshotFromTurn` rebuilds images, files and the pick. Round trip keeps text, files, images, model and effort. OK, with M4.
5. `agent:permissionResponse`: the responder builds `LanePermissionResponse`. The strict schema accepts it, and the reason is capped at 500, matching the deny popover `maxlength="500"`. The Copilot edit refusal is returned as an error, the request stays pending, and the card shows the text. OK.
6. Usage: the normalizer sends increments, which `addCliUsage` sums in `applyPendingOutput`. The durable `turnTotal` goes to the sink once per completion (`lane-completion-outcome.ts`). No double count found. OK.
7. Capabilities: previews carry `effectiveCapabilities.turnInput`, and the composer reads them first and the record second. Disabled controls show the backend reason (`settingReason`). Gap: S2.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Payload match (send, permission, options) | COMPLETE | Count caps (M2) |
| Capabilities in UI match the backend | PARTIAL | Restored lane efforts and commands (S2) |
| Live usage, no double count | COMPLETE | Doc mismatch (M6) |
| Errors reach the user | PARTIAL | `attachments-capacity` raw code (S1), generic schema failure (M2) |
| Recovery keeps text, files, images, model, effort | COMPLETE | Duplicate Recover and Retry (M4) |
| No main chat regression | COMPLETE | Controller keeps keys, paste, drag and queue guards; no divergence found |
| No leftovers | PARTIAL | `clearPending` unused; no TODO, `console.log` or debug code added |

Implicit requirements not addressed: UI mirrors of the host count limits; a rawDelivery label.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Lane switch during send | YES | `holdForLane` | None |
| Host restart with held images | YES | `attachments-unavailable`, text kept | Recover shows no note |
| Two composers on one lane | YES | preferred composer | None |
| 9 images or 33 files | NO | Schema rejection | Generic text (M2) |
| Stopped lane picker | PARTIAL | Cached lists only | S2 |
| Copilot edited approval | YES | Refused, stays pending | None |
| Same model as current | YES | Not treated as a change | None |

## Verdict

- Recommendation: REVISE (minor; the Serious items are text and capability-reason fixes, not data loss).
- Confidence: MEDIUM. I read the backend coordinator, planner, capabilities, usage normalizer, attachment store, RPC handlers, the lane composer, delivery controller, stores and `ComposerInputController` in full. I did not read every adapter diff, the `.html` templates or the spec files, and I ran nothing.
- Top risk: the user sees a refusal or disabled control whose text is raw (`attachments-capacity`) or contradicts the backend (restored lane effort).
- A robust implementation would add: human text for every `reasonCode`; the UI mirror of the 8-image and 32-file limits; a catalog fallback for cold lanes; clearing or annotating a pending pick once it is sent; and a `rawDelivery` label.
