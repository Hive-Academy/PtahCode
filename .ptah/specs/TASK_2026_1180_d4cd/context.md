# TASK_2026_1180_d4cd — Fix lane plan-limit state per CLI

Worktree: `.claude-worktrees/fix-lane-plan-limit-state-d4cddeb4d3c1`, branch `fix/lane-plan-limit-state`.
The task tool timed out twice, so the carrier was written by hand.

## Objective

Make the plan-limit state of each agent lane in `ptah_agent_list` correct and complete.

## Evidence

- 2026-11-10 (user): codex `AT LIMIT (Weekly, resets 2026-11-17)` with Weekly 7% used, state
  LIMIT REACHED, source provider-api, while force-spawned codex lanes work. Antigravity
  `unknown (reader failed)`. Quota of antigravity is per model.
- 2026-11-15 (this session, before any change): codex `unknown (limit lookup timed out)`,
  grok `unknown (limit lookup timed out)`, antigravity `unknown (no windows reported) [CLI command]`,
  claude and Claude Api `unknown (limits not tracked)`, copilot/opencode `no usage source`.

- 2026-11-15: Glm `Weekly 100%` and kimi `Monthly total 100%` show window state "near limit"
  in the plan table while the row says AT LIMIT. A 100% window must read "limit reached".
- 2026-11-15: MCP calls `ptah_task_create` and `ptah_agent_spawn` (codex, no force) timed out.
  A codex spawn with `force: true` started (`08fc1321`) although the MCP call also reported a
  timeout. Grok spawn with force returned at once.

## Lanes

| Lane | Agent | Job | Deliverable |
| --- | --- | --- | --- |
| codex | 08fc1321 | code-path research | code-findings.md (delivered) |
| codex | 8e71f3e6 | duplicate of 08fc1321 (spawn timeout) | same file (delivered) |
| grok | b101ea26 | per-CLI probe | failed: confirmed limit |
| antigravity (gemini-4-carbon-high) | 303a503c | per-CLI probe | cli-probe.md |

Confirmed limit: lane `grok`, family grok, HTTP 402 "Grok Build usage balance exhausted"
on models grok-4.6 and grok-4.7, reset unknown. Skip grok for this run. Ptah showed
`unknown (limit lookup timed out)` for it, and the lane ended as `failed` without a
`usage-limit` stop reason. Both are defects in scope (a 402 balance-exhausted must classify
as a limit).

## Confirmed causes (coordinator spot-check of code-findings.md)

1. Codex false AT LIMIT: `codex-plan-usage.reader.ts:187-196` copies the bucket-level
   `rateLimitReachedType` onto BOTH windows of a bucket. `namesGate`
   (`plan-limit-ledger.rules.ts:180`) then treats a 7% weekly window as gating, so
   `readingClears` never clears held exhaustion. d91f6b2a8 (2026-11-10) fixed only the
   no-flag case. Fix: a reached flag gates only the window at >=100%; a flag with no window
   at limit becomes a named bucket gate (e.g. credits), never the weekly window.
2. Lookup timeout: outer deadline 12 s (`evidence-precedence.ts:22`) vs a cold codex
   app-server read plus a 50 s source chain; grok has 3 s vs a 5 s HTTP read.
3. 100% window shows "near limit": `classifyWindow` needs exhaustion evidence for
   `limit-reached`; Glm/kimi readers do not set it at 100%.
4. Grok 402 "usage balance exhausted" is not classified as a limit.
5. Side effect of cause 2: the first codex `ptah_agent_spawn` returned an MCP timeout but
   started lane 8e71f3e6 anyway; the retry started 08fc1321. Two lanes ran the same brief
   and both wrote code-findings.md (duplicate sections). The spawn path awaits the slow
   limit lookup before it replies. Batch (a) must bound that wait so the MCP call returns.

## State of main at task start

- `main` already has `quota/readers/usage-source-chain.ts`, `fallback-usage.runner.ts`,
  `antigravity-cli-usage.adapter.ts` (commits aed6e5d1d, cd2876373, 3a36902e0).
- PR #1061 (`feat/cli-tier-map`, TASK_2026_896_9339) merged on 2026-11-10: per-call model
  routing for system CLI lanes is on main. No live branch overlap.

## Coordinator decisions (from the user brief)

- One port, many readers. Ordered sources per CLI. First answer wins. Result carries source
  label and age. No CLI-specific branches in formatter or spawn gate.
- PTY scrape is a fallback only: strict timeout, cache, kill on timeout, tolerant parser with
  fixtures, never on the Electron main-loop critical path, no startup work.
- Parse failure gives `unknown (reason)`, never a false AT LIMIT. AT LIMIT only when a gating
  window is exhausted, and the window is named.
- Per-model quota dimension for antigravity.

## Batches (planned)

| Batch | Scope | PR | State |
| --- | --- | --- | --- |
| research | usage-sources.md | - | done |
| a1 | codex false AT LIMIT, 100% reads limit-reached (codex lane 8e067b33) | #1298 | in_review |
| a2 | spawn bounded lookup wait, grok deadline (antigravity lane aa2f8cb4) | #1298 | in_review |
| a3 | review fixes 1, 3, 4 (codex lane 370c5eef); review: review-batch-a.md | #1298 | in_review |
| b | antigravity reader (agy JSON, branch fix/antigravity-usage-reader) | #1301 | in_review |
| c1 | codex `ordinaryUsageAllowed` gate (branch fix/lane-usage-sources); review: review-batch-c1-r3.md | #1308 | in_review |
| c | fallback reader port coverage: claude OAuth usage, grok, copilot | - | pending |
| d | per-model limit state | - | pending |

### Batch (a) decisions

- A codex bucket flag with no window at 100% makes no exhausted window. The flag stays on the
  allowance. The provider's real gate (`ordinaryUsageAllowed`) is dropped by the codex client
  today; batch (c) carries it to the reader.
- Review finding 2 is accepted as a known gap: the spawn gate waits 4 s. After the 30 s
  plan-usage cache TTL, a slow lane with an active exhaustion can spawn with
  `unknown (limit lookup pending)`. The spawn dispatchers reach limits only through the async
  `PtahAPI.agent.limits`. A synchronous last-known read needs a new port (follow-up).
