# Cooperative agent handoff implementation plan

## Inputs and constraints

Requirements and observed failures come from [context](./context.md), the [subagent inventory](./inventory-partial.md), [SDK cancellation inventory](./inventory-sdk-cancel-text.md), [session and lane inventory](./inventory-sessions-lanes.md), and the supplied prior architect handoff. The current-code citations and old-to-new mapping are in the [parity inventory](./parity-inventory.md). The prior handoff corrects the incident timeline and preserves the settled design direction. The ceiling multiplier is the remaining product choice. This task is a design-only refactor in the existing task worktree.

## Codebase evidence

| Existing seam | Location | Architectural implication |
| --- | --- | --- |
| Normal SDK SubagentStop prepares a record and queues correlated delivery | C/subagent-budget-monitor.ts:781–885 | Reuse the completion seam without synthetic stop notifications |
| SDK already exposes non-interrupting guard hook/callback | H/sdk-query-options-builder.ts:1422–1483, SDK/sdk-permission-handler.ts:1388–1405 | Gate new tools on both surfaces and preserve allow-rule enforcement |
| Runtime already imports the SDK public registration layer | RT/di/register.ts:16,96 | Register runtime-owned disposition lookups through an SDK port |
| Ambient tasks excluded from renderer snapshots | SDK/message-transform/system-message.transformer.ts:47–72 | Consume raw provider snapshots for liveness |
| Both Claude-backed lane entry points build SDK options | L/cli-adapters/claude-cli.adapter.ts:215–265 and RT/ptah-cli/ptah-cli-registry.ts:964–1008 | Compose one gate at the shared existing options builder, preserve named-account and yolo paths |
| Parent drainer uses durable send IDs and waits when owner is inactive | RT/cli-agents/parent-delivery/parent-delivery-drainer.service.ts:200–250 | Reuse persistence and deduplication for authenticated child reports |

## Architecture and contracts

The parent continues from a correlated handoff result after the agent returns normally. Crossing a threshold changes admission policy and publishes a notice. It never settles the running turn, interrupts it, closes its tab, aborts its query or marks it completed. A confirmed provider failure and explicit user stop remain lifecycle events. [Current path inventory](./parity-inventory.md)

Keep accounting in the existing subagent monitor, SDK session lifecycle and CLI lane coordinator. The runtime owns child and lane lineage, including the authoritative parent for delivery. The SDK owns root and subagent tool admission. The host owns dispatch and user commands. Shared owns vocabulary and formatting without host or SDK types. The runtime already depends on the SDK at registration. Register the child/session disposition reader there against a public SDK port so the SDK never imports the runtime. Electron is the first integrated consumer. Headless hosts consume the same contracts and existing report/status surfaces.

Proposed public shape in `libs/shared`, through its existing barrel. Existing serialized completion/status values remain decodable.

```ts
type AgentActionActor = 'ptah-budget' | 'ptah-watchdog' | 'ptah-host' | 'provider' | 'user';
type AgentAction = 'asked-handoff' | 'paused' | 'ended';
type AgentActionReason =
  | 'context-budget' | 'weighted-budget' | 'raw-budget' | 'duration'
  | 'telemetry-unavailable' | 'notes-overdue' | 'handoff-record-unavailable'
  | 'runtime-cap' | 'succession-limit' | 'successor-start-failed'
  | 'session-budget' | 'handoff-complete' | 'repeat-call' | 'lane-inactive'
  | 'tool-gate-unavailable' | 'provider-no-response' | 'provider-input-closed'
  | 'compaction-overdue' | 'permission-cancelled' | 'permission-timeout'
  | 'identity-unavailable' | 'user-stop' | 'host-shutdown';
type AgentNextStep =
  | 'write-notes-and-return' | 'return-report' | 'review-live-agent'
  | 'continue-from-handoff' | 'retry-first-turn' | 'review-and-resume'
  | 'review-permission' | 'none';
interface AgentActionNotice {
  readonly actor: AgentActionActor;
  readonly action: AgentAction;
  readonly reason: AgentActionReason;
  readonly nextStep: AgentNextStep;
  readonly measured?: number;
  readonly limit?: number;
  readonly unit?: 'tokens' | 'milliseconds' | 'calls' | 'turns';
}
interface AgentHandoffResult {
  readonly executionId: string;
  readonly notice: AgentActionNotice & { action: 'ended'; reason: 'handoff-complete' };
  readonly notesPath?: string;
  readonly recordPath?: string;
  readonly recordState: 'written' | 'unavailable';
  readonly successorId?: string;
}
function formatAgentActionNotice(notice: AgentActionNotice): string;
```

The notice describes the affected operation. For example, a permission request can end while its turn continues and host dispatch can be paused while the remote CLI continues. Carry subject ID, turn or generation, scope and delivery ID on the existing event envelope. The phase sequence is running → asked-handoff → paused if needed → ended on observed settlement. A jump across thresholds records both transitions, with one effective instruction. Evaluate a live gate immediately before each call. Deduplicate notifications by subject, execution generation, action and reason. Dispose gate state with its execution. A settings update may move thresholds for future decisions. An existing pause remains latched until an authorized operator decision or normal return.

