# Final Code Logic Review — TASK_2026_AGENT_BUDGET

## Summary

| Metric | Result |
| --- | --- |
| Score | 6/10 |
| Verdict | REVISE |
| Blocking | 0 |
| Serious | 1 |
| Minor | 1 |

The earlier late-session-ID and mixed-model accounting findings are addressed by `agent-budget-coordinator.ts:53-76` and `agent-budget-policy.ts:94-122`. The round 5 live test proves a Codex CLI warning in the rollout, budget stop and fresh-session gate, plus SDK stopped-Task SendMessage refusal and one handoff record. It does **not** prove the later SDK notes fixes or a priced Codex child decision. This score is above 3–4 because the principal CLI and SDK stop paths are coherent and partly live-proven; it is below 7–8 because the remaining Codex ordering flaw can turn valid usage into an unavailable decision. The review inspected the full PR file list and traced the changed policy, lifecycle, observer, migration, and SDK monitor paths; it did not independently read all 106 changed files in full.

## Findings

### Serious — a terminal that first links a Codex child skips the usage drain

**Evidence:** `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:122-151`; `libs/backend/codex-runtime/src/lib/codex-child-budget-tap.ts:42-50,93-134`.

The observer tests `tap.parentOf(event.threadId)` *before* `settle()` calls `tap.observe(event)`. If a child terminal is the first event carrying its `parentThreadId` (a linkage route explicitly supported by the tap at lines 43 and 47–48), the drain branch is skipped. `settle()` then links the child and completes that turn with `no-usage-event`. A valid usage notification arriving shortly afterward is stored as pending, but the completed-turn key prevents a second decision. The child remains marked telemetry-unavailable and its tokens never enter its budget snapshot. This matters especially across reconnects or reordered notifications, precisely where the two-second drain is intended to help. Link the terminal before deciding whether to drain, while preserving one charge per turn; add a terminal-first/usage-later fixture. **Fix before the PR leaves draft.**

### Minor — Codex child model fallback can price an unreported child as the root model

**Evidence:** `libs/backend/codex-runtime/src/lib/codex-context.ts:442-450,545-557`; `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:65-72`.

On first child linkage, the context assigns the root's observed model to that child until a child `thread/settings/updated` arrives. A child turn completed before that update can be weighted at root rates even if the child selected another model. The reported child model overrides this correctly when delivered in time. Record this as degraded pricing or wait for the child's settings before final pricing when its model is unknown; a fixture with differing root and child models would make the boundary explicit. This is not a draft blocker given the observer is advisory and the raw-token floor still applies.

## Five logic questions

1. **Silent failure:** terminal-first linkage followed by trailing usage produces a permanent unavailable child decision (`codex-child-budget-observer.ts:122-151`; `codex-child-budget-tap.ts:97-133`).
2. **Unexpected user action:** a Codex parent spawns a child whose first observed event is its terminal; that child's valid late usage does not count toward its advisory budget (same lines).
3. **Wrong input-dependent answer:** a child running a model different from the root before child settings arrive can inherit root pricing (`codex-context.ts:545-557`).
4. **Dependency delay/failure:** the CLI Codex and ACP adapters use bounded two-second usage drains; after the bound they fail closed with telemetry-unavailable. The SDK monitor defers a handoff stop if record creation fails and retries, while a safety stop sends an in-memory handoff (`subagent-budget-monitor.ts:1482-1508` and its documented stop path). These are observable tradeoffs, not evidence that late usage was charged.
5. **Missing requirement:** the plan does not define model provenance when the child's model notification is late. The implementation should explicitly distinguish a reported child model from the root fallback before applying catalog rates.

## End-to-end assessment

| Area | Assessment and evidence |
| --- | --- |
| Settings | Per-key migration preserves explicit new keys and writes through a temp rename (`agent-budget-settings-migration.ts:39-65`); shared schema supplies defaults (`agent-budget-policy.ts:8-25`). |
| Policy | Full input plus output is the floor, catalog classes weight usage, provider USD wins display cost, missing cost remains unavailable, and snapshot flags enforce one warning/stop (`agent-budget-policy.ts:56-123`). |
| CLI lifecycle | Provisional and prior ledgers merge and evaluate immediately (`agent-budget-coordinator.ts:53-76`); manager dispatches the result on native-ID binding (`agent-process-manager.service.ts:1382-1387`); resume rejects budget stops and near-limit totals (`lane-resume-gate.ts`, budget branch). |
| Codex child | Linkage, two-second drain and bounded maps exist, but the terminal-first ordering finding remains. Round 5 live test observed linkage yet telemetry-unavailable; the later fix report supplies focused specs, not a live priced decision. |
| SDK child | Monitor keys accounting by session and Task identity, enforces warned notes, writes and publishes handoffs, and gates stopped messages. Round 5 live test proves stop attribution, refusal burst, and handoff; subsequent notes/stub/read wording fixes were verified by focused tests but have not been live retested. Native Agent resume remains untestable in the stated harness. |

## Verification, decisions, and limits

- Read-only review. No build, test, Ptah Dev launch, commit, or push. Scoped `ptah_get_diagnostics` was attempted on four production files but timed out after 45 seconds, so it supplies no passing evidence. Prior scoped verify results are documented in `fix-round-3-report.md`, `live-test-5-fix-report.md`, and `live-test-5-sdk-fix-report.md`.
- Accepted gaps: first Claude CLI result after resume may overstate cost; Codex child observer is advisory; native Agent tool cannot exercise SDK resume.
- **Decision:** Treat the two-second drain as a finite vendor boundary, not an assurance of eventual usage. The alternative is an unbounded wait; existing telemetry-unavailable handling is reversible if a vendor flush signal appears.
- No skill-loading tool was available in this lane; no skill instructions were inferred.

## Verdict

**REVISE.** Fix the serious terminal-first Codex observer defect before the PR leaves draft. The minor model-provenance issue can be tracked separately. Confidence: medium, because the final Codex child accounting and post-fix SDK notes behavior lack live confirmation, and this review did not fully read every changed adapter file.
