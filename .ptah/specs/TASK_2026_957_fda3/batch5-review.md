# Batch 5 independent review

Reviewed the worktree `git diff` for git-ui, machines-ui, and marketplace against `design-system-epic.md`, `family-3-look.md`, and the `PtahBadgeDirective` owner. Source was not edited. Tests were not run (no `node_modules`, as requested). The look sheet is at `.ptah/specs/TASK_2026_957_fda3/family-3-look.md`; the path under `TASK_2026_924_8ac1` in the request does not exist.

## Findings

1. **Medium — variable length labels can be clipped without an ellipsis.** The owner CSS explicitly requires a `.ptah-badge-text` child for text that can overflow (`libs/frontend/ui/src/lib/badge/ptah-badge.css:28`). The migrated skill name in `libs/frontend/marketplace/src/lib/external-consent-dialog.component.ts:270`, upgrade version in that file at line 205, and `chips` input labels in `libs/frontend/git-ui/src/lib/review-canvas/file-section-header.component.ts:230` remain direct text. Long values can hit the badge's `max-width: 100%`/`overflow: hidden` and be cut without an ellipsis. Wrap the variable text where truncation is possible; the remote driver badges already do this correctly.
2. **Low — one adopted badge retains the old 10 px type size.** `libs/frontend/marketplace/src/lib/external-consent-dialog.component.ts:270` keeps `text-[10px]`, overriding the owner's 11 px caption size. `family-3-look.md` section 4 says every badge uses the caption role, so this badge remains visually inconsistent with the family. Remove the type-size override if the intended approved look applies here.

## Checks

- All changed `ptahBadge` hosts are `span`; each affected standalone component imports `PtahBadgeDirective`. Used tones (`neutral` default, `info`, `ok`, `warn`, `err`), `soft` default/`outline`, and sizes `xs`/`sm` match `libs/frontend/ui/src/lib/badge/badge.types.ts`. `count` in `libs/frontend/marketplace/src/lib/pages/overview/overview-page.component.html:189` exists on the directive (`libs/frontend/ui/src/lib/badge/badge.directive.ts:25`).
- The converted remote driver labels use `.ptah-badge-text` (`libs/frontend/machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts:283` and `libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts:143`). No further definite look regression was established from source review; no rendered comparison was available in this review.
- The changed installed-servers spec checks `data-tone` (`libs/frontend/marketplace/src/lib/pages/servers/installed-servers-page.component.spec.ts:806`). Search across `libs` and `apps` specs found no `.badge`/old-class assertion for a migrated batch-5 badge. `libs/frontend/git-ui/src/lib/task/task-worktree-view.component.spec.ts:773,804-805` still asserts old classes for the separate, unchanged `TaskPrPanelComponent` PR-state badge; those assertions are outside the migrated worktree chips and are not a batch-5 failure. Other `.badge` spec matches likewise cover unchanged components.
- The diff adds no agent role names outside `.ptah/specs`.
- Matching skill discovery/invocation was unavailable in this CLI session; the Ptah harness skill inventory tool is not an invocable skill mechanism.

