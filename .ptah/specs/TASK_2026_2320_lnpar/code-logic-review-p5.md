# Code Logic Review, P5 (Messaging core, backend), TASK_2026_2320_lnpar

Scope: commits `b18a834f2^..4c3af2582` (batches 15-22). Read-only review of the diff and the whole
changed files; no tests, builds or `tsc` were run (reading and git output only).

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 6.5/10 |
| Verdict | REVISE |
| Blocking issues | 0 |
| Serious issues | 4 |
| Moderate issues | 7 |
| Failure modes found | 11 |

The blocked-command guard, raw delivery, R3-1/R3-2, the settings pre-flight and the usage normalizer
are sound on the paths I traced. The serious items are error-path gaps (a throw where the contract
says return `error`, a refusal whose text never reaches the user, images dropped on Recover) and one
silent drop that becomes live as soon as Ptah CLI declares `effort`.

Context that bounds every finding: no adapter declares `turnInput` yet (`grep` for `turnInput` in
`cli-adapters` finds only `cli-adapter.interface.ts`; batches.md Batch 15 notes "until Batch 27 fills
Grok's manifest"). So `commands.blocked`, per-turn model/effort and images are all inert in
production until that batch lands. The P5 logic is correct against fixtures, but nothing protects Grok
`/always-approve` in a real run before Batch 27. `hiddenLaneCommands: ['always-approve']`
(`grok-acp-profile.ts:117`) has no consumer yet.

## Executor deviations, judged

| Deviation | Judgement |
| --- | --- |
| `rawDelivery` instead of `delivery.raw` | Accepted. `delivery` is already `queue`/`now` in the schema (`agent-message-envelope.schema.ts`), and the strict schema plus spec reject `raw:false` and extra keys. R3-1 reads `envelope.rawDelivery?.raw` (`agent-message-reconciler.ts:187`) and `ackStateAtStart(…, undefined)` returns `'unavailable'` (`:74`), so R3-1 holds. |
| Contract helper is a plain function | Accepted. `lane-turn-input-contract.ts:12-35` is correct for what it checks. It does not check `commands.blocked` or `usage`, which is fine for Req 4.3. |
| Edits outside the write sets (router, DI, coordinator spec) | Accepted. The router and DI edits were needed to carry `turn`/`rawBody`; the terminal listener is registered in the one place the store is built (`register-agent-messaging.ts:47-71`, the only `fromStateStorage` caller). |
| Ptah CLI effort not carried on cold resume | Not accepted as is. See S4. |
| Flush refusal recorded as `continuation_rejected`; settings refusal loses text | Acceptable on the code path (permanent `failed`, body kept, never retried), but the text is lost. See M3. |
| Receipt projection lacks `rawDelivery` | Real gap against plan line 361 and L8 ("Delivered as a command"). See M5. |
| `AcpAvailableCommand`/`readAvailableCommands` not in the barrel | Minor. Batch 27 will import by deep path or need the export. Export them now. |

## Five logic questions

### 1. How does this fail silently?

- Ptah CLI cold resume drops `reasoningEffort`: `ptah-cli-lane-resumer.ts:83-87` carries only
  `model`. The dispatcher puts effort into `info` (`agent-message-dispatcher.ts:208-212`) and the
  envelope reads `started`, so the user sees a successful send with the old effort. Becomes live when
  Ptah CLI declares `effort: supported`, because `restoredTurnInput` copies `declared.effort`
  unchanged (`agent-effective-capabilities.ts:111`). (S4)
- Copilot: `edit-refused` returns `{success:false, error: COPILOT_EDIT_REFUSED}`
  (`agent-rpc.handlers.ts:1423`). The frontend discards `error` and shows "This permission request is
  no longer pending" (`agent-permission-responder.ts:73-74`). The refusal is visible but the
  message is false. The same banner is shown for a schema rejection (`'Invalid permission
  response.'`, e.g. a `reason` over 500 chars or a `modifiedInput` over 100,000 chars). (S1)
- A raw message whose `rawDelivery` marker write returned null falls back to `dispatching` without
  the marker (`agent-message-dispatcher.ts:109`), so `startAck` (`:375`) sets `pending` for a message
  that was sent with no ack line, and the ack never arrives. Use `form.raw`. (M6)

### 2. What user action produces unexpected behaviour?

- Recover text after a failed send: images are released the moment an envelope is `failed`
  (`TERMINAL`, `agent-message-envelope.store.ts:37`; listener `:588`), but "Recover text" is offered
  for failed messages. `heldTurn` (`agent-message-coordinator.service.ts:538-547`) then returns no
  images, so the user's images vanish on every refusal (blocked command, settings refusal, capability
  change). (S2)
