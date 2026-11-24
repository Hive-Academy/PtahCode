# Context — TASK_2026_2307_1d64

Worktree: `/home/amun/ptah-extension/.claude-worktrees/fix-settings-providers-polish-c6e14c260bd3`
Branch: `fix/settings-providers-polish`. Host: Electron (renderer `apps/ptah-extension-webview`,
code in `libs/frontend/chat/src/lib/settings/**`, `libs/frontend/core`).

## User request (verbatim intent, 2026-11-22)

After the large Providers settings refactor, these defects and tweaks remain:

1. **Select chevron under the select.** In the "Reassign main agent" popover the chevron of the
   "Provider connection" and "Save to" selects renders on a line below the select, not inside it.
2. **`CLI agent` badge position.** In the CLI agents table the `CLI agent` badge sits next to the
   name. Move it to the second line, next to the version number.
3. **Memory curator / Enhancement dropdown icon.** The provider icon inside the dropdown trigger
   is not aligned (sits high and left of the label).
4. **Connect provider catalog modal is useless.** "Connect provider" opens a catalog modal
   ("Search providers") whose rows only redirect to the sidebar wizard, which shows the same
   provider list again in step 1. Open the sidebar wizard directly. (User-requested removal.)
5. **Discard confirmation.** Closing the wizard sidebar shows an inline "Discard this setup?"
   block at the top of the sidebar. It must be a modal dialog shown over the sidebar.
6. **Show API key.** The "Show API key" text button below the input must be an icon button at
   the end of the input.
7. **Main agent section.** The Provider / Model / Effort rows with the "Change main agent"
   button: user asks for a better presentation and for our recommendation.
8. **Dropdown sync.** Provider and model dropdown values do not sync correctly, especially when
   the user chooses the Memory curator or Enhancement models.
9. **"All capabilities" layout break.** Expanding "All capabilities" in a CLI agent row breaks
   the grid: some cells (Ask, Yolo) collapse to one-character-wide columns.
10. **Settings sidebar polish.** The left settings navigation needs refinement (spacing,
    hierarchy of "Decision matrix" child, footer block, status dot).

## Gate 0.1

- Preference source: memory (`cli-lane-context-handoffs`): CLI lanes first-class, Codex
  implementation lane where available, Claude subagents as fallback.
- Mode: `enabled`. Approval mode: `lane-review`.
- `ptah_agent_list` (2026-11-22): codex installed, confirmed room (Weekly 5%). antigravity
  installed, limit unknown. grok installed, no usage source. claude installed, not tracked.
  Ollama Code and kimi code AT LIMIT. copilot disabled. cursor, opencode, pi not installed.

## Flow

inventory (architecture, inventory-only) → design (items 4, 5, 7, 10) → Gate 1.7 → batch →
implement → review → visual-review → completion.
