# Review 2: List and detail look fix

Verdict: no blockers. Two minor findings.

## Checked and OK
- Tailwind strings in `gridColumns()` (list-detail.component.ts) are complete literals. The arbitrary at-rule variants and `1199.98px` are valid in Tailwind 3.4. The ranges do not overlap.
- Static `class` plus `[class]="gridColumns()"` on the root div: Angular keeps the static classes.
- List row `[class]` host binding keeps the static host classes. `aria-disabled:hover:bg-transparent` has higher specificity than `hover:bg-...`.
- `@if (withMeta())` with an HTML comment inside is valid. The aside shows only from 1200 px.
- Back button: wrapper div is hidden at 768 px and wider. The focus code returns early at 768 px and wider, so there is no focus regression.
- Tokens `ptah-surface`, `ptah-controls` and `rounded-ptah-surface` exist in `apps/ptah-extension-webview/tailwind.config.js`.
- The diff does not touch `form-controls/` or `field.component.ts`.

## Findings
1. minor - toolbar.component.ts:7-9. The sort span (`min-w-32`) and the filters span are always rendered. With no `[sort]` content, the empty span still reserves 8 rem in column 2. With no filters and no count, row 2 stays empty but `gap-y` adds blank space. Fix: use `empty:hidden` on the sort and filters spans (or drop `min-w-32` from the wrapper and put it on the projected select).
2. minor - list-detail.component.spec.ts (first test). The test asserts class names only. It does not test the narrow layout or the back event. Fix: add `fixture.nativeElement.querySelector('button').click()` and assert that `back` emitted. The `root` selector fallback `?? querySelector('div')` is redundant.
