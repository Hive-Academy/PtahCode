# Implementation Plan — TASK_2026_UI_FOUNDATION

## Summary and scope

Phase A makes `@ptah-extension/ui` the reusable page foundation for the approved Inbox list/detail direction. Add seven patterns, a native button directive, align the existing field control and stat card, add an Electron-only gallery, and ratchet new raw DaisyUI usage. Keep DaisyUI 4, Tailwind 3, and the glass tokens in `apps/ptah-extension-webview/src/styles.css`. Dashboard, Machines, and Reviews page migrations, RPC, and data loading belong to later phases.

Inputs read: task `context.md`; UX `DESIGN.md` §8, `report.md` §3/5, `reviews-ux.md`, `machines-ux.md`, `prototype/tokens.css`, `prototype/reviews-a.html`, `prototype/machines-a.html`; dashboard `design-audit.md`; UI source/config/barrels; webview routes/styles; root package and verify; degradation audit. The design inputs establish the 480/768/1200 container ladder, 12 px text floor, 40 px row floor, glass roles and Settings-style title.

Code evidence: `libs/frontend/ui/project.json` names `@ptah-extension/ui` with `scope:webview,type:ui`; `src/index.ts` must remain a pure star-export barrel (its comment cites the guard spec); `surfaces/index.ts` already exports section/card/tile/stat/field; `surfaces/field-control.directive.ts` adds only a size class; `apps/ptah-extension-webview/src/app/app.routes.ts` owns standalone routes and ends with a wildcard; `electron-only-surface.guard.ts` refuses VS Code before lazy loading; `styles.css` defines glass, surface, state and gold tokens; `libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts:11` defines near limit as 90%.

All new declarations are standalone, components use OnPush, and APIs use signal `input()`/`output()`. The UI index is the only cross-project import path.

## Dependency change

Implementation adds exact `"@angular/aria": "22.2.6"` to root `package.json` dependencies and updates `package-lock.json`. Keep installed `@angular/cdk` `~22.2.0`, adjusting only if peer metadata requires it. Confirm the pinned package's declarations after installation. [npm version listing](https://www.npmjs.com/package/%40angular/aria?activeTab=versions) lists 22.2.6; the [Angular listbox guide](https://angular.dev/guide/aria/listbox) documents `Listbox`/`Option` from `@angular/aria/listbox` with `ngListbox`/`ngOption`; the [toolbar guide](https://angular.dev/guide/aria/toolbar) documents `Toolbar`/`ToolbarWidget` from `@angular/aria/toolbar`.

Use Listbox/Option for selectable rows: they own roving focus, keyboard navigation and `aria-selected`. Use native controls and normal Tab order for the search/filter bar, which mixes a text input, chips and a select; Angular Toolbar is intended for a coordinated widget set. Other patterns need native semantics, not Aria primitives. Do not add CDK Overlay: current native overlays already own that boundary. CDK test harness utilities may be used for Aria interaction tests; no additional focus manager.

## Component specifications

Paths below are relative to `libs/frontend/ui/src/lib/`. Each component has the stated `*.component.ts` and same-stem `*.component.spec.ts`. Keep templates small or pair a same-stem HTML file. Use static class tokens so Tailwind sees them; project Angular content, never raw HTML.

