# Code Logic Review, P3 + P4 (batches 11-14) — `TASK_2026_2320_lnpar`

Scope: `git diff 8914a568f 404a69013 -- libs apps`. Read in full: `lane-composer.component.ts`, `lane-delivery.controller.ts`, `lane-permission-view.ts`, the `agent-permission-responder.ts` diff, the agent-card, canvas lane view, continue-input, header and usage diffs, plus the backend handlers they talk to. No tests, builds or verify were run (read-only review).

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 6.5/10 |
| Verdict | REVISE |
| Blocking | 0 |
| Serious | 3 |
| Moderate | 6 |

The composer, queue and prompt-card work is sound. The queue, recovery and prompt-once flows keep whole messages and answer each prompt once. The problems are the lane permission responses (`always_allow`, `modifiedInput`) that the UI now sends before the backend honours them, and two paths where a message or attachment can be lost without notice.

## Serious

### S1. Copilot lane: "Always allow" is treated as DENY, while the UI reports "Allowed by you"
- `lane-permission-view.ts:206-213` maps `allow` and `always_allow` to the outcome `allowed`. `agent-permission-responder.ts` (`respondLane`) now forwards every main-chat decision.
- The Copilot bridge only accepts the literal `allow`: `copilot-permission-bridge.ts:185` (`decision.decision === 'allow' ? 'allow' : 'deny'`) and `:225` (`... 'allow' ? 'approved' : 'denied-interactively-by-user'`). Any other decision is a denial.
- Scenario: the user clicks Always allow on a Copilot lane prompt. Copilot denies the tool. The card then says "Allowed by you. No longer answerable here."
- This is a silent, misleading failure, and it can be hit on today's backend. The RPC handler `agent-rpc.handlers.ts:1383-1402` has no schema, so it does not reject. It forwards the decision unchanged.
- SDK-route lanes survive: `sdk-permission-handler.ts:1534` downgrades `always_allow` to a one-time allow when there is no session scope.
- Fix: do not offer Always allow on the lane card until batch 22 narrows the decision. Or have `respondLane` map `always_allow` to `allow` for requests that come from the Copilot bridge. Or do the narrowing in the handler now.

### S2. `modifiedInput` is sent but discarded by the backend
- The responder adds `modifiedInput` (`agent-permission-responder.ts`, the `...(modifiedInput === undefined ? {} : { modifiedInput })` line).
- The handler rebuilds the SDK response as `{ id, decision, reason }` only (`agent-rpc.handlers.ts:1398-1402`). The Copilot bridge reads only `decision` and `reason`. I found no consumer.
- The user edits the tool input, approves, and the original input runs. The card reports "Allowed by you".
- It does not break today's backend: no rejection, extra fields pass through. Fix: either hide the edit affordance for lanes until batch 22 carries `modifiedInput` through, or wire it through in the handler.

### S3. `sendQueuedNow` loses the message if the lane switches mid-flight
- `lane-delivery.controller.ts:343-349`: `takeQueued` has already cancelled the message on the backend. If the composer's `agentId` changes before the `await` returns, the `if (!message || this.agentId() !== agentId) return;` leaves the message cancelled, not sent and not restored.
- The composer is explicitly reused across lanes: the lane-switch effect resets the draft.
- Probability is low, impact is data loss. Fix: when the lane changed and the message exists, either finish the send for the original agentId, or put it into `acceptedMessages` / a recover entry for that agent.
- Related: `send()` at `:288` returns without `remember()` when the lane switches after the backend accepted. A later refusal of that receipt will then not restore the text or its attachments.

## Moderate

