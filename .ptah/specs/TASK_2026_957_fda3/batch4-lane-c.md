# Badge adoption batch 4 - lane C

## Per file
- `command-center-header.component.ts`: adopted. Session and status spans use `ptahBadge` outline. The context chip uses tone `warn` when `contextWarning()` is true, else `neutral`. This replaces the `text-state-need` and `border-state-need` overrides.
- `command-center-start.component.ts`: adopted. "Current" uses tone `accent` (no `primary` tone exists). Two "Command Center" spans use outline.
- `command-rail-tabs.component.ts`: adopted. The tab count uses `ptahBadge count` and keeps the `tab-badge` class (the glass rule and specs use it). Added the component `imports`.
- `usage-breakdown-table.component.ts`: adopted. The provider label uses `ptahBadge size="xs"` (neutral replaces ghost).
- `usage-dashboard.component.html`: left raw. The partial badge is a `button` with tooltip and focus handling. The directive selector is `span[ptahBadge]` only.

## Specs updated
- `command-center-page.component.spec.ts`: `header .badge:last-of-type` -> `header [data-ptah-badge]:last-of-type` (3 places).
- `command-center-start.component.spec.ts`: `.badge-primary` -> `[data-tone="accent"]`.

## Verification
None run. The worktree has no node_modules and the brief bans wide runs. I checked the diff by reading it only. A template check with `typecheck-templates` is advised.