`readToolDisposition(request: { sessionId: string; agentId?: string; toolName: string; input: unknown }): AgentActionNotice | undefined` is synchronous and has no I/O. The SDK validates its trusted caller identity and uses the registered state plus existing tool/path policy. A deny is a PreToolUse permission decision with reason, and a corresponding `canUseTool` result is `{ behavior: 'deny', message, interrupt: false }`. PreToolUse is necessary on auto-allow paths. Permission checks continue to authorize any otherwise-allowed call. Existing session/lane result envelopes gain optional structured notice data and a correlated handoff pointer. No new persisted status enum is required. Use actual lifecycle status for running, waiting, complete or failed.

## Path flows

### Subagents (A–J and P1)

1. Extend the current effective-context and cumulative usage assessment. Preserve deduplication of assistant usage across blocks and the current weighted/raw accounting. Enter `asked-handoff` at the first warning threshold, even if only one independent dimension is available. Deliver through the existing subagent notice queue/PostToolUse and handoff context at the next hook. Keep SDK agent ID, Agent tool-call ID, task ID if known and parent ID as separate fields. A missing task ID never delays admission policy for an already attributed agent.
2. An ask advises the agent to finish the current step and return. Keep ordinary permission enforcement in this phase. At pause, deny new work. Permit Read/Grep/Glob for already read-only roles with existing scope, Read of permitted handoff materials, and Write/Edit only to canonical assigned note or report paths for roles with write permission. Allow the final response without a tool. Never grant a tool the role lacks. Validate normalized paths against existing workspace policy, including symlink/traversal protections. Permit verified report or handoff coordination where exposed. Already admitted calls can finish.
3. PostToolUse only records a successful write. The 10-minute timer emits one overdue notice and keeps the same policy state. Use the existing monitor-owned timer, with cleanup when no tracked item needs a notice. Null workspace, unknown role or missing notes path falls back to inline report and existing read-only rights. No write capabilities are added by recovery.
4. SDK SubagentStop finalizes the record with single-flight protection, publishes it through the current record/index/stub paths and pairs it with the Agent result. If the Agent result already arrived, use the existing correlated delivery mechanism. Parent delivery failures are retryable independent of the record write and of execution state. Use recorded paths and final response if writes fail after the bounded retry. Return the record-unavailable notice with an inline summary pointer. The tool result stays visible if both routes fail. Never manufacture a completed record for a live or externally interrupted agent.
5. Refuse new delegated work targeting a paused agent, with the shared copy. A completed handoff remains routable through existing successor advice. Gate decisions preserve the distinction between a resumed workload, an actual user stop and a new spawned agent.

### Permissions and actual cancellation (P2–P4 and U)

Carry explicit decision origin through response resolution. Dispose currently resolves a deny with “Extension deactivated” and falls through to hard deny. Relabel it at origin. Empty signal response, unattached lane identity, routable/unroutable expiry, unattended host denies and targeted cleanup must take the non-interrupting host branch. A UI decision with message remains a user decision. A plain user deny retains its current interrupt semantics. Preserve keyed cleanup and the empty-session guard.

Associate surviving aborts with the owned turn before cleanup/abort and independently of any raw error string. In the SDK-derived stream presentation, replace exact stock cancellation copy only when correlated with an attributable Ptah abort. Persist original provider transcripts as currently owned by the SDK. Use the next existing model-input opportunity to attach one origin explanation before actual user/recovery work, and use the parent notice if the canceled run is unattended. If historical or unknown cancellation has no trusted provenance, treat attribution as unknown. The SDK owns its own tool_result content. A host formatter can change the Ptah-rendered event and next-turn context.

### Sessions, successors and runtime caps (C1–C9 and T1–T4)

- Child warning uses existing runtime lead. At cap, stop scheduling unrelated parent work for the predecessor and offer handoff at a settled boundary. Cap plus existing grace freezes new non-handoff tools on a hook-capable SDK session and holds host sends. Record/publish the same disposition by trusted tab and SDK IDs. A child that was idle can finish the queued handoff request when it next runs. On a provider without a certified tool hook, apply host dispatch hold and use the explicit no-hook notice. A failed successor start or exhausted succession allowance leaves notes, live session, lane ownership and worktree accessible. Parent gets one escalation and can decide how to proceed.
- Existing top-level advisory stages and Electron auto-queue remain. At limit the queued handoff command runs after the current turn with attributed copy. A missing skill or exhausted command retries leaves a banner and manual handoff action. Once handoff is requested, reserve the successor start without transferring work. Stage successor creation if required by the public tool result, but fence successor work until predecessor reaches a real settled turn and ownership is committed atomically. The predecessor gets a handoff-only gate after acceptance. Ack is idempotent and never invokes `endSession`. If predecessor does not settle, keep the successor fenced, notify parent/UI and reconcile late confirms by request ID. A staged successor can acknowledge the handoff but its instruction to start work is held until commit. The predecessor can still finish notes, use approved report tools and return. Use existing close only for an already-ended source. Retired live predecessors remain visible/readable and accept user stop through the existing path.
- Preserve cleanup of explicitly canceled admissions and actual host shutdown. Roll back unused reservations on start failure and preserve accepted notes. Retain real-end grace/lineage behavior, lane reparenting after successful ownership transfer and existing recoverable-end mapping for sessions with prior progress.

### Watchdog and first-turn recovery (W1–W5)

Keep the 180-second guard within a confirmed open turn. A false→true transition can come from host input or reliable SDK evidence of a provider turn, such as assistant partial stream start or an actual root PreToolUse. Task lifecycle messages update activity but never imply a provider turn by themselves. If the installed adapter gives no first-byte signal for a self-started turn, keep it idle until trustworthy evidence exists. Do not synthesize a timer from a scheduled wake alone.

