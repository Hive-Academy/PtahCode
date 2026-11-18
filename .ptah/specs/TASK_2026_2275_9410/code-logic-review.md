# Code Logic Review — TASK_2026_2275_9410

**Verdict: CHANGES REQUIRED**

Score: **6/10**. The idle-reopen fix works for sampled streaming states, but real activity can be invisible to the new gate. This is below sound (7–8) because legitimate live turns can lose automatic hand-off; above 3–4 because identity checks, claims, and retry handling remain coherent.

Scope: entire coordinator and spec; uncommitted diff against HEAD `7b1ef1585`; HEAD's settlement change; context.md and task.md; status, identity, budget, partition, stream delivery and scheduling writers. No source changes or test/build commands were run.

Path abbreviations below: `C` = `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`; `S` = its `.service.spec.ts`; `TM` = `libs/frontend/chat-state/src/lib/tab-manager.service.ts`. All other paths are repository-relative.

## Findings, ordered by severity

### 1. Serious — background activity is discarded while its budget is absent (confirmed)

- Evidence: `C:165–169` records activity only from `budgetTabs()`; `C:237–245` excludes background tabs with null/undefined budgets. `C:179` subsequently rejects the session forever until another observed turn.
- Scenario: a mounted background tab with a session id streams while `sessionBudget === null`; the turn ends; its first confirmed budget then arrives at `limit`. Even running the effect between every transition never records that session. The eventual limit causes no probe, claim or send.
- This is a supported state: `TM:3099–3100` clears a budget when binding a different resumed session; `TM:1966–1984` independently writes generating/terminal status. Live stats explicitly preserve an absent budget (`libs/frontend/chat/src/lib/services/chat-store/session-stats-aggregator.service.ts:220–224`), whereas result stats install the budget (`:145–147`; `TM:2810–2813`). Thus a budget need not exist during streaming.
- Minimal fix: collect activity from **all mounted tabs in both partitions**, without the budget predicate, then filter budgets for candidate/withdrawal processing. Add a background null-budget → streaming → loaded → limit regression test.

### 2. Serious — a real turn can start and finish before the effect samples it (confirmed static failure path)

- Evidence: `C:128–130,165–167` remembers only the current status at effect execution. `libs/frontend/chat/src/lib/services/chat-message-handler.service.ts:624–626` queues individual events; `libs/frontend/chat/src/lib/services/stream-flush-scheduler.service.ts:80–94` collects visible-tab events for 50 ms and executes the entire queue synchronously. Snapshot events are also processed in one loop (`chat-message-handler.service.ts:695–699`).
- Scenario: a previously idle mounted tab receives generating and idle/failed in the same flush, without a separate local `markStreaming` transition (for example an externally initiated short turn). `TM:1966–1984` writes streaming then loaded before Angular runs the coordinator effect. The effect sees loaded, misses the real turn, and rejects a limit budget even if it arrives later.
- Minimal fix: retain activity at the accepted streaming transition, keyed by session id, and let the coordinator consume that sticky observation. Sampling an effect more often does not preserve intermediate values. Add a test that applies streaming and loaded without an intervening `TestBed.tick()`, then supplies limit.
- Confirmation limit: the synchronous queue and lost intermediate state are established from code; frequency in production was not measured. No runtime reproduction was executed.

### 3. Serious — hidden externally started turns never supply a generating status (confirmed routing gap)

- Evidence: `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.ts:175–190` retains hidden events but forwards only terminal turn states with `statusOnly: true`. `libs/frontend/chat/src/lib/services/chat-message-handler.service.ts:597–601` routes those to `TM:2038–2057`, which only sets loaded. The new prerequisite is `C:167,179`.
- Scenario: an old mounted tab has never streamed this page, is hidden, and receives a cron/gateway/backend-started turn without a renderer send. Its real generating event stays in the backend tail; the coordinator never observes streaming, even with a valid budget throughout. Result stats at limit are rejected. Revealing a completed turn is insufficient to guarantee recovery: its retained events are applied in the synchronous snapshot loop from finding 2.
- Minimal fix: provide an activity observation for accepted generating control events independently of hidden transcript rendering, and retain it by session. If the no-backend-change constraint is retained, explicitly narrow the supported activity contract and cover the chosen frontend activity source; the present claim to cover every mounted background tab is unsupported (`C:57–59`).

## Five logic questions