| Component / file | Contract | Appearance, states, a11y and test seam |
| --- | --- | --- |
| `ptah-page-header` / `foundation/page-header.component.ts` | `title = input.required<string>()`; `description = input<string | null>(null)`; `backLabel = input<string | null>(null)`; `back = output<void>()`; slots `[status]`, `[actions]`. | `text-lg font-semibold tracking-tight` heading, muted description, `border-surface-border` bottom rule, glass `bar` when sticky. Optional back uses labeled native `ptahButton`. Test optional slots, title semantics, narrow wrap and back output. |
| `ptah-list-detail` / `foundation/list-detail.component.ts` | `selectedId = input<string | null>(null)`; `backLabel = input('Back to list')`; `back = output<void>()`; slots `[list]`, `[detail]`, `[empty]`, `[meta]`. Caller owns selected id in route/store and scroll restoration. | Container query: narrow list or pushed detail; at 768 px fixed 320 px list + fluid detail with independent scroll; at 1200 px optional 280 px meta rail. Unselected wide view shows empty slot. Use `surface-1`, borders, glass tile/bar. Test selection/back, empty state and layout at 360/768/1200; caller integration tests focus return to selected row. No observers/timers per row. |
| `ptah-list-row` / `foundation/list-row.component.ts` | Attribute selector `div[ptahListRow]`; `title = input.required<string>()`, `meta = input<string | null>(null)`, `current = input(false)`; `[leading]`/`[trailing]` slots. Consumer applies `ngOption [value]` to same host inside `ngListbox [value]`. | `min-h-10 px-3 py-2.5`, grid `[auto_1fr_auto]`, truncated meta with title, focus-visible ring, selected tint. `ngOption` owns tabindex/selection; `current` supplies `aria-current=page` only when route-current. Test arrows/Home/End, selection/current, disabled and 40 px floor. Do not nest action buttons in option. Link rows use native anchors without listbox semantics. |
| `ptah-status-badge` / `foundation/status-badge.component.ts` | `status = input.required<'running' | 'queued' | 'pending' | 'needs-review' | 'warning' | 'failed' | 'offline' | 'completed' | 'online'>()`; `label = input<string | null>(null)`. | `badge badge-sm`; 8 px marker and visible text. Map running→run/ring, queued/pending→idle/hollow, review/warning→need/diamond, failed/offline→err/square, completed/online→done/circle using `--state-ink-*`. Test all mappings in dark/light and text availability. |
| `ptah-state-panel` / `foundation/state-panel.component.ts` | `state = input.required<'loading' | 'empty' | 'error' | 'partial' | 'no-permission'>()`; `title/body = input<string | null>(null)`; `actionLabel = input<string | null>(null)`; `action = output<void>()`. | Loading 3–5 skeleton rows and `aria-busy`; empty centered CTA; safe caller-facing error with `role=alert`; partial `alert-warning` above retained content with `role=status`; permission explanation. `py-10 px-4 max-w-sm`, glass styling. Test all five variants, roles/action, and transition to content. Never display raw error/secret. |
| `ptah-toolbar` / `foundation/toolbar.component.ts` | `query = input('')`, `queryChange = output<string>()`, `count = input<number | null>(null)`; slots `[filters]`, `[sort]`. | Labeled search input with `ptahFieldControl`, projected chips using `ptahButton` and caller-owned `aria-pressed`, native select, right count `tabular-nums`; sticky `data-glass-surface=bar`, wrap at 480 px. Test search output, filter Tab order, count and label. |
| `ptah-meter` / `foundation/meter.component.ts` | `value = input.required<number>()`, `max = input.required<number>()`, `label = input.required<string>()`, `unit = input('')`. | Clamp visual ratio 0–100; zero/invalid max shows unavailable and no misleading fill. `role=meter` and `aria-valuemin/max/now` only for valid data. Track `--surface-border-strong`; fill gold below 90%, need ink from 90% (import `NEAR_LIMIT_PERCENT` from `@ptah-extension/shared`; do not copy the number), err ink at ≥100% (at limit). No 75% step. Test 0/89/90/99/100/over/invalid and light/dark. Reduced motion disables width transition. |

### Existing standards and exports

Keep surface-card/section/tile, stat-card, field + fieldControl, native modal/drawer/dropdown/popover/tab-group/autocomplete/provider-mark and motionStage. Add `surfaces/button.directive.ts` + spec: `button[ptahButton]` with `variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('secondary')`, `size = input<'xs' | 'sm'>('sm')`, `iconOnly = input(false)`, `busy = input(false)`. It applies DaisyUI `btn` hierarchy; busy keeps focus, blocks duplicate activation, exposes `aria-disabled` and loading indication; icon-only caller supplies `aria-label`. Preserve native button semantics. Modify `surfaces/field-control.directive.ts` to add matching DaisyUI base class plus size/border classes to input/select/textarea; keep `ptah-field` help/error wiring. Add `size = input<'default' | 'dense'>('default')` to stat-card (text-2xl/text-xl) without changing default. Export through `surfaces/index.ts` and new `foundation/index.ts`; append only star exports to `src/index.ts`.

## Gallery route

