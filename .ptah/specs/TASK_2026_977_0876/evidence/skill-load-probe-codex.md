## Runtime

- CLI: Codex
- Model: GPT-6

## 1 Skill mechanism

No native skill invocation mechanism or supplied skill list is available in this session. A Ptah skill inventory search tool is present, but its own description says its results are not the set of skills invocable through a Skill tool. No Skill tool is available. Skill names from a supplied list: none.

## 2 Load by name: agent-lanes

Failure. There is no native skill loader with which to invoke `agent-lanes` by name, so no description line was loaded by name.

## 3 Folders

Counts are immediate child directories of each skills folder.

| Folder | Exists | Count | Location |
| --- | --- | ---: | --- |
| `.agents/skills` | No | 0 | Workspace |
| `.claude/skills` | Yes | 22 | Workspace |
| `.github/skills` | No | 0 | Workspace |
| `.cursor/skills` | No | 0 | Workspace |
| `.codex/skills` | No | 0 | Workspace |
| `.agents/skills` | Yes | 16 | Home |
| `.claude/skills` | Yes | 17 | Home |
| `.github/skills` | No | 0 | Home |
| `.cursor/skills` | No | 0 | Home |
| `.codex/skills` | Yes | 16 | Home |

## 4 Load by path

Success. Read the first 15 lines of `.claude/skills/agent-lanes/SKILL.md` by path. Frontmatter values:

- `name`: `agent-lanes`
- `description`: `Contract for background CLI agent lanes via the ptah_agent_* tools. Use when a task spawns or resumes a lane, or checks, messages, recovers or verifies one, even if it never names a tool, orchestration or tribunal. Load before any ptah_agent_spawn. This is the mechanic orchestration and tribunal load for lane work, not a substitute for the engineering workflow or for a multi-vendor panel.`

## 5 Load by name: orchestration

Failure. There is no native skill loader with which to invoke `orchestration` by name.

## Conclusion

loads by path only

The requested skill file was readable by path, but this session provides no native way to load a skill by name.