Feed the watchdog raw `background_tasks_changed` before the UI transformer drops ambient entries. Maintain a session-scoped level set keyed by task ID and current connection generation, update from task start/progress/terminal messages, and use snapshots to reconcile IDs. Include Monitor, ambient work, and run_in_background. Track open lane waits in the root tool map, closing on a result or terminal event. Between turns preserve tasks, clear turn-local tools, and keep the idle hold. Within a turn, open tools/tasks, explicit permission wait, compaction and bounded provider retry defer a hang verdict. A 600-second quiet interval and 300-second compaction dwell are overdue notices. Back off notice frequency. When the last blocker clears, start a full quiet window. Use one watchdog per query, detach on terminal/dispose, and ignore stale generation updates. Preserve retry margin/cap. Verify event order in fixtures for start, end, reconnect and task snapshots, including snapshots before root tool-use correlation.

An open turn with no accounted work or retry and no provider progress at expiry can take the provider-hang cleanup. Carry `provider-no-response` into a typed end event before any broadcaster zero-event cleanup. An actual rejected input channel follows the existing recovery boundary with `provider-input-closed`. Compaction dwell alone never aborts. Where the provider connection is broken mid-turn, retain observed progress and report for a deliberate retry.

Extend Fix C’s single-retry owner across top-level successors, initial child sessions and child successors. Consume the typed end, atomically reserve one retry for the logical first turn (lineage, startup generation and input ID), then wait the existing 5 s for teardown. Require zero outward SDK events, zero settled turns, no observed tool execution or partial output, and a confirmed ended attempt. The 120-s child probe is advisory while liveness is uncertain. Recover with first input plus attributed context using the child start contract if no SDK ID is bound, or verified resume otherwise. The child spawner’s 30-s grace must recognize the reserved retry and skip duplicate succession/settlement while it owns recovery. Abort the scheduled retry on explicit close, stop or ownership change. A second failure or unsupported host settles once and reaches the parent’s verified lineage, or the existing top-level UI if no parent. Never replay an input on an ambiguous transport failure.

### CLI lanes (L1–L7)

The lane coordinator produces a notice on accounted unique turns, duration timer, settings/ledger hydration, inactivity and repeat detection. Reuse current message steering only when adapter capabilities support delivery without interrupt. Otherwise enqueue a handoff instruction for the next safe boundary. For the Claude SDK and Ptah CLI Claude-backed lanes compose the budget decision with existing PreToolUse and permission hooks, including named-account admission and bypass-permissions launch. Pass read-only gate callback from launch context through the existing adapter options and shared Claude SDK lane options builder. Only declare a tool pause supported when it covers all owned tool paths. Any adapter with partial/no hook, including an alternate Ptah CLI provider route without the SDK gate, enters host-dispatch pause. Hold dispatch/resume of new work in the central manager and keep queued work and receipts. An already-running CLI may keep issuing tools. Parent sees that explicitly. Do not simulate a tool pause by killing, aborting, injecting a user stop or starting a competing worker.

Resolve the normal lane result through the existing completion/report surface and attach handoff pointer, transcript fallback or report. Preserve waiting during pause and completed idle release only after actual settlement. Persist coordinator state alongside existing budget ledger or rederive a conservative hold on reattach. An adapter that exits by itself reports its actual cause with the latest handoff notice as context. Inactivity and repeated calls both become ask-then-pause. Inactivity has weak liveness evidence (often a quiet tool/watch), so can only warrant reversible gating. Repeat counts are a loop heuristic, and the same normalized key can represent legitimate polling.

### Child reports (R1–R2)

Use authenticated transport identity only. HTTP already passes a session identity. Stdio already has launcher-provided `callerSessionId` and must pass it as the child alternative when no trusted lane ID exists. Router validates it against child registry/SDK binding and recorded parent lineage, then re-resolves on transfer. A known inactive owner gets a queued receipt. Keep unknown/unbound callers refused and make startup binding discoverable through verified IDs. No acceptance of caller-supplied parent or agent ID in MCP arguments.

Extend existing `AgentReportDelivery` with an additive queued receipt contract such as `{ delivered: false; queued: true; receiptId: string }`. Reuse the durable parent delivery store and drainer already used by lane reports. Distinguish the verified child origin in the envelope and retain the child ID, current parent and logical lineage. Resolve tab-to-SDK binding and rekey during verified handoff/adoption while the parent queue is frozen. Recheck the child owner before enqueue and before send. An unknown owner after restart leaves a visible blocked receipt until verified binding exists. Return queued only after the write is confirmed. Deduplicate by the existing client-message ID and apply current report bounds before enqueue. If the durable queue is unavailable, immediate delivery can still succeed for a verified live parent. Return explicit failure for an inactive parent in that configuration. On permanent invalidation or expiry retain the undelivered outcome in the existing delivery status. Preserve lane `final` behavior and ignore it for children as today.

## Messages

Use exact templates below. Values in braces are trusted IDs, allowlisted reason fragments, numbers or approved workspace-relative paths. Include the latest notice on parent completion, using the same delivery ID to suppress duplicate rendering. For UI title, use the first sentence. For queued or refused operations, indicate their actual scope.

