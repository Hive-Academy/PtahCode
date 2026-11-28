# Context — TASK_2026_2331_f700

Fixes GitHub issue #1518, extended to Codex main chat. User approved starting now (2026-11-26).

Evidence: `.ptah/tmp/session-tools-attribution-research.md` (copied into this worktree; Codex
research lane, read-only, source-inferred matrix). Confirmed by the orchestrator:
`session-handoff.service.ts:590` resolves the caller only through the Claude SDK lifecycle.

Broken: ptah_session_handoff, ptah_artifact_publish (Codex + ACP); ptah_session_link_task,
ptah_harness_propose_config, ptah_cron_create, ptah_git_worktree_add organization record,
ptah_agent_spawn permission inheritance (ACP only).

Direction: one host-injected live chat session resolver (SDK lifecycle, Codex chat, ACP
provider-session pool) returning runtime, canonical session id, tab id, trusted workspace,
with explicit unresolved/ambiguous results. Handoff also needs runtime-aware successor creation,
retirement and acknowledgement.

## Decisions

- Type BUGFIX, depth Partial. Gate 0.1: lanes enabled (user cost mode until 2026-11-27 18:00;
  CI does verification). Approval mode lane-review.
- Executor codex (only lane with confirmed room). One lane writes implementation-plan.md first,
  then implements (cost mode; no separate plan gate). The code review is cross-vendor
  (antigravity, grok or Kimi Code, whichever has room).
- Separate PR from #1516; branch from main. Low file overlap expected (rpc-handlers chat
  session files differ).
