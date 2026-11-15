---
title: Built-in Agents
description: The built-in agent templates in PtahCode, their roles, and when to use each.
---

# Built-in Agents

PtahCode has 11 built-in agent templates for planning, review, research, design, and visual QA. The [setup wizard](/setup/setup-wizard/) selects the templates that apply to your project and writes them to `<workspace-root>/.claude/agents/`. Implementation work runs as the `implement` phase on a subagent, CLI lane, or session.

## The catalog

| Agent                        | Role                                                           | Reach for it when…                                               |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| **project-manager**          | Breaks work into tasks, tracks status, coordinates handoffs    | You have a vague goal and need it turned into actionable tickets |
| **software-architect**       | Designs systems, picks patterns, authors ADRs                  | You're starting a new module or making a cross-cutting change    |
| **team-leader**              | Recommends batch executors, verifies work, records batch state | A plan needs batches, executor recommendations, and review gates |
| **senior-tester**            | Unit, integration, and e2e test strategy                       | You need coverage for new code or a regression suite             |
| **code-style-reviewer**      | Lint, formatting, naming, idioms, readability                  | Pre-merge style pass or cleanup sprint                           |
| **code-logic-reviewer**      | Business logic, edge cases, state transitions, concurrency     | Critical paths, payment flows, auth, anything load-bearing       |
| **visual-reviewer**          | UI/UX visual bugs, responsive breakpoints, accessibility       | Verifying a UI change looks right across viewports and states    |
| **researcher-expert**        | Evaluates libraries, patterns, API docs, RFCs                  | Choosing a dependency or exploring an unfamiliar domain          |
| **modernization-detector**   | Spots outdated patterns, deprecated APIs, legacy idioms        | Before a refactor sprint or framework upgrade                    |
| **ui-ux-designer**           | Visual design, design systems, component specs                 | Creating landing pages, brand assets, design tokens              |
| **technical-content-writer** | Marketing copy, docs, blogs, video scripts                     | Release notes, launch pages, tutorials, API references           |

## Agent groups at a glance

### Planning & Leadership

`project-manager` → `software-architect` → `team-leader`

Use this trio when you're kicking off something non-trivial. The project manager writes the brief, the architect designs the approach, and the team leader supervises execution.

### Implementation

The `implement` phase covers backend, frontend, and operations changes. It runs on an assigned executor: a subagent, [CLI lane](/agents/cli-agents/), or session. Older records that name `backend-developer`, `frontend-developer`, or `devops-engineer` map to `implement`.

A custom agent with one of these retired names still maps to `implement` in routing. Lane spawn role resolution, mirror, and sync use the setup wizard origin store and matching workspace file hash, so user-authored or edited agents with these names remain available for lane spawn.
A provider copy is kept after its source is removed only when the workspace agent file proves it is an unchanged wizard-written agent.

### Quality & Review

`senior-tester`, `code-style-reviewer`, `code-logic-reviewer`, `visual-reviewer`

`visual-reviewer` adds a browser-based pass for UI work — responsive breakpoints, interaction states, and accessibility.

### Research & Design

`researcher-expert`, `modernization-detector`, `ui-ux-designer`, `technical-content-writer`

These specialists produce specs, briefs, reports, and content artifacts for the assigned executor.

## How agents are used

The model selects its own sub-agents. For a coordinated task, use [orchestration](/agents/agent-orchestration/). The team-leader recommends executors and next actions. The orchestrator spawns the agents.

## Delegation and task state

The orchestrator spawns sub-agents, batch executors, and phase lanes. Other eligible specialists may delegate focused sub-tasks to CLI lanes when lane mode is enabled or auto and the tools are available. **`team-leader`, `visual-reviewer`, and `ui-ux-designer` do not delegate to CLI lanes.** The team-leader spawns no agents at all.

Specialist templates receive a task-spec block for their assigned role: no task-ID allocation and no edits to `task.md` or `batches.md`. They report completion with evidence. The team-leader alone records batch states; task status belongs to the orchestrator, project-manager, and team-leader.

When `ptah_*` tools are listed in the session, templates use them first. If absent, they use native tools without probing for Ptah tools. CLI work follows the [agent-lanes skill](/mcp-and-skills/skills/#skill-dependencies).

## Customizing built-ins

Edit the agent file in `<workspace-root>/.claude/agents/`. The setup wizard overwrites a generated agent file in place when you run it again. See [Custom agents](/agents/custom-agents/) for the full flow.