- Interrupt-and-send ("Now") with a model change on a lane whose provider refuses it at
  `applyTurnSettings`: the planner only refuses model/effort when `plan.mode === 'steer'`
  (`agent-delivery-planner.ts:96`). On the interrupt-resume route the turn is interrupted first
  (`router.interruptAndResume`), then `applyContinuationTurnInput` runs inside `continueConversation`
  and throws, which becomes `AgentInterruptedDeliveryError` (router `:372`). The running turn is lost
  and nothing is delivered. Visible, but avoidable by applying/validating settings before interrupt. (M4)
- A user message starting with a path such as `/usr/bin is missing` goes raw (no header, no ack) when
  the lane's command list is unknown and its manifest marks commands or skills supported
  (`deliversRaw`, `agent-message-dispatcher.ts:158-160`). Decision 15 says "advertised only". (M1)

### 3. What input produces a wrong answer?

- `turnSetting` regex `^[\w.:/@+-]+$` (`agent-message-rpc.handlers.ts:34`) rejects any provider model
  id containing a space or parentheses (for example Cursor-style display ids). The send then fails at
  the boundary with a parse error rather than a coded refusal. Low probability, wrong answer is a
  hard error. (M7)
- Case-insensitive advertised-command match (`matchesLaneCommand`) sends `/Compact` raw to a
  provider that may be case-sensitive; the provider then answers "unknown command". Minor.
- Blocked-command rule itself is right: `trimStart` (covers BOM, newlines), first whitespace-bounded
  token, must start with `/`, `/` stripped, case-insensitive exact (`lane-command-filter.ts:19-56`).
  `"hello\n/always-approve"` is not a command to the provider either, so not blocked. A zero-width
  character glued to the token is not `\s` and would bypass the match; no provider is known to strip
  it, so I leave this as a note.

### 4. What happens when a dependency fails?

- `store.transition` rejects (disk full): `refuseHeld` (`agent-message-dispatcher.ts:178-186`) and the
  `rawDelivery` write (`:104-108`) are not guarded, so `attempt()` throws instead of returning an
  outcome with `error`/`storage-unavailable`. `markDispatching` has the guard (`journalFailed`); these
  two do not. After the `rawDelivery` throw the envelope is stuck in `dispatching` with nothing sent. (S3)
- `limitGate.check` throwing after `holdImages` (`agent-message-coordinator.service.ts:213-217`)
  leaks the held images: there is no envelope yet, so no terminal listener ever releases them, and
  the `try/catch` that releases covers only `put`. (M2)
- `failLostAttachments` is awaited inside `scheduler.start` with no guard
  (`agent-message-delivery.scheduler.ts:105`). A storage failure on that first write rejects `start`,
  so the held `blocked-retryable` messages are not re-armed at all. (M8)
- Provider catalog timeout: bounded at 5 s with the timer cleared (`bounded`, coordinator `:797`),
  returns cached lists plus `error`, never throws. OK. But `advertisedCommands` calls `turnOptions`
  from inside `serial.run(lineage)` for every `/`-leading user send, so a hung provider holds that
  lineage's send queue for up to 5 s. (M9)

### 5. What is missing that the requirements never mentioned?

- Memory accounting for parked entries: a parked router entry keeps `turn.images` by reference
  (`router.park` `:412-416`). After the envelope goes terminal the store releases its accounting
  but the parked reference stays until flushed or removed, so the 64 MiB cap can undercount.
- Non-terminal envelopes (`blocked-retryable` with no `nextRetryAt`, `outcome-unknown`) hold images
  indefinitely; only Cancel or a restart frees them, and a full cap yields `attachments-capacity`
  with no hint to the user which message is holding it.
- `always_allow` on Copilot allows once and remembers nothing (`toBridgeDecision`), while the card
  reports "Always allowed". The doc comment says so, but the user is not told.
- Concurrent `continueConversation` calls on one idle lane both pass the busy check and both
  run `applyTurnSettings` before one of them is refused as busy, so the loser's model change is
  already applied to the handle (`agent-process-manager.service.ts:3170-3185`). Narrow: the
  coordinator serialises sends per lineage, but the router flush does not.

## Focus risks

