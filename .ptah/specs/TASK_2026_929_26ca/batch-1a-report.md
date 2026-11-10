# Batch 1a report

## Files

Moved with `git mv`: `libs/frontend/ui/src/lib/surfaces/button.directive.ts` and its spec to `libs/frontend/ui/src/lib/button/`.
Added `button-host.ts`, `icon-button.directive.ts`, `icon-button.directive.spec.ts`, `tooltip.directive.ts`, `tooltip.directive.spec.ts`, `tooltip-panel.component.ts`, and `index.ts` there.
Changed `libs/frontend/ui/src/index.ts`, `libs/frontend/ui/src/lib/surfaces/index.ts`, `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`, and the three foundation callers' relative imports: `page-header.component.ts`, `list-detail.component.ts`, `state-panel.component.ts`.

## Public API

`PtahButtonDirective`: `button[ptahButton], a[ptahButton]`; signal inputs `variant` (`primary|secondary|ghost|danger|link`, default `secondary`), `size` (`xs|sm|md`, default `sm`), `busy` (boolean attribute), and deprecated `iconOnly` (boolean attribute, gallery compatibility). Missing button type becomes `button`; explicit type remains.
`PtahIconButtonDirective`: `button[ptahIconButton], a[ptahIconButton]`; required `label` (also `aria-label` and tooltip text), `variant` (same except `link`, default `ghost`), `size` (default `sm`), `busy`. Host directives compose the tooltip.
`PtahTooltipDirective`: `[ptahTooltip]`, required text signal input; CDK connected overlay prefers above and falls back below, with reposition scroll strategy. Focus shows immediately, pointer enter after 250 ms; blur, pointer leave, Escape and destruction remove it.

## Zero-pixel proof

The recipe table lists each of the 20 existing template occurrences. Before and after class sets are identical; a `+` suffix denotes existing extra template classes, also unchanged. The gallery loop emits multiple buttons but counts as one source occurrence.

| Caller | Before = after recipe |
| --- | --- |
| gallery: Refresh preview | `btn btn-ghost btn-sm` |
| gallery: variant/size loop | `btn btn-{variant} btn-{size}` |
| gallery: More actions | `btn btn-secondary btn-sm btn-square` |
| gallery: Saving | `btn btn-secondary btn-sm opacity-60 cursor-wait` |
| gallery: Disabled | `btn btn-secondary btn-sm` |
| gallery: All runs | `btn btn-ghost btn-xs` |
| findings panel: sort | `btn btn-ghost btn-xs` |
| findings panel: clear filters | `btn btn-ghost btn-sm` |
| finding card: open location | `btn btn-ghost btn-xs` + `font-mono` |
| finding card: open evidence | `btn btn-ghost btn-xs` + `font-mono` |
| finding card: Accept | `btn btn-primary btn-xs` |
| finding card: Dismiss | `btn btn-ghost btn-xs` |
| finding card: Reply | `btn btn-ghost btn-xs` |
| finding card: Copy fix prompt | `btn btn-secondary btn-xs` |
| finding card: Submit dismissal | `btn btn-secondary btn-xs` |
| finding card: Send reply | `btn btn-secondary btn-xs` |
| state panel: first action | `btn btn-secondary btn-sm` + `mt-4` |
| state panel: second action | `btn btn-secondary btn-sm` + `mt-4` |
| page header: back | `btn btn-ghost btn-xs` |
| list detail: back | `btn btn-ghost btn-sm` + `m-2 [@container(min-width:768px)]:hidden` |

In installed `node_modules/daisyui/dist/full.css`, `.btn-md` repeats the base `.btn` values for height and min-height (3rem), horizontal padding (1rem), and font-size (0.875rem). Adding `btn-md` therefore has the same effect as `btn` without a size class. Current `xs` and `sm` users retain their exact class sets. This is a CSS source comparison, not a rendered screenshot; no app launch is allowed in this batch.

## Type findings

All 20 existing template occurrences explicitly set `type`: 18 `button`, two `submit` (finding card forms). No existing caller changes submit behavior and no template type edits were needed. The gallery's `iconOnly` caller is outside permitted edits, so its deprecated input remains.

## Verification

Attempted requested `npm run verify -- -p ui | tail -60`; PowerShell has no `tail`, so the command did not start. Ran the verify script once using PowerShell's equivalent `npm run verify -- -p ui | Select-Object -Last 60`. Real result:
```text
NX   2 tasks: 0 succeeded, 2 failed
? nx run @ptah-extension/ui:typecheck
? nx run @ptah-extension/ui:lint
```
The task logs identified three stale relative imports and two empty test buttons. Both issues were fixed after that run. The one-run rule prevents a second verify, so these fixes and the tests remain unverified. Ptah diagnostics were unavailable because its index is rooted in a different checkout.

## Decisions

- Retain deprecated `iconOnly` because the gallery has its sole use and gallery edits are forbidden. Reversible once the gallery moves to `ptahIconButton`.
- Keep the 20 existing templates unchanged because their recipe classes and explicit types already match the new API. Reversible.
- Use a shared host recipe and busy click helper for both directives, preserving capture-phase click blocking. Reversible.
- Compose tooltip through `hostDirectives`; the icon directive supplies its label to the tooltip instance. Reversible.

## Proposed Removals

- Remove deprecated `iconOnly` after the gallery's icon button is migrated in an authorized batch.

## Open risks

- Post-fix typecheck, lint and specs have not run under the one-run verification limit. CDK overlay rendering in Electron and VS Code hosts has not been visually inspected because app launch is prohibited.

