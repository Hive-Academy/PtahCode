# CI Fix Report: `ui-class-audit:lint` (`surface-layout.component.ts`)

## Root Cause
`tools/ui-class-audit/baseline.json` allowed 2 `<dynamic>` occurrences in `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts` (previously the two `[class]="containerClass()"` bindings). Adding `[class]="rowItemClass(group.entry.child)"` brought the count to 3 (`3 > 2`), causing `ui-class-audit:lint` to fail.

## What `tools/ui-class-audit/check-ui-classes.ts` Accepts as Provably Safe
From `findTemplateHits` and `walkExpression` in `tools/ui-class-audit/check-ui-classes.ts`:
- **Static `class="..."` (without `{{ ... }}` interpolation):** each whitespace-separated class token is checked against `isBlockedClassToken`; no `<dynamic>` hit.
- **Per-class `[class.foo]="expr"` bindings:** matched by `/^\[class\.([^.\]]+)\]$/`; only `foo` is checked against `isBlockedClassToken` and `expr` is treated as a boolean guard (never a class source).
- **`[class]` / `[ngClass]` / `[className]` / `[attr.class]` expressions whose AST resolves strictly to static class names:**
  - string literals (`'...'`) and no-substitution template literals;
  - object literals (`{ 'class-name': condition }`) with string literal or identifier keys (values are boolean guards, not walked as class sources);
  - array literals, parenthesized expressions, conditional (`?:`) arms, and `+` concatenations composed exclusively of the above.
- **Flagged as `<dynamic>`:** method/signal calls (`containerClass()`, `rowItemClass(...)`), bare identifiers, template literals with `${...}` interpolations, computed object keys, and `{{ ... }}` inside `class="..."`.

## Changes Made
Modified only `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts` (no baseline edit, no suppression comments, no spec edits needed):

1. **Horizontal row-item wrapper (`libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:197-203`):**
   - Replaced `<div [class]="rowItemClass(group.entry.child)" data-testid="row-item">` with per-class bindings:
     - `[class.dp-row-item-divider]="isVerticalDivider(group.entry.child)"`
     - `[class.dp-row-item-inline]="isInlineKind(group.entry.child)"`
     - `[class.dp-row-item]="!isVerticalDivider(group.entry.child) && !isInlineKind(group.entry.child)"`
   - Replaced unused `rowItemClass(child)` with `isVerticalDivider(child)` (`surface-layout.component.ts:399-401`).
   - Preserves identical rendered classes for vertical dividers (`dp-row-item-divider`), inline kinds (`dp-row-item-inline`), and block/horizontal-divider items (`dp-row-item`).

2. **Collapsible body non-container fallback (`libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:257`):**
   - Replaced `<div [class]="containerClass()">` inside `#collapsible` `@else` with static `<div class="flex flex-col gap-4">`.
   - Only `accordion` (in viewport mode) reaches this branch (`section` only enters `#collapsible` when `layoutWidth() === 'container'`, which takes the `responsiveChildren` branch), and `containerClass()` always evaluated to `'flex flex-col gap-4'` for both `accordion` and `section`.

3. **Stack / Grid container (`libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:293-318`):**
   - Replaced `<div [class]="containerClass()">` in `@default` with a provably-safe static-key `[class]="{ ... }"` object literal covering every layout mode with identical classes:
     - Container grid (`containerGrid()`): `dp-grid`, `dp-grid--stats` (when `isStatGrid()`), `dp-cols-1..4`, `dp-gap-none|small|medium|large`.
     - Viewport grid (`viewportGrid()`): `grid`, `grid-cols-1`, `sm:grid-cols-1..4`, `gap-0|2|4|6`.
     - Horizontal stack (`horizontal()`): `flex`, `flex-row`, `flex-wrap`, `gap-0|2|4|6`.
     - Vertical stack (`!isGrid() && !horizontal()`): `flex`, `flex-col`, `gap-0|2|4|6`.
   - Replaced `containerClass` and the now-unused module-private `GAP_CLASSES`, `CONTAINER_GAP_CLASSES`, and `SM_GRID_COLUMNS` lookup tables with focused computed signals (`isGrid`, `containerGrid`, `viewportGrid`, `isStatGrid`, `gapKey` at `surface-layout.component.ts:360-371`). All Tailwind utility names remain literal strings in the file for content scanning.

## Verification Results
All focused checks passed with exit code `0`:

| Check | Command | Result |
| --- | --- | --- |
| UI class audit | `.\node_modules\.bin\ts-node.cmd --transpile-only tools/ui-class-audit/check-ui-classes.ts` | **PASS** (exit `0`). `surface-layout.component.ts`: `0 token(s)` (down from 3 `<dynamic>`, baseline 2). Overall: `TOTAL 839 blocked token(s) across 212 file(s); 0 token count(s) over baseline` (daisyui-class) and `0 token count(s) over baseline` (raw-spacing). |
| Jest suite | `.\node_modules\.bin\jest.cmd --config libs/frontend/declarative-dashboard/jest.config.ts --runInBand --coverage=false` | **PASS** (exit `0`). `Test Suites: 25 passed, 25 total`; `Tests: 327 passed, 327 total` (`surface-layout.component.spec.ts` passed unmodified). |
| TypeScript check | `.\node_modules\.bin\tsc.cmd --noEmit -p libs/frontend/declarative-dashboard/tsconfig.lib.json` | **PASS** (exit `0`). 0 errors. |
| Angular template typecheck | `.\node_modules\.bin\ngc.cmd --noEmit -p libs/frontend/declarative-dashboard/tsconfig.lib.json` | **PASS** (exit `0`). 0 errors/warnings in `declarative-dashboard` (one pre-existing NG8107 warning in `../ui/src/lib/patterns/settings-layout/settings-layout.component.ts`). |
| ESLint | `.\node_modules\.bin\eslint.cmd libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts` | **PASS** (exit `0`). 0 errors (standard standalone-eslint warning that `@nx/enforce-module-boundaries` was skipped without cached ProjectGraph). |
| Ptah diagnostics | `ptah_get_diagnostics` scoped to `surface-layout.component.ts` | **PASS**. 0 errors, 0 warnings in requested file. |

## Notes
- Skill availability: `ui-ux-designer` and `angular-frontend-patterns` were not present in the host's available skills catalogue for this session.
- `tools/ui-class-audit/baseline.json` was not modified; `surface-layout.component.ts` now reports `0 token(s)` (a decrease from baseline 2, which passes the ratchet).