1. **Blocked commands.** Verified on every path:
   send (`dispatcher.attempt` `:90` before `markDispatching` and the journal), queue flush
   (`applyContinuationTurnInput` `:3136-3140`, reads `rawBody ?? message`; `rawBody` is set from
   `attempt.body` in `live` `:247` and kept on the parked entry), interrupt-resume (`continueWith`
   passes `input`; both dispatcher and manager check), cold resume (`AgentLaneResumeService.resume`
   `:54-55` plus the dispatcher check, and the held re-check `routeHeld` via `turnInputRefusal`), raw
   delivery (checked before `deliversRaw`). Applies to every sender kind, not only users. Blocklist
   source is resolved turn input, then the manifest, so a throwing `turnInputSupport()` still keeps
   the static list (`liveTurnInput` `:75-79`). No bypass found. Only caveat: the list is empty until
   Batch 27 wires Grok.
2. **Raw delivery.** Only `sender.kind === 'user'` and only a leading `/token`; a parent or lane sender
   always gets the header (`:149`). No header and no ack line (`:112-115`), `ackState` goes through
   `ackStateAtStart(..., undefined)` in both the dispatcher (`startAck`) and the reconciler (R3-1).
   Never steers: `routerDeliveryFor` (`:176-180`) rewrites `steer` to `now` only with confirmed
   `allowPartialTurnLoss`, else `queue`, and the router honours `noSteer` on both the `steer` and
   `now` branches (`router :283`, `:301`). R3-2 satisfied. Gap: the fallback rule (M1).
3. **Turn settings.** A refusal throws before `turnSeq`, status, `turns.set` and `settleTurn`
   (`continueConversation` `:3327-3344`), so status and turnSeq are unchanged. The record is
   updated only after a successful apply and after a re-check that the lane is still this idle record.
   Caveat in the "missing" list above (concurrent calls).
4. **Attachment store.** Cap check is correct, including replace-in-place and keeping the previous
   holding on a cap error (`hold` `:57-72`). Release happens on `settled`, `cancelled`, `failed`,
   `expired` via the single terminal listener, including a send-time refusal and a deduplicated put.
   Restart: held-in-memory images are gone and `failLostAttachments` fails `not-started` and
   `blocked-retryable` image envelopes; `dispatching` ones become `outcome-unknown` and a retry fails
   `attachments-unavailable` rather than sending without images. Leaks: M2 (limit-gate throw), the
   parked-reference note. Data loss: S2.
5. **Usage increments.** No double count: the card gets `step.increment`
   (`agent-process-manager.service.ts:2064-2077`), the durable outcome gets `step.turnTotal` only when
   `outcomeUsageIsTurnTotal`, unchanged from before, and request context and the lane guard still read
   the raw segment. `settleTurn` runs at the start of each continuation (`:3344`), so a `turn`-scope
   handle does not subtract the previous turn's sum. `costUsd` stays last-wins on `turn`, is stripped
   from `message`/`cumulative` increments and kept in the total. One uncertainty (LOW): handles with no
   `usageScope` (ACP runtimes) now default to `turn` semantics for every segment
   (`segment.usageScope ?? sdkHandle.usageScope ?? 'turn'`, previously pass-through for handles that
   are not turn-total). If an ACP handle emits per-message usage without a scope, increments would go
   negative. ACP repeats the turn's usage on its terminal, which fits `turn` semantics, so I believe
   it is right; confirm with one spec on the ACP handle.
6. **Schemas.** `LanePermissionResponseSchema` accepts exactly `{requestId, decision, reason?,
   modifiedInput?}` with the four decisions the frontend can send (`agent-permission-responder.ts:62-72`).
   Limits that the frontend does not enforce: `reason` max 500, `modifiedInput` 100,000 serialized
   chars, any key named `constructor`/`prototype`/`__proto__` rejected at any depth. Each rejection is
   reported as "no longer pending" (S1). The send schema (`sendSchema`/`turnSchema`) matches what the
   lane composer builds (`{data, mediaType}` images, `files`, `model`, `reasoningEffort`); one risk,
   M7. Payload ceiling: 8 images at about 6.9 MB base64 each is about 55 MB, under the 64 MiB host
   cap but a second concurrent send is refused `attachments-capacity`.
