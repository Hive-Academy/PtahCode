Verdict: REVISE

Scope: implementation-plan.md read in full; decisions.md D6 applied; code spot-checked at the cited ranges (stream-background.ts:156-179, agent-monitor.store.ts:1042-1081 and 2704-2748, accumulator-core.service.ts:632-639, codex-chat-adapter.ts:201-228, codex-chat-turn-stream.ts, system-message.transformer.ts:455-470, transcript-event-validators.ts:309-323, worker-protocol frames.ts:192-203). No code was run. `evidence.md` was not re-read in full; I relied on the plan's summary of it.

## Findings

1. **Blocking: the plan contradicts settled decision (c) and (a).** Plan lines 27-28 and 49 make `AgentStatusEvent.taskId` optional. Batch 5 puts its tests in `agent-monitor.store.spec.ts`, and Batch 5 never requires a test that a Claude/lane agent cannot go terminal to running.
   - Required change, shared: replace the contract with the discriminated union under "Decisions" below. SDK-variant producers keep a required `taskId`.
   - Required change, store: Batch 5 writes `agent-monitor.store.ts`, a NEW `agent-monitor.store.native-codex.spec.ts`, `background-agent.store.ts` and `background-agent.store.spec.ts`. It must not touch `agent-monitor.store.spec.ts`.
   - Required change, test: add a test that an agent with `agentType !== 'codex'`, or one with a `taskId`, stays terminal when it receives a later `running` status. Today `settledStatus` (agent-monitor.store.ts:1071-1081) holds a terminal state unless `isNewExecution` is true. The native branch must be a separate early path keyed on `event.native` plus `existing.agentType==='codex'`. It must not loosen `isNewExecution` (1042-1053) or `settledStatus`.

2. **Blocking: Batch 2 is under-scoped and the contract change breaks other projects.** `AgentStatusEvent` is also validated or duplicated outside `shared`.
   - `libs/frontend/machines-ui/src/lib/services/transcript-event-validators.ts:309-323` requires `taskId: isString` for `agent_status`. A native event would fail validation there.
   - `libs/worker-protocol/src/lib/frames.ts:192-203` requires `taskId: z.string()`. A native event would be rejected or stripped on a worker/remote path.
   - `libs/frontend/machines-ui/src/lib/services/transcript-event-validators.ts:309` also uses `EventOf<'agent_status'>['status']`, so it follows the union's type.
   - Required change: Batch 2 must include the two files above, or the plan must explicitly justify that native events never reach them. Because 3 projects (shared, worker-protocol, machines-ui) exceed the 2-project cap, split into 2a (`shared` + `worker-protocol`) and 2b (`machines-ui`). Alternatively keep 2 and add a verified claim that no Codex native event is relayed through those two paths. I prefer the split.
   - Also add `agent-monitor.store.ts:2712,2713,2717` to the list: they read `event.taskId` and will need `'taskId' in event` narrowing. Batch 5 owns that change.

3. **Serious: the Batch 4 `codex-chat-adapter.ts` edit is avoidable. Use codex-runtime instead.**
   - The seeding runs `thread/read` history into the context map, and it only needs the context plus the history reader. Both already live in codex-runtime (`codex-context.ts` resume at 591-671, `codex-session-history.ts:137-276`).
   - Required change: move the resume seeding into `codex-context.ts` (Batch 1 file) or a new codex-runtime helper called from the resume path. Drop `codex-chat-adapter.ts` and its spec from Batch 4, and drop the `codex-session-history.spec.ts` verify if there is no reader change.
   - Batch 4 then becomes `codex-history-projector.ts` and its spec in agent-sdk, plus a runtime seeding test. Batch 4 would write only 2-3 files across 2 projects, or move seeding into Batch 1 and make Batch 4 a single-project batch.
   - If the adapter must still be touched, `resolveLiveSessionId` (codex-chat-adapter.ts:216-228) and `getPermissionLevel` (202-208) must keep their signatures and semantics, per decision (b).

4. **Serious: identity model, partly already true, and the plan misses the live `session.id` link.**
   - `CodexChatEvents` is built with `session.id` (codex-chat-turn-stream.ts:331). Child projections reuse `this.sessionId` (codex-chat-events.ts:181). Both live paths already emit the parent session ID. The history path is `codex-history-projector.ts:172`.
   - `session.id` is compared against `event.threadId` at codex-chat-turn-stream.ts:325,439,460,671, so session ID equals the parent thread ID today. RC6's claim that child thread ID is used as `sessionId` is not what the code does. The plan should say so, and Batch 3 should lock it with a test instead of a code change.
   - Required change: state in the plan that no change to base `sessionId` is needed. Add a history-path test that `sessionId` is the parent session and not the child.
   - The `parentSessionId` flows via `knownSessionId(event.sessionId)` at agent-monitor.store.ts:2739-2740. The native `agent_start` and `agent_status` must carry the same parent `sessionId` so `agentVisibleInSession` (1227-1248) matches.