Create `apps/ptah-extension-webview/src/app/ui-gallery.component.ts` + spec. Register lazy `/ui-gallery` in `app.routes.ts` with `canMatch: [electronOnlySurface]` before wildcard. It is internal review, outside `SURFACE_ROUTE_IDS` and without `SURFACE_ACTIVE`; check route/surface parity tests and update `app.routes.spec.ts` if needed. Deterministic sample data; no RPC. Expose light/dark via existing theme mechanism, no copied tokens.

Show every new pattern and existing surface/field/button/overlay/motion pattern: list-detail unselected/narrow pushed/two-pane/three-pane; row default/hover/focus/selected/current/disabled; all badge statuses; all five state panels; toolbar empty/query/chips/count; meter 0/89/90/99/100/unavailable; page header with/without back/status/actions; button variants/busy; field normal/error; stat default/dense; surface card/section/tile; native modal/drawer/dropdown/popover/tab/autocomplete/provider mark; motion and reduced-motion sample. Review in Electron at 360/480/768/1200 container widths, dark and light, checking glass, clipping, contrast, focus, 12 px type floor and motion preference.

## Lint ratchet

Create `tools/ui-class-audit/check-ui-classes.ts`, `baseline.json`, `project.json`, `check-ui-classes.spec.ts`. Follow `tools/degradation-audit`: committed normalized-path baseline, fail increases, allow decreases, never regenerate silently. Parse Angular external HTML and inline templates under `apps/ptah-extension-webview/src` and `libs/frontend/**/src`; exclude `libs/frontend/ui`, specs and generated output. Inspect static `class`, `[class.foo]` and static `ngClass`; report file/line/class. Fail new dynamic expressions that may contain blocked roots unless proven safe.

Block class roots `btn,input,select,textarea,card,badge,alert,skeleton` and their DaisyUI modifiers (`btn-primary`, `input-sm`, `card-body`, etc.), not HTML tag names or Tailwind utilities. Allowed replacements: `ptahButton`, `ptahFieldControl` with `ptah-field`, surface components, status badge, state panel and toolbar. Baseline each blocked token count per file, so a new usage in an existing file fails; seed exact counts during implementation from existing ~100 form files. Test new-file addition, same-file increment, unchanged usage, removal and inline templates. Add Nx `ui-class-audit:lint` with source inputs. `scripts/verify.mjs` confirms scoped `-p` and default lint/test/typecheck targets. Run `npm run verify -- -p ui-class-audit`; final gate `npm run verify -- -p @ptah-extension/ui,ptah-extension-webview,ui-class-audit`.

## Batches

File-disjoint, with all paths workspace-relative. Each named component spec accompanies its implementation.

| Batch | Exact files | Suggested executor / scoped verify |
| --- | --- | --- |
| 1 dependency/controls | MODIFY `package.json`, `package-lock.json`, `libs/frontend/ui/src/lib/surfaces/field-control.directive.ts`, `surfaces/index.ts`, `surfaces/stat-card.component.ts`, `surfaces/stat-card.component.spec.ts`; CREATE `surfaces/button.directive.ts`, `surfaces/button.directive.spec.ts`, `surfaces/field-control.directive.spec.ts` | Angular UI engineer; `npm run verify -- -p @ptah-extension/ui`. Check pinned Aria types/peers first. |
| 2 layout/selection/status | CREATE `libs/frontend/ui/src/lib/foundation/page-header.component.ts`, `page-header.component.spec.ts`, `list-detail.component.ts`, `list-detail.component.spec.ts`, `list-row.component.ts`, `list-row.component.spec.ts`, `status-badge.component.ts`, `status-badge.component.spec.ts` | Angular UI engineer; `npm run verify -- -p @ptah-extension/ui`. Depends on batch 1. |
| 3 remaining patterns/public API | CREATE `libs/frontend/ui/src/lib/foundation/state-panel.component.ts`, `state-panel.component.spec.ts`, `toolbar.component.ts`, `toolbar.component.spec.ts`, `meter.component.ts`, `meter.component.spec.ts`, `foundation/index.ts`; MODIFY `libs/frontend/ui/src/index.ts` | Angular UI engineer; `npm run verify -- -p @ptah-extension/ui`. Exports follow batches 1–2. |
| 4 Electron gallery | CREATE `apps/ptah-extension-webview/src/app/ui-gallery.component.ts`, `ui-gallery.component.spec.ts`; MODIFY `app.routes.ts`, `app.routes.spec.ts` | Angular app engineer; `npm run verify -- -p ptah-extension-webview`. Depends on batch 3. |
| 5 ratchet | CREATE `tools/ui-class-audit/check-ui-classes.ts`, `baseline.json`, `project.json`, `check-ui-classes.spec.ts` | Tooling engineer; `npm run verify -- -p ui-class-audit`; then combined gate. Parallel with 2–4; seed baseline against existing legacy files. |