| Event | Exact model, parent or UI text |
| --- | --- |
| Budget ask, writable | “Ptah budget monitor asked for a handoff because {reason}. Finish the current step, write progress and remaining work to {notesPath}, then return normally.” |
| Budget ask, read-only or path unavailable | “Ptah budget monitor asked for a handoff because {reason}. Finish the current step and return your progress, findings, and remaining work in your final report.” |
| Budget ceiling deny | “Ptah budget monitor paused new work tools because {reason}. Use only the permitted handoff tools, then return normally.” |
| Read-only ceiling deny | “Ptah budget monitor paused new work tools because {reason}. You may use your permitted Read, Grep, and Glob tools and return your findings in your final report.” |
| Parent/UI pause | “Ptah budget monitor paused new work for {id} because {reason}. The execution remains live. Review its progress and decide how it should continue.” |
| Notes delay | “Ptah budget monitor is still waiting for {id} to return its handoff after 10 minutes. The execution remains live. Review its progress.” |
| Normal return | “{id} returned normally after a Ptah budget monitor handoff request. Continue from {pointer}.” |
| Record failure | “Ptah could not save the handoff record for {id}. Continue from its final report in the execution transcript.” |
| Child runtime ask | “Ptah budget monitor asked for a handoff because this child session is approaching its {minutes}-minute runtime cap. Write the current state, remaining work, verification and active lane IDs to {notesPath}, call ptah_session_handoff, then return normally.” |
| Child paused or successor blocked | “Ptah budget monitor paused new work for {id} because {reason}. Review its notes and worktree. Continue after choosing a successor or explicitly resuming work.” |
| Ack waiting | “Ptah host recorded the successor acknowledgement. The successor will receive work after the predecessor returns and its result is available.” |
| Top-level command | “/session-handoff Ptah budget monitor requested a handoff because this session used {usage}.” |
| Auto command exhausted | “Ptah budget monitor could not queue the session handoff. Use Wrap up & hand off to try again.” |
| CLI without live gate | “Ptah budget monitor requested a handoff from lane {id} because {reason}. Ptah paused new host-dispatched work. This CLI has no verified tool gate and may still be running tools. Review its progress and decide whether to let it finish or stop it explicitly.” |
| Ask cannot be delivered | “Ptah budget monitor could not deliver its handoff request to {id} on the active turn. The request is queued for the next supported delivery opportunity.” |
| Permission teardown | “Ptah host closed the permission request for {tool} because {reason}. Review the session state before retrying.” |
| Permission expired | “Ptah host denied {tool} because its permission request expired. Request permission again if the tool is still needed.” |
| Unattached lane identity | “Ptah host denied {tool} because the lane identity was unavailable before the permission deadline. Return a report if the tool remains unavailable.” |
| Explicit user stop context | “Ptah recorded an explicit user stop for the previous turn. Review the current state before repeating any interrupted work.” |
| Provider hang | “Ptah watchdog ended the turn because the provider sent no response for {seconds} seconds while no work was accounted for. Review the current state before retrying the turn.” |
| Retry | “Ptah watchdog is retrying the first turn once because the provider sent no response and the previous attempt produced no output or tool activity. Continue the original task.” |
| Final failed startup | “Ptah watchdog could not recover the first turn for {id}. The provider did not respond. Review its worktree and start or resume the session when ready.” |
| No safe retry | “Ptah watchdog could not safely retry the first turn for {id}. Review the session and its worktree before starting another attempt.” |
| Activity overdue | “Ptah watchdog is still waiting for {operation}. Review the session if the wait is unexpected.” |
| Broken input | “The provider input channel closed. Ptah ended the affected turn for recovery. Review the current state and send a new message to retry.” |
| Report queued | “Ptah queued the child report for its verified parent. Receipt: {receiptId}. Delivery will be attempted when the parent is available.” |
| Report storage unavailable | “Ptah could not save the report for the inactive parent. Keep the report and retry when the parent is available.” |
| Report rejected | “Ptah could not route this report because the caller’s child session identity could not be verified.” |

Format evidence through the shared reason mapping. Reason fragments include “context reached {measured} of {limit} tokens”, “weighted lifetime usage reached {measured} of {limit} tokens”, “raw lifetime usage reached {measured} of {limit} tokens”, “runtime reached {measured} minutes”, “usage telemetry was unavailable for {measured} consecutive turns”, “the same tool call repeated {measured} times in one turn”, “the lane produced no output for {measured} minutes”, “the succession allowance is exhausted”, and “the successor could not start”. Use “the configured lane output wait expired” for an existing live no-output episode with uncertain duration. Keep provider endpoint, model diagnostics and raw errors out of user copy.

## Settings

