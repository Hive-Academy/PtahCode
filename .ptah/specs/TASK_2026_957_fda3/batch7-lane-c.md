# Batch 7 lane C: badge adoption (skill-synthesis-ui clones)

| File | Result |
| --- | --- |
| `clone-card.component.ts` | Adopted the provider sync chips. The `li` keeps `data-testid`, `title` and `data-state`. A `span[ptahBadge]` inside it takes the tone (`CHIP_TONE` now maps to ghost->neutral, info->info, error->err, warning->warn, success->ok). Variable chip text is in `ptah-badge-text`. Raw DaisyUI `badge` was on an `li`, but the directive selects `span` only, so a span was added. |
| `enhance-preview-drawer.component.ts` | Adopted all three: verdict ok, verdict neutral, judge score neutral outline (`tabular-nums` kept). |
| `provenance-badge.component.ts` | Adopted the plugin state word (turned-off neutral, orphaned warn). The origin badge stays raw: its plugin `border-primary`, strong surface border and `bg-base-300` cannot be shown with tone/appearance without a look change. |
| `quarantined-agents-panel.component.ts` | Adopted the count as a neutral, small `count` badge. |
| `reconcile-guard.ts` | Adopted both target badges (neutral, small). Variable target text is in `ptah-badge-text`. |

## Specs

No spec queried `.badge` or a `badge-*` class for the changed hosts. Specs use `data-testid`. `provenance-badge.component.spec.ts` checks the `badge` class on the origin badge, which stays raw. `scorecard-badge`, `scorecard-detail`, `agent-model-editor` and `skills-pause-switch` still use raw badges. They are outside my file list.

## Verification

- `npm run verify -- -t lint -p skill-synthesis-ui` passed.
- No test or template typecheck run (no node_modules, per the brief).
- No commits or pushes.
