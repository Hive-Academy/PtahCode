# Task Context - TASK_2026_977_0876

## User Request

Final request (2026-11-12):

> awesome so lets convert this into a well defined task for us to work on phase by phase , but you
> agree with me that agent generation and subagents shouldn't be a thing afterwards , right ?

The request closes a discussion of eight messages. The direction the user gave, in their words:

- "models has become powerful enough and barely needs our subagents anymore and we ourselves are
  utilizing more of cli tools and child sessions for tasks and barely call for a specific subagent"
- "the orchestration workflow ... should not be tightly coupled with subagents as it explains a
  workflow where we plan, design, batch, implement, test, review ... the concept of certain
  developer titles doesn't make sense anymore"
- "its better to deal with everything as a session as it makes agent to agent communication a
  breeze and users can easily also talk to it and steer"
- "we retire subagent one by one and let our workflow uses the new enhancements"
- "if we moved to skill we won't need to generate any by hand as most of the frameworks, libraries
  and others has their own set of skills, and we do integrate with skills.sh"
- "the sole job for team leader is to split the implementation plan into executable tasks with
  batches which could be easily be a phase, same as the design and visual review"
- "the never on a lane rule i made it myself because only claude has a good taste, but its not
  suppose to be a blocker in any kind"
- The workflow must become general: "for any kind of task the user want to do".

## Task Type

FEATURE (program of several phases; each phase is delivered as its own child task and pull request)

## Complexity

Complex

## Strategy

- Depth: Full.
- This task is the program carrier. Its deliverable is the definition in `task-description.md`.
- No code changes in this task. Each program phase starts as a child task
  (`parent: TASK_2026_977_0876`) in its own worktree from `main`, with its own plan, review and PR.
- Flow for this task: definition (orchestrator) → cross-side document review (CLI lane) →
  Gate 1 with the user → commit → push → pull request.
- First phase after approval: Program Phase 0 (parity inventory and open points).

## Program Phases

The session that changes the state of a phase updates its row in the same pull request.

| Phase | Name | Task ID | Pull request | State |
|---|---|---|---|---|
| 0 | Parity inventory | - | #1131 | merged |
| 1 | Phase contract | - | #1147 | merged |
| 2 | Executor neutrality | TASK_2026_1161_9efb | #1174 | merged |
| 3 | Setup skills by stack | - | #1185 | merged |
| 4 | Retire role subagents | TASK_2026_1175_2690 | #1267 (step 0a) | in review |
| 5 | Remove agent generation | - | - | not started |
| 6 | General workflow | - | - | not started |

Bots (Phase 7) is a separate task after the program (U-D8).

## CLI Lanes

Gate 0.1 (2026-11-12):

- Preference source: the user's global instructions ("delegate heavily to CLI agent lanes", prefer
  non-Claude vendors).
- Mode: `enabled`.
- Approval mode: `lane-review`, but Gate 1 for this task escalates to the user because the
  definition proposes removals (agent generation, subagent sync, the 14 role templates).
- `ptah_agent_list` rows:

| Lane | Family | State |
| --- | --- | --- |
| codex | codex | installed, confirmed room (Weekly 19%) |
| antigravity | antigravity | installed, limit unknown (reader failed; 429 quota earlier in this session) |
| grok | grok | AT LIMIT until 2026-11-12 20:04 UTC |
| Glm (ptah-cli) | ollama-cloud | AT LIMIT until 2026-11-16 |
| kimi code (ptah-cli) | kimi-code | AT LIMIT until 2026-11-25 |
| Claude Api (ptah-cli) | anthropic-api | available, limits not tracked |
| claude | claude | installed, limits not tracked (same usage as the main session) |
| copilot, opencode | - | disabled |
| cursor, pi | - | not installed |

- Document reviewer for this task: `codex` (the only lane with confirmed room, other family than
  the author).

## Conversation Summary

1. Research of three external products (Grok Bot, OpenAI dots, Claude Duet). Common pattern:
   identity, direct conversation, memory, triggers, approval rules, delegation. Copies of the lane
   reports are in `evidence/`.
2. First executor comparison relied on lane claims and was partly wrong. The user corrected it. The
   corrected facts are in `task-description.md` § Evidence.
3. Agreed model: phase (what the workflow needs), skill (knowledge, from a registry by tech stack),
   project guidance (facts of one repository), bot (identity for the persistent case only, later).
4. Agreed end state (user decision, 2026-11-12): agent generation and the role subagents are not
   product concepts after this program. This replaces the earlier statement "i don't want to delete
   or remove what we have": capabilities are preserved through the parity inventory, the mechanisms
   are retired.
5. Open item outside this task: removal of the `fastify-best-practices` and `vitest` skills. Their
   source is in `~/.ptah/user/skills`, so the user must uninstall them in the app or approve a
   manual delete.