| Existing key / input | Defaults and planned interpretation |
| --- | --- |
| `agentBudget.warnRatio` | 0.85 (0.01–0.99), applies to effective subagent context, enabled lifetime dimensions, and duration. Keep projected CLI budget warning first if earlier. |
| `agentBudget.stopWeightedTokens` | 3,000,000 (1,000–100,000,000). Keep storage key, label as lifetime budget in settings. Ask at ratio × budget, pause at 2× budget (default 6,000,000). Preserve subagent raw backstop with same pair, and existing lane weighted accounting. |
| `agentBudget.handoffContextTokens` | 150,000 (1,000–2,000,000). Ask at ratio × effective context, no later than context target. Pause at 2× effective context (default 300,000 before adaptation). Provider window/exhaustion can arrive earlier and follow existing provider handling. |
| `agentBudget.maxDurationMin` | 90 (1–1,440) since original launch across resumes. Ask at ratio × duration, pause at 2× duration. Rearm from original start on live settings changes; schedule both even without telemetry. |
| Missing telemetry | Existing three consecutive unique turns threshold is pause, with ask on first unique unavailable turn. Reset streak upon valid usage, retain an already-issued notice/pause. |
| `agentSessions.maxRuntimeMinutes`, `runtimeWarnLeadMinutes`, `handoffGraceMinutes`, `maxSuccessions` | 120/10/15/8. Ask at cap minus lead, pause at cap+grace (135 min default), preserve bounded successor allowance. Pending confirmed succession gets no forced timer cleanup. |
| `agentOrchestration.laneRepeatCallStopAt` | 20. Keep file setting key, label as handoff threshold in settings. Pause at 2× count within one guard turn. |
| Lane spawn `timeout` | 3,600,000 ms default, 0 disabled. Ask at configured inactivity period, pause at 2× if still quiet. Count from latest real activity, account known wait and queued steering, retain zero-disable semantics. |
| `sessionBudget.*` | Preserve weighted 50,000,000 default, tokens unit, USD 30, fallback 9,000,000, 50% tighten, 80% handoff, compaction count 3, null tighten window and autoHandoffAtLimit=true. The top-level limit already queues a cooperative action. |
| Fixed timers | Preserve notes overdue 10 min, provider guard 180 s, background overdue 600 s, compaction overdue 300 s, launch probe 120 s, recovery delay 5 s, unexpected-end grace 30 s, and successor confirmation 30 s. No new preference key. |

First implementation uses the proposed 2× policy, with source-level thresholds in the shared accounting logic. Preserve settings allowlists and stored values. No migration from historical stop records is required. In-progress executions start receiving new rules at next assessment. Never translate an old terminal stop into an active pause.

## File-disjoint batches

Prefixes are defined in the parity inventory. **RT** is `libs/backend/cli-agent-runtime/src/lib/`. **CS** is `libs/frontend/chat-state/src/lib/`. Each write set includes changed specs and is exclusive. “Reads” denotes additional contract/evidence files. Dependencies describe implementation order, not deployment order. Land as one coordinated behavioral change so the new thresholds never invoke the old stop consumers. Each row applies the **lane checks** contract below. The codebase evidence uses the same prefixes.

**Lane checks for every batch.** Later implementation lanes run only `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>`, and `npx eslint <files>` scoped to their write set and project. The coordinator runs `npm run verify` and covers affected consumers through its configured lock/caps. No implementation checks were run for this design. Filenames ending in `.spec.ts` in the write column are that batch’s test ownership.

