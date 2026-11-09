# Context — TASK_2026_MCP_AUTH_REJECT

- Worktree: `D:\projects\ptah-extension\.claude-worktrees\mcp-auth-reject` (branch `fix/mcp-auth-reject` from `main`)
- Recovery: `task.md` was moved from the main checkout into this worktree (cmp identical, then removed from main).
- Type: BUGFIX. Depth: Partial. Flow: research (investigation) → team-leader → implement → QA.

## Gate 0.1 — CLI lanes

- Preference source: user global CLAUDE.md ("delegate heavily to CLI agent lanes, prefer non-Claude vendors")
  plus memory `orchestration-executor-preference` (lanes-first, codex first). Older memory
  `cli-lane-token-burn` (disable lanes) is superseded by the current global CLAUDE.md instruction.
- Mode: `enabled`. Approval mode: `lane-review`.
- `ptah_agent_list` rows at start (2026-11-08 ~23:33 UTC):
  - codex (cli, codex): installed, confirmed room (Weekly 59%).
  - antigravity (cli, antigravity): installed, limit unknown (reader failed).
  - claude (cli, claude): installed, not preferred (same Claude usage).
  - grok: AT LIMIT (resets 2026-11-12 20:04 UTC).
  - Glm (ollama-cloud): AT LIMIT weekly (resets 2026-11-09 00:00 UTC).
  - kimi code: AT LIMIT monthly (resets 2026-11-25 00:00 UTC).
  - copilot, opencode: disabled. cursor, pi: not installed.

## Lane runs

- 87f27e35 codex researcher-expert: delivered investigation.md (4m 29s).
- b764cf06 codex backend-developer: delivered implementation-report.md, then stopped by Ptah agent budget
  (3,000,000 weighted tokens) after 23m 42s. Resume refused. Remaining work (verification) taken by the orchestrator.
  Its test failures came from a missing node_modules junction in this worktree; orchestrator added the junction.
- ea244dd9 antigravity code-logic-reviewer: delivered code-logic-review.md, REVISE 5/10.
- Fix round (F1, F5, F7) done by the orchestrator (decision 11).
- 6d8186df antigravity code-logic-reviewer: delivered code-logic-re-review.md, APPROVED 8/10.
