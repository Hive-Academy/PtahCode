# Review of implementation-plan.md — round 1

- Author: Codex CLI lane (software-architect role). Reviewer: orchestrator (in-process, cross-side).
- Verdict: **REVISE**

## Defects

1. `implementation-plan.md:14` — The plan sets `sessionBudget.autoHandoffAtLimit` default to
   `false`. The current default is `true` (`libs/shared/src/lib/types/session-budget.types.ts:231`).
   No scope item asks for this. Remove the change. (The "opt-in" line in context.md was a stale
   memory note, not a requirement.)
2. `implementation-plan.md:22` — The escalation condition needs
   `postCompactionContextTokens >= rotationSuggestTokens` (default 300k). With a 200k auto-compact
   window the post-compaction context cannot reach 300k, so the rule can never fire. Use a
   threshold relative to the effective auto-compact window: escalate only when the context
   after the compaction is at least 50% of that window (the compaction did not help). No
   escalation when the window or the sample is unknown.
3. `implementation-plan.md:40` — The idle gate `max(configuredIdleMin, effectiveSdkWindow + 50_000)`
   is above the SDK window. SDK auto-compaction fires at the window, so idle compaction can
   never fire on a first-party session. State the purpose of idle compaction from the code,
   prove that the new threshold is reachable, or select a design that keeps idle compaction
   functional (for example: fire below the window only when the context grew by a minimum
   amount since the last compaction boundary, so the same occupancy is not compacted twice).
4. `implementation-plan.md:44` — `ptah_session_send` already has an explicit `steer` mode.
   Say exactly what changes: the public modes stay; `steer` gets the `parent-steer` cause tag;
   only host-originated messages (runtime warning, wrap-up) change from interrupt to queue.
   Do not add a new parameter unless the code proves it is necessary.
5. `implementation-plan.md:13-15` — A profile with a stored `sessionBudget.tokens` resolves to
   `raw`, so the user who reported the problem (30M stored) sees no change. Keep that
   resolution, but add a visible prompt in the settings card and the banner tooltip that
   names the weighted measure as recommended when the resolved measure is raw.

## Accepted

Items 3 (durable handoff state), 4 (compaction deferral) and the `TurnStopCause` contract in
item 6. No removal is proposed, so no user approval of a removal is necessary.

# Round 2 (re-review of the five corrections)

- Verdict: **APPROVED**. All five defects are corrected: autoHandoffAtLimit default unchanged;
  count rule uses 50% of the effective auto-compact window; idle gate is below the window with
  a 50k post-boundary growth guard (default min 150k); steer keeps its public modes with a
  `parent-steer` tag; raw-mode recommendation in settings card and banner tooltip.
- Gate 2 passes in lane-review mode. No removal is proposed.