7. **Copilot bridge.** `always_allow` is treated as allow, `deny_with_message` as deny with `reason`
   (`toBridgeDecision`). `modifiedInput` on an allow decision is refused and the request stays pending,
   which is the right behaviour; a deny with `modifiedInput` is applied as a plain deny. `modifiedInput`
   is forwarded to the SDK permission handler (`agent-rpc.handlers.ts:1409`). The two handlers share
   ids only by coincidence of unknown ids being ignored, which is the existing contract. Only Copilot
   refuses an edit it cannot honour; whether the other lanes served through the SDK handler apply
   `modifiedInput` is outside this diff and unverified.
8. **Error handling.** Router paths return `unsupported` with codes; `composerOptions` never throws;
   `turnOptions` never throws; `getMessage` throws only when the body is unreadable (existing
   behaviour). The throw sites are S3 and M8.

## Failure modes

### Edit refusal reads as "no longer pending" (S1)

- Trigger: Copilot approval with edited input, or any schema rejection (reason over 500, large edit).
- Symptom: wrong banner; the user retries the same edit and gets it again.
- Evidence: `agent-rpc.handlers.ts:1384-1389,1423`; `agent-permission-responder.ts:72-75`.
- Current handling: backend returns a specific `error`; frontend drops it.
- Recommendation: show `result.data.error` in the banner when present; reserve "no longer pending"
  for the "No pending permission request matched" case. Cap `reason` in the card at 500.

### Images lost on Recover (S2)

- Trigger: any failure (blocked command, `turn-options-refused`, `attachments-unavailable` by capacity,
  capability change at `routeHeld`) after which the user recovers the text.
- Symptom: text, files, model and effort come back; images do not.
- Evidence: `agent-message-envelope.store.ts:37,588`; `agent-message-coordinator.service.ts:538-547`;
  `agent-message-attachment.store.ts:75-79`.
- Current handling: release on `failed`.
- Recommendation: keep images for a `failed` envelope until Recover/Withdraw/expiry, or release only
  `settled`/`cancelled`/`expired` and release on `failed` when the reason is `attachments-unavailable`.

### Storage failure throws out of `attempt()` (S3)

- Trigger: `store.transition` rejects in `refuseHeld` or in the `rawDelivery` write.
- Symptom: `agent:sendMessage` rejects with a raw error; the envelope stays `not-started` or
  `dispatching`; no coded outcome.
- Evidence: `agent-message-dispatcher.ts:104-108,178-186`; compare `journalFailed` at `:94-96`.
- Recommendation: wrap both in the same try/catch and return `unsupported(..., 'storage-unavailable')`.
  For the marker, failing the write should refuse before any adapter call.

### Ptah CLI effort dropped on cold resume (S4)

- Trigger: stopped Ptah CLI lane, user picks an effort, sends.
- Symptom: delivered, old effort used, no notice.
- Evidence: `ptah-cli-lane-resumer.ts:83-87` (comment "registry has no effort option");
  `agent-effective-capabilities.ts:111`; `agent-message-dispatcher.ts:208-212`.
- Recommendation: in `restoredTurnInput`, mark `effort` unsupported for `ptah-cli` with a reason, so the
  planner refuses it at send and at `routeHeld`.

### Raw fallback is broader than "advertised" (M1)

- Evidence: `agent-message-dispatcher.ts:156-160`.
- Recommendation: with no known list, deliver with the header (not raw) and let the provider treat
  the text as plain; or require the list lookup to have succeeded.

### Held-image leak on limit-gate throw (M2)

- Evidence: `agent-message-coordinator.service.ts:213-217`.
- Recommendation: release in a `catch` around the gate, or call `holdImages` after the gate.

## Blocking issues

None.

## Serious issues

- **S1** Edit/validation refusal text is lost in the frontend banner. `agent-permission-responder.ts:72-75`.
- **S2** Images dropped on Recover after a failed send. `agent-message-envelope.store.ts:37,588`.
- **S3** `attempt()` throws on a storage failure instead of returning `error`.
  `agent-message-dispatcher.ts:104-108,178-186`.
- **S4** Ptah CLI effort silently dropped on cold resume. `ptah-cli-lane-resumer.ts:83-87`.

## Moderate and minor issues

- M1 Raw fallback rule too broad: `agent-message-dispatcher.ts:156-160`.
- M2 Held-image leak on limit-gate throw: `agent-message-coordinator.service.ts:213-217`.
- M3 Flush refusals keep no text: a blocked or content refusal becomes `continuation_rejected`
  (`router :558-561`, `reconciler :253`), a settings refusal keeps the reason but not `lastError`
  (`classifyContinuationFailureDetail` text is only used on the live paths). The user sees a generic code.
