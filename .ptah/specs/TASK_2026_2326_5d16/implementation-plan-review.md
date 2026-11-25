# Review — implementation-plan.md

- Author: codex CLI lane 2368cb6b (CLI side, family codex)
- Reviewer: orchestrator (in-process side, Claude) — cross-side
- Verdict: **REVISE → resolved by binding amendments below** (applied in implementation-plan.md
  `## Orchestrator amendments`). Gate 2 goes to the user (approval mode `user`, request text).

## Strengths
- Every component maps to an RCA root cause with file:line evidence; compatibility callers listed
  (host-routing coordinator, MCP stdio dispatcher, capability-matrix RPC, Electron and CLI DI).
- Deadline design races each gather input and keeps completed facts; missing inputs become explicit
  reasons; deterministic ranking always returns.
- Result size cap handled by staged compaction with `traceOmitted`.

## Findings
1. **Blocking — D7 scope boundary.** B09 writes `decision-model/system-one.client.ts` and adds a
   background warmup path. Cold load, keep-alive and the connection belong to the sibling session
   "Chappie decision host" (decisions.md D7). Plan decision 4 also disables local inference on the
   current transport, which is a large behavior change outside this task.
2. **Serious — unapproved removal of a user setting.** Component 1 drops the `preferredRank`
   tie-break. `preferredRank` comes from the user's configured preferred agent order
   (`agent-namespace.builder.ts:967-983`, `getPreferredAgentOrder`). Removing it silently removes a
   user capability.
3. **Serious — unapproved removal.** Plan decision 1 removes the design/visual-review subagent
   score=100 override (`pipeline/phase-plan.ts:175-181`). Removals go to the user; the predictable
   fix is to make it visible, not to drop it.
4. **Moderate — model executor choice.** Plan decision 2 makes a decision-model executor choice
   advisory. That removes the decision model's only executor role. Predictability is reached by the
   explanation (deciding factor + gap), not by removing it.
5. **Minor — execution cost.** 13 batches with a coordinated merge across B02-B09 would need 13 lane
   spawns plus intermediate broken fixtures. Group into 5 sequential lane runs.