| Batch and Nx projects | Write set | Reads and dependencies | Acceptance | Recommended executor |
| --- | --- | --- | --- | --- |
| 1. Shared vocabulary, shared | Shared/types/agent-action.types.ts (new), Shared/types/agent-action.types.spec.ts (new), Shared/types/execution/stream-background.ts, Shared/types/ai-provider.types.ts, `libs/shared/src/index.ts` | Current lane, session and background event types; prior inventory | Exact actor/reason copy; additive decoders accept historical records; end cause remains typed through boundaries | TypeScript backend |
| 2. Shared thresholds, shared | Shared/utils/agent-budget-policy.ts, Shared/utils/agent-budget-policy.spec.ts, Shared/types/advanced-settings.types.ts | Batch 1; current settings descriptors, context-limit policy, lane accounting | Inclusive warn/ceiling boundaries, unique unavailable streak, raw/weighted/context independence and defaults; preserve existing callable policy contracts while consumers migrate | TypeScript backend |
| 3. Subagent lifecycle, agent-sdk | C/subagent-budget-monitor.ts, C/subagent-stop-cause.ts, SDK/di/register.ts, C/subagent-budget-monitor.spec.ts, C/subagent-budget-batch2.spec.ts, C/subagent-stop-cause.spec.ts | Batches 1–2; D path, dispatcher, current record/index/stub delivery | No budget stopTask; single normal-return record despite duplicate hooks, missing SDK task ID or post-result delivery; bounded failed-record fallback; duration timer cleans up | SDK backend |
| 4. Subagent tool gate, agent-sdk | C/subagent-notes-gate.ts, C/subagent-budget-hooks.ts, C/subagent-handoff-message.ts, C/subagent-notes-gate.spec.ts, C/subagent-budget-hooks.spec.ts, C/subagent-notes-warnings.spec.ts | Batches 1–3; H/post-tool-use-hook-handler.ts and existing role/file guards | Ask allows wrap-up. Paused writable/read-only cases complete with permitted paths, preserved role rights and accurate copy. Timeout sends once | SDK backend |
| 5. Subagent result and continuation, agent-sdk | C/subagent-handoff-delivery.ts, C/subagent-resume-advice.ts, C/subagent-handoff-delivery.spec.ts, C/subagent-resume-advice.spec.ts, C/subagent-context-limit.spec.ts, C/subagent-successor-lineage.spec.ts | Batches 3–4; handoff record, message queue, Agent result enrichment | Correlated durable result, parent delivery acknowledgment, useful inline fallback, correct paused/settled lineage and detected context limit | SDK backend |
| 6. Permission origin and live session gate, agent-sdk | SDK/sdk-permission-handler.ts, H/system-abort-permission-message.ts, H/sdk-query-options-builder.ts, SDK/sdk-permission-handler.spec.ts, SDK/sdk-permission-handler.unattended.spec.ts, H/sdk-query-options-builder.spec.ts | Batches 1, 4; permission rules, existing root and named-account hooks; disposition port from 7 | Host denies never interrupt; verified user choices preserve behavior; root and SendMessage pauses cover bypass paths with no policy escalation | SDK backend |
| 7. SDK disposition boundary, agent-sdk + cli-agent-runtime | SDK/di/tokens.ts, `libs/backend/agent-sdk/src/index.ts`, RT/di/register.ts, H/session-tool-disposition.port.ts (new), H/session-tool-disposition.port.spec.ts (new) | Batch 1; existing container registrations and session lifecycle ports; child registry from 12 | Runtime registration feeds SDK a synchronous trusted lookup; direct SDK hosts can operate without runtime callback; wire root and SendMessage policy in batch 6; no import cycle | SDK/runtime backend |
| 8. Watchdog tracking, agent-sdk | H/no-activity-watchdog.ts, Q/session-registry.service.ts, H/no-activity-watchdog.spec.ts | Batch 1; raw background snapshot type and UI transformer, pump and current holds | Open worker/watch/lane wait can outlast quiet windows. True provider wait abort verdict only in open turn. Ambient level updates and cleanup survive turn transitions | SDK backend |
| 9. Query cause and recovery context, agent-sdk | Q/session-query-executor.service.ts, H/session-lifecycle-manager.ts, SDK/message-transform/system-message.transformer.ts, Q/session-query-executor.service.spec.ts, Q/session-query-executor.input-channel-failure.spec.ts, SDK/message-transform/system-message.transformer.spec.ts | Batches 1, 3, 6–8; provider error path, turn tap and SDK tool_result boundary | Explicit cause survives abort; compaction dwell only notifies; broken input remains recoverable; Ptah explains attributed cancels and emits structured agent notices; original user stop still works | SDK backend |
| 10. Renderer-independent stream cleanup, rpc-handlers | RPC/chat/streaming/chat-stream-broadcaster.service.ts, RPC/chat/streaming/chat-stream-broadcaster.service.spec.ts | Batches 1 and 9; end-event broadcast and progress counters | Confirm zero events without cause overwrite; distinguish start, resume and actual explicit stop; terminal event emitted once | RPC backend |
| 11. Recovery policy and top-level ownership, cli-agent-runtime | S/handoff-watchdog-recovery.ts, S/handoff-watchdog-recovery.spec.ts, S/session-handoff.service.ts, S/session-handoff.service.spec.ts, S/session-handoff.port.ts, S/session-handoff-ack.service.spec.ts | Batches 7, 9–10; chain and ack stores, caller-turn flush; child bridge from 12 | One eligible retry, canceled by user/ownership changes; ack fences and settles once on natural boundary; late confirm reconciled; no live predecessor close or end | Runtime backend |
| 12. Child caps and successor lifecycle, cli-agent-runtime | S/session-spawner.service.ts, S/session-child.registry.ts, S/session-child-succession.ts, S/session-child-first-turn.watchdog.ts, S/session-spawner.succession.spec.ts, S/session-spawner.start-guard.spec.ts | Batches 7, 10–11; current child settings, worktree, lane adoption, close port | Cap and late start never stop ongoing work; one recovery reservation across zero-event and 30-s grace; worker ownership transfer at boundary; parent notice on failure, remaining explicit stop unaffected | Runtime backend |
| 13. Child detail and outcome regression, cli-agent-runtime | S/session-spawner.service.spec.ts, S/session-child-outcome.ts, S/session-child-outcome.spec.ts, S/session-child.registry.spec.ts, S/session-child-succession.spec.ts | Batch 12; historical enum and descriptor shape | Distinguish live pause from actual failure; preserve prior outcome readability, end grace, prestart cancellation and explicit user stop | Runtime backend |
| 14. Lane guard calculations, cli-agent-runtime | L/agent-budget-coordinator.ts, L/lane-budget-guard.ts, L/lane-budget-deadline.ts, L/agent-budget-coordinator.spec.ts, L/lane-budget-guard.spec.ts, L/lane-budget-deadline.spec.ts | Batch 2; telemetry and persisted usage | Ask then pause on unique turns/settings/deadlines; duration independent of inactivity; stable repeat counts and projected warning | Runtime backend |
| 15. Lane manager and CLI admission, cli-agent-runtime | L/agent-process-manager.service.ts, L/cli-adapters/cli-adapter.interface.ts, L/cli-adapters/claude-cli.adapter.ts, RT/claude/claude-sdk-lane-options.ts, L/agent-process-manager.guard.spec.ts, L/agent-process-manager.service.spec.ts | Batches 1, 6, 14; named-account runner hooks, `runSdk` and delivery capabilities | Certified hook denies only new unsafe calls even with permission bypass; unsupported CLI remains running with host hold and exact notice; pending work retained; no auto terminal events | SDK/runtime backend |
| 16. Lane result and resume, cli-agent-runtime | L/lane-completion-envelope.ts, L/lane-completion-notifier.service.ts, L/lane-resume-gate.ts, L/lane-completion-envelope.spec.ts, L/lane-completion-notifier.service.spec.ts, L/lane-resume-gate.spec.ts | Batches 12, 15; completion result and replay, manager dispatch, child pending delivery | Parent sees once per event, idle parent can consume a pending notice, actual lane return carries result, paused CLI session cannot receive new work via resume bypass; historical stop text decodes | Runtime backend |
| 17. Child report queue, cli-agent-runtime | L/agent-report-router.service.ts, L/agent-report-router.service.spec.ts, L/parent-delivery/parent-envelope.schema.ts, L/parent-delivery/parent-delivery-drainer.service.ts, L/parent-delivery/parent-delivery-drainer.service.spec.ts, L/parent-delivery/parent-envelope.schema.spec.ts | Batch 12; HTTP identity and stdio input, current registry events, report coalescer | Known inactive parent queues; verified successor replay once; unknown identity refuses; parent ownership changes rechecked; lifetime and failure explicit | Runtime backend |
| 18. Child report transport, vscode-lm-tools | MCP/mcp-core/protocol-dispatcher.ts, MCP/mcp-core/mcp-response-formatter.ts, MCP/mcp-stdio/agent-tool.dispatcher.ts, MCP/mcp-core/protocol-dispatcher.spec.ts, MCP/mcp-stdio/agent-tool.dispatcher.spec.ts | Batch 17; existing namespace and launcher identity contract | HTTP and stdio agree on verified caller and queued result; lane identity takes precedence; no new user-supplied identity parameter | MCP backend |
| 19. Electron session handoff UI, chat | F/services/session-auto-handoff-coordinator.service.ts, F/services/session-handoff-prompts.ts, F/services/auto-handoff-source-closer.service.ts, F/components/molecules/notifications/session-budget-banner.component.ts, F/services/session-auto-handoff-coordinator.service.spec.ts, F/components/molecules/notifications/session-budget-banner.component.spec.ts | Batches 1, 11–12; CS/tab-manager.service.ts close semantics and existing Angular state | Queue uses attributed text and safe failure state; predecessor close only after confirmed actual end; user controls unchanged | Angular frontend |
| 20. Electron action rendering, chat | F/components/organisms/message-bubble.component.ts, F/components/molecules/lane-event/lane-event-row.presentation.ts, F/components/molecules/agent-card/agent-card-header.component.ts, F/settings/ptah-ai/lane-guards-settings.logic.ts, F/components/molecules/lane-event/lane-event-row.presentation.spec.ts, F/settings/ptah-ai/lane-guards-settings.logic.spec.ts | Batches 1, 5, 9, 13, 16; actual Electron event handlers | Notice origin and scope visible, queued and paused execution remains live, legacy stopped results render, setting label matches behavior | Angular frontend |
| 21. End-to-end behavior regressions in existing harnesses, agent-sdk | H/subagent-stop-hook-handler.spec.ts, H/session-lifecycle-manager.spec.ts, C/compaction-coordinator.spec.ts, C/idle/idle-session.reducer.spec.ts | Batches 3–10; user and auto call paths | SDK normal return and explicit stop distinguishable; continue on compaction backoff; no hard stop via normal handoff. Read and retain explicit dispatcher/RPC tests | Independent SDK/RPC tester |
| 22. Cause propagation and model context, agent-sdk | H/session-end-callback-registry.ts, Q/session-control.service.ts, Q/session-stream-pump.service.ts, SDK/message-transform/user-message.transformer.ts, Q/session-control.service.spec.ts, SDK/message-transform/user-message.transformer.spec.ts | Batches 1, 8–9; provider control, typed end causes, actual SDK tool_result transformer | Explicit user stop and watchdog origin paired with previous owned turn; next input carries explanation once. Transformed cancellation matches trusted cause. Event survives zero-event cleanup without a second teardown | SDK backend |
| 23. Subagent usage state and retired stop plumbing, agent-sdk | C/subagent-request-accounting.ts, H/subagent-budget-stop-callback-registry.ts, H/subagent-budget-stop-callback-registry.spec.ts, C/subagent-stop-notices.ts, SDK/sdk-message-transformer.ts, Q/session-query-executor.slash-persistence.spec.ts | Batches 1–5, 9; legacy stopped-record renderer, usage/adaptive settings | Repeated content blocks never multiply usage or misses. Roll same-request deltas into a unique final sample. Retire unreferenced live stop callbacks and producers. Keep historical stopped data readable | SDK backend |
| 24. Source closer and handoff regression, chat + cli-agent-runtime | F/services/auto-handoff-source-closer.service.spec.ts, S/session-handoff-close-result.spec.ts, S/session-handoff-lineage.spec.ts, S/session-held-message-transfer.spec.ts | Batches 11–12, 19; UI close→abort path and handshake stores | Retry and late notice cannot retire a conflicting generation; held messages and lane ownership transfer exactly once. UI never closes a live predecessor | Integration tester |
| 25. Runtime binding and visible progress, cli-agent-runtime + shared | S/session-spawner.port.ts, L/lane-completion-result.ts, RT/wiring/agent-events.ts, Shared/types/agent-messaging.types.ts, Shared/types/agent-process.types.ts, L/lane-completion-result.spec.ts | Batches 1, 11–17; child descriptors, lane event push and completion result path | Optional notice and receipt data survives IPC/persistence without overloading terminal outcome; result and status agree on execution ID and scope | Runtime backend |
| 26. Shared launch gate on Ptah CLI, cli-agent-runtime | RT/ptah-cli/ptah-cli-registry.ts, RT/ptah-cli/ptah-cli-registry-permission-routing.spec.ts, RT/ptah-cli/ptah-cli-registry-capabilities.spec.ts | Batch 15; Headless registry invokes shared lane options. Read provider-specific branch and options construction | Claude-backed Ptah CLI receives the same certified gate; alternate provider routes retain fallback and existing permission routing | Runtime backend |