- M4 Interrupt before a refusable settings change: `agent-delivery-planner.ts:96`;
  `agent-process-manager.service.ts:3170`. Apply or validate settings before `interrupt()`.
- M5 `rawDelivery` not projected to the receipt (`projectAgentMessageEnvelope`), so "Delivered as a
  command" cannot render. Add a field to `AgentDeliveryReceipt` and its projection.
- M6 `startAck` should use `form.raw`, not the re-read marker: `agent-message-dispatcher.ts:373-376`.
- M7 Model id regex may reject real provider ids: `agent-message-rpc.handlers.ts:34`.
- M8 `failLostAttachments` can reject `scheduler.start`: `agent-message-delivery.scheduler.ts:105`.
  Catch per envelope and log.
- M9 Catalog lookup inside the lineage lock for every `/` send: `advertisedCommands`, coordinator.
- Minor: export `AcpAvailableCommand` and `readAvailableCommands` from the acp-runtime barrel; a
  refused flush entry is marked `dispatching` by the journal first, so `everDispatched` may demand a
  duplicate-risk confirmation on Retry for a message that ran nothing (verify in `journalDispatch`).

## Data flow (send with images, model, raw command)

1. `agent:sendMessage` parses `turnSchema` (strict, size-bounded): OK.
2. `coordinator.send`: plan, `turnInputRefusal` (blocked command first, then images/files/model/effort): OK.
3. `holdImages` (cap): OK; limit gate may throw and leak (M2).
4. `store.put` with `turn` summary (count only, never bytes): OK; release on put failure and dedupe: OK.
5. `dispatcher.attempt`: blocked check, `deliveryForm` (images present or `attachments-unavailable`),
   raw decision: OK; `refuseHeld` and marker write can throw (S3).
6. `live` or `cold`: raw text without header, `noSteer`, `rawBody`, turn: OK; cold drops images by
   design (refused earlier) and Ptah effort (S4).
7. Router: park keeps `turn` and `rawBody`, flush re-checks blocked and applies settings: OK.
8. Reconciler: `started`, ack `unavailable` for raw: OK.
9. Terminal state: listener releases images: OK; Recover afterwards loses them (S2).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Blocked command refused on every path | COMPLETE (logic) | List empty until Batch 27 wires manifests |
| Raw `/command`, no header, no ack, no steer | COMPLETE | Fallback breadth (M1); no receipt field (M5) |
| Turn settings refusal leaves record unchanged | COMPLETE | Concurrent-call and interrupt notes (M4) |
| Images in host memory only, capped, released | PARTIAL | Recover loses images (S2), leak (M2) |
| Usage increments, no double count | COMPLETE | ACP default-scope confirmation |
| Strict permission schema accepts frontend payload | COMPLETE | Rejections mis-reported (S1) |
| Copilot `always_allow` / `modifiedInput` | COMPLETE | `always_allow` not remembered, not told |

Implicit requirements not addressed: user-visible text for flush refusals (M3); effort on Ptah cold resume (S4).

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| `"  /Always-Approve on"` | YES | trimStart, case-insensitive first token | none |
| Blocked text from a parent or lane sender | YES | check is sender-independent | none |
| Host restart with held images | YES | fails `attachments-unavailable`, text kept | start guard (M8) |
| Cap exceeded | YES | refused, previous holding kept | no hint which message holds memory |
| Duplicate idempotency key | YES | images released | none |
| Raw message parked then flushed | YES | text raw, ack `unavailable` | marker-null fallback (M6) |
| Raw message with a steer route | YES | queue, or interrupt only when confirmed | none |
| Throwing `turnInputSupport()` | YES | fail closed, static blocked kept | none |
| Empty `turn: {}` | YES | summary undefined | none |
| Storage write fails mid-attempt | NO | throws | S3 |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH on the blocked-command, raw and usage logic; MEDIUM on adapter behaviour that
  no manifest declares yet.
- Top risk: S3 and S2 (a storage failure that throws instead of returning an outcome, and image loss on
  Recover) plus the dormant S4 that goes live with Batch 27.
- What a robust implementation would add: guard the two dispatcher writes; keep images for failed
  envelopes until Recover or expiry; show backend refusal text in the permission banner; refuse Ptah
  effort on cold resume; release images when the limit gate throws; guard `failLostAttachments`; make
  the raw fallback header-preserving; project `rawDelivery` to the receipt; confirm the ACP default
  usage scope with one spec; make sure Batch 27 wires Grok `commands.blocked` before the feature ships.
