# Decisions — TASK_2026_2320_lnpar

| # | Date | Decision | Evidence | Source | Reversible |
|---|---|---|---|---|---|
| 1 | 2026-11-23 | Type FEATURE, depth Full | task.md type FEATURE; XL estimate; three goal areas | orchestrator, rule table | yes |
| 2 | 2026-11-23 | Lanes disabled, approval mode `user` | no ptah_* tools listed in this session | orchestrator, Gate 0.1 | yes |
| 3 | 2026-11-23 | parity-inventory.md required | lane composer is redesigned (agent-steer-input replaced) | SKILL.md § Task folder | no |
| 4 | 2026-11-23 | Document reviews run same-side (Claude subagent) | no other execution side available; weaker-evidence label | agent-lanes §6 fallback | yes |
| 5 | 2026-11-23 | User replied "approved" to the strategy/gate-setup notice (not Gate 1; task-description.md not yet written) | user message | user | yes |
| 6 | 2026-11-23 | Gate 1 APPROVED by user (revision 1); SDK sub-agent unified look = follow-up task | user message | user | yes |
| 7 | 2026-11-23 | Lane "Send options" chevron dropped; lanes use Ctrl+Enter + queued-card Send now like main chat (parity A row = move, user-approved) | design-spec-review.md finding 2 | user (AskUserQuestion) | yes |
| 8 | 2026-11-23 | Lanes get main chat's compact bar / type-to-expand unchanged; no 40px inspector variant | design-spec-review.md finding 4; parity D "expose" | user (AskUserQuestion) | yes |
| 9 | 2026-11-23 | Fix QueuedFollowUps contrast in the shared component (Queued label -> base-content, note -> state-need ink); main chat look changes, verify both Anubis themes in Electron visual review | design-spec-review.md OQ2 recommendation | user (AskUserQuestion) | yes |
| 10 | 2026-11-23 | Req 1.10 exception: Send keeps native `disabled` (not focusable), matching main chat; reason announced via aria-live status line | design-spec-review.md N2; "identical" intent; decision 7 | orchestrator (evidence) | yes |
| 11 | 2026-11-23 | Gate 1.7 APPROVED by user; OQ5 resolved: agy stream-json is removed in parallel task TASK_2026_2322_4ba4; this task supports agy via ACP only | user message | user | no |
| 12 | 2026-11-23 | Full auto: Gate 2 approved by orchestrator on an APPROVED review; merge authorised by user; `--admin` only on a fresh ask | user message; memory pr-merge-authority | user | yes |
