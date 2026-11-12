# Batch 6 badge adoption review

Read-only review of the worktree diff against `family-3-look.md`, `design-system-epic.md`, and `PtahBadgeDirective`. No tests ran (no `node_modules`). No rendered screenshot was available for a visual comparison. Normal skill discovery was unavailable; no matching `SKILL.md` was found in this worktree.

## Findings

1. **Medium — raw badge remains in a changed component.** `libs/frontend/marketplace/src/lib/pages/skills/skill-detail.component.ts:323-331` still renders the provenance value with `badge badge-sm`. The family look sheet lists only the chat composer, canvas rail, and file-status badge as visual exceptions (`.ptah/specs/TASK_2026_957_fda3/family-3-look.md`, Exceptions), so this is an unrecorded raw recipe in an adopted component. Its custom `h-auto`, border, background and wrapping need an explicit migration or named exception; a simple directive swap could truncate the provenance value.

2. **Medium — review header state does not use the specified status treatment.** `libs/frontend/review-runs-ui/src/lib/components/review-page-header.component.ts:32-46` converts the outer chip to `ptahBadge` but retains a round `bg-current` dot. The look sheet's review-runs reference calls for `ptah-status dot` with a label and shape glyph (`.ptah/specs/TASK_2026_957_fda3/family-3-look.md`, section 5). The current dot has `aria-hidden`, so its shape and accessible name do not convey the state independently; the adjacent words still convey it. The chip also defaults to `sm` and keeps `text-xs`, while that reference specifies `neutral outline xs` and the owner caption type. This needs a design decision or a follow-up status adoption.

## Checks with no further finding

- All newly applied directives are on `span` hosts, are imported in their standalone components, and use supported tone, size, appearance and boolean count inputs. `event-feed.component.ts:19,70-72` types dynamic tones as `PtahBadgeTone`; the other dynamic bindings resolve to valid literal tones. Count badges use `count` on numeric content.
- Variable text on migrated badges uses `.ptah-badge-text`: server origin, provider origin, skill scope/shadowed copy, corpus concept, embedder label, and event kind. Remaining direct text is fixed or enum text.
- A repository-wide search of `libs` and `apps` specs found no `.badge` or old badge-class query against a component changed in this diff. `review-repositories.component.spec.ts:37` queries `.badge` in its own unchanged component; `thoth-shell.component.spec.ts:831` checks its own tile badge. The changed memory-curator specs now assert `data-tone`.
- No added diff line contains an agent role name outside `.ptah/specs`.
- The new owner look intentionally changes solid/ghost recipes to token soft or outline treatments. The look sheet's approval record is still open; source inspection cannot establish a pixel-level no-regression result.
