## Summary

One shared `agentBudget` guard for Claude Agent SDK subagents, Codex-provider subagents and CLI agent lanes (`ptah_agent_spawn`).

- **Settings (batch A):** new `agentBudget` group — `warnRatio` 0.85, `stopWeightedTokens` 3,000,000, `handoffContextTokens` 150,000, `maxDurationMin` 90 — with a migration from the old `compaction.subagent*` keys, a settings UI section, and export/import support.
- **Shared contract and policy (batch C):** Zod-validated completed-turn telemetry (`AgentTurnTelemetry`) and a host-neutral `AgentBudgetPolicy`: cost order provider → Ptah pricing catalog → explicit unavailable (logged once), catalog-weighted tokens with a raw-token floor, one predictive warning (ratio ≥ warnRatio, or the largest turn so far would cross the stop), one stop.
- **CLI lanes (batches C, D, G):** every adapter reports per-turn usage with the observed billed model (Claude, Codex, ACP/Grok, OpenCode, Cursor, Copilot, Antigravity, Pi). Missing usage is one `telemetry-unavailable` record after the completed-turn boundary (named 2 s drain for Codex/ACP), never zero. `AgentBudgetCoordinator` keeps durable counters, merges ledgers on a late native session ID, stops with reason `budget` / `telemetry-unavailable` / `duration`, puts a progress pointer (true CLI Session ID + last turn) in the completion, and the resume gate refuses stopped and near-limit sessions. The warning is steered onto an active Codex turn or queued for the next turn; a same-turn warning goes into the stop message.
- **Codex-provider children (batches E, F):** one `CodexChildBudgetObserver` per context on Electron and CLI; native children are linked on their first notification; one charge per completed child turn (real counters, raw-token floor when the model id is missing); bounded state across relinks; advisory decision against `handoffContextTokens`.
- **Claude SDK subagents (batch B):** `subagent-budget-monitor.ts` on `AgentBudgetPolicy`, keyed by parent session + Task id; the PreToolUse gate refuses SendMessage/resume for warned and stopped subagents; the #989/#1004 notice, notes gate, handoff and stop paths are kept; a policy stop pushes the Ptah handoff to the parent before its next reply (bounded 15 s stream wait).
- `agent-process-manager.service.ts` does not grow vs main (budget logic in `lane-budget-deadline.ts`, `lane-session-binding.ts`, `lane-budget-telemetry.ts`).

Design and history: `.ptah/specs/TASK_2026_AGENT_BUDGET/` (implementation-plan.md, batch and fix reports, reviews, live tests 1–8).

## Test plan

- [x] `npm run verify -- -p shared,agent-sdk,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli` on each batch and fix: lint and typecheck pass; all tests pass except the 2 pre-existing Windows `platform-core` session-driver-lock specs (`control-endpoint.spec.ts`, `kernel-session-driver-lock.spec.ts`), which also fail on main.
- [x] Degradation audit (`tools/degradation-audit/check-degradation.ts`): exit 0, no baseline raised.
- [x] Reviews: logic and style reviews in 3 rounds plus 2 final rounds (Codex and OpenCode lanes); all blocking and serious findings fixed.
- [x] Live tests 1–8 in Ptah Dev on Electron, each with the isolation gate (build contains #978; production `~/.ptah/settings.json` raw and canonical SHA-256 unchanged; Dev settings restored byte for byte). Proven live:
  - Codex CLI lane: per-turn `Accepted lane turn` records with real tokens and catalog cost authority; one predictive warning before the stop, delivered by queue-next-turn and visible in the Codex rollout; budget stop with source; progress pointer in the parent UI; resume refused with the budget-stop reason.
  - Native Codex-provider child: linked, decisions with real counters, relinks without an extra charge.
  - Haiku SDK subagent: per-turn accounting with the observed model, warning, Ptah-attributed stop with the handoff pushed before the parent's reply, one `.handoff.md` record, a burst of PreToolUse denials counted as one, a fresh Task reads the handoff.
- [ ] Not proven live / known gaps:
  - The last fix commit (`d96022bbf`: child drains on stream close, info-level child logs, no `unsupported` log on a queued warning) is covered by specs only.
  - The Codex child observer is advisory (no child stop). The child advisory near `handoffContextTokens` was seen once (round 6), not in every run.
  - SDK subagent resume cannot be exercised with the native Agent tool; Haiku does not always update its notes after the notice (the host merges the inferred snapshot).
  - The parent UI can still show the SDK's own interruption string; Ptah's handoff text paraphrases it.
  - The first Claude CLI result after a resume has no restored cumulative cost base, so its per-turn cost can be overstated.
  - Usage of Grok/Antigravity/OpenCode/Copilot/Cursor/Pi/GLM/Kimi lanes is covered by fixtures, not live runs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
