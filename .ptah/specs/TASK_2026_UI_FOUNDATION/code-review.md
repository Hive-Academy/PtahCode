# Code Review — TASK_2026_UI_FOUNDATION (Phase A)

Verdict: CHANGES REQUIRED

| Metric | Value |
| --- | --- |
| Overall score | 4/10 |
| Assessment | CHANGES REQUIRED |
| Blocker | 0 |
| Major | 4 |
| Minor | 4 |

Score is 4, not 5–6, because the failures are on the primary paths: a busy button still activates, a selected row has no selected treatment, a narrow list disappears under the default listbox selection mode and drops focus, and the partial state panel is not a warning above retained content. It is not 1–3: the Electron gallery route, the meter’s 90/100 thresholds, the public barrels, and the ratchet’s compare/update rules are implemented and match the plan.

Scope: uncommitted Phase A surfaces under `libs/frontend/ui` (button, field control, stat card, foundation patterns), `apps/ptah-extension-webview` gallery route, and `tools/ui-class-audit`. Read against `context.md` and `implementation-plan.md`. No `code-style-review.md` in the task folder. `angular-frontend-patterns` was not loaded; this lane’s review contract and the repo rules were the checklist. `npm run verify` was not run. Tailwind’s compiler was used only to see whether the list-detail container utilities emit.

## Five logic questions

### 1. How does this fail silently?

A busy `ptahButton` still runs the caller’s click handler from the keyboard, and a pointer event falls through the button onto whatever is underneath (`button.directive.ts:15-31`). A narrow list-detail hides the list as soon as a row becomes selected and does not move focus (`list-detail.component.ts:9-11`). A partial state panel renders with `role="status"` and no warning chrome, so the caller can believe the partial state was shown (`state-panel.component.ts:9-14`).

### 2. What user action produces unexpected behaviour?

Arrowing through the gallery listbox (default `selectionMode` is `follow`) selects the newly focused row. Below 768px that selection hides the list (`ui-gallery.component.ts:36-42`, `list-detail.component.ts:9`). Pressing Enter or Space on a busy button still activates it. Clicking a busy button can activate a control behind it because `pointer-events-none` does not swallow the event.

### 3. What input data produces a wrong answer?

`ptah-meter` treats any negative `value` as unavailable even when `max` is valid (`meter.component.ts:19`), instead of clamping the bar. `selectedId=""` is not `null`, so the list hides, but it is falsy, so the detail slot and the back button do not render (`list-detail.component.ts:9-12`).

### 4. What happens when a dependency fails?

These components do not call RPC or host services. The gallery is static. `electronOnlySurface` fails closed: it returns `VSCodeService.isElectron`, and a refused `canMatch` never loads the chunk (`electron-only-surface.guard.ts:19-20`, `app.routes.ts:205-208`). A missing or unreadable `baseline.json` makes `ui-class-audit` fail every blocked token; a parse error in a scanned `.ts` file exits 2 (`check-ui-classes.ts:401-405`, `797-804`).

### 5. What is missing that the requirements never mentioned?

Nothing extra was required to judge the batch. The plan’s gallery list of existing overlays, motion, surface card, and surface tile is not in `ui-gallery.component.ts`. Noted as minor finding 8, not as an unspecified case.

## Findings

### 1. Major — busy button still activates

`libs/frontend/ui/src/lib/surfaces/button.directive.ts:15-31`

`busy()` sets `pointer-events-none`, `aria-disabled="true"`, and `aria-busy="true"`, and `blockBusyClick` calls `preventDefault()` plus `stopImmediatePropagation()`. That does not match “keeps focus, blocks duplicate activation, exposes a loading indication.”

- The button stays in tab order (`disabled` is not set). Enter and Space still fire `click` on the button. The template `(click)` listener is registered before the directive host listener, so it runs first. `stopImmediatePropagation()` in the host listener cannot cancel it.
- `pointer-events-none` stops the button from being the hit target, so the click lands on whatever is behind the button.
- There is no visible busy treatment (no spinner, label change, or opacity). `aria-busy` is the only loading signal.

