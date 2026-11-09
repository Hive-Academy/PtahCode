# Batches 1–3 report

Implemented the reusable UI foundation for batches 1–3 in `@ptah-extension/ui`.

## Files

- Batch 1: added `surfaces/button.directive.ts` and spec, `surfaces/field-control.directive.spec.ts`; changed `field-control.directive.ts`, `stat-card.component.ts` and spec, and `surfaces/index.ts`.
- Batch 2: added `foundation/page-header`, `list-detail`, `list-row`, and `status-badge` components and their specs.
- Batch 3: added `foundation/state-panel`, `toolbar`, and `meter` components and their specs, `foundation/index.ts`; appended a star export to `src/index.ts`.

## Public API

- `button[ptahButton]`: `variant` (`primary|secondary|ghost|danger`), `size` (`xs|sm`), `iconOnly`, `busy`. Busy adds `aria-disabled` and `aria-busy` while retaining focus.
- `ptah-stat-card`: new `size` (`default|dense`); default remains `text-2xl`, dense uses `text-xl`.
- `ptah-page-header`: `title`, `description`, `backLabel`, `back`; status and actions slots.
- `ptah-list-detail`: `selectedId`, `backLabel`, `back`; list, detail, empty, meta slots.
- `div[ptahListRow]`: `title`, `meta`, `current`; leading and trailing slots.
- `ptah-status-badge`: `status`, `label`.
- `ptah-state-panel`: `state`, `title`, `body`, `actionLabel`, `action`.
- `ptah-toolbar`: `query`, `queryChange`, `count`; filters and sort slots.
- `ptah-meter`: `value`, `max`, `label`, `unit`.

The installed `node_modules/@angular/aria/types/listbox.d.ts` declares standalone `Listbox` (`[ngListbox]`, `value` model) and `Option` (`[ngOption]`, required `value`, optional `disabled`) at lines 79–141 and 30–54 respectively. `PtahListRowComponent` shares a `div` host with `ngOption`; the component does not manage focus or selection. Its spec composes both directives. Consumers put rows under `ngListbox` and bind `value`/`disabled` on `ngOption`; link rows remain native links.

## Verification

`npm run verify -- -p @ptah-extension/ui` requested one project, `@ptah-extension/ui`. Final run: lint/typecheck `NX 2 tasks: 2 succeeded`; test `NX 1 task: 1 succeeded`; verify exit code 0. Initial run found the Angular component-selector lint rule on the planned attribute component; a local documented exception resolved it. Scoped diagnostics reported no errors in requested changed files, with eight unrelated sibling errors from its compiler scan.

## Decisions

- Kept `div[ptahListRow]` so `ngOption` can own the same focusable element. The plan names this selector, and the installed declarations allow `[ngOption]` on a `div`. A one-line lint exception is reversible.
- Imported `NEAR_LIMIT_PERCENT` through `@ptah-extension/shared`; the UI project's `scope:webview,type:ui` tags permit shared utilities, and the export exists. Meter uses need ink at 90% and error ink at 100%. Reversible.
- The toolbar search uses an `aria-label` to keep its native input labeled without generating a duplicate DOM id when multiple toolbars render. Reversible.

## Deviations from plan

- The `angular-frontend-patterns` skill was unavailable: host skill search returned zero matches. Repository conventions and the provided plan were used.
- No gallery or app route was changed; those belong to batch 4. No browser rendering was available for these library components without the later gallery, and the request prohibits serve/dev. Visual tokens and spacing were checked against `DESIGN.md` section 8 and both supplied prototypes; visual quality remains for the gallery review.