Coordinator confirms worktree and task scope before implementation, delegates file-disjoint work through orchestration and uses agent-lanes before CLI delegation. Assign independent logic/style review before acceptance. Apply Angular frontend patterns to renderer work. Verify Electron first, then platform-cli and cli-engine, with TUI/VS Code compatibility coverage for changed shared contracts. Keep any host fix in a small coordinator-assigned batch with its own disjoint write set if an actual compatibility failure identifies it. UI visual review is Electron-only when authorized. No app, browser, build or workspace-wide targets are part of this design lane.

## Specs

The write sets enumerate changed and proposed new specs. Preserve the existing explicit-user stop assertions in subagent dispatcher/RPC and lifecycle specs. Fixtures that mention `stopTask` solely to implement a mock Query remain valid. Also read the following regression sentinels when coordinating rollout.

- `session-query-executor.slash-persistence.spec.ts` and SDK Query mocks must still compile when budget-stop callbacks disappear. Update only fixtures coupled to that removed wiring.
- `subagent-handoff-record.spec.ts`, `subagent-handoff-index.spec.ts`, `subagent-handoff-files.spec.ts` and `subagent-deliverables.spec.ts` pin record format, workspace safety and historical behavior.
- `session-handoff-close-result.spec.ts`, `session-handoff-lineage.spec.ts`, `session-held-message-transfer.spec.ts` and the existing auto-handoff source-closer spec cover races around ownership and closing. Adjust expectations that explicitly assumed an automatic close of a live source.
- `lane-completion-replay.spec.ts`, `lane-completion-outcome.spec.ts`, `agent-lane-resume.service.spec.ts` and completion-envelope snapshots pin persistence/replay behavior. If a test owns literal legacy copy, keep its historical fixture and add coverage for the new notice.
- Report integration exercises HTTP and stdio through their existing dispatch specs. Run one simulated Electron child→successor→parent handoff and one unsupported CLI with queued work in authorized integration review. Inject a zero-event first-turn failure in both lineage kinds and assert one retry or visible escalation.

