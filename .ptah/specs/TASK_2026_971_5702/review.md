# Review: List and detail look

No blockers.

- **Major** — `libs/frontend/ui/src/lib/foundation/list-detail.component.ts:9,16`: At 1200px and wider, the grid always allocates a 280px third column and shows an empty bordered `<aside>`. The gallery removed its `[meta]` content, so this is a visible blank column. **Fix:** Render the aside and three-column layout only when metadata is projected, or use two columns for the gallery.
- **Minor** — `libs/frontend/ui/src/lib/foundation/list-detail.component.ts:9`: Container widths strictly between 1199px and 1200px match `:grid` but neither column rule; CSS widths can be fractional, so the layout falls to a single implicit column. **Fix:** Use an exclusive `< 1200px` upper bound for the two-column query.
- **Minor (test gap)** — `libs/frontend/ui/src/lib/foundation/list-detail.component.spec.ts:12-17` and `libs/frontend/ui/src/lib/foundation/toolbar.component.spec.ts:9-15`: The new assertions check class strings and element presence, so they miss both the empty wide column and actual grid placement; toolbar has no count-null/filters-slot coverage. **Fix:** Assert the rendered column/slot behavior at the breakpoints and with count null and non-null.

The arbitrary `@container` variant syntax is valid for Tailwind 3.4, and the static host classes should merge with Angular's `[class]` binding. Toolbar DOM order places search/sort in row one and filters/count in row two when count exists; without count, the second row's right cell is empty. The back wrapper uses `display: none` from 768px upward, so its button is removed from focus order; the existing narrow focus transfer remains intact.
