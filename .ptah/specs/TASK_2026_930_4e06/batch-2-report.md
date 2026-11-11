# Batch 2 Report - TASK_2026_930_4e06 (Renderer)

## Status
Completed

## Files Changed

- [`libs/frontend/chat-types/src/lib/chat-types.ts`](file:///D:/projects/ptah-extension/.claude-worktrees/feat-cli-tier-map-fb3792312cff/.claude-worktrees/cr/libs/frontend/chat-types/src/lib/chat-types.ts)
  - Imported `type ChildSettingSource` from `@ptah-extension/shared`.
  - Extended `TabAgentOrigin` with optional `model?: string`, `effort?: EffortLevel`, `modelSource?: ChildSettingSource`, and `effortSource?: ChildSettingSource`.
- [`libs/frontend/chat-state/src/lib/tab-manager.service.ts`](file:///D:/projects/ptah-extension/.claude-worktrees/feat-cli-tier-map-fb3792312cff/.claude-worktrees/cr/libs/frontend/chat-state/src/lib/tab-manager.service.ts)
  - Updated `buildAgentSessionTab` to copy `model`, `effort`, `modelSource`, and `effortSource` from `AgentSessionOpenedPayload` into `TabState.agentOrigin` when present.
- [`libs/frontend/chat-state/src/lib/tab-persistence.ts`](file:///D:/projects/ptah-extension/.claude-worktrees/feat-cli-tier-map-fb3792312cff/.claude-worktrees/cr/libs/frontend/chat-state/src/lib/tab-persistence.ts)
  - Updated `restoredAgentOrigin` to preserve and validate `model` (non-empty string of at most 200 characters), `effort` (member of `EFFORT_LEVELS`), `modelSource` (member of `CHILD_SETTING_SOURCES`), and `effortSource` (member of `CHILD_SETTING_SOURCES`).
  - Invalid optional fields are dropped individually without dropping `agentOrigin` or the restored tab.
- [`libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts`](file:///D:/projects/ptah-extension/.claude-worktrees/feat-cli-tier-map-fb3792312cff/.claude-worktrees/cr/libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts)
  - Added `childRoute` computed signal (with value equality `sameChildRoute`) derived from `tab().agentOrigin`.
  - Renders a compact child route line (`data-testid="compact-session-child-route"`) showing `<model> · <effort>` (for example `claude-sonnet-5-5 · high`) only when `tab().agentOrigin` is defined; renders nothing for non-child tabs.
  - Shows `default model` when `model` is absent and `default effort` when `effort` is absent.
  - Maps `ChildSettingSource` values (`pin` -> `"set by parent"`, `model` -> `"decision model"`, `ranking` -> `"ranking rule"`, `default` -> `"host default"`) into both `[title]` and `[attr.aria-label]` on the model span (`data-testid="compact-session-child-model"`), effort span (`data-testid="compact-session-child-effort"`), and route row.
  - Truncates long model IDs (`min-w-0 truncate`) with a `title` attribute containing the full model ID and source, using the existing Tailwind/DaisyUI classes and tokens of neighbor elements (`flex min-w-0 shrink-0 items-center gap-1.5 border-b border-base-content/10 px-3 py-1 font-mono text-[11px] text-base-content-muted`).
- [`libs/frontend/chat-state/src/lib/tab-manager.agent-adoption.spec.ts`](file:///D:/projects/ptah-extension/.claude-worktrees/feat-cli-tier-map-fb3792312cff/.claude-worktrees/cr/libs/frontend/chat-state/src/lib/tab-manager.agent-adoption.spec.ts)
  - Added unit test verifying `adoptAgentSessionTab` copies `model`, `effort`, `modelSource`, and `effortSource` into `agentOrigin`.
- [`libs/frontend/chat-state/src/lib/tab-restore-sanitize.spec.ts`](file:///D:/projects/ptah-extension/.claude-worktrees/feat-cli-tier-map-fb3792312cff/.claude-worktrees/cr/libs/frontend/chat-state/src/lib/tab-restore-sanitize.spec.ts)
  - Added unit tests across both restore readers (`TabManagerService.loadTabState` and `TabWorkspacePartitionService`) verifying valid `model` (up to 200 chars), `effort`, `modelSource`, and `effortSource` are kept and invalid fields are dropped without dropping `agentOrigin` or the tab.
- [`libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.spec.ts`](file:///D:/projects/ptah-extension/.claude-worktrees/feat-cli-tier-map-fb3792312cff/.claude-worktrees/cr/libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.spec.ts)
  - Added unit tests verifying non-child tabs render nothing, child tabs render resolved model/effort with truncation, `title`, and mapped source `aria-label`/`title`, and absent `model`/`effort` render `default model` / `default effort` with `host default`.

## Decisions

- **Decision 1: Placement and styling of the child model/effort row in `CompactSessionCardComponent`**
  - **Options**: (a) Render a compact metadata bar (`flex min-w-0 shrink-0 items-center gap-1.5 border-b border-base-content/10 px-3 py-1 font-mono text-[11px] text-base-content-muted`) directly inside `CompactSessionCardComponent` below the card header when `tab().agentOrigin` is present; (b) Modify child components in `@ptah-extension/chat-ui`.
  - **Evidence**: Task rules restrict edits strictly to the four named files and their specs (`libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts`), and the neighbor `data-zone="sub"` row uses `flex min-w-0 items-center gap-1.5 border-b border-base-content/10 px-3 font-mono text-[11px] text-base-content-muted`.
  - **Reversible**: Yes.

- **Decision 2: Default source label when `model` or `effort` is absent on `TabAgentOrigin`**
  - **Options**: (a) Default the source to `'default'` (`"host default"`) when `model` or `effort` is absent and no explicit `*Source` is set; (b) Omit the source label when `*Source` is undefined.
  - **Evidence**: `context.md` specifies that when a field is omitted and no routing match overrides it, the host default applies (`source: 'default'`, field stays omitted). Defaulting to `'default'` ensures child origins without explicit `*Source` still expose `"host default"` in their tooltip and `aria-label` when showing `default model` or `default effort`.
  - **Reversible**: Yes.

## Tool & Skill Availability Notes

- Checked host skill catalogue (`<skills>`): UI/Angular skills (`impeccable`, `ui-ux-designer`, `angular-frontend-patterns`) are not listed in this CLI host's skill catalogue.
- Used `ptah_search_files` to locate spec files. `ptah_lsp_references` timed out after 3m0s, and `ptah_get_diagnostics` timed out after 45s while the workspace TypeScript check was warming up; fell back to scoped `read_file` and the mandatory `npm run verify` command.

## Verification

- **Exact command**:
  ```bash
  npm run verify -- -p "@ptah-extension/chat-types,@ptah-extension/chat-state,@ptah-extension/chat"
  ```
- **Results**:
  - `@ptah-extension/chat-types:typecheck`: **PASSED**
  - `@ptah-extension/chat-types:lint`: **PASSED**
  - `@ptah-extension/chat-state:typecheck`: **PASSED**
  - `@ptah-extension/chat-state:lint`: **PASSED**
  - `@ptah-extension/chat:typecheck`: **PASSED**
  - `@ptah-extension/chat:lint`: **PASSED**
  - `@ptah-extension/chat-state:test`: **PASSED** (all 35 suites passed, including the updated `tab-manager.agent-adoption.spec.ts` and `tab-restore-sanitize.spec.ts`).
  - `@ptah-extension/chat:test`: 249 suites passed (4,336 tests passed); **106 suites** failed to load `marked` with the known worktree limitation `"Could not locate module marked mapped as: ...\.claude-worktrees\cr\node_modules\marked\lib\marked.umd.js"` (105 suites failed to start at module import, and 1 suite `workspace-coordinator.service.spec.ts` had 3 tests fail at dynamic `import('@ptah-extension/git-ui')` with the same `"Could not locate module marked"` error).

## Visual Check

- `ptah_browser_navigate` and `ptah_browser_screenshot` are not listed in the attached `ptah` MCP server tool list in this CLI environment, and running `build`/`serve`/`dev` targets is forbidden by task rules. Visual rendering could not be inspected via browser screenshot; markup, classes (`truncate`, `font-mono text-[11px] text-base-content-muted`), `[title]`, and `[attr.aria-label]` attributes were verified against neighbor elements in `CompactSessionCardComponent` and covered in `compact-session-card.component.spec.ts`.

## Open Points

- None.