## Risks

- Some adapters cannot inject into a running turn or gate tools. Capability must be proven from the launch path. Host hold scope must be visible in every surface that renders the notice.
- Idleness and absent telemetry are partial evidence. Never treat either as proof of a provider hang. A stale task snapshot can suppress a real hang; retain current-generation snapshot semantics and overdue visibility so an operator can respond.
- Async hook delivery, record writes and event handling can reorder. Correlation and full result fallback are required when identity, storage, lineage or output timing varies. A failed write or failed notification cannot advance lifecycle status by itself.
- Retry is safe only with zero outward events and absence of execution evidence. Preserve exactly one retry across duplicate ends and guard races. No synthetic timeout should settle a live query just to unblock recovery.
- Fixed ceilings change effective limits. A lower provider context window can end work before the pause is observed. Warn from effective per-agent context and retain provider attribution.
- Older clients need optional fields and historical format support. Roll back logical gates and message additions independently for already settled records. A rollback must preserve queued reports/notes and must not reintroduce an automatic kill.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Natural settlement is the only automatic handoff completion | Use SDK SubagentStop and settled turn, or retain threshold-driven retirement | A–D, C6 and T3. User explicitly specified cooperative handoff | User decision. Internal delivery mechanism can change |
| Reuse current settings with 2× independent budget ceilings | Introduce ceiling keys, use existing limits as immediate pauses, or derive higher ceilings | E–G, L3–L4 and current policy/defaults. Existing keys are shared with headless hosts | Yes. Update policy centrally |
| Inactivity and repeat-call are reversible guard requests | Keep kill or convert to ask-and-pause | L1–L2. Idle tools and repeated polling can be legitimate. User requires every automatic budget/watchdog action to preserve live work | Yes. Thresholds can be adjusted |
| Root guard observes live turn and open work separately | Time out background silence, or count open work until explicit release | W1–W4. Root watchdog clears task state today and UI snapshot filters ambient tasks | Yes. Event inputs and overdue cadence can evolve |
| Retry one provably unstarted turn across both unattended lineages | Parent-only report, generic provider-error retry, or typed one retry | C5/C9. Fixed user decision requires a retry for zero-event unattached work and escalation | The count is fixed for this task. Eligibility can be tightened |
| Route reports from authenticated session identity and queue for verified inactive parent | Guess alternate live ID, refuse and ask sender to retry, or bounded queue | R1/R2. Router already validates lineage and stdio already has a trusted session ID | Yes. Optional receipt is additive |
| Keep live predecessor visible until actual end or user action | Reuse UI auto-close or separate logical retirement | T3 and `closeHandoffPredecessor` call the UI close/abort path | Yes. A non-aborting view removal can be added if needed |
| Use a transport-origin label for teardown | Infer from SDK text, or classify at cause and correlate with owned turn | P2–P4. SDK stock text applies to multiple unrelated aborts | Yes. Internal payload and formatting can evolve |

## Open questions for the user

- Confirm the proposed 2× weighted/raw lifetime and duration ceilings for the first rollout. Existing context and child grace ceilings retain their established policy shapes. The 2× proposal uses existing settings and can be tuned without a migration.

## User decisions (binding, override the sections above)

See context.md "User decisions on the plan". In short: phased PRs P1-P5; pause at 2x existing keys;
lane timeout/repeat-call -> ask-then-pause approved; child cap -> freeze tools approved;
`ptah_session_handoff_ack` keeps ending the predecessor (no "keep predecessor live" change; skip the
batch 11 ack change and batch 24 source-closer change).