## Risks and preserve list

- Preserve every existing UI public export/selector: surfaces, field + fieldControl, stat card, native overlays, autocomplete/option, provider mark, motion, overlay/selection APIs. Keep `src/index.ts` star-only. No V2 or compatibility shim.
- Aria 22.2.6 is absent here. Confirm pinned declarations and peer metadata before imports. Prove `ngOption` works on the row's attribute-component host; if not, place it on a plain wrapper around a presentational row. One focus owner only.
- Prototype fixed dark colors and compact rows conflict with audited theme tokens and 12/40 px floors. Use source tokens and DESIGN.md §8; inspect both themes. Avoid new global CSS unless tokens cannot express a state.
- Per-file totals can hide same-file additions; token-per-file baseline and regression tests are mandatory. Dynamic expressions must not bypass the ratchet.
- Container queries drive layout without per-row ResizeObserver, timers or polling. Caller provides safe error summaries, route/store owns selection and scroll.

## Decisions

### User-decided directions

| # | Decision | Scope and evidence | Reversible |
| --- | --- | --- | --- |
| 1 | `ptah-page-header` uses only `text-lg font-semibold tracking-tight` for its title. | Phase A; UX `report.md` §5 records the accepted Settings-style title, and `DESIGN.md` §8.2 specifies the header. | Yes |
| 2 | Existing `ptah-stat-card` gains a size input; default remains `text-2xl`, dense uses `text-xl`. | Phase A; UX `report.md` §5, current `surfaces/stat-card.component.ts` default. Existing callers continue to work. | Yes |
| 3 | Reviews minimum severity remains read-only: “Minimum severity: Minor (fixed).” | Later Reviews phase; UX `report.md` §5. No Phase A contract change. | Yes |
| 4 | Fix the missing `review:listFindings` call in a separate bug-fix PR before Reviews redesign. | Later Reviews phase; UX `report.md` §5. | Yes |
| 5 | Reviews pagination uses a “Load more” button at the end of the list. | Later Reviews phase; UX `report.md` §5. | Yes |
| 6 | Reviews polls only while a run is `running`. | Later Reviews phase; UX `report.md` §5. No backend push-event contract in Phase A. | Yes |

### Phase A architecture decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Native button directive and existing fieldControl are the standards. | New button/form components; raw DaisyUI. | `surfaces/field.component.ts` already wires label/help/error; DESIGN.md §8.8–9 needs native controls. | Yes |
| Aria Listbox/Option owns selectable row focus; links remain links. | Manual roving tabindex; all links. | Angular listbox guide; DESIGN.md §8.5 permits options or links. | Yes |
| Gallery is an Electron-only internal route outside surface IDs. | Public surface ID; separate app. | `app.routes.ts`, `electron-only-surface.guard.ts`, surface route tests. | Yes |
| Nx audit with per-file/token baseline. | Global immediate ESLint ban; file count. | Existing raw usage; `tools/degradation-audit/project.json` and baseline pattern. | Yes |
| Meter: need ink from 90% (`NEAR_LIMIT_PERCENT`), err ink at 100%. Orchestrator correction: the lane proposed 75%/90%, which conflicts with the project's single 90% near-limit rule and the dashboard plan. | 75% warning + 90% critical. | `evidence-precedence.ts:11`; dashboard plan.md (one 90% threshold); DESIGN.md §8.11 corrected. | Yes |
| User decisions (report.md §5): page title `text-lg font-semibold tracking-tight`; stat-card `size` input (default text-2xl, dense text-xl). Items 3–6 are Reviews-page decisions for Phase C. | — | User via session master, 2026-11-09. | Yes |

## Clarifications Needed

None for Phase A. Earlier six UX questions are resolved in UX `report.md` §5; page migration decisions remain later work.
