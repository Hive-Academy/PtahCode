# Incident: production subagent handoff stop with no usable handoff (2026-11-07)

Source: cross-session report from session "agent-messaging phase 3" (production Ptah app).
Trigger: ~/.ptah/settings.json `compaction.subagentHandoffTokens` was lowered 400000 -> 150000 at ~14:58 UTC
(this task, on the user's request). Before that, no subagent reached the limit.

## Timeline (UTC)

1. ~15:40 background Agent-tool subagent `backend-developer` (agentId aca7f237f94cf5152), worktree
   `.claude-worktrees/lane-output-restore`, finished its first task (77 tool uses, ~59 min, ~141k tokens).
2. ~16:33 parent resumed it with SendMessage for a review fix, so it started near 141k context tokens.
3. 16:47:26 SubagentBudgetMonitor stopped it at 150,166 context tokens (limit 150,000), mid-edit
   (last text: "Now rewrite the helper in `lane-restore.ts`.").
4. Task notification: status `killed`, "stopped by user". The user did not stop it.
5. No progress notes file (`.ptah/subagent-handoffs/toolu_01AmZ1Cw8ZWTfbp1bLkDzFtn.md` missing).
   The handoff record `20261107T164726046Z-...-a7bace07.handoff.md` holds only the original brief.
6. An "INTERRUPTED AGENTS" reminder advised "resume (cache warm, context within budget)", but
   SendMessage failed: "was stopped by the user and won't be resumed".
7. The edit was complete on disk; the parent verified and committed it. No work lost this time.
8. Right after the stop, two of the parent's own Bash/Read calls were refused with
   "The user doesn't want to take this action right now". The user did not refuse them.

## Candidate defects (not yet confirmed in code)

| # | Defect | Expected |
|---|---|---|
| 1 | Budget stop is attributed to the user ("stopped by user", status `killed`) | Attributed to Ptah's budget monitor, with reason `handoff` / `safety` |
| 2 | Near-budget notice is at most one per subagent at 85%; a subagent resumed above 85% gets no new notice | A notice on resume when the context is already above the warning ratio |
| 3 | No progress notes; the handoff record holds only the original brief | The record holds the latest progress (last assistant text, files touched) even without notes |
| 4 | "Resume, cache warm, within budget" advice for a stopped agent that cannot resume | No resume advice for a budget-stopped agent; advise a new agent from the handoff record |
| 5 | Resuming an agent near the limit puts it over the limit on the first turn | A warning or a refusal with guidance when the parent resumes an agent above the warning ratio |
| 6 | Parent tool calls refused with "The user doesn't want to take this action" after the stop | Not refused, or refused with the true cause |
