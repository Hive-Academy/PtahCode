---
title: Analyze current project
description: Let Ptah read your workspace and prepare project guidance.
---

**Analyze current project** is the Setup path for a project that already has code. Ptah reads your workspace and prepares project guidance. There are no built-in agent roles to recommend.

![Setup analysis overview](/screenshots/agents-setup-wizard.webp)

## When to run it

- The first time that you open a project in Ptah.
- After a large change to the stack of the project.
- When you want to refresh project guidance against the current code.

## Start the analysis

1. Click **Setup** in the tab bar.
2. On the **Analyze current project** card, click **Start analysis**.

## The steps

A stepper at the top of the page shows where you are.

### 1. Analyze workspace

Ptah scans the workspace and detects the stack. It shows the progress of each phase. You can leave the page: the analysis keeps running. Earlier results appear under **Saved analyses**.

### 2. Choose agents

The built-in catalog is empty. Custom agents in `.claude/agents/` remain available.

### 3. Generate agents

Built-in generation is unavailable while the catalog is empty. Custom-agent generation remains available through its own workflow.

### 4. Project guidance

Ptah shows the **Detected stack** and writes project guidance. The page shows the **Generated guidance**.

### 5. Done

A summary of what happened, with any items that need attention.

## Run only one part

The **Analyze current project** card also has two links:

- **Only generate agents** — review the empty built-in catalog.
- **Only regenerate guidance** — write the project guidance again.

## What gets written

Custom agents are Markdown files with YAML frontmatter in `.claude/agents/`:

```
<workspace-root>/
  .claude/
    agents/
      reviewer.md
      ...
```

:::tip
Commit `.claude/agents/` to source control. Your team then gets the same agents, and pull requests can review prompt changes.
:::

## Analyze current project or AI team builder

**Analyze current project** scans the workspace and prepares guidance. The [AI team builder](/setup/ai-team-builder/) lets you describe a custom team and tune agents, skills, prompts, and MCP servers.