`button.directive.spec.ts:8-15` only checks `btn-primary`, `aria-disabled`, and `disabled === false`. Removing `blockBusyClick` or `pointer-events-none` would still pass.

### 2. Major — narrow list push selects on arrow and drops focus

`libs/frontend/ui/src/lib/foundation/list-detail.component.ts:9-11`
`apps/ptah-extension-webview/src/app/ui-gallery.component.ts:36-42`
`node_modules/@angular/aria/fesm2022/listbox.mjs:50`

Below the 768px container, the list section gets `hidden` whenever `selectedId() !== null`. The detail section is shown, and the back button is not focused. Hiding the focused option moves focus to the document.

The reference listbox does not set `selectionMode`. Angular Aria’s default is `'follow'`, so moving focus selects the row and emits `valueChange`. The gallery writes that into `selection`, which is `selectedId`. On a narrow viewport, ArrowDown selects the next row, hides the list, and leaves focus nowhere. The user cannot arrow through the list. The back button is the only way out, and it is not focused.

`list-detail.component.spec.ts` only checks that a back button appears after `selectedId` is set. It does not project list or detail content, does not press keys, and does not assert focus.

The container utilities themselves do emit. Tailwind compiled `[container-type:inline-size]`, `@container(min-width:768px)` grid and `!block`, and `@container(min-width:1200px)` for the meta rail. At 768px and up, `!block` beats `hidden`, so the wide two-pane and three-pane rules are real. This finding is the narrow selection behavior, not missing CSS.

### 3. Major — selected rows are not visually selected

`libs/frontend/ui/src/lib/foundation/list-row.component.ts:9-11`

The host paints `bg-base-200` and sets `aria-current="page"` only when `current()` is true. Nothing styles `[aria-selected="true"]`. The plan splits those states: `ngOption` owns selection, and `current` is only the route-current marker. A selected row that is not `current` looks identical to an idle row. The gallery sets `current` only on the security row (`ui-gallery.component.ts:39`), so every other selected row stays unstyled.

Global CSS only tints `[aria-selected]` on `.electron-tabs` tabs (`styles.css:2759`), not on these rows.

`list-row.component.spec.ts` asserts `role="option"`, `aria-current`, and `min-h-10`. It never checks a selected class, a disabled style, or Arrow/Home/End. `softDisabled` defaults to `true` (`listbox.mjs:41`), so the gallery’s disabled row stays in the arrow sequence with no disabled class on `ptahListRow`.

### 4. Major — partial state is not a warning above retained content

`libs/frontend/ui/src/lib/foundation/state-panel.component.ts:9-14`

The plan requires a partial `alert-warning` above retained content, with `role="status"` on that warning. The implementation sets `role="status"` on the whole `<section>` when `state() === 'partial'`, and projects `<ng-content>` inside that section, which is `max-w-sm`, `text-center`, and `py-10`. There is no `alert-warning` class. A list projected for the partial state is squeezed into the centered column and is part of the status announcement.

`error` correctly uses `role="alert"`. `loading` sets `aria-busy` and renders three skeleton rows. Empty, error, and no-permission rely on caller `title` / `body` / `actionLabel`, which matches the inputs. Text is interpolated, not `[innerHTML]`.

`state-panel.component.spec.ts` checks `aria-busy` and that a non-loading title is present. It does not assert `role="alert"`, `role="status"`, `alert-warning`, the action output, or projected content. Removing the alert role would still pass.

### 5. Minor — default `npm run verify` does not run the ratchet for a template edit elsewhere

`tools/ui-class-audit/project.json:7-22`

