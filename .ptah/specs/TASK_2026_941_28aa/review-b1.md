# Review b1 (marketplace button adoption)

**Verdict: one major finding (leftover `[attr.aria-busy]` on a `ptahButton`), two minor notes. No blocker.**

## Findings

### Major

1. `libs/frontend/marketplace/src/lib/ui/provider-card-list.component.ts:241` - the "remove" button
   is now `ptahButton` (lines 233-236) but still has `[attr.aria-busy]="busyRefs().has(row.ref)"`.
   The directive owns `aria-busy` (`button-host.ts:21`). Two bindings write the same attribute, and
   this one writes the string `"false"` when idle. Replace it with `[busy]="busyRefs().has(row.ref)"`,
   as the lane did for `provider-table.component.ts:461`, `server-detail.component.html:594,618`
   and `bulk-action-bar.component.ts:116`.

### Minor

1. `libs/frontend/marketplace/src/lib/ui/connector-card-status.component.ts:141` - the dismiss
   button lost `h-5 min-h-0 w-5 p-0` and now uses the `xs` icon button size. The control can be
   larger than before in the error row. Check the look in Electron. This follows rule 29 (family owns
   the size), so no change is required.
2. `libs/frontend/marketplace/src/lib/shell/marketplace-shell.component.html:16` - the old
   `focus-visible:outline ...` utilities were removed with the btn classes. The host directive owns
   the focus ring, so this is acceptable. Confirm the focus ring shows in the visual check.

## Checks

1. Attributes: every converted element keeps `data-testid`, `(click)`, `[disabled]`, `type`,
   `[routerLink]`, `[attr.*]` and `@if` structure in the diff. Pass.
2. Variant and size mapping: `btn-outline` -> default secondary, `btn-outline btn-error` ->
   `variant="danger"` (`server-detail.component.html:615`, `skill-detail.component.ts:477`),
   `btn-error` -> danger (`bulk-action-bar.component.ts:112`), ghost + `border-base-300` ->
   secondary (no variant) in `external-marketplaces`, `smithery-surface`, `connector-detail`,
   `connectors-page`. `btn-sm` -> default size, `btn-xs` -> `xs`. Pass.
3. `ptahIconButton` labels: all seven non-empty (`Cancel install`, `Re-check harness health`,
   `Close without moving anything`, `Copy redirect URL`, `Dismiss message`, `Dismiss error`,
   `Back to chat`) and `[label]="closeLabel()"` in `docked-inspector.component.ts:59`. No leftover
   `aria-label` or `title` on them. Pass. `closeLabel()` must never be empty at runtime
   (the directive logs an error on empty label). It has a default in the component, not changed here.
4. Imports: each changed component imports the directives it uses. `connectors-page`,
   `server-detail`, `installed-servers-page`, `installed-skills-page`, `smithery-surface`,
   `featured-connectors`, `provider-table` and `external-marketplaces` already imported
   `PtahButtonDirective` (templates in `.html` or already used). No unused import found.
   `harness-repair-dialog` and `harness-health-badge` keep `PtahButtonDirective`, which they still use.
   Pass.
5. Skipped by the lane (kept as `btn`): `harness-health-badge.component.ts:~207` `btn-warning
   btn-outline` and the filter chips in `connectors-page.component.html:203-218` (dynamic
   `[class.btn-*]`). Correct. Pass.
6. `aria-busy`: see major finding 1. All other `ptahButton` + busy cases use `[busy]`. The other
   `[attr.aria-busy]` hits in the grep are on non-button containers.
7. Behaviour changes: `w-full` (`oauth-surface:313`, `smithery-surface:199,620`), `shrink-0`,
   `ml-auto` (`installed-skills-page:211`, `bulk-action-bar:171`), `mt-3` and `-mr-1` are kept.
   `gap-1`, `border-base-300` and size utilities were removed as rules allow. No lost layout class
   found. `[busy]` adds `opacity-60 cursor-wait` and `aria-disabled` while busy: that is intended.
8. Tests: `connector-card-actions.component.spec.ts:107` reads `btn-sm`, but that component is not
   in the diff. No spec reads a removed class from a changed component.
9. Prettier-only edits in `.ts` files (wrapping, imports) are noise and not findings.
