---
id: TASK_2026_MARKETPLACE_CLI_IMPORT
status: backlog
type: FEATURE
title: Import MCP servers from Claude, Codex, agy and other CLIs in the Marketplace
description: >-
  GitHub #1503. Scan each installed CLI's MCP config and let the user import selected servers
  as Ptah install intents, so the gateway serves them to every provider. No native config writes.
depends_on: []
created: 2026-11-24T00:00:00.000Z
updated: 2026-11-24T00:00:00.000Z
---

## Description

Filed for later at the user's request (2026-11-24); not started. The full proposal, source table and
acceptance criteria are in GitHub issue #1503 and are copied below.

## Problem

Since #1500, Ptah's `ptah` MCP gateway serves every MCP server to main chat, cron runs and every CLI lane, and Ptah writes no provider MCP config files. Claude sessions run with strict MCP config (decision row 40 of TASK_2026_979), so they load only `ptah`.

Servers a user set up in a CLI's own config are therefore not available everywhere, unless the gateway already reads that file:

| Source | Readable | Served by the gateway today |
|---|---|---|
| Claude `~/.claude.json` (user and project scope) | yes | yes |
| Enabled Claude Code plugins' MCP servers | yes | yes |
| Codex `~/.codex/config.toml` `[mcp_servers]` | yes | no |
| agy / Gemini `mcp_config.json` | yes | no |
| Copilot and Cursor MCP config files | yes | no |
| claude.ai account connectors (e.g. Claude Docs) | names only, maybe | no; the sign-in lives in the claude.ai account |

The gateway also reads only the default `~/.claude.json`, not a named account's `$CLAUDE_CONFIG_DIR/.claude.json`.

## Proposal: "Import from your CLIs" in the Marketplace

1. **Scan.** Read each installed provider's MCP config: Claude (default and named config dirs), Codex, agy/Gemini, Copilot and Cursor. List every server found with:
   - its source file;
   - its transport (http, sse or stdio);
   - a duplicate badge when Ptah already has it (same URL, or same command and args);
   - any blocker, such as an unset `${VAR}` or an unsupported transport.
2. **Import.** The user ticks servers and presses Import. Each one is recorded as a Ptah install intent (`~/.ptah/mcp-installed.json`, global or workspace scope, user's choice), so the gateway serves it to every provider at once.
   - Header and env secrets go to Ptah's secret store, not the plain intent file.
   - A stdio server needs this explicit user action, so it also gets the approval that agent-installed stdio intents lack today (#1500 follow-up).
3. **Re-scan, not two-way sync.** A Re-scan button flags servers added to a CLI since the last import.
   - Ptah never writes back into native CLI config files. That was removed on purpose in #1500.
   - Imported entries are owned by Ptah from then on: toggle, remove and refresh in the Installed tab.

### Phase 2: claude.ai account connectors

These connectors live in the user's claude.ai account, and Ptah cannot reuse their sign-in.
- **Third-party connectors:** the import maps the connector to the vendor's public MCP endpoint, where one is known (the connector catalog). The user then signs in again through Ptah's OAuth.
- **Anthropic's own connectors** (e.g. Claude Docs): these stay Claude-only. The Marketplace says so.
- **To verify first:** what `claude mcp list` (or another supported route) exposes about account connectors.

## Acceptance criteria

- The Marketplace shows an Import section listing servers found in each installed CLI's config, with source, transport, duplicate and blocker information.
- Importing records Ptah intents. The gateway serves them in main chat, cron runs and every CLI lane (live check per provider).
- No native CLI config file is written or changed.
- Secrets are stored in Ptah's secret store.
- Re-scan reports only new or changed servers. Running Import twice creates no duplicates.
- Stdio imports require the explicit user click and are not started before it.

## Related

- #1500: the MCP gateway; the PR body lists the follow-ups this issue replaces.
- #1502: OAuth scope fix and the Higgsfield connector.
- Follow-ups from #1500 that are still separate: remove the unused `IMcpGateway.servedFileServerNames`; add user approval for agent-installed stdio intents. The second is partly covered here for imports.