`lint` inputs include `apps/ptah-extension-webview/src/**/*.{html,ts}` and `libs/frontend/**/src/**/*.{html,ts}`. There is no `implicitDependencies`. Nx affected marks a project from files under its root and from project-graph dependencies, not from another project’s files that appear only in target inputs. `scripts/verify.mjs:91-98` uses `nx affected -t lint,test,typecheck` when `-p` is omitted. A new `class="btn"` in `libs/frontend/chat` does not select `ui-class-audit`, so the ratchet does not run. `npm run verify -- -p ui-class-audit` does run it, and those inputs then bust the lint cache. `tools/degradation-audit/project.json` is wired the same way; the plan asked for source inputs and this copies that shape. The default gate still does not enforce the ratchet.

When the lint target does run, the compare rules match the plan (`check-ui-classes.ts:493-573`):

- A new file, or a higher token count in a known file, fails.
- A lower count passes and is reported. It is written only with `--update-baseline`.
- A deleted file becomes `staleFiles` and the run still passes. `--update-baseline` drops it.
- `--update-baseline` never raises an existing count, including for a file that appears after the baseline exists.
- Scan paths are normalized with `replace(/\\/g, '/')` (`check-ui-classes.ts:627`). `writeBaseline` sorts file and token keys with `localeCompare(..., 'en')` and omits zero counts.
- The committed `baseline.json` has 451 files, already sorted, no backslash keys, and a trailing newline.

The scanner only reads `class` / `ngClass` / `[class.*]` / `[class]` / `[ngClass]` / `[className]` / `[attr.class]` inside HTML and inline `template` strings (`check-ui-classes.ts:327-368`, `409-445`). `host: { class: 'btn' }` and `classList.add('btn')` are not counted. Specs, `libs/frontend/ui`, and `libs/frontend/webview-e2e-harness` are ignored.

### 6. Minor — status marker shapes do not match the plan’s mapping

`libs/frontend/ui/src/lib/foundation/status-badge.component.ts:8-19`

The ink mapping is right: running → run, queued/pending → idle, needs-review/warning → need, failed/offline → err, completed/online → done. Visible text is always rendered. The marker shapes are not: running is a filled circle (`rounded-full` + `bg-state-run`), and the plan calls it a ring; queued/pending get a square border (`border` without `rounded-full`), and the plan calls that a hollow mark. Text keeps the status understandable. `bg-state-*` colors exist in `apps/ptah-extension-webview/tailwind.config.js:32-36`.

### 7. Minor — a negative meter value is reported as unavailable

`libs/frontend/ui/src/lib/foundation/meter.component.ts:19-21`

`valid()` requires `value >= 0`. A negative value with a positive `max` shows “Unavailable”, omits `role="meter"`, and draws no bar. The plan says to clamp the visual ratio to 0–100 and to reserve the unavailable state for a zero or invalid max. `max <= 0`, `NaN`, and `Infinity` correctly take the unavailable path. At a valid max, 90 uses `bg-state-need` and 100 uses `bg-state-err` because `NEAR_LIMIT_PERCENT` is the shared constant `90` (`evidence-precedence.ts:11`), compared as a percent (`meter.component.ts:9`). Width is capped at 100. `meter.component.spec.ts` locks 0/89/90/99/100/120 colors only. Deleting the `valid()` branch would not fail that spec.

### 8. Minor — gallery route tests do not lock the guard, and several plan samples are absent

`apps/ptah-extension-webview/src/app/app.routes.ts:205-208`
`apps/ptah-extension-webview/src/app/webview-routing.spec.ts:1232-1241`
`apps/ptah-extension-webview/src/app/ui-gallery.component.ts:18-53`

The route is lazy `loadComponent`, uses `canMatch: [electronOnlySurface]`, sits before the `**` fallback, and is outside `SURFACE_ROUTE_IDS`. VS Code never matches it, so the chunk is not requested. That part is correct.

