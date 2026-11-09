# TASK_2026_898_c1a5 — Context

## User request (verbatim intent)

1. **Handoff close (do first).** A session handed off with `/session-handoff` stays in the
   "done" section of the sessions list and causes confusion. Once the new session
   acknowledges the handoff, close the old session completely. Provide a command similar to
   the handoff document flow (e.g. an acknowledge/close step).
2. **Task status hygiene.** `task.md` must carry the right status: `in_review` when a PR is
   opened for the task.
3. **Post-merge close-out.** After review and merge, the agent invokes a close-out workflow in
   the background, driven by hooks (or whatever mechanism fits): worktree cleanup, skill
   learning and memory extraction.
4. **Skill-trajectory learning becomes manual/explicit.** Instead of automatic synthesis on
   turn-complete/boot, learning runs on explicit calls — the close-out workflow is one caller.
   Other manual work gets proper hook points (e.g. "agent cleaned up a task").

## Prior evidence (from memory + repo)

- Spec harvester: `libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts`, runs
  automatically on turn-complete and boot; skips tasks whose status is not `done`.
- TASK_2026_878_5513 fixed harvest reconciliation (marker v3).
- Orchestration skill ends at "PR open, CI/reviews watched"; no post-merge phase.
- CLAUDE.md keeps worktree/branch until the user authorizes cleanup — close-out cleanup must
  respect that (user-reserved: removal of worktrees/branches).
- Handoff skill: `.claude/skills/session-handoff/` + `ptah_session_handoff` tool.

## Execution

- Worktree: `D:\projects\ptah-extension\.claude-worktrees\task-lifecycle-closeout`,
  branch `feat/task-lifecycle-closeout` from `main`.
- Type FEATURE, depth Full. Flow: PM → architect → team-leader → implement → QA.
- Gate 0.1: preference source = user global CLAUDE.md ("delegate heavily to CLI lanes, prefer
  non-Claude vendors"). Lane mode `enabled`. Approval mode `lane-review`.
- `ptah_agent_list` (2026-11-09): codex installed, confirmed room (weekly 61%);
  Glm (ollama-cloud, pc-355b645d-…) confirmed room; antigravity installed, limits unknown;
  grok AT LIMIT (resets 2026-11-12); kimi code AT LIMIT (resets 2026-11-25);
  copilot/opencode disabled; cursor/pi not installed; claude installed (avoid: same usage).
- `ptah_route_decide` pre-flight timed out → skill table used.

- 2026-11-09 02:48Z: lane Glm (ptahCliId pc-355b645d…, family ollama-cloud) usage limit hit, reset unknown. Phase A review lane 7c97eb9a stopped on agent budget with no deliverable. Skipping Glm for the rest of this run. Phase A review moves to grok (backend) and antigravity (UI), both with unknown limit state. Codex is excluded as the implementer family.
- 2026-11-09 02:50Z: grok lane (family grok) failed after 10 s with 0 tool calls. Its row shows Weekly 100%, resets 2026-11-12 20:04 UTC. Skipping grok. The backend review waits for the antigravity lane to free up (same family as the UI review, different from the codex implementer).
