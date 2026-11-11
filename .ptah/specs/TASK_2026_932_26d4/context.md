# TASK_2026_932 — child session lineage, stop-follow, terminal status model, cleanup

## Problem (user)
The sidebar shows ~17 finished child sessions as "Done". Opened, some show "Interrupted".
The coordinator cannot clean them up. Defects A–D come from the coordinator.

## Root causes (investigated)

### A. `Source session policy lineage is unavailable`
- Thrown by `ChatSessionService.captureLineage` (libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts ~L555)
  when `sessionMetadataStore.get(sourceSessionId)` has no row AND `pendingLineage` (keyed by TAB id) has no entry.
- Only the child-start path surfaces the literal text (`startAgentChildSession`; the handoff path reduces errors to a kind).
- A child succession (child calls `ptah_session_handoff`) starts the successor through
  `ChildChatSessionHostAdapter.startChildSession` with
  `sourceSessionId = descriptor.parentSessionId ?? descriptor.parentTabId`.
- The successor record copies `child.parentSdkSessionId` (spawner `succeedChild` ~L1801). That value is absent when
  (1) the parent SDK id was not resolved when the child started (`sdkIdOf(guard.caller)` undefined), or
  (2) the parent itself handed off: `registry.reparent(..., parentSdkSessionId undefined)` clears it.
- Then the source id is the parent TAB id. Metadata rows are keyed by SDK id, and `pendingLineage[tabId]`
  is deleted when the parent's SDK id resolves. Result: refusal. Later handoffs of other children succeed
  because their records still hold a parent SDK id.
- Fix: (a) spawner: whenever a descriptor/successor is built, use
  `child.parentSdkSessionId ?? this.sdkIdOf(child.parentSessionId)` and store it on the successor;
  (b) adapter: when the descriptor has no parent SDK id, resolve `lifecycle.find(parentTabId)?.realSessionId`
  before falling back to the tab id (same for handoff `fromSessionId`);
  (c) `captureLineage`: when no metadata and no pending entry, the error text says how to recover.
- Regression tests: spawner (succession after parent reparent uses the live parent SDK id) and adapter.

### B. `ptah_session_stop` on a handed-off id stops the successor
- `SessionSpawnerService.resolveOwned` follows `succeededBy` to `registry.resolveLatest`, and `stop` acts on that.
- Fix: `stop` looks at the record for the GIVEN id. When it is terminal with `succeededBy` and the caller did not pass
  `followHandoff: true`, refuse with reason `handed-off` and a detail that names the successor id (latest in chain)
  and its status. With `followHandoff: true`, stop the latest successor. The reply always names the id that was stopped
  and, when followed, the id that was asked for.

### C. "Done" in the list vs "Interrupted" inside
- "Done" = heuristic in `compact-session-card.component.ts` `summary` (idle + messages > 0 → "Done"). It never reads the
  child registry.
- "Interrupted" = transcript turn with no result (`message-bubble` `chat-turn-interrupted`): a handoff/stop ends the
  predecessor mid-turn, or the host exited.
- The child registry (in memory, last 20 ended) is the only source of truth, and it has 5 terminal values plus a free-text
  reason.
- ONE model, `SessionChildOutcome`, in `@ptah-extension/shared` (wire type for MCP text and the UI):
  ```ts
  export const SESSION_CHILD_OUTCOME_KINDS = ['completed','handed-off','stopped','interrupted','failed','timed-out'] as const;
  export interface SessionChildOutcome {
    readonly kind: SessionChildOutcomeKind;
    readonly reason: string;      // the registry endReason
    readonly endedAt: string;     // ISO
    readonly successorId?: string; // handed-off only: latest successor in the chain
  }
  ```
  Mapping from the registry: handed-off → handed-off (+successorId); stopped → stopped; timed-out → timed-out;
  failed → failed; ended → by cause: host-shutdown/workspace-close/stream-exit/provider-error/compaction-abort/unknown →
  interrupted, user-stop/parent-stop → stopped. `completed` is reserved for an ended child whose last completion was
  delivered and whose cause is a normal close (user-stop after a delivered final turn). The pure mapper lives in
  `cli-agent-runtime/src/lib/session-children/session-child-outcome.ts`.

### D. Cleanup
- New MCP tool `ptah_session_clear_finished { sessionIds?: string[] }`: removes TERMINAL children of the caller from
  the registry (never live ones). Never touches worktrees, branches, transcripts or tabs on disk. Returns count + ids
  and the ids it skipped (live / unknown / not owned).