5. **Serious: dedup and terminal precedence gaps.**
   - (a) Live plus history replay: the plan keys history on "real item IDs", but each activity is wire-identified by `activity.id` (call ID) and a `kind`. A repeated `interacted` call can reuse the same call ID. The cycle key "most recent started or interacted activity ID" would then collide between a replayed `interacted` and a distinct later one. Required change: define the cycle ID as `(activity.id, parentTurnId, sequence)` or an ordinal derived from the parent turn history. Equal or older cycle is an idempotent no-op in the store, and the comparison must be deterministic (an ordinal, not a timestamp).
   - (b) Reconnect mid-cycle: after reseed, the context map holds the last cycle. A live `completed` for that cycle must be accepted exactly once. Required change: persist `lastTerminalKey` in the seeded map, derived from history, so a replayed terminal is dropped. Add a test: seed from a history that already has `completed` for cycle N, then replay the live `completed`, and expect no second terminal.
   - (c) `interacted` before the previous cycle's child turn terminal: a late child `turn/completed` for the old cycle would settle the new one. The plan says "keyed by `(childThreadId,turnId)`; it cannot settle a newer cycle", but it never says which cycle a child turn belongs to. Required change: bind each child turn ID to the cycle that was current when that turn started (first child notification after the activity). A terminal then applies only to its bound cycle. If the turn has no binding, do not settle. Add the test: interacted(N+1) arrives, then terminal of child turn N, and the card stays running.
   - (d) Plan line 22 says a failed child turn overrides `completed` for the same cycle, but the store already refuses to leave terminal (`settledStatus`). Native branch must allow `completed` to `failed` within the same cycle only when the failure is structured. Either specify this or drop the override; I recommend specifying it with a test.
   - (e) The runtime key `(parentThreadId,parentTurnId,activity.id,kind)` is fine for item/started plus item/completed dedup, but it does not dedup across parent turns in history replay if turn IDs are regenerated. Use the key only inside a single parent turn's live window, and rely on cycle ordinal for cross-turn dedup.
   - (f) Orphan child events before the `started` activity (plan line 21): "pending/unattached" has no bound or flush rule beyond the context spec. Required change: set a cap and a drop-with-log on parent turn end, and specify that the buffered child events are flushed with the canonical `parentToolUseId`.

6. **Serious: Batch 5 contains an undefined background-store path.** Plan line 50 allows a background entry only if "the integration test" shows truthful semantics, and Batch 5 lists `background-agent.store.ts` and its spec as writes. Native children are not SDK background tasks (stream-background.ts:30-55) and the plan has no `taskId` for them, and `accumulator-core.service.ts:646` hands only `agent_completed` to the background store.
   - Required change: decide now. Recommendation: omit the background entry for native agents. Remove `background-agent.store.ts` and its spec from Batch 5, and drop the `background_agent_started/completed/stopped` emission from RC3. This also removes a duplicate-terminal source, since a status plus a background terminal could both settle one child.
   - If kept, state its terminal dedup key and its interaction with the `agent_status` terminal.

7. **Moderate: Batch 5 and Batch 6 file ordering and disjointness.**
   - Batch 5 must come after Batch 2 (types) and Batch 3. Batch 6 reads the same flat status contract; run it after Batch 2 and parallel to Batch 5. Batch 7 depends on both. The plan's "ordered" list is sound apart from the above.
   - Batch 4's `codex-chat-adapter.ts` is not touched by any other batch, so files are disjoint. Batches 3 and 4 both write under `libs/backend/agent-sdk/src/lib/codex-app-server/` but different files (`codex-chat-events.ts` versus `codex-history-projector.ts`). The projector constructs `CodexChatEvents` (codex-history-projector.ts:172), so Batch 4 depends on Batch 3's final public shape. State this ordering.
   - Required change: remove the "Phase B merge gate" wording from Batch 5; decision D6 says do not wait for Phase B.

8. **Moderate: verify commands.** `jest.config.ts` and `tsconfig.lib.json` exist for codex-runtime, agent-sdk, shared, chat-streaming, chat-execution-tree and chat (checked on disk). Component spec paths in Batch 7 (inline-agent-bubble, subagent-lane, `agent-monitor-panel.scope.spec.ts`) were not confirmed on disk; the plan itself defers that check (line 61). Required change: confirm and state the real paths before dispatch, and add the `libs/frontend/chat-streaming` native spec path to Batch 5's jest command. Batch 2 has no jest command (typecheck only); add at least a type-level test in Batch 5's native spec.
   - Batch 1 and Batch 4 each touch codex-runtime. This is fine under the two-project cap only if Batch 4 stays at agent-sdk plus codex-runtime.

9. **Minor: UI controls (Batch 7).** The disabled reason string at plan line 49 should be one shared constant in the chat lib, used by both inline-agent-bubble and subagent-lane, and tested once. SDK send/stop uses `taskId` (agent-monitor.store.ts:3119-3161); the union makes `taskId` absent on native records, so gate on `agentType==='codex' && !taskId`.

