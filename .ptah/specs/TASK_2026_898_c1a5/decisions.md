# Decisions — TASK_2026_898_c1a5

| # | Decision | Evidence | Reversible |
|---|---|---|---|
| 1 | Type FEATURE, depth Full | New commands, hooks, workflow; spans skills, session backend, skill-synthesis, task tracking. `ptah_route_decide` pre-flight timed out (fallbackCause timeout) → skill table. | yes |
| 2 | One task, two phases: Phase A handoff close, Phase B task lifecycle + close-out | User said handoff close comes first; both are lifecycle hygiene. | yes |
| 3 | Task folder created by hand in the worktree (`ptah_task_create` schema has no `worktreePath`) | CLAUDE.md forbids task files in main checkout. | yes |
| 4 | Lanes `enabled`, approval `lane-review`; PM by codex lane, Gate 1 review by in-process reviewer | User global CLAUDE.md: prefer non-Claude lanes. Opposite-side review rule. | yes |
| 5 | Interpretation: "make skill trajectory learning manual" = stop automatic synthesis/harvest triggers; run on explicit invocation (close-out workflow, command, or UI) | User wording; to be confirmed by PM as scope. | yes |
| 6 | Worktree/branch removal in close-out stays gated by user authorization unless the user approves auto-removal | CLAUDE.md git rules; user-reserved (removal, irreversible). Raised at Gate 1. | yes |
| 7 | Gate 1 APPROVED (orchestrator in-process review of codex PM output; user answered open questions) | task-description-review.md | yes |
| 8 | USER: worktree/branch auto-removal = opt-in setting, off by default; removes only when worktree is clean and branch is merged; otherwise cleanup is reported pending for per-task approval | User answer at Gate 1 | yes |
| 9 | USER: on ack, close the predecessor exactly as if the user closed it by hand (same code path as a manual close). No delete, no archive, no new group. Lineage stays visible via the session tree in the stats sidebar | User answer at Gate 1 | yes |
| 10 | Gate 2 APPROVED after 1 revise round (lane-review mode, opposite-side review) | implementation-plan-review.md | yes |
| 11 | Automatic memory curation on Stop/boot is kept; only skill harvest on Stop becomes explicit | Review finding 1; requirements AC 8 scope | yes |
| 13 | A3 scope expanded: `ptahAPI.session.acknowledge` via `session-namespace.builder.ts` + `types.ts`; predecessor closer = host→UI correlated request (`sessionHandoff:closePredecessor {requestId, predecessorTabId, predecessorSdkId}`) answered by UI RPC `session:handoffCloseResult {requestId, closed}`; host closer awaits with timeout → `false` (→ retryable-failure); closer registered in the Electron composition root. UI side stays A4 and uses the ordinary `closeTab` path (decision 9) | A3 lane report: no awaitable host→UI path exists, closer token unregistered, namespace outside scope. Grep: no request/response host→UI helper in libs | yes |
| 12 | Team-leader decomposition runs as a codex lane (role team-leader), not a Claude subagent | User global CLAUDE.md: save Claude usage | yes |
