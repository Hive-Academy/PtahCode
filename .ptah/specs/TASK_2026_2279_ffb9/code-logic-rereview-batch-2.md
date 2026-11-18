# Code logic re-review: batch 2 revision

**Score: 8/10. Verdict: APPROVED** (two low items remain; none blocks).

Method: I read `implementation-batch-2-revise.md`, then the current diff and untracked files, and checked each claim against the code. I ran `subagent-context-limit`, `subagent-successor-lineage` and `subagent-budget-batch2` specs: 3 suites, 14 tests, all pass. I did not run nx or verify. Line numbers refer to files under `libs/backend/agent-sdk/src/lib/helpers/compaction/`.

**Coordinator claim on F1, checked against the SDK.** In `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, `contextWindow` appears only once, at L1519, in `ModelUsage` (result metadata). A grep for `contextWindow|context_window|maxOutputTokens` found nothing in `ModelInfo` (L1458) or the init message. The claim is **confirmed**: no earlier window field exists.

## Status of F1-F9

| # | Original finding | Status | Evidence |
|---|---|---|---|
| F1 | Window unknown on the first subagent | **Resolved** (per decision) | `subagent-context-limit.ts` L22-26 `warnUnknown` warns once per session and uses the setting. It is called at `subagent-budget-monitor.ts` L573. `rekey` (L18) and `release` (L21) keep the set bounded; the monitor calls them at L1049 and L1120. Catalog-before-result is still used (L49). |
| F2 | Window keyed by model, so a parent window can apply to a subagent | **Resolved** (small residual, N2) | L34 keeps the minimum observed window per exact `[route, model]`. L51 takes the smaller of the catalog and observed values. A model change recomputes the window (L47-51). The real-monitor spec `subagent-budget-batch2.spec.ts` L84-92 covers the model switch (small to large) and `budgetReached`. |
| F3 | Reduction text waived the guard and erased ancestry | **Partly resolved**, accepted by design | `subagent-successor-lineage.ts` L22-26 requires at least 24 characters and 4 words. Ancestry is kept (`readPredecessor` no longer looks at the reduction). Only `guardSuccessor` L77 applies the exception. Still open by design: omitting the predecessor link bypasses the guard, and a reduction statement is not verified. `initialContext` is now used (L34). |
| F4 | Empty deliverables meant never productive | **Resolved** | `subagent-deliverables.ts` `completed()` returns `productive.length > 0` when nothing is declared, excluding the notes path. The monitor passes the notes path at L1773. |
| F5 | `budgetReached` used the raw setting | **Resolved** | `effectiveBudgetReached` (`subagent-context-limit.ts` L10-13) uses the effective settings and the current context. It is used at `subagent-budget-monitor.ts` L973. The real-monitor spec at L89-92 checks it. |
| F6 | Forgeable record and unbounded read | **Resolved** | `subagent-successor-lineage.ts` L42-44 requires the record to be inside both the workspace and `.ptah/subagent-handoffs`, with the `.handoff.md` suffix (symlink-aware via `insideNotesWorkspace`). L45-58 caps the read at 256 KB and re-checks the size after reading. Residual: an authorized writer in that directory can still tamper. |
| F7 | Silent fail-open paths | **Resolved** | `readPredecessor` L64-72 warns once per session and logs at debug. An unavailable workspace now goes through the catch (L41) and so also warns. `moveLineageWarning` is wired to rekey and release (monitor L1049, L1120). The hook's no-session branch already warns (`subagent-budget-hooks.ts` L43). |
| F8 | `initialContext` unused | **Resolved** | It is now part of the exhaustion rule (`successorLineage` L34). |
| F9 | Tests did not prove the production path | **Resolved** | `subagent-budget-batch2.spec.ts` L56-81 uses a real `SubagentBudgetMonitor`. It writes real handoff records through warned completions, rekeys the session, and gets a `lineage exhausted` deny from the hook. L84-92 covers the model change. |

## New observations from the revision

- **N1 (low): the exhaustion rule is stricter than the spec.** `successorLineage` L34 adds `initialContext >= previous.initialContext`. A successor that starts smaller is never exhausted even if it is as fast. This is reasonable and matches "reduce initial load", but it differs from the item 5 wording, which lists only request count and no completed deliverable. It should be noted in the root-cause document. No code change needed.
- **N2 (low): the minimum window is monotonic for the life of the monitor.** `windows` (`subagent-context-limit.ts` L34) never raises a window for an exact route and model key. If the same id was seen at 200k and is later served at 1M (for example an account change or SDK upgrade), it stays capped at 90% of 200k until restart. That means earlier handoffs than necessary, which is the safe direction. Optional fix: clear the entry on session release or on a route change.
- **N3 (info): the reduction check is a heuristic.** The 24-character, 4-word rule is easy to satisfy. This follows the explicit-link design decision, so it is not a defect.

## Regression checks

- **Cleanup:** per-session sets are bounded and released. The `windows` map is capped at 4096 entries. The deliverables `finish`/`release` sites are unchanged.
- **Guard scope:** the guard only denies when an exhausted linked predecessor exists and there is no concrete reduction. Unlinked Agent/Task calls are not touched, and neither are unrelated scopes.
- **Notes turn:** the monitor does not end it on a count. It still ends on the notes write or the time watchdog.
