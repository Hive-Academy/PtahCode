# Batch 6 lane C report

## Files (all adopted)
- memory-curator-ui `event-feed.component.ts`: `ptahBadge` `sm`; tone bound from the row. Row tone type is now `PtahBadgeTone` (`ok`/`warn`/`info`/`err`). Text wrapped in `ptah-badge-text`.
- memory-curator-ui `storage-health-panel.component.ts`: retention badge (`ok` or `neutral`, was ghost) and run badge (`ok`/`warn`/`err`), both `sm`. Directive added to `imports`.
- memory-curator-ui `memory-pause-switch.component.ts`: Paused badge `warn` `sm`; kept `text-xs font-medium`.
- memory-curator-ui `timeline-filters.component.ts`: BM25-only badge `warn` `sm`.
- review-runs-ui `review-page-header.component.ts`: status badge `appearance="outline"` (default `sm`); kept `gap-2 text-xs` and the state color classes. Badge lines only.

## Specs updated
- `event-feed.component.spec.ts`, `storage-health-panel.component.spec.ts`, `memory-pause-switch.component.spec.ts`: now query `[data-ptah-badge]` and check `data-tone`.

## Not changed
- `review-repositories.component.spec.ts` queries `.badge` but belongs to another component (not in this lane). Its owner must update it.

## Verification
Not run: no `node_modules` in this worktree. Source review only. Not committed.
