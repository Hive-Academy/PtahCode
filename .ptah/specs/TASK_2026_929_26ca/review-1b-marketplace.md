## Verdict
APPROVE (the diff is correct; one set of missed exact-recipe elements is a completeness gap, not a defect)

## Defects
None in the changed lines.

Completeness gap (severity: low, finding 5 of the task):
1. `libs/frontend/marketplace/src/lib/kept-items-repair-prompt.component.ts:454`, `:462`, `:522`, `:531`, `:539`
   have a static class that is exactly `btn btn-ghost btn-xs`, `btn btn-primary btn-sm` or `btn btn-ghost btn-sm`.
   All five have an explicit `type="button"`. The component imports only `[LucideAngularModule]` (line 112), so it also
   needs `PtahButtonDirective`. The batch report claims 0 exact recipes remain. The claim is wrong. Probable cause:
   the report census scans to the first backtick after `template: \``, and this file has an earlier or inner backtick.
   An attribute-aware scan found these five elements.
2. `libs/frontend/marketplace/src/lib/ui/storefront-hero.component.ts:101` is only a doc-comment example. It is not a
   template element, so it is correctly not changed.

## Checked
Each changed element: class token set equals the old set (`btn`, color, size). Mapping `danger` to `btn-error` is correct.
All 31 changed elements are in a `.ts` or `.html` template. Counts per file:
- external-consent-dialog.component.ts: 4
- external-marketplaces.component.ts: 6
- harness-health-badge.component.ts: 1
- harness-repair-dialog.component.ts: 2
- oauth-surface.component.ts: 3
- connectors-page.component.html: 3 (owner connectors-page.component.ts imports it)
- installed-servers-page.component.ts: 1
- server-detail.component.html: 1 (owner server-detail.component.ts imports it)
- installed-skills-page.component.ts: 1
- skill-detail.component.ts: 2
- smithery-surface.component.ts: 2
- direct-removal-confirm.component.ts: 2
- featured-connectors.component.ts: 1
- provider-card-list.component.ts: 1
- provider-table.component.ts: 1

Points confirmed:
- Every `<button>` already has an explicit `type`. Eight `<a>` elements are not affected by the type default. No default `type="button"` change.
- No changed element sits where a submit is lost. The three `<form>` blocks hold their own non-changed submit buttons.
- Imports: all come from `@ptah-extension/ui`. No duplicates, none removed, none unused. Format-only oddities
  (`imports: [\n PtahButtonDirective,\n LucideAngularModule]`) in harness-repair-dialog and skill-detail need Prettier only.
- No extra attribute, binding or text changed. Only the `class` line became `ptahButton variant size`.
- Specs: the only class assertion is `connector-card-actions.component.spec.ts:107` (`btn-sm`). That component is not in the diff.

## Notes
- Report match: the "Replaced" table (31 rows) matches the diff. The "type added: none" claim is true. The "Census after: 0"
  claim is false (see Defect 1).
- Skipped list in the report was not re-audited for non-exact elements. A spot check found no other exact recipe.
- Recommend a follow-up change for `kept-items-repair-prompt.component.ts` (5 elements plus import).