- **M1. Send now ignores pending attachment reads.** `lane-composer.component.ts:573` (`requestNow`) checks `nowDisabled`, `stopped` and `imagesBlocked`, but not `attachments.pendingReads() > 0`. Queue send does (`sendDisabled`). Ctrl+Enter while an image is still reading sends the message without it. The image then lands in the tray unsent.
- **M2. `restore()` overwrites a newer model or effort pick.** `lane-delivery.controller.ts` (`restore`) calls `settings.pickModel` / `pickEffort` from the snapshot unconditionally. A pick made after queueing is replaced silently when a message is withdrawn or refused.
- **M3. Two composers mounted for one lane** (inspector plus canvas, or panel plus canvas). `acceptedMessages` is module-global, and `takeRecoveredMessage` and `processReceipt` are consumed by whichever controller reacts first. A refused or recovered message can be restored into a composer the user is not looking at. Coalescing across the two mounts works, which hides the problem on the happy path.
- **M4. `LanePermissionView.resolvedStatus` has side effects in a `linkedSignal` computation.** `lane-permission-view.ts:165` deletes entries from `sentOutcomes` during computation. The status line, and `notice` (set at `:202`, cleared only on a later successful answer), stay on screen until the lane changes. No bug on the happy path, but the status can be stale or wrongly "answered elsewhere" if recomputation is skipped.
- **M5. Usage flash fires on a lane switch.** `cli-lane-usage-summary.component.ts` (`figureChanges` linkedSignal) is sourced from `tokens` only, not the agent. If the component is reused for another agent, the different total counts as a "change" and flashes.
- **M6. Question answers pass the active tab as the deciding tab.** `ChatStore.handleQuestionResponse` (`chat.store.ts:486-499`) calls `cancelPendingQuestionOnOtherTabs(response.id, activeTab)` for a lane question. Pending copies on other tabs are cancelled. It is acceptable and answers once, but the lane's owner tab is not passed.

## Checked and found sound

- **Capability gating.** Model, effort and approval pills take `disabledReason` and show the reason on the status line (`lane-composer.component.html:128-165`). The `/` list gives each empty group a reason (`commandSource`). Image block has visible chip, status text and a disabled Send. No silent drop found.
- **Queue and recovery.** The queue snapshot carries files, images, model and effort. The recover path uses `takeRecoveredMessage`. `takeQueued` reads before cancel and reports on failure, so a failed cancel keeps the message. `sendQueuedNow` restores the whole message on refusal or exception.
- **Prompt answered once.** `respondLane` guards on `answeredRequestIds` and the reconciliation set. `handleQuestionResponse` in `permission-handler.service.ts:579-593` ignores an unknown id. Canvas renders flat agent cards, so there is no double prompt block. The agent card renders prompts only for `presentation() === 'card'`.
- **Question scoping.** `LanePermissionView.questions()` filters on `request.agentId === agentId`. Canvas `pendingQuestions` excludes questions with an `agentId`. Questions without an `agentId` still show above every non-orchestrator lane, as documented in the batch 13 report.
- **`connect()` leaks.** `LanePermissionView.connect` throws on a second connect. The composer's providers are per component. No timers or listeners were added by batches 11-14, and `figureChanges` uses a linkedSignal, not a timer.
- **linkedSignal staleness.** Both uses key on the agent, except M5.

## Five logic questions (short)

1. Silent failure: S1 and S2 (UI says Allowed, backend denies or ignores). S3's second half (no restore after lane switch).
2. Unexpected action: Ctrl+Enter during an image read (M1). Lane switch during Send now from a queued card (S3).
3. Wrong answer from data: an edited tool input (S2). A Copilot request answered with Always allow (S1).
4. Dependency failure: RPC refusal in `sendQueuedNow` and `send` is handled and restores. Permission RPC timeouts go through the responder's reconciliation (covered in P2).
5. Missing: a backend schema (batch 22) before the UI exposes always_allow/modifiedInput. A re-select of the lane while a send is in flight.

## Does the batch 12 contract break today's backend?

No. `agent:permissionResponse` has no validation (`agent-rpc.handlers.ts:1383`), so `always_allow` and `modifiedInput` do not cause a rejection. They do cause wrong behaviour (S1, S2). When batch 22 adds the strict zod schema, the frontend payload must match it exactly, including `modifiedInput`. The shared type `LanePermissionResponse` already matches.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Composer parity with main chat | COMPLETE | None found. |
| Gated controls with visible reasons | COMPLETE | None found. |
| Whole-message queue, send-now, recovery | PARTIAL | S3, M1, M2. |
| Prompt answered once across surfaces | COMPLETE | Backend decision semantics: S1, S2. |
| Questions scoped to the asking lane | COMPLETE | Questions without `agentId` remain visible on every non-orchestrator lane (documented). |
| Confirmed model chip and usage figure | COMPLETE | M5. |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH (code read, nothing executed)
- Top risk: Always allow on a Copilot lane denies the tool while the card says "Allowed by you" (S1).
- A robust version would: gate or narrow `always_allow` and `modifiedInput` in the UI until batch 22; make `sendQueuedNow` and `send` recover on a lane switch; check `pendingReads` in `requestNow`; not overwrite newer model picks in `restore()`.
