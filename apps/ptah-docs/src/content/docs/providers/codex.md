---
title: OpenAI Codex
description: Use your ChatGPT plan through OpenAI Codex in Ptah.
sidebar:
  order: 4
---

# OpenAI Codex

The OpenAI Codex connection gives Ptah access to GPT models through your OpenAI Codex (ChatGPT) plan. Codex can be the main agent, and it can run as a CLI agent lane.

## What you need

- A ChatGPT plan that includes Codex.

Ptah includes its own copy of the Codex CLI. You need an installed Codex only if you sign in with a plain `codex login` command in a terminal.

## Connect

1. Open **Settings → Providers**.
2. Click **Connect provider**, then **Connect** next to **OpenAI Codex**.
3. Click **Sign in with Codex**.
4. Approve the sign-in in your browser.

## Agent behavior

The **Credentials** tab of the OpenAI Codex connection has an **Agent behavior** section, below the sign-in block. The section shows also when Codex is not signed in.

To open it:

1. Open **Settings → Providers**.
2. Open the **OpenAI Codex** connection.
3. Click the **Credentials** tab.

### Codex web search

**Codex web search** (`agentOrchestration.codexWebSearch`, default on) lets Codex agents search the web. A change applies when the next Codex lane starts.

Codex CLI lanes use the global **Tool output size** for each tool result and compact at floor(**Budget warning ratio** × **Agent handoff context**). See [Context budgets](/settings/context-management/#context-budgets).

### Codex sandbox

**Codex sandbox** sets the sandbox mode for all new Codex chat turns and Codex CLI lanes.

| Mode | What Codex can do |
| ---- | ----------------- |
| **Read only** | Read files. It cannot change files or use the network |
| **Workspace write, no network** | Change files in this workspace. Network access is disabled where the platform supports it |
| **Workspace write with network** | Change files in this workspace and use the network |
| **Full access** (default) | Read and change files outside this workspace and use the network, with no sandbox protection |

:::caution
With **Full access**, commands can affect your computer. Use it only for runs that you trust. When you change to **Full access** from another mode, PtahCode asks you to confirm. Click **Use full access** to confirm.
:::

On Windows, the workspace-write modes block child processes, so some build and test tools cannot run. Network blocking on Windows is not complete.

For runs that PtahCode starts, this setting takes precedence over `~/.codex/config.toml`. A change applies from the next turn. A turn that is already running keeps its sandbox. **In effect** shows the mode that is in use.

Approval prompts in Codex chat still follow your permission level. Codex CLI lanes run without approval prompts.

## Codex as a CLI agent

When Codex runs as a sub-agent lane, its model and reasoning effort come from the **CLI agents** matrix on the Providers tab. Click the model or effort cell of the Codex row to change it. These settings are stored in `~/.ptah/settings.json` as `agentOrchestration.codexModel` and `agentOrchestration.codexReasoningEffort`. An empty value uses the default.

`agentOrchestration.codexAutoApprove` (default `true`) lets the Codex CLI approve its sandbox operations without a prompt. Set it to `false` to approve them yourself.

## Verify that it works

1. Open a chat.
2. Select a Codex model.
3. Send a prompt that needs some reasoning.
4. Make sure that the response streams. The [Execution Tree](/chat/execution-tree/) shows the thinking steps.

## Troubleshooting

- **Sign-in fails** — your ChatGPT plan must include Codex.
- **Codex is not available as a sub-agent** — make sure that `codex` is not in `agentOrchestration.disabledClis`.
