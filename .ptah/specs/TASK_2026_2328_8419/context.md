# Context

Follow-up tweaks to the redesigned session stats sidebar (TASK_2026_2309_5bea).

## Requests
1. The orchestrator permission request rendered twice (top banner and the
   Orchestrator row in AGENTS) as a long multi-line sentence.
2. Plan-limit providers needed separation, aligned columns, badges and icons.
3. Antigravity and a second Claude account showed "Multiple scopes · Usage
   unknown" with no windows.
4. The Models per-model table expanded in place; it should be a popover with
   a stats-list layout.

## Decisions
- Top request lines render only while no Orchestrator row exists; the row
  already carries the same request list (`inspectorAgentRows`).
- Request lines are one line: kind pill, truncated text (full text in
  `title` and the button `aria-label`), compact Review/Answer button.
- Root cause of 3: `stats-limit-view-model.ts` bailed out when one owner's
  lanes had more than one `modelScope`. It now builds a plan per scope and
  merges them (tiles deduplicated by id, status tiles of window-less scopes
  dropped when another scope rendered windows, at-limit indicator first).
- Models popover state is local and closes on a session switch, so a
  top-layer dialog with a backdrop never reopens on its own after a remount.
