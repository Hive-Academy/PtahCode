---
title: Built-in Agents
description: The active built-in agent and the phase workflow in PtahCode.
---

# Built-in Agents

PtahCode ships the `team-leader` agent template. The [setup wizard](/setup/setup-wizard/) can write it to `<workspace-root>/.claude/agents/`. Planning, architecture, research, documentation, design, implementation, tests, review, and visual review run as phases on a subagent, CLI lane, or session.

## Active agent

| Agent | Role | Use it when |
| --- | --- | --- |
| **team-leader** | Recommends batch executors, verifies work, and records batch state | A plan needs batches and review gates |

## Phase workflow

A feature can run through `plan` -> optional `research` / `design` -> `architecture` -> `team-leader` -> `implement` -> `tests` and `review`. The `docs` phase prepares documentation and content. The `visual-review` phase uses browser tools.

Old role names remain phase aliases: `project-manager` maps to `plan`; `software-architect` maps to `architecture`; `researcher-expert` and `modernization-detector` map to `research`; `technical-content-writer` maps to `docs`; `ui-ux-designer` maps to `design`. Verification aliases also remain: `senior-tester` maps to `tests`; `code-style-reviewer` and `code-logic-reviewer` map to `review`; `visual-reviewer` maps to `visual-review`.

Custom agents with these names remain available for lane spawn. The origin store and matching workspace file hash identify unchanged wizard agents for retirement; user-authored or edited agents remain available.

## Delegation and task state

The orchestrator spawns phase lanes, batch executors, and subagents. The team-leader recommends executors and records batch states in `batches.md`; it does not spawn agents. Phase workers report evidence within their assigned scope. The orchestrator owns task status and user checkpoints.

When `ptah_*` tools are listed in a session, templates use them first. CLI work follows the [agent-lanes skill](/mcp-and-skills/skills/#skill-dependencies).

## Customizing the built-in

Edit the agent file in `<workspace-root>/.claude/agents/`. The setup wizard overwrites a generated agent file in place when you run it again. See [Custom agents](/agents/custom-agents/) for the full flow.