10. **Minor: transcript file lists.** Plan references `accumulator-core.service.ts:624-648` as read-only; the `agent_status` case there needs no code change under the union, since it passes the event straight through to `onAgentStatus`. Say so, so no lane edits it.

## AgentStatusEvent consumers

Method: `git grep -n -E "agent_status|AgentStatusEvent" -- "*.ts" ":!*.spec.ts"`. `ptah_lsp_references` was not used. This text search covered every non-spec `.ts` file in the repo, including `apps/`. Spec files were not enumerated.

| File:line | Use | Needs change |
| --- | --- | --- |
| libs/shared/src/lib/types/execution/stream-background.ts:156-179 | Definition | Yes, the union |
| libs/shared/src/lib/types/execution/stream-background.ts:353 | Member of `FlatStreamEventUnion` | No change (type name stays) |
| libs/shared/src/lib/types/execution/stream.ts:53 | `'agent_status'` literal in the event type list | No |
| libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts:9,455-470 | Only existing producer, sets `taskId: msg.task_id` | No; typed as the SDK variant, must still compile |
| libs/frontend/chat-streaming/src/lib/accumulator-core.service.ts:632-639 | Dispatch to `onAgentStatus` | No |
| libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:35,2704-2748 | Reducer; reads `event.taskId` at 2712, 2713, 2717 | Yes (narrowing plus native branch) |
| libs/frontend/chat-streaming/src/lib/streaming-handler.service.ts:73 | Event type list | No |
| libs/frontend/chat-streaming/src/lib/subagent-execution.store.ts:60 | Event type list | No |
| libs/frontend/chat/src/lib/services/chat-store/persisted-content-filter.ts:121 | Event type check | No |
| libs/frontend/machines-ui/src/lib/services/transcript-event-validators.ts:309-323 | Validator requires `taskId: isString` | Yes (accept native variant) |
| libs/worker-protocol/src/lib/frames.ts:192-203 | zod schema requires `taskId` | Yes (union or optional) |
| libs/backend/rpc-handlers/src/lib/handlers/subagent-history-page.ts:31 | Event type allowlist | No |

Nx projects needing a scoped check: `shared`, `agent-sdk`, `chat-streaming`, `machines-ui`, `worker-protocol`, plus the already-planned `codex-runtime`, `chat-execution-tree` and `chat`. No `apps/` file references `AgentStatusEvent` or `agent_status`, so `ptah-electron` and `ptah-extension-webview` need no scoped check from this change. They consume the types only transitively through the libs, so run each lib's `tsc --noEmit` and nothing at app level.

Proposed exact union (in `stream-background.ts`):

```ts
interface AgentStatusEventBase extends FlatStreamEvent {
  readonly eventType: 'agent_status';
  readonly parentToolUseId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'killed' | 'paused';
  readonly description?: string;
  readonly errorMessage?: string;
  readonly agentId?: string;
  readonly workflowRunId?: string;
  readonly workflowName?: string;
}

export interface SdkAgentStatusEvent extends AgentStatusEventBase {
  readonly taskId: string;
  readonly native?: undefined;
}

export interface NativeCodexAgentStatusEvent extends AgentStatusEventBase {
  readonly taskId?: undefined;
  readonly agentId: string; // child thread id, required
  readonly native: {
    readonly provider: 'codex';
    readonly agentThreadId: string;
    readonly activityId: string;
    readonly cycleId: string;
    readonly cycleOrdinal: number;
    readonly kind: 'started' | 'interacted' | 'interrupted' | 'completed';
  };
}

export type AgentStatusEvent = SdkAgentStatusEvent | NativeCodexAgentStatusEvent;
```

The discriminant is `native` (present or absent), narrowed with `event.native !== undefined`. Existing SDK producers keep compiling because `native` is optional-undefined. A `taskId`-keyed discriminant is not usable because the existing producer is the SDK variant and has no explicit tag.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use the `native`-keyed discriminated union for `AgentStatusEvent` | (1) optional `taskId` (plan); (2) union discriminated by `native`; (3) a new event type | Decision (c); one producer, system-message.transformer.ts:455; validators and zod frame also require `taskId` | Yes |
| Drop `codex-chat-adapter.ts` from Batch 4; seed in codex-runtime | (1) edit adapter; (2) seed in context/runtime | codex-context.ts resume and codex-session-history.ts are already in codex-runtime; adapter edit is only plumbing | Yes |
| Omit the background-agent entry for native children | (1) emit `background_agent_*`; (2) omit | No SDK task semantics for native children (stream-background.ts:30-55); extra terminal source | Yes |
| Child sessionId needs no code change, only tests | (1) change base sessionId; (2) test only | codex-chat-turn-stream.ts:331 and codex-chat-events.ts:181 already use the parent session ID | Yes |
| Split Batch 2 into 2a (shared + worker-protocol) and 2b (machines-ui) | (1) one batch with 3 projects; (2) split | Two-project cap | Yes |
