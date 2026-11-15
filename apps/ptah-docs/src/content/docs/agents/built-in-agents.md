---
title: Built-in Agents
description: The empty built-in catalog and phase workflow in PtahCode.
---

# Built-in Agents

PtahCode no longer ships built-in agent roles. The [setup wizard](/setup/setup-wizard/) has no built-in agent templates to recommend or generate. You can create custom agents in `<workspace-root>/.claude/agents/`.

## Phase workflow

A feature runs through `plan`, optional `research` and `design`, `architecture`, `batch`, `implement`, `tests`, `review`, and `completion`. The `docs` phase prepares documentation and content. The `visual-review` phase uses browser tools. A phase can run on a subagent, CLI lane, or session.

Old role names remain phase aliases: `project-manager` maps to `plan`; `software-architect` maps to `architecture`; `researcher-expert` and `modernization-detector` map to `research`; `technical-content-writer` maps to `docs`; `ui-ux-designer` maps to `design`; `team-leader` maps to `batch`. Verification aliases also remain: `senior-tester` maps to `tests`; `code-style-reviewer` and `code-logic-reviewer` map to `review`; `visual-reviewer` maps to `visual-review`.

Custom agents with these names remain available for lane spawn. Existing generated agent files and history remain readable.

## Delegation and task state

The orchestrator spawns phase lanes, batch executors, and subagents. The `batch` phase recommends executors and checks batch evidence; the `completion` phase audits the finished task. Phase workers report evidence within their assigned scope. The orchestrator owns task status and user checkpoints.

When `ptah_*` tools are listed in a session, phase workers use them first. CLI work follows the [agent-lanes skill](/mcp-and-skills/skills/#skill-dependencies). See [Custom agents](/agents/custom-agents/) to create and manage workspace agents.