`webview-routing.spec.ts` only checks that `ui-gallery` is an extra path and that some `canMatch` is set. The loop that requires `electronOnlySurface` covers `apps`, `command-center`, and `machines`, not `ui-gallery`. Replacing the guard with `() => true`, or switching the route to an eager `component`, would still pass. The gallery spec counts badges, panels, meters, and rows. It would still pass if the guard changed.

The gallery also does not show the plan’s existing surface card, surface tile, modal, drawer, dropdown, popover, tabs, autocomplete, provider mark, or motion sample. One responsive list-detail covers the widths when the window is resized; the missing pieces are the existing patterns.

## Checked and correct

- Public API: `src/index.ts` only appends `export * from './lib/foundation'`. `foundation/index.ts` and `surfaces/index.ts` export the new symbols. `scope:webview` may import `scope:shared` (`eslint.config.mjs:290-291`). `NEAR_LIMIT_PERCENT` is on the shared barrel (`libs/shared/src/lib/utils/index.ts:131`).
- Angular shape: new components are standalone and `OnPush`, use `input()` / `input.required()` / `output()`, and do not use `@Input`, `@Output`, `NgModule`, `any`, `@ts-ignore`, `as unknown as`, `console.*`, or `[innerHTML]`. Field control uses `inject(ElementRef)` and adds `input` / `select` / `textarea` plus the `-sm` and border classes in its constructor (`field-control.directive.ts:14-18`).
- Page header title is `text-lg font-semibold tracking-tight`, with optional description, back button, and `[status]` / `[actions]` slots (`page-header.component.ts:7-11`). The header badge in the gallery carries a `status` attribute, so it matches the slot. The spec clicks back.
- Stat card `size` defaults to `text-2xl` and `dense` uses `text-xl` (`stat-card.component.ts:11`). The spec covers the dense path and the actions slot.
- Toolbar search input has `aria-label="Search"`, uses `ptahFieldControl`, emits the input value, and shows `count` including when the parent passes it (`toolbar.component.ts:8-18`). The gallery wires `query` both ways. The spec would fail if the output stopped emitting or the count disappeared. It would not fail if `aria-label` were removed.
- Meter color boundaries and the unavailable max are as above. Reduced motion is `motion-reduce:transition-none` on the fill (`meter.component.ts:9`).
- List row composes with `ngListbox` / `ngOption` on the same host: the spec gets `role="option"`. Minimum row class is `min-h-10` (40px) and type is `text-xs` (12px).
- List-detail wide layout: container type and the 768 / 1200 utilities are generated by Tailwind from the template strings, including `!block` so a selected wide list stays visible. Meta is `hidden` until the 1200px container rule, which is emitted after `.hidden` and therefore wins while the query matches.
- Gallery route is Electron-only and lazy, as cited above. `ACCEPTED_INITIAL_VIEWS` is unchanged, so the host allow-list does not gain `ui-gallery` (`webview-routing.spec.ts:1142-1149`).
- Ratchet compare, seed, decrease, delete, path normalization, and baseline ordering behave as finding 5 describes. The spec file covers new file, same-file increment, unchanged, removal, stale prune, inline templates, and the ui/spec/harness excludes (`check-ui-classes.spec.ts:382-598`).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Do not file the container-query utilities as missing CSS | Treat `[@container(...)]` as dead without `@tailwindcss/container-queries`; treat it as generated | Tailwind compile of the list-detail class strings emitted `container-type: inline-size` and both `@container` rules. The catalog grid avoids the plugin by using raw CSS; that does not stop arbitrary variants. | Yes |
| Do not file conditional `ng-content` as broken | Assume `@if` drops projected detail; assume Ivy projects when the branch is created | Detail/empty slots are inside `@if`. No failing projection test, and current Ivy creates the slot with the branch. Left unfiled. | Yes |
| Rate the affected-graph gap major-adjacent but minor | Major, because default verify skips it; minor, because the plan asked for inputs and degradation-audit is identical | `project.json` has inputs and no `implicitDependencies`. `verify.mjs` uses `nx affected` without `-p`. | Yes |