1. **How does this fail silently?** Findings 1–3 leave `activeSessions` empty; the only indication is the once-per-session skip log (`C:179–181,290–295`). Repeated budget revisions cannot recover the missed observation.
2. **What user action produces unexpected behaviour?** Starting/revealing a hidden backend-driven turn can miss hand-off. The requested ordinary old-session send works when its streaming state is observed: successful continue calls `markStreaming` (`libs/frontend/chat/src/lib/services/message-sender.service.ts:1141–1142`), after which `C:167` admits it and `C:369–381` sends/queues it. Already-settled responses take an earlier return (`message-sender.service.ts:1125–1133`), so this is not a universal observation guarantee.
3. **What input produces a wrong answer?** A background null budget followed by a post-turn limit, or generating/terminal statuses coalesced into one flush. Matching `budget.sessionId` and `claudeSessionId` are still enforced (`C:171,441–442`).
4. **What happens when a dependency fails?** Existing probe/send failures retain capped backoff (`C:324–326,373–376,390–400,575–604`). Missing skill stays suppressed (`C:310–322`). The new gate prevents reaching those mechanisms for missed activity; it does not introduce a retry storm.
5. **What is missing from the requirements?** A reliable activity observation contract across budget absence, batched state changes and hidden-stream suppression. The decision's “effect already re-runs on each tab change” confuses invalidation with observing every intermediate value.

## Tracking, identity and PR 1422 interaction

- Status-only updates are tracked: `C:238–239` reads tabs and the background revision within `candidates()` before `untracked` (`C:146`). Active updates replace the tab array (`TM:1788–1824`); background updates bump their revision (`libs/frontend/chat-state/src/lib/tab-workspace-partition.service.ts:450–459`). Status needs no independent signal.
- Mutating the plain Set here does not invalidate signals or cause an effect loop. It is private and monotonically grows; the same evaluation immediately sees the addition (`C:167,179`). It cannot compensate for an unobserved transition.
- Session id assigned while still streaming works: `TM:2246–2249` changes the tracked tab and `C:166–167` records the new id. A new id seen only after streaming ends is correctly not inferred from the old id; a same-flush assignment remains subject to finding 2. Rebinding clears the old budget (`TM:2976,2993`) and qualification checks prevent cross-session sends (`C:441–442`).
- For a session admitted through `candidates()`, `activeSessions` can never become false. Therefore the added `stillQualifies` check (`C:444`) cannot newly release its claim, block its resend, or make deferral loop. Awaiting-settlement observation (`C:132–142`), delivered resend (`C:549–558`), failed/withdrawn queue retry (`C:408–426`) and stale withdrawal (`C:253–288`) retain their prior conditions. PR 1422's waiting-for-delivery-start limitation remains pre-existing, not a new finding.

## Spec assessment

- The four additions (`S:131–201`) prove idle no-probe/no-claim/no-send, status-only wake-up, persistence after an observed turn, and the equivalent budget-bearing background path. They do not cover null-budget background activity or intermediate states lost to batching.
- `startAfterTurn()` (`S:58–66`) forces streaming at below-limit stage, calls `TestBed.tick()`, then restores fixtures. This legitimately establishes prior activity for existing cases, but guarantees away finding 2 throughout the migrated suite.
- The auto-handoff-off test (`S:516–522`) still exercises its gate: the helper preserves `autoHandoff: false`, then restores a limit budget. Removing that guard would cause a send. It is not newly masked by inactivity.
- The resuming/permission test (`S:503–513`) has permission true throughout resuming, so its send assertion alone cannot isolate resume suppression; this overlap predates the helper. The separate skip-log assertions (`S:532–537`) still exercise the resume gate. Prefer a standalone active-session resuming test with permission false.

## Decisions and verification limits

- Kept the review read-only and treated missing observations as functional gaps rather than rewriting the explicitly chosen Set policy. Options: accept narrower sampling semantics, or preserve accepted activity transitions; evidence above favors preserving activity. This is reversible.
- No implementation plan, task-description, style review or test report exists in the discovered task folder. No pending handoff stub was present. No test results are claimed; the concurrent gate belongs to the parent.
- Ptah AST inspection was used. `ptah_code_search_symbols` returned zero indexed symbols, so native search was used for tracing. Skill discovery/loading is unavailable in this lane; no Angular skill was loaded or reconstructed. `ptah_get_diagnostics` was not invoked because its CLI implementation can run the TypeScript compiler, prohibited during this review.
