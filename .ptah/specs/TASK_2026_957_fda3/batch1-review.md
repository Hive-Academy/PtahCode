# Batch 1 review (read-only)

Scope: uncommitted diff of 15 chat files plus `tools/ui-class-audit/baseline.json`. No build or test ran.

## Confirmed defects

1. **Directive not registered in `execution-header.component.ts`** (import at line 1, badge at line 56).
   - The file imports `PtahBadgeDirective`, but the `@Component` decorator (line 23) has no `imports` array.
   - The `ptahBadge` attribute on the `lane-account` span is therefore inert. The span loses all badge styling, and the old DaisyUI `badge` classes are gone.
   - The import is also unused, so lint can fail.
   - Fix: add `imports: [PtahBadgeDirective],` to the decorator (after `standalone: true`).
   - Note: the inner `<span class="truncate">` does not work inside the inline-flex badge. Use `class="ptah-badge-text"` as the badge CSS comment states. The same note applies to `agent-card-header.component.ts` (the `max-w-[10rem]` badges) if they hold direct text.

## Non-blocking observations

- `message-bubble.component.html` lines 323 and 344: the added `flex` class changes the host from inline-flex (badge) to block-level flex. Original `div.badge` was inline-flex. The layout can change if the parent is not a flex container. Consider removing `flex`.
- `agent-monitor-panel.component.ts` (`totalCount()`) and `session-filter-bar.component.ts` (count badge) show numbers. The `count` input is not set. Consider `count` for centered, tabular numbers. Not a regression.
- `agent-card-header.component.ts`: the status `[tone]` ternary has a `neutral` fallback. The original had no color for other statuses. This is an acceptable mapping.
- Fixed badge height (`--ptah-badge-h-*`) replaces `py-2.5` padding in `message-bubble` badges. Check visually.
- Source files use CRLF line endings. Git warns only. Not a defect.

## Verified OK

- Import and `imports` array are correct in 14 of 15 files. This includes the companions `lane-event-row.component.ts` and `message-bubble.component.ts`.
- Tone mapping is consistent: success to `ok`, error to `err`, warning to `warn`, ghost/neutral to default `neutral`, outline to `appearance="outline"`. Size mapping matches (`badge-xs` to `xs`, `badge-sm` to default `sm`).
- Dynamic class bindings (`agent-card-header`, `peer-session-send-dialog`, `task-card`) became typed `[tone]` bindings. No stale class strings remain. `task-card` uses a typed union.
- Specs for `workflow-badge` and `task-card` use `data-ptah-badge`, `data-size` and `data-tone`. These match the directive host bindings.
- No `any` was added.
- `subagent-tile.component.ts` is correctly left raw (button element).
- `baseline.json`: the only removals are badge entries of migrated files and badge tokens inside shared entries. The `+` lines are diff alignment artifacts. `subagent-tile` and untouched files remain.
- No email address or user name appears in the files reviewed.
