# TASK_2026_2267_be46 — Decision matrix + Context Management pages

Child E1 of epic TASK_2026_1177_9109. Branch `feat/settings-decision-matrix-context`, base `867a8a3e8`.

## Goal

1. Move every decision-model / lane-routing setting from Context Management (`ptah-orchestration-settings`,
   tab id `orchestration`) to the Decision matrix page (`ptah-decision-matrix-page`, tab id `matrix`).
   UI move only: settings keys, RPC and behaviour stay unchanged. Keep every id, data-testid, aria-label.
2. Make both pages match the rev 2 prototype (`docs/design-system/settings/prototype/settings-prototype.html`,
   screens `rev2-context-dark-784.jpg`, `rev2-matrix-light-1168.jpg`, `review-a3-matrix-dark-1440.jpg`,
   section pattern `advanced-dark-1168.jpg`) and the user rules in `docs/design-system/settings/README.md`
   ("User decisions after rev 2").

## Moved settings

| Setting | Component | Key | Old page | New page |
| --- | --- | --- | --- | --- |
| Routing suggestions | `host-routing-setting.component.ts` | `agentOrchestration.hostRouting` | Context Management | Decision matrix |
| Rotate close executors (+ recent picks) | `lane-rotation-setting.component.ts` | `agentOrchestration.laneRotation` | Context Management | Decision matrix |

Inspected and kept on Context Management (context topics, not routing): Subagent prompt cache, Session budget,
Lane guards (stops repeated tool calls), advanced groups `context-budgets` and `background-queries`.
The "See decision matrix" link and the `openMatrix` outputs are removed (the setting now lives on the matrix page).

## Root cause of "small inputs on a wide screen"

`ptah-form-section` caps the fields column at `--ptah-form-section-fields-max-w: 36rem` unless the section sets
`wide`. Every section on both pages sets `wide`, so the fields column fills to the card edge, and the controls fill
their `[ptahFieldGrid]` columns (maximum three).

## Layout decisions

- Section pattern: `ptah-form-section wide` (title + hint at left, content at right that fills the card).
- Toggles: `ptah-setting-row` (row title + hint at left, toggle at the right edge) with the `ptahToggle` directive.
- Dropdowns: shared `ptah-select` (designed menu). Never native `select[ptahSelect]` on these pages.
- Text/number fields: shared `ptah-field`. In a `ptah-setting-row` or a compact table cell the control has no
  floating label (row title / column header labels it).
- Hierarchy: page title (shell) > section title (`--ptah-text-section-title-*`) > row title > hint
  (`--ptah-text-hint-*`, `text-base-content-muted`). One primary action per section.
- Decision matrix order: header (back to Context management, "Rated N days ago", refresh), instrument band,
  section "Routing suggestions", section "Rotate close executors", section "Model ratings" (filters row: family
  select | search | sort select in one `[ptahFieldGrid]`, then the table).
- Needs-model state: compact warn `ptah-alert` "Suggestions need a routing model. Choose one in Background models."
  with a ghost "Choose model" action that deep links to Providers `background-models`. Keep
  `host-routing-needs-model`.
- Recent picks: chips (`span[ptahBadge]`), newest first, raw ids in a tooltip, not in `<details>`.
- Ratings table cells hold one short value: score + small bar. Stale is a small icon badge with a tooltip.
  Long text (evidence, sample counts, dates) goes into the popover / detail row behind the score.

## Deep links

`settings.component.ts applyPendingTab`: sections `host-routing`, `routing-suggestions`, `lane-rotation` open the
matrix tab (Electron), same as `decision-matrix`.

## Out of scope

`libs/frontend/ui` select/field controls (child G), Providers page and Background models (child D), Advanced and
Search & Voice pages. `advanced-settings-group.component.ts` is shared with Advanced: change only the
`headingStyle="section"` path that Context Management uses.