- `ptah_session_status` without `sessionId`: default lists live children in full, and terminal children as counts per
  outcome kind plus one short line each (id, label, outcome kind, successor). `includeFinished: true` gives the full
  records.

### Item 2 (coordinator). Interrupted attribution
- `SessionChildOutcome.reason` is plain words that name the actor and the cause; `cause` keeps the machine value.
  parent-stop → `stopped by the parent session <parentSessionId> (ptah_session_stop)`; user-stop →
  `stopped by the user (stop button or tab closed)`; host-shutdown → `host exit or restart`; workspace-close →
  `workspace closed`; stream-exit → `the agent stream exited`; provider-error → `provider error`; compaction-abort →
  `context compaction did not finish`; config-reinit → `configuration reloaded`; timed-out → `runtime cap reached`;
  handed-off → `handed off to <successorId>`; first-turn-not-started → `first turn did not start`.
- An ended record with NO end cause → kind `unknown`, reason `SESSION_CHILD_OUTCOME_UNKNOWN_REASON`. Never guessed.

### E. Start settles without the first turn
- `ChatSessionService.startAgentChildSession` returns success when `sdkAdapter.startChatSession` returns a stream;
  the stream runs detached in `ChatStreamBroadcasterService.streamEventsToWebview`. The spawner says "starting".
- A 0-event stream failure calls `turnState.forceIdle` (phase `idle`) and `sdkAdapter.endSession(..,'provider-error')`.
  The spawner's `statusOf` maps phase `idle`/`failed` to status `idle`. If the session end never reaches the spawner
  (no lifecycle record / token for the tab yet, or the stream hangs), the child stays `idle`, 0 turns, no SDK id,
  no transcript, and the parent gets no signal. When the end does arrive, `provider-error` routes to an automatic
  succession of a child that never ran.
- Exact trigger not proven (no host logs). Fix = detection that fails loudly:
  (1) first-turn watchdog `SESSION_CHILD_FIRST_TURN_TIMEOUT_MS` (120 s) armed after a successful start: when it fires
  and the child has no SDK id and 0 settled turns and is not `generating`/awaiting permission → push a `failed`
  completion to the parent, mark the child `failed` with cause `first-turn-not-started` and the evidence (phase,
  lifecycle record present, SDK id absent); one re-arm when it is still `generating`.
  (2) a session end of a child with 0 settled turns and no SDK id is a failed start: `failed`, never a succession.
  (3) status text: `idle` with 0 settled turns reads `starting (first turn not started)` until the watchdog decides.

### E2. Start timeout and duplicate start (findings: start-timeout-findings.md)
- "The operation timed out." is the parent's MCP HTTP client deadline (>= 60 s). The host start keeps running and
  finishes; the child is not visible until `registry.add`, so the parent retries blind.
- PR 1 fix: (a) allocate the child id at the top of `provisionAndStart` and register a `starting` pending record
  (caller, label, branch, startedAt) before the model route and worktree steps; a refusal removes it, success
  replaces it. `ptah_session_status` lists it with its id. (b) Implicit idempotency: a second start from the same
  caller with the same branch while a pending or live non-terminal child exists returns that child (no second
  worktree). (c) session_start description: on a timeout, call `ptah_session_status` first.
- Follow-up (not PR 1): a `timeout` on the `ptah` MCP HTTP server config (agent-sdk options builder); the
  `ptah_agent_spawn` Ptah CLI path validates the working directory after the lane starts (findings section 4).

## Scope split
- PR 1 (this branch): A, B, C backend model (snapshot `outcome` + MCP text), D MCP tool + compact status.
- PR 2 (follow-up): UI — rail card and chat banner read the same outcome (push message), "Clear finished" and per-item
  dismiss in the sidebar. Reason: PR size; UI needs a new push message and tab-state persistence.

## Lane batches (file-disjoint)
- Batch 1 (lane): libs/backend/cli-agent-runtime/** + libs/shared/src/lib/types (outcome type) +
  libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.ts (+spec) + chat-session.service.ts message.
- Batch 2 (lane): libs/backend/vscode-lm-tools/** (tool def, args schema, handlers, dispatcher, caller policy, budget,
  namespace builder, sweep spec) + docs (apps/ptah-docs agent-sessions.md, .claude/skills/agent-lanes/SKILL.md,
  plugins/ptah-core/skills/agent-lanes/SKILL.md).
