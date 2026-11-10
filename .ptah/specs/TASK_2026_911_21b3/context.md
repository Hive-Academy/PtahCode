# TASK_2026_911_21b3 — context

## Request (user, verbatim)

"nothing should ever completely interrupt an agent session like so, if its limit reach it should
be auto handing off the session systematically".

## Evidence (2026-11-09/10)

- Child sessions 25bf7448 (TASK_2026_901) and 201dfd7b (P2 Git dock) ended `timed-out`:
  "exceeded the 120-minute runtime cap (agentSessions.maxRuntimeMinutes)". Both were mid-task
  (waiting on a scoped verify, lanes still running). Uncommitted work stayed in the worktree; the
  codex lanes they owned lost their parent.
- Child session ff1fe72e (TASK_2026_904 Wave 1) ended at 111 min with "ended outside the
  spawner: stop button, error or teardown" while running a foreground typecheck.
- Code: `libs/backend/cli-agent-runtime/src/lib/session-children/session-child-settings.ts`
  (`SESSION_CHILD_MAX_RUNTIME_MINUTES` fallback 120, max 720) and `session-spawner.service.ts`
  (`armRuntimeCap` ~1372, `onRuntimeExceeded`, timeout text ~961). Existing `/session-handoff`
  skill and `ptah_session_handoff` / `ptah_session_handoff_ack` MCP tools.

## Expected outcome

1. `investigation-report.md`: root cause of the runtime cap stop and the "ended outside the
   spawner" path.
2. Design + implementation: a limit never hard-stops a session mid-work. Warn ahead of the cap,
   let the child finish its step and write HANDOFF.md, start a successor session automatically
   (same worktree, task folder, lane ownership and completion routing), notify the parent. A
   hard stop stays only as a last-resort safety net after a failed handoff and never discards
   work.
3. Specs for the new behavior, Electron first.

## Gate 0.1 — execution

- Preference source: explicit parent instruction (delegate to non-Claude CLI lanes).
- Mode: lanes `enabled`. Approval: plan reported to the parent session; proceed after 10 minutes
  without an answer.
- `ptah_agent_list` (2026-11-10 04:14 UTC): Glm (ollama-cloud) confirmed room; codex near limit
  (Weekly 91%); grok and kimi code AT LIMIT; antigravity unknown; copilot/opencode disabled.
- Primary lane: Glm. Review family: codex (different family) if room remains, else antigravity.

## Lane limits (this run)

- 2026-11-10 04:24 UTC: Glm (`ptahCliId` `pc-355b645d-35af-4974-84cf-9cf961ea0164`, family
  ollama-cloud) refused the B1 spawn: usage limit, session window 100%, reset 07:00 UTC. Not
  forced. Fallback for B1: codex (other family, weekly 91%).
- 2026-11-10 04:30 UTC: antigravity (`cli` antigravity, family antigravity) failed the B3 spawn
  after 9 s: `RESOURCE_EXHAUSTED (429) Individual quota reached`, reset in about 134 h
  (2026-11-15). Fallback for B3: codex. All implementation is codex now, so the review family
  is Glm after its 07:00 UTC reset.
- The investigation lane (Glm 722201e3) was stopped at the agent budget (3,000,000 weighted
  tokens); its deliverable was complete (verdict `delivered`).

## Lane state (resume point)

- B1 codex f0adaa92: delivered (`batch-1-report.md`), not verified.
- A host restart (about 04:35 UTC) stopped B2/B3/B4 (`stopReason: host-restart`) with partial
  edits on disk and skeleton reports. Resumed 2026-11-10 05:27 UTC on the same CLI sessions:
  - B2 agent `1986ace0-5b37-43fc-a790-ea6b58681462`, CLI session `01a1c3ba-6bbf-7c53-8cee-fa13d6c9da7f`
  - B3 agent `32b7c87b-133e-49eb-b839-0621ad58de48`, CLI session `01a1c3ba-1412-7ba1-b292-d0d80cf3b040`
  - B4 agent `c702e821-bc7d-42bb-822f-e0d46974948b`, CLI session `01a1c3b9-61cf-7440-ae05-9e264650187a`
- Next: read reports + diff, `npm run verify -- -p cli-agent-runtime,vscode-lm-tools,agent-sdk,
  rpc-handlers,gateway-chat-bridge,shared` (+ projects B4 names), Glm review after 07:00 UTC,
  commit, push, PR against `main`, report URL + head SHA to the parent.
- Nothing is verified or committed.

## Flow

BUGFIX, Full depth: investigation lane → plan (`implementation-plan.md`) → report to parent →
implementation lanes → scoped verify (orchestrator) → independent review → PR.

## Lane limits (2026-11-10 05:46 UTC)

- grok (family grok): usage balance exhausted (HTTP 402), reset unknown. Review lane dd53b35b failed in 20 s. Skip grok for this run.
- Glm (family ollama-cloud): session limit, resets 07:00 UTC. It is the review lane after the reset.
- kimi code: monthly limit, resets 2026-11-25.
