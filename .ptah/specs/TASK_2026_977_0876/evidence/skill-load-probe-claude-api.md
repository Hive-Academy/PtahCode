# Skill load probe: claude-api lane

## Runtime

- CLI: Claude Code (Claude Agent SDK session)
- Model: claude-haiku-5-5 (Haiku 5.5)

## 1 Skill mechanism

Yes. This session has a native `Skill` tool. It takes a `skill` name and an optional `args` value. The session instructions also list the available skills by name and one-line description.

Skill names listed in the session instructions (32 names, in list order):

free-media-sourcing, general-video, hyperframes, hyperframes-animation, hyperframes-audio, hyperframes-cli, hyperframes-core, hyperframes-creative, hyperframes-keyframes, hyperframes-registry, hyperframes-studio, media-use, motion-graphics, product-launch-video, threejs-scene-craft, video-quality-bar, execute-phase-gated-task, frontend-design, init-saas, initialize-workspace, orchestrate, orchestrate-help, fleet-fix, review-code, review-logic, review-security, dataviz, simplify, loop, claude-api, run, security-review

Note: `agent-lanes` and `orchestration` are not in this list.

## 2 Load by name: agent-lanes

- Result: FAILURE
- Method: `Skill` tool, `skill: "agent-lanes"`, no other arguments.
- Error returned: `Skill agent-lanes is disabled for model invocation in skillOverrides settings`
- Description line: not available (the skill did not load).

## 3 Folders

Counts are the number of direct subfolders of each folder.

| Folder | Exists | Count | Location |
|---|---|---|---|
| .agents/skills | no | - | workspace |
| .claude/skills | yes | 22 | workspace |
| .github/skills | no | - | workspace |
| .cursor/skills | no | - | workspace |
| .codex/skills | no | - | workspace |
| .agents/skills | yes | 16 | home |
| .claude/skills | yes | 17 | home |
| .github/skills | no | - | home |
| .cursor/skills | no | - | home |
| .codex/skills | yes | 16 | home |

## 4 Load by path

- Result: SUCCESS
- Method: `Read` tool on `.claude/skills/agent-lanes/SKILL.md`, first 15 lines.
- Frontmatter `name`: `agent-lanes`
- Frontmatter `description`: `'Contract for background CLI agent lanes via the ptah_agent_* tools. Use when a task spawns or resumes a lane, or checks, messages, recovers or verifies one, even if it never names a tool, orchestration or tribunal. Load before any ptah_agent_spawn. This is the mechanic orchestration and tribunal load for lane work, not a substitute for the engineering workflow or for a multi-vendor panel.'`

## 5 Load by name: orchestration

- Result: FAILURE
- Method: `Skill` tool, `skill: "orchestration"`, no other arguments.
- Error returned: `Skill orchestration is disabled for model invocation in skillOverrides settings`

## Conclusion

Conclusion: loads by path only

Name-based loading is blocked by the `skillOverrides` setting for model invocation. Reading the `SKILL.md` file by path works, so the files are readable even though the native skill mechanism refuses them.
