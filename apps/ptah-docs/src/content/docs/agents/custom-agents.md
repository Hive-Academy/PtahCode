---
title: Custom Agents
description: Create and edit your own agents in PtahCode.
---

# Custom Agents

A custom agent records how your team works. You can create and edit a specialist.

## Where custom agents live

Each agent is a Markdown file in:

```
<workspace-root>/.claude/agents/
```

Commit this folder to source control so that your team uses the same agents.

## Anatomy of an agent file

```markdown
---
name: api-contract-reviewer
description: Reviews OpenAPI specs for consistency, versioning, and breaking changes.
model: sonnet
---

# API Contract Reviewer

You are a senior API designer. Audit OpenAPI and JSON Schema files
for backwards compatibility and naming consistency.

## Output format

Return a markdown table with: path, issue, severity, suggested fix.
```

### Frontmatter fields

| Field         | Required | Description                                                     |
| ------------- | -------- | --------------------------------------------------------------- |
| `name`        | Yes      | Unique ID in the workspace.                                     |
| `description` | Yes      | Tells the model when to use the agent.                          |
| `model`       | No       | The model for this custom agent. |

## Create a custom agent

1. Create a Markdown file in `.claude/agents/`.
2. Add the frontmatter and the system prompt.
3. Save the file.

## Edit a custom agent

Edit the file in `.claude/agents/`. Workspace analysis leaves your agent files in place.

## Share agents

- **For a project**: commit `.claude/agents/` to the repository.
- **For other CLIs**: PtahCode copies your agents into the agent folders of other CLIs. Refer to [Syncing agents to CLIs](/agents/syncing-to-cli/).

## Test a change

After you edit a prompt, start a new chat and ask a typical question. Make sure that:

- The agent stays in its role.
- The tool use is as expected.
- The output format matches your instructions.

If the agent drifts, add explicit "Always" and "Never" rules and an example to the prompt.
