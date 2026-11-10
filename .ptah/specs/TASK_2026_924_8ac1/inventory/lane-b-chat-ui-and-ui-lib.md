# Lane B inventory: chat-ui consumers and the `libs/frontend/ui` owner lib

Read-only inventory. Date basis: worktree of `main` at commit f26db123d. No file other than this one was changed.

## 0. How the numbers were made (reproducible)

- **Scope (Part 1):** `libs/frontend/{chat-ui,canvas,chat-execution-tree,chat-streaming,markdown,thoth-shell,core,notification-center}` and `apps/ptah-extension-webview/src`, minus `ui-gallery.component.ts`, `*.spec.ts`, `*.stories.ts`. 367 files (chat-ui 163, core 85, canvas 37, chat-streaming 30, webview 17, chat-execution-tree 10, markdown 10, notification-center 9, thoth-shell 6).
- **Raw count** = `rg -o -g '*.ts' -g '*.html' -e '<pattern>'` (one hit per match, all text: templates, CSS strings, comments, TS code).
- **Classified count** = element instances found by a small Node scanner (the same file set). It reads `.html` files and every inline `template: \`...\`` block, skips HTML comments, reads each opening tag to its closing `>` (quote aware, multi-line) and tests tag attributes. An element in `@for` counts once. Elements whose classes come only from a TS expression (`[class]="fn()"`) are found by tag name but not by class name.
- **Approximate (`~`):** every class-token count (badge, loading, skeleton, alert, card, avatar, tab), `title` counts, and a11y counts for inputs (a wrapping `<label>` is only partly checked). Counts by tag name (button, input, textarea, select, table, li, dialog, progress, img, a) are exact for templates.
- Lib names below are folder names under `libs/frontend`. `chat` and `chat-ui` are different libs. Lib `chat` is outside this scope (it holds most DaisyUI use: baseline 2019 tokens).

## 1. Summary table (Part 1)

| Family | Classified count | Looks | Top surfaces | Approx? |
|---|---|---|---|---|
| F1 field/input (text/search) | 10 `<input>` (text 6, search 3, no type 1) | 9 | chat-ui setup-plugins (mcp/plugin/skill browsers), canvas rail card + orchestra canvas, core permission actions | exact count; looks `~` |
| F2 textarea | 2 | 1 | chat-ui `lane-composer`, `agent-steer-input` | exact |
| F3 select/dropdown/menu | 1 `<select>`, 3 `ptah-native-dropdown`, 3 custom `role=menu`, 1 DaisyUI `dropdown` = 8 (+4 `ptah-native-popover` shells, counted in F7) | 7 | canvas rail (card, focus header, agent dock menu), chat-ui theme toggle | `~` |
| F4 toggle/checkbox/radio | 13 (radio 7, checkbox 6; 1 of the checkboxes has class `toggle`) | 8 | chat-ui question-card, theme-toggle, motion pickers, plugin catalog | exact (inputs) |
| F5 button / icon button / link | 175 `<button>` (text 151, icon-only 24) + 3 `<a>` | 97 raw class recipes, about 20 real looks | chat-ui (116), canvas (41), notification-center (9) | exact count; looks `~` |
| F6 tabs/segmented | 19 (role tab/tablist/tabpanel and `tab` classes) + 4 `join` | 14 + 2 | chat-ui theme-toggle, display-panel, canvas lane tabs, thoth-shell | `~` |
| F7 dialog/popover/tooltip | native `<dialog>` 1; `role="dialog"` elements 7; `ptah-native-popover` 4; `ptah-native-dropdown` 3; native `popover` attr 3; DaisyUI `modal` 3 parts; DaisyUI `tooltip` 0; `title=` on elements 106 | 4 to 7 | chat-ui autopilot-popover, theme-toggle, compaction-marker; canvas dock/orchestra; notification-center | `~` |
| F8 table / list row | `<table>` 1, `<li>` 18, `role=row/listitem` 12, shared list rows 0 | 10 (li), 9 (row) | chat-ui session breakdown, turn recap, compact-session | `~` |
| F9 card / panel / section | DaisyUI `card` 6, collapse/details 6, `ptah-catalog-*`/`storefront` 17, `data-glass-surface` 13 | 6 + 6 | chat-ui, notification-center, canvas | `~` |
| F10 badge/chip/status | `badge` 28, ad-hoc pill 5, status dot 15, `kbd` 0, `ptah-file-status-badge` 2 | 21 + 5 + 13 | chat-ui cost/token/duration badges, tool-call-header, mcp browser | `~` |
| F11 empty/skeleton/spinner | `loading` 16, skeleton 15, `animate-pulse` 4 (dots), `ptah-state-panel` 0 | 4 + 5 | chat-ui (status-badge, plugin browsers), canvas inspector dock | `~` |
| F12 toast/alert/banner | `alert` 8, `role=alert/status` 36, `aria-live` 10, toast/banner 0 elements | 5 | chat-ui plan limits, autopilot popover, mcp browser; notification-center | `~` |
| F13 avatar/mark | `avatar` class 0, `<img>` 1, `ptah-monogram-tile` 5, `ptah-brand-mark` 1, `ptah-provider-mark` 1 | 1 | chat-ui, canvas (`ptah-agent-avatar`, local) | exact for marks |
| F14 other | `<progress>` 4, `divider` 2, `stat` 19, `link` 2, `steps` 2 | 2 (progress) | chat-ui session/vitals tiles | `~` |

Reading the table: the scope has **175 buttons, 26 text fields/selects, 13 toggles, 28 DaisyUI badges** and very few shared `@ptah-extension/ui` controls. Buttons are DaisyUI `btn` classes on `<button>` (111 of 175; 62 more are custom-styled; 2 use `ptahRailIconAction`; 0 use `ptahButton`).

## 2. Part 2: owner lib `libs/frontend/ui/src`

Barrel `libs/frontend/ui/src/index.ts` exports `lib/overlays`, `lib/selection`, `lib/native`, `lib/surfaces`, `lib/motion`, `lib/foundation`, `lib/extracted`. Two extra entry files exist: `libs/frontend/ui/src/brand-mark.ts` (re-exports `PROVIDER_BRAND_ART`, `MarkArtwork`) and `libs/frontend/ui/src/provider-brand-art.ts` (lazy artwork entry).

"Usage" = matches of the tag or attribute in `*.ts`/`*.html` under `libs/frontend/**` and `apps/ptah-extension-webview/**`, outside `libs/frontend/ui`, no specs/stories. "gal" = how many of those sit in `ui-gallery.component.ts`. Behavior layer legend: **NATIVE-POP** = `popover` attribute + `showPopover()`; **NATIVE-DLG** = `<dialog>` + `showModal()`; **FUI** = `@floating-ui/dom` through `native/shared/floating-ui.service.ts`; **CDK-OVL** = `@angular/cdk/overlay`; **CDK-A11Y** = `@angular/cdk/a11y` (Highlightable); **KBD** = own `KeyboardNavigationService` (`native/shared/keyboard-navigation.service.ts:66`). `@angular/aria` is not used in `libs/frontend/ui` (only the gallery imports `@angular/aria/listbox`).

### 2.1 Foundation and surfaces (new design-system layer, TASK_2026_913)

| Selector | File:line | Inputs / outputs | Family | Layer | Usage outside ui | Top consumers |
|---|---|---|---|---|---|---|
| `button[ptahButton]` | `lib/surfaces/button.directive.ts:4` | in: variant, size, iconOnly, busy | F5 button | none (class recipe) | 14 (gal 4) | review-runs-ui 10, webview 4 |
| `input/select/textarea[ptahFieldControl]` | `lib/surfaces/field-control.directive.ts:5` | none | F1/F2/F3 field | none | 10 (gal 4) | review-runs-ui 6 |
| `ptah-field` | `lib/surfaces/field.component.ts:13` | in: label, hint, error | F1 field wrapper | none | 3 (gal 3) | webview gallery only |
| `ptah-inbox-layout` | `lib/surfaces/inbox-layout.component.ts:23` | in: listLabel, detailLabel, leadingLabel, hasLeading, listWidth, leadingWidth, detailOpen | F8 layout | none | 4 (gal 2) | review-runs-ui 1, machines-ui 1 |
| `button[ptahInboxRow]` | `lib/surfaces/inbox-row.directive.ts:23` | in: selected | F8 row | none | 7 (gal 1) | review-runs-ui 5, machines-ui 1 |
| `ptah-stat-card` | `lib/surfaces/stat-card.component.ts:4` | in: label, value, trend, size | F9/F14 | none | 6 (gal 1) | marketplace 5 |
| `ptah-surface-card` | `lib/surfaces/surface-card.component.ts:9` | in: elevation, interactive | F9 card | none | 2 (gal 1) | memory-curator-ui 1 |
| `ptah-surface-section` | `lib/surfaces/surface-section.component.ts:17` | in: tone, padding, glassSurface | F9 section | none | 9 (gal 9) | gallery only |
| `ptah-surface-tile` | `lib/surfaces/surface-tile.component.ts:9` | in: selected, density | F9 tile | none | 1 (gal 1) | gallery only |
| `ptah-page-header` | `lib/foundation/page-header.component.ts:5` | in: title, description, backLabel; out: back | F9 header | none | 1 (gal 1) | gallery only |
| `ptah-toolbar` | `lib/foundation/toolbar.component.ts:5` | in: query, placeholder, count; out: queryChange | F1/F9 | none | 1 (gal 1) | gallery only |
| `ptah-list-detail` | `lib/foundation/list-detail.component.ts:6` | in: selectedId, backLabel; out: back | F8 | none | 1 (gal 1) | gallery only |
| `div[ptahListRow]` | `lib/foundation/list-row.component.ts:7` | in: title, meta, current | F8 row | none | 4 (gal 4) | gallery only |
| `ptah-state-panel` | `lib/foundation/state-panel.component.ts:7` | in: state, title, body, actionLabel; out: action | F11 empty/loading | none | 1 (gal 1) | gallery only |
| `ptah-ui-status-badge` | `lib/foundation/status-badge.component.ts:6` | in: status, label | F10 badge | none | 3 (gal 2) | review-runs-ui 1 |
| `ptah-meter` | `lib/foundation/meter.component.ts:5` | in: value, max, label, unit | F14 meter | none | 1 (gal 1) | gallery only |

### 2.2 Extracted recipes (TASK_2026_9xx setup / rail)

| Selector | File:line | Inputs | Family | Usage | Top consumers |
|---|---|---|---|---|---|
| `button[ptahSetupAction]` | `lib/extracted/setup-action/setup-action.directive.ts:13` | ptahSetupAction, ptahSetupActionBusy | F5 button | 12 | onboarding 7, machines-ui 3, review-runs-ui 2 |
| `select[ptahSetupField]` | `lib/extracted/setup-field/setup-field.directive.ts:11` | ptahSetupField | F3 select | 2 | setup-wizard 1, onboarding 1 |
| `button[ptahRailIconAction]` | `lib/extracted/rail-icon-action/rail-icon-action.directive.ts:5` | label, active, disabled | F5 icon button | 2 | canvas 2 (`canvas-rail-card`) |

### 2.3 Native layer (`lib/native`, native-first behavior)

| Selector | File:line | Inputs / outputs | Family | Layer | Usage | Top consumers |
|---|---|---|---|---|---|---|
| `ptah-native-dropdown` | `lib/native/dropdown/native-dropdown.component.ts:64` | in: isOpen, placement, offset, hasBackdrop, backdropClass, closeOnBackdropClick, panelRole; out: opened, closed, backdropClicked | F3 | NATIVE-POP + FUI | 6 | chat-ui 2, chat 2, marketplace 1 |
| `ptah-native-popover` | `lib/native/popover/native-popover.component.ts:77` | in: isOpen, placement, anchor, offset, hasBackdrop, backdropClass, keepInViewport; out: opened, closed, backdropClicked | F7 | NATIVE-POP + FUI | 37 | chat 29, canvas 3, marketplace 2 |
| `ptah-native-option` | `lib/native/option/native-option.component.ts:48` | in: optionId, value, isActive, disabled; out: selected, hovered | F3 | none (ARIA role=option) | 3 | chat 2, marketplace 1 |
| `ptah-native-autocomplete` | `lib/native/autocomplete/native-autocomplete.component.ts:83` | in: suggestions, isLoading, isOpen, headerTitle, ariaLabel, emptyMessage, optionIdPrefix, listboxId, openActiveIndex, trackBy, suggestionTemplate, matchInputWidth, compact; out: suggestionSelected, closed | F3 combobox | NATIVE-POP + FUI + KBD | 0 (used inside `provider-model-search-field`, `peer-session-picker`) | none |
| `ptah-native-modal` | `lib/native/modal/native-modal.component.ts:68` | in: isOpen, ariaLabel, ariaLabelledby, size; out: closed | F7 modal | NATIVE-DLG | 7 | chat 4, skill-synthesis-ui 2, setup-wizard 1 |
| `ptah-native-drawer` | `lib/native/drawer/native-drawer.component.ts:62` | in: isOpen, side, widthClass, ariaLabel, showCloseButton, closeOnEscape, closeOnBackdrop; out: opened, closed | F7 drawer | NATIVE-POP | 12 | chat 5, marketplace 3, skill-synthesis-ui 2 |
| `ptah-native-tab-group` | `lib/native/tab-group/native-tab-group.component.ts:73` | in: tabs, activeId (model), ariaLabel; out: tabSelected | F6 | KBD | 6 | chat 3, skill-synthesis-ui 1, marketplace 1 |
| `ptah-native-card` | `lib/native/card/native-card.component.ts:104` | in: tone, spine, clickable, selectable, selected, disabled, density, ariaLabel; out: activated | F9 | none | 13 | memory-curator-ui 9, skill-synthesis-ui 2 |
| `ptah-provider-model-picker` | `lib/native/provider-model-picker/provider-model-picker.component.ts:162` | in: provider, model, label, defaultTier, requiresToolUse, fixedProvider, extraProviders, excludedProviders, disabled, searchable; out: selectionChange | F3 composite | uses search field + native autocomplete | 4 | chat 4 |
| `ptah-provider-model-search-field` | `lib/native/provider-model-picker/provider-model-search-field.component.ts:55` | in: options, defaultLabel, selectedId, disabled, loading, loadingLabel, ariaLabel, inputId, includeDefault, pinnedOption, compact, openOnFocus, placeholder; out: modelSelected | F3 combobox | native autocomplete | 3 | chat 3 |
| `ptah-peer-session-picker` | `lib/native/peer-session-picker/peer-session-picker.component.ts:154` | in: sessions, selectedSessionId, label, placeholder; out: selectionChange, opened | F3 | native dropdown + option | 1 | chat 1 |
| `ptah-json-schema-form` | `lib/native/form/json-schema-form.component.ts:45` | in: schema; model: value; out: validChange | F1 form | none | 1 | marketplace 1 |
| `ptah-catalog-card` | `lib/native/catalog-card/catalog-card.component.ts:106` | in: heading, description, meta, badge, headingLevel, interactive; out: activated | F9 | none | 21 | marketplace 14, chat-ui 7 |
| `ptah-catalog-card-skeleton` | `lib/native/catalog-card/catalog-card-skeleton.component.ts:51` | in: density | F11 | none | 10 | marketplace 6, chat-ui 4 |
| `ptah-catalog-grid` | `lib/native/catalog-card/catalog-grid.component.ts:49` | in: ariaLabel | F9 layout | none | 22 | marketplace 14, chat-ui 8 |
| `ptah-storefront-panel` | `lib/native/catalog-card/storefront-panel.component.ts:52` | in: heading, subtitle, headingLevel | F9 panel | none | 8 | marketplace 6, chat-ui 2 |
| `ptah-file-status-badge` | `lib/native/file-status-badge/file-status-badge.component.ts:77` | in: status, conflictKind | F10 | none | 4 | git-ui 2, chat-ui 2 |
| `ptah-brand-mark` | `lib/native/brand-mark/brand-mark.component.ts:105` | in: brandSlug, label, size | F13 | none (vendored art) | 15 | marketplace 13, chat-ui 1 |
| `ptah-mark-svg` | `lib/native/brand-mark/mark-svg.component.ts:46` | in: art, paint | F13 | none | 0 (internal to brand/provider mark) | none |
| `ptah-monogram-tile` | `lib/native/brand-mark/monogram-tile.component.ts:112` | in: label, size | F13 | none | 16 | marketplace 5, chat-ui 5, command-center 4 |
| `ptah-provider-mark` | `lib/native/provider-mark/provider-mark.component.ts:67` | in: providerId, fallback, size | F13 | none | 18 | chat 8, dashboard 4, command-center 4 |
| `ptah-aurora-effect` | `lib/native/aurora/aurora-effect.component.ts:14` | in: variant, visible | decoration | none | 1 | canvas 1 |
| `[ptahMotionStage]` | `lib/motion/motion-stage.directive.ts:23` | n/a (motion) | motion | none | 6 | chat 4 |
| `[ptahMotionRouteStage]` | `lib/motion/motion-route-stage.directive.ts:56` | n/a (motion) | motion | none | 7 | marketplace 7 |
| `FloatingUIService`, `KeyboardNavigationService` | `lib/native/shared/floating-ui.service.ts:95`, `keyboard-navigation.service.ts:66` | services | behavior | FUI, KBD | internal | native components |

Barrels `native/brand-slugs`, `native/mark-svg`, `native/monogram-tile`, `native/brand-mark/index.ts` and top-level `brand-mark.ts`, `provider-brand-art.ts` re-export files from `native/brand-mark/*`. They exist to keep the vendored logo table out of the eager chunk (see header comment in `lib/native/monogram-tile/index.ts`).

### 2.4 Older CDK layer (`lib/overlays`, `lib/selection`)

| Selector | File:line | Inputs / outputs | Layer | Usage outside ui |
|---|---|---|---|---|
| `ptah-dropdown` | `lib/overlays/dropdown/dropdown.component.ts:42` | in: isOpen, positions, hasBackdrop, backdropClass, closeOnBackdropClick; out: opened, closed, backdropClicked | CDK-OVL | 0 |
| `ptah-popover` | `lib/overlays/popover/popover.component.ts:47` | in: isOpen, position, positions, hasBackdrop, backdropClass; out: opened, closed, backdropClicked | CDK-OVL + a11y | 0 |
| `ptah-autocomplete` | `lib/selection/autocomplete/autocomplete.component.ts:55` | in: suggestions, isLoading, isOpen, headerTitle, ariaLabel, emptyMessage, trackBy, suggestionTemplate; out: suggestionSelected, closed | CDK-OVL + a11y + KBD | 0 |
| `[autocompleteInput]` | `lib/selection/autocomplete/autocomplete.directive.ts:15` | none | host directive | 0 |
| `ptah-option` | `lib/selection/option/option.component.ts:36` | in: optionId, value; out: selected, hovered | CDK-A11Y Highlightable | 0 |

### 2.5 Duplicates inside the ui lib

| Pair | Which is current | Evidence |
|---|---|---|
| `overlays/dropdown` `ptah-dropdown` vs `native/dropdown` `ptah-native-dropdown` | Native one. CDK one has 0 outside use. | outside use 0 versus 6 |
| `overlays/popover` `ptah-popover` vs `native/popover` `ptah-native-popover` | Native one (37 uses). | 0 versus 37 |
| `selection/option` `ptah-option` vs `native/option` `ptah-native-option` | Native one (3 uses). `ptah-option` has 0 outside use. | 0 versus 3 |
| `selection/autocomplete` vs `native/autocomplete` | Native one (inside two pickers). CDK one has 0 outside use. | 0 versus 0 direct, native used via pickers |
| `native/card` `ptah-native-card` vs `surfaces/surface-card` `ptah-surface-card` | Both live and not related. Native card has 13 uses (memory-curator-ui, skill-synthesis-ui). Surface card has 2 uses (1 gallery). Two card APIs: tone/spine/density versus elevation/interactive. | no re-export |
| `foundation/status-badge` `ptah-ui-status-badge` vs chat-ui `ptah-status-badge` | Different components. chat-ui badge at `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts:18` maps chat states (pending, streaming, complete, resumed, error) to DaisyUI `badge-*`; ui badge maps `PtahStatus` (running, queued, failed, online ...). chat-ui tag has 0 template uses found. | selectors differ |
| `native/file-status-badge` vs the two above | Third badge, git status only (4 uses). | |
| Brand marks: `ptah-brand-mark`, `ptah-provider-mark`, `ptah-monogram-tile` | Three marks on one SVG renderer `ptah-mark-svg`. Not duplicates. | |
| Re-exports | Only the barrel files in 2.3 are re-exports (`native/mark-svg`, `native/monogram-tile`, `native/brand-slugs`, top-level `brand-mark.ts`, `provider-brand-art.ts`). No component in 2.4 re-exports a native one. | |
| `ptah-button` recipes | `ptahButton` (surfaces), `ptahSetupAction`, `ptahRailIconAction` are three separate button recipes. | |

## 3. Gallery, audit tool and tokens

### 3.1 `ui-gallery`
- File `apps/ptah-extension-webview/src/app/ui-gallery.component.ts` (99 lines, selector `ptah-ui-gallery`, plus local `ptah-inbox-layout-demo`).
- Route: `apps/ptah-extension-webview/src/app/app.routes.ts:205` (`path: 'ui-gallery'`, `data: { standalone: true }`, lazy `loadComponent`). It sits before the `**` fallback (checked by `app.routes.spec.ts:57`).
- Guard: `canMatch: [electronOnlySurface]` from `apps/ptah-extension-webview/src/app/electron-only-surface.guard.ts` (reads `VSCodeService.isElectron` per navigation; a refused match skips the lazy chunk and falls to `chat`).
- Shows: page header with back button and status badge; sections Buttons (variant x size grid, icon-only, busy), Fields, Metrics (`ptah-stat-card`), Statuses, States (`ptah-state-panel`), Meters, Surfaces (card, tile), List and detail, Inbox layout. It also imports `Listbox`/`Option` from `@angular/aria/listbox`. It is reached only by URL `/ui-gallery`. It shows only the foundation/surfaces layer (2.1), not the native layer.

### 3.2 `tools/ui-class-audit`
- Files: `tools/ui-class-audit/check-ui-classes.ts` (ratchet), `baseline.json` (89 KB), spec, project.json.
- Ratchets raw DaisyUI roots in templates outside the ui lib. `BLOCKED_ROOTS` at `check-ui-classes.ts:69`: `alert, badge, btn, card, input, select, skeleton, textarea`. A class is blocked if it equals a root or starts with `<root>-` (except `select-none|text|all|auto`). Tailwind variant prefixes and `!` are stripped first. Dynamic class expressions that cannot be proven safe count as one `<dynamic>`.
- Scans (`DEFAULT_SCAN_GLOBS`, line 565): `apps/ptah-extension-webview/src/**/*.{html,ts}` and `libs/frontend/**/src/**/*.{html,ts}` (inline templates only in `.ts`). Ignores `node_modules`, `dist`, `libs/frontend/ui/**`, specs, `libs/frontend/webview-e2e-harness`.
- Not ratcheted: `modal`, `dropdown`, `tabs`, `join`, `loading`, `toggle`, `checkbox`, `radio`, `tooltip`, `avatar`, `kbd`, `progress`, `menu`, `collapse`.
- Rule: counts may fall, never rise. `--update-baseline` never raises a value.
- Baseline totals: 451 files, **5572** occurrences. By root: `btn` 3531, `badge` 772, `input` 336, `alert` 174, `select` 110, `skeleton` 96, `textarea` 49, `card` 22, `<dynamic>` 482. Top tokens: `btn` 1160, `btn-ghost` 651, `btn-sm` 576, `btn-xs` 539, `badge` 258, `btn-primary` 217, `btn-outline` 200, `input-bordered` 110.
- By lib: chat 2019, marketplace 548, chat-ui 432 (59 files), git-ui 344, tasks-ui 313, onboarding 288, memory-curator-ui 250, skill-synthesis-ui 196. In Part 1 scope: chat-ui 432, canvas 123 (11 files), notification-center 31, core 19, thoth-shell 9, webview 2, markdown 1.

### 3.3 Design tokens today
Files: `apps/ptah-extension-webview/src/styles.css` (4113 lines), `apps/ptah-extension-webview/src/app/app.css` (73 lines, 0 custom properties; it only uses `--vscode-editor-*`), `apps/ptah-extension-webview/tailwind.config.js` (363 lines).

| Group | Tokens | Location |
|---|---|---|
| Glass | `--glass-panel`, `--glass-border`, `--glass-blur` (legacy) | `styles.css:94-96` |
| Glass (full set) | `--glass-base/-2/-3`, `--glass-ink`, `--glass-accent`, `--glass-blur`, `--glass-blur-overlay`, `--glass-saturation`, `--glass-brightness`, `--glass-filter(-overlay)`, `--glass-plate`, `--glass-fill(-raised/-overlay/-tile/-input)`, `--glass-tint(-alpha/-mix)`, `--glass-hover`, `--glass-sel`, `--glass-bubble-user`, `--glass-code(-ink)`, `--glass-edge-top/-bottom`, `--glass-line(-strong)`, `--glass-input-edge`, `--glass-glint`, `--glass-divider`, `--glass-scrim`, `--glass-scroll`, `--glass-badge-tint`, `--glass-btn-tint`, `--glass-grain` | `styles.css:2828-2885` |
| Glass scenes | `--glass-scene-{aurora,ember,tide,horizon,pyramid,temple}` and `--glass-tint-alpha-*` | `styles.css:3039-3050` |
| Glass finish | `--glass-sheen`, `--glass-glow-ring/-halo/-blur`, `--glass-outline-*`, `--glass-rim`, `--glass-frame`, `--glass-raise`, `--glass-lip-display`, `--glass-composer-overlay-alpha` | `styles.css:3559-3601`, `3708` |
| Surface and elevation | `--surface-0/1/2/3`, `--surface-border`, `--surface-border-strong`, `--surface-highlight`, `--elev-shadow`, `--elev-shadow-raised`; glass shadows `--glass-elev-1/2/3`, `--glass-shadow`, `--glass-shadow-overlay`, `--glass-pane-shadow`, `--glass-content-shadow`, `--glass-overlay-shadow` | `styles.css:159-173`; `2875-2876`; `3560-3562`; `3598-3600` |
| State ink | `--state-ink-run/need/err/done` (per stock theme; mapped to `text-state-*`, `bg-state-*` in `tailwind.config.js:32-35`), `--ptah-error-ink`, `--ptah-accent-ink`, `--agent-badge-text-light/-dark` | `styles.css:327-338` (per theme, 132 `data-theme` rules in file), `2409-2412`, `1159-1160`; `tailwind.config.js:32` |
| Radius | `--glass-radius`, `--glass-radius-inner`, `--glass-radius-sm`; `--tab-radius` (`tailwind.config.js:318`) | `styles.css:2840-2842` |
| Spacing | `--sidebar-spacing-xs/sm/md/lg`, `--compact-spacing-xs/sm/md/lg`, `--sidebar-font-size/-icon-size`, `--compact-font-size/-icon-size`, `--golden-ratio` | `styles.css:70-83`, `120` |
| Focus ring | No shared token. Only `--glass-focus` and `--composer-focus-ink` | `styles.css:2879`, `3890` |
| Control height | `--btn-height-xs/sm/md`, `--input-height`, `--avatar-size-sm/md` | `styles.css:86-91` |
| Motion | `--ptah-ease-soft`, `--ptah-ease-gentle-in`, `--ptah-motion-*`, `--ptah-stagger-step` | `styles.css:41-56`, `866-943` |
| Brand / agent | `--ptah-gold(-strong/-soft)`, `--ptah-link`, `--gradient-*`, `--agent-color-*`, `--agent-architect...supervisor`, `--aura-color-*`, `--tab-bg`, `--tab-border-color` | `styles.css:59-61`, `99-124`, `1150-1176`, `2736` |

DaisyUI themes (`apps/ptah-extension-webview/tailwind.config.js`): custom `anubis` (line 87, dark), `anubis-light` (156), `ptah-glass` (232, default dark: `darkTheme` at 338), `ptah-glass-light` (277). The 32 stock DaisyUI themes are removed from the main sheet and ship as a lazy `theme-extra.css` (comment at lines 321-336; theme list in `libs/frontend/core/src/lib/services/theme.service.ts`, 34 names).

## 4. Part 1 per family

Conventions: count = classified; "raw" = rg `-o` count (lib split in brackets). Looks = class recipe without layout classes.

### F1 Field/input
- **Raw:** `<input\b` 24 [chat-ui 20, core 2 (one is a JSDoc comment in `autopilot-state.service.ts:59`), canvas 2]. **Classified:** 23 inputs in templates: 10 text/search + 13 checkbox/radio (see F4). Types of the 10: text 6, search 3, no type 1.
- **Looks (9 for 10):** `input input-bordered input-sm` family, 4 sizes of the same DaisyUI recipe. `input input-bordered input-sm pl-8 text-xs` ×2 (`libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts:176`); `input input-bordered input-xs text-xs` ×1 (`.../molecules/agent-steer-input.component.ts:83`); `input input-xs input-bordered input-info text-[10px] bg-base-100/50` (`.../molecules/question-card.component.ts:202`); canvas variant with custom border and focus classes (`libs/frontend/canvas/src/lib/orchestra-canvas.component.ts:128`); plain `input input-bordered input-sm` (`libs/frontend/core/src/lib/components/attention-permission-actions.component.ts:46`). Other 3 differ in icon padding or mono font (`plugin-catalog-panel.component.ts:452`, `mcp-directory-browser.component.ts:343`, `canvas-rail-card.component.ts:419`).
- **Where:** chat-ui setup-plugins (mcp directory, plugin catalog, skill.sh browser), chat-ui agent steer and deny popover, canvas rail rename and orchestra canvas, core permission actions.
- **Binding (26 text/radio/checkbox/textarea/select controls):** event binding `(input)` 10, `(change)` 14, `[value]` 15, `[checked]` 13; `[(ngModel)]` 2; reactive forms 0; signal forms 0; CDK 0; aria 0.
- **a11y gaps:** input without `aria-label`/`aria-labelledby` and with no `id`/`placeholder`/`title`: 8 raw hits, about 4 real after a wrapping-`<label>` check (examples: `question-card.component.ts:115`, `:150`, `:180`, `install-scope-field.component.ts:103`, `mcp-directory-browser.component.ts:393`). Placeholder as only name: 1 (`question-card.component.ts:202`).
- **Shared component used:** `@ptah-extension/ui` field controls: 0 (no `ptahFieldControl` or `ptah-field` in scope).

### F2 Textarea
- **Raw:** 2 [chat-ui 2]. **Classified:** 2. **Looks:** 1 (no class, styled by `[class]="textareaClass"`): `libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts:18`, `agent-steer-input.component.ts:46`.
- **Where:** lane composer and agent steer input. **Binding:** event binding `(input)` + `[value]`; auto-size by `field-sizing: content`. **a11y:** `lane-composer.component.ts:18` has `[id]` and a label nearby (ok); no unlabeled textarea found (count 0). **Shared:** 0.

### F3 Select / dropdown / menu / combobox
- **Raw per pattern:** `<select\b` 1 [chat-ui 1]; native-dropdown/autocomplete/popover/option/picker tags 14 [chat-ui 6, canvas 8; includes TS imports]; `\bdropdown(-content)?\b` 23 [chat-ui 15, core 4, canvas 4]; `\bmenu\b` 73 [canvas 51, chat-ui 18, core 2, markdown 1, thoth-shell 1]; `role=(menu|menuitem|listbox|combobox|option)` 22 [canvas 22]; `cdkMenu|ngListbox|ngCombobox|ngOption` 0.
- **Classified (8):** `<select>` 1 (`mcp-directory-browser.component.ts:329`), `ptah-native-dropdown` 3 (chat-ui 2, canvas 1), custom `role="menu"` 3 with 11 `role="menuitem"` buttons (`libs/frontend/canvas/src/lib/canvas-rail/canvas-focus-header.component.ts:42`, `canvas-rail-card.component.ts:291`, `canvas-detail/agent-dock-menu.component.ts:81`), DaisyUI `dropdown` 1 (`theme-toggle.component.ts:199`).
- **Looks (7):** `select select-bordered select-sm text-xs` ×1; menu panel `rounded-lg border border-base-content/10 bg-base-200 p-2 shadow-lg` ×2 (`canvas-focus-header.component.ts:42`); menu item `btn btn-ghost btn-sm font-normal` ×8 (`canvas-focus-header.component.ts:48`); `btn btn-ghost btn-sm py-1 font-normal` ×3 (`canvas-rail-card.component.ts:298`); `dropdown dropdown-end` + `dropdown-content p-2 shadow-lg bg-base-200 rounded-box` (`theme-toggle.component.ts:199`, `:214`).
- **Where:** canvas rail (card menu, focus header menu), agent dock menu, chat-ui theme toggle and mcp directory browser.
- **Binding:** signals + `(click)`; native popover 1 (`theme-toggle.component.ts:217` `popover="auto"`, `showPopover()` at `:514`); Floating UI via `ptah-native-dropdown` only; CDK 0; `@angular/aria` 0.
- **a11y gaps:** custom menus: 3 `role=menu`, all with key handlers on the element (gap count 0). `<select>` has no label in template: 1 (`mcp-directory-browser.component.ts:329`, check). DaisyUI dropdown inside theme toggle opens by popover but has `role="dialog"` without `aria-modal`: 1 (`theme-toggle.component.ts:214`).
- **Shared:** `ptah-native-dropdown` 3, `ptah-native-popover` 4, `ptah-native-option` 0, `ptah-provider-model-picker` 0, `ptah-peer-session-picker` 0.

### F4 Toggle / checkbox / radio
- **Raw:** `type="checkbox"` 7 [core 1 (JSDoc), chat-ui 6]; `type="radio"` 7 [chat-ui 7]; class `toggle|checkbox|radio` 142 [chat-ui 119, core 14, canvas 6, notif 2, markdown 1] (mostly prose and TS names, not classes); `role="switch"` 0.
- **Classified:** 13 inputs (checkbox 6, radio 7).
- **Looks (8):** `checkbox checkbox-xs checkbox-primary` ×3 (`mcp-directory-browser.component.ts:393`); `radio radio-xs radio-info` ×2 (`question-card.component.ts:150`); `radio radio-xs` (`motion-preference.component.ts:16`); `radio radio-xs radio-primary` (`install-scope-field.component.ts:103`); `checkbox checkbox-xs checkbox-info` (`question-card.component.ts:115`); `toggle toggle-primary toggle-sm` (`plugin-catalog-panel.component.ts:522`); `sr-only peer` radios drawn as custom tiles ×3 (`motion-style-picker.component.ts:54`, `theme-toggle.component.ts:320`, `:334`); checkbox with no class (`theme-toggle.component.ts:310`).
- **Where:** chat-ui question card, theme toggle (glass, accent, scene), motion pickers, install scope, plugin catalog, MCP browser.
- **Binding:** `[checked]` + `(change)` 13; `[(ngModel)]` 0 on these.
- **a11y gaps:** no `aria-label` on checkbox/radio: 8 raw (about 3 are wrapped by `<label>`): `motion-preference.component.ts:16`, `motion-style-picker.component.ts:54`, `theme-toggle.component.ts:310`, `question-card.component.ts:115`, `:150`, `:180`, `install-scope-field.component.ts:103`, `mcp-directory-browser.component.ts:393`. `role="switch"` missing on the `toggle` input: 1 (`plugin-catalog-panel.component.ts:522`).
- **Shared:** none (no `@ptah-extension/ui` toggle exists).

### F5 Button and icon button
- **Raw:** `<button\b` 176 [chat-ui 117, canvas 41, notification-center 9, core 5, thoth-shell 2, webview 2]; class `\bbtn\b` 371 (token hits incl. `btn-*`); `ptahButton|ptahSetupAction|ptahRailIconAction` 2 [canvas 2]; `role="button"` 2 [canvas 2]; `btn-square|btn-circle` 15; `<a\b` 5 (3 elements, 2 are strings in markdown renderer).
- **Classified (175 buttons):** text 151, icon-only 24 (16 chat-ui, 4 notification-center, 3 canvas, 1 thoth-shell); links 3 `<a>` (`report-response-button.component.ts:33`, `mcp-directory-browser.component.ts:470`, `skill-sh-browser.component.ts:241`). With class `btn`: 111; with no `btn` class (custom Tailwind): 62; `ptahRailIconAction`: 2; `ptahButton`: 0; `ptahSetupAction`: 0.
- **Modifiers (buttons):** `btn-ghost` 77, `btn-xs` 68, `btn-sm` 41, `btn-primary` 21, `btn-square|circle` 14, `btn-outline` 9, `btn-error` 4, `btn-info` 4, `btn-success` 3, `btn-warning` 3.
- **Looks:** 97 raw recipes, top 12 (rest 85 are one-off Tailwind recipes):

| # | Look | Count | Example |
|---|---|---|---|
| 1 | `btn btn-ghost btn-xs` | 23 | `libs/frontend/chat-ui/src/lib/atoms/theme-toggle.component.ts:200` |
| 2 | no class (class set by `[class]` or host) | 13 | `libs/frontend/chat-ui/src/lib/atoms/copy-button.component.ts:27` |
| 3 | `btn btn-ghost btn-sm` | 9 | `libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts:36` |
| 4 | `btn btn-primary btn-sm` | 5 (+3 `btn-sm btn-primary`) | `.../setup-plugins/mcp-directory-browser.component.ts:249` |
| 5 | `btn btn-xs join-item` | 4 | `.../setup-plugins/plugin-catalog-panel.component.ts:314` |
| 6 | `btn btn-ghost btn-square btn-xs` | 3 | `libs/frontend/chat-ui/src/lib/atoms/copy-text-button.component.ts:34` |
| 7 | `btn btn-primary btn-xs` | 3 | `.../chat-input/autopilot-popover.component.ts:139` |
| 8 | `rounded px-1.5 py-0.5` (link-like text) | 3 | `.../compact-session/compact-session-activity.component.ts:599` |
| 9 | `btn btn-xs btn-ghost` (same as 1) | 3 | `.../compact-session/compact-session-callout.component.ts:97` |
| 10 | `btn btn-ghost btn-sm flex-nowrap` | 3 | `libs/frontend/canvas/src/lib/canvas-rail/canvas-focus-header.component.ts:48` |
| 11 | `btn btn-ghost btn-sm h-auto py-1 text-left` | 3 | `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:298` |
| 12 | `btn btn-xs btn-success` | 2 | `.../agent-card/agent-card-permission.component.ts:45` |

  After merging (1, 9) and (4, 3-more): about 20 real looks.
- **Where:** chat-ui molecules (setup-plugins, lane composer, compact-session, agent cards), canvas rail and focus header, notification-center, core permission actions.
- **Binding:** `(click)` 173 of 175; `[disabled]` 36; `aria-label` 77; `aria-pressed|expanded` 41; `type` attribute 175 of 175.
- **a11y gaps:** icon-only with no `aria-label` and no `title`: 0. `title` as the only name: 1 (`question-card.component.ts:210`). Button with no text and no `aria-label` (may use interpolation): 2 (`question-card.component.ts:210`, `plan-limit-tile.component.ts:59`). Clickable `<div>`/`<span>`: see F7/other below (4).
- **Shared:** `ptahRailIconAction` 2 (canvas); all other buttons use raw DaisyUI.

### F6 Tabs / segmented
- **Raw:** `role=(tab|tablist|tabpanel)` 24 [chat-ui 13, canvas 8, thoth-shell 3]; `\btabs?\b` 792 (mostly prose and TS names; not a measure); `\bjoin\b` 74 (mostly the word "join" in TS, 8 in templates); `ptah-native-tab-group` 0.
- **Classified:** 19 elements (tablist 4, tab 7, tabpanel and tab-class helpers 8) + 4 `join` groups.
- **Looks (14 + 2):** custom `theme-tab surface-tab` ×2 (`theme-toggle.component.ts:228`); sidebar tab label `tab-label uppercase text-[10px] font-semibold` (`sidebar-tab.component.ts:83`); `dp-strip border-b ...` (`display-panel.component.ts:204`); `dp-pill rounded-full border ...` (`display-panel.component.ts:211`); canvas lane tabs `border-b border-surface-border bg-surface-1 ...` (`canvas-lane-tabs.component.ts:142`); `join` + `btn btn-sm join-item` segmented scope control (`install-scope-field.component.ts:96`). The other 8 are one-offs.
- **Where:** chat-ui theme toggle, display panel, sidebar tab; canvas lane tabs; thoth-shell nav.
- **Binding:** signals + `(click)`; roving keyboard 0 `(keydown)` on tablist elements.
- **a11y gaps:** `role=tablist` without key handler (arrow keys) on the element: 4 (`theme-toggle.component.ts:227`, `:259`, `display-panel.component.ts:204`, `canvas-lane-tabs.component.ts:142`). Tab without `aria-selected`: 0.
- **Shared:** `ptah-native-tab-group` 0 uses in scope (6 uses in other libs).

### F7 Dialog / modal / drawer / popover / tooltip
- **Raw:** `<dialog\b` 3 (1 template, 2 markdown strings); class `\bmodal\b` 21; `ptah-native-modal|drawer` 0; `\bdrawer\b` 5 [core 5, comments]; `popover` 55; `\btooltip\b` 24 (all comments or names, 0 DaisyUI tooltip); `data-tip` 0; `title="|[title]|[attr.title]` 178 lines; `role="dialog"` 11; `Overlay\b|cdkConnectedOverlay` 0.
- **Classified:** native `<dialog>` 1 (`libs/frontend/chat-ui/src/lib/molecules/notifications/compaction-marker.component.ts:54`, DaisyUI `modal`, `modal-box`, `modal-backdrop`, `showModal`); `role="dialog"` elements 7 (the same + `autopilot-popover.component.ts:60`, `theme-toggle.component.ts:214`, `canvas-inspector-dock.component.ts:228`, `canvas-rail-card.component.ts:417`, `orchestra-canvas.component.ts:115`, `notification-center.component.ts:32`); `ptah-native-popover` 4 (chat-ui 1, canvas 3); `ptah-native-dropdown` 3; native `popover` attribute 3 (chat-ui); `title` on an element 106 (~, chat-ui 85, canvas 14).
- **Looks (surface panels):** `surface-3 p-4 rounded-xl` (`orchestra-canvas.component.ts:115`); `surface-3 rounded-2xl border border-[color:var(--surface-border)]` (`notification-center.component.ts:32`); `dropdown-content p-2 shadow-lg bg-base-200 rounded-box` (`theme-toggle.component.ts:214`); `modal` / `modal-box` (`compaction-marker.component.ts:54`); `bg-base-100` panel (`canvas-inspector-dock.component.ts:228`); plain panel `p-4` (`canvas-rail-card.component.ts:417`); no-class popover panel (`autopilot-popover.component.ts:60`). 7 looks.
- **Where:** chat-ui autopilot popover, theme toggle, compaction marker; canvas inspector dock, rail card rename, orchestra canvas dialog; notification-center panel.
- **Binding:** native `<dialog>` + `showModal()` 1; native `popover` attribute + `showPopover()` 3 (`theme-toggle.component.ts:217`, `:514`); Floating UI 0 in scope (inside `ptah-native-popover`); CDK 2 imports (`@angular/cdk`); `@angular/aria` 0. Rest: signals + `@if`.
- **a11y gaps:** dialog without label (`aria-label` or `aria-labelledby`): 1 (`compaction-marker.component.ts:54`). `role="dialog"` without `aria-modal`: 5 (`theme-toggle.component.ts:214`, `autopilot-popover.component.ts:60`, `compaction-marker.component.ts:54`, `canvas-rail-card.component.ts:417`, `orchestra-canvas.component.ts:115`). Focus management for custom dialogs (not native `<dialog>`): not detectable by static scan, 6 to check. `title` as only name: native tooltip on 106 elements, no keyboard or touch access (examples: `agent-avatar.component.ts:139` ×25, `session-stats-summary.component.html:279` ×6, `inspector-session-stats.component.ts:265`).
- **Shared:** `ptah-native-popover` 4, `ptah-native-dropdown` 3, `ptah-native-modal` 0, `ptah-native-drawer` 0.

### F8 Table and list row
- **Raw:** `<table\b` 1; class `\btable\b` 57 (prose, not class); `ptah-list-row|ptahInboxRow|ptah-list-detail` 0; `<li\b` 19; `role=(row|listitem)` 19 lines.
- **Classified:** `<table>` 1 (`libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/lane-usage-tile.component.ts:234`); `<li>` 18 [chat-ui 17, canvas 1]; `role=row|listitem` elements 12 [chat-ui 10, notification-center 2]; clickable `li`: 0.
- **Looks:** `<li>` 10 looks: no class ×8 (`boot-progress.component.ts:127`); `border-b border-base-content/10 py-1.5 last:border-b-0` ×2 (`turn-summary-files.component.ts:84`); hover row `border-l-2 border-transparent hover:bg-base-content/5` (`compact-session-activity.component.ts:660`); row `py-1 pl-3 pr-2 border-t ... hover:bg-[var(--surface-highlight)]` (`lane-result-card.component.ts:104`); 5 more one-offs. `role=row`: 9 looks; `notification-row surface-2 rounded-xl border ...` ×2 (`notification-center.component.ts:48`); `model-usage-row px-2 py-1 border-b` ×3 (`session-model-breakdown.component.ts:34`, `:81`, `:126`).
- **Where:** chat-ui session stats, model breakdown, turn recap, compact session, plugin browsers; notification-center rows.
- **Binding:** signals + `@for`; no `(click)` on `li` (0). Clickable rows are `<button>` inside `@for` (not counted as rows).
- **a11y gaps:** clickable `<div>`/`<span>` with `(click)` and no role, tabindex or key handler: 4 (`libs/frontend/chat-ui/src/lib/atoms/file-path-link.component.ts:36`, `.../compact-session/compact-session-activity.component.ts:670`, `.../notifications/compaction-marker.component.ts:92`, `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts:233`); 3 of those have no key handler at all. `<table>` without caption or header scope: 1.
- **Shared:** `ptah-list-row`, `ptahInboxRow`, `ptah-list-detail`, `ptah-inbox-layout`: 0 in scope.

### F9 Card / panel / section header
- **Raw:** class `\bcard\b` 446 (chat-ui 223, canvas 129, chat-streaming 80; mostly component names like `*-card`); `ptah-native-card|surface-card|surface-section|surface-tile|stat-card|page-header|toolbar` 0; `data-glass-surface` 16; `\bcollapse\b` 48; `<details\b` 9 (3 template, 3 markdown strings).
- **Classified:** DaisyUI `card`/`card-body` elements 6; `collapse`/`<details>`/custom collapse elements 6; `ptah-catalog-card|grid|storefront-panel` 17 (chat-ui); `data-glass-surface` elements 13; local card components (chat-ui `ptah-artifact-card`, `ptah-agent-dock-card`, `li[ptah-canvas-rail-card]`).
- **Looks:** 6 card looks: `card card-border border-base-300 bg-base-200/50 shadow-sm` (`libs/frontend/chat-ui/src/lib/molecules/thinking-block.component.ts:28`); `stats-card rounded border border-base-content/10 bg-base-200/50 px-2 py-1.5` (`.../session/session-stats-summary.component.html:235`); `snackbar-card surface-3 rounded-xl border ...` (`libs/frontend/notification-center/src/lib/notification-snackbar.component.ts:35`); `card-body px-4 pt-0 pb-4` (`thinking-block.component.ts:70`); 2 more. 6 collapse looks (`dp-collapse` `turn-summary-chip.component.ts:130`; `bg-base-200/30 rounded border ...` `agent-card-output.component.ts:279`).
- **Where:** chat-ui session stats, thinking block, turn recap; canvas rail cards; notification-center; chat-ui catalog.
- **Binding:** signals + `(click)`; `<details>` native toggle 3.
- **a11y gaps:** clickable card via `div`: see F8 (4). Section headers with no heading element: not scanned.
- **Shared:** `ptah-catalog-card` 7, `ptah-catalog-grid` 8, `ptah-storefront-panel` 2 (all chat-ui); `ptah-native-card` 0; `ptah-surface-*` 0.

### F10 Badge / chip / status
- **Raw:** `\bbadge\b` 278 [chat-ui 247, thoth-shell 17, chat-streaming 4, markdown 4, core 2, canvas 2, notif 1, webview 1]; `ptah-status-badge|ptah-file-status-badge|ptah-ui-status-badge` 3; `rounded-full` 56; `\bkbd\b` 2 (markdown strings).
- **Classified:** `badge` elements 28 (class tokens in TS computed strings add about 89, see approximate); ad-hoc pill 5; status dot 15; `kbd` 0; `ptah-file-status-badge` 2.
- **Looks (badge 21; top 12):** `badge badge-xs badge-outline rc-chip` 3 (`compact-rail-meta.component.ts:130`); `badge badge-sm badge-ghost opacity-70` 2 (`cost-badge.component.ts:63`); `badge badge-outline badge-sm` 2 (`token-badge.component.ts:34`); `badge badge-xs font-mono px-1.5 ptah-superpower-badge` 2 (`agent-card-output.component.ts:104`); `badge badge-xs font-mono px-1.5` 2 (`permission-request-card.component.ts:94`); `badge badge-sm badge-neutral` 2 (`mcp-directory-browser.component.ts:293`); `badge badge-sm badge-success ok-solid-text` (`cost-badge.component.ts:52`); `badge badge-ghost badge-sm` (`duration-badge.component.ts:18`); `badge badge-sm` (`atoms/status-badge.component.ts:21`); `badge badge-sm badge-warning` (`agent-card-permission.component.ts:25`); `badge badge-xs badge-ghost font-mono` (`agent-summary.component.ts:93`); `badge badge-primary badge-outline badge-xs` (`autopilot-popover.component.ts:74`). Rest 9. Pills: 5 looks (`px-2 py-0.5 rounded-full border border-base-300 bg-base-200/40 text-xs` `compaction-marker.component.ts:23`). Dots: 13 looks of `rounded-full` + color/size (`background-agent-strip.component.ts:178`, `:244`, `:250`).
- **Where:** chat-ui atoms (`cost-badge`, `token-badge`, `duration-badge`, `status-badge`), tool-call header, mcp browser, background-agent strip, lane usage tile; canvas agent dock menu.
- **Binding:** signals + interpolation, `[class.badge-*]`; 5 badge elements use dynamic `[class]`.
- **a11y gaps:** status dot with color only and no text or `aria-label`: about 15 dots, none checked for `aria-hidden` + sibling text (examples: `background-agent-strip.component.ts:178`, `plan-limit-tile.component.ts:135`, `boot-progress.component.ts:158`). `title` as only name on badges: 6 (`cost-badge.component.ts:63`, `compact-rail-meta.component.ts:130`).
- **Shared:** `ptah-file-status-badge` 2. Local chat-ui atoms (`ptah-token-badge`, `ptah-cost-badge`, `ptah-duration-badge`, `ptah-status-badge`) wrap DaisyUI `badge`. `ptah-ui-status-badge`: 0.

### F11 Empty state / skeleton / spinner
- **Raw:** `\bloading\b` 130; `skeleton` 30; `animate-spin` 2 (TS only); `animate-pulse` 6; `ptah-state-panel` 0.
- **Classified:** `loading` elements 16 (4 looks: `loading loading-spinner loading-xs` ×12 `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts:30`; `... -translate-y-1/2` ×2 `mcp-directory-browser.component.ts:185`; `loading loading-spinner text-primary` `boot-progress.component.ts:148`; `loading loading-spinner loading-lg text-primary` `apps/ptah-extension-webview/src/app/app.html:45`); skeleton elements 15 (5 looks: `skeleton` ×7 inside `skeleton-block.component.ts:42`; `skeleton rounded` ×2 `mcp-directory-browser.component.ts:279`; canvas skeleton blocks 8 `canvas-inspector-dock.component.ts:211`); `animate-pulse` 4 dots.
- **Empty states:** about 10 ad-hoc blocks (icon + text) not counted exactly (for example `canvas-empty-board.component.ts:75`, `artifact-viewer.component.ts:119`).
- **Where:** chat-ui status badge, plugin browsers, boot-progress; canvas inspector dock and empty board; webview `app.html` boot.
- **Binding:** signals + `@if`. **a11y gaps:** spinner without accessible text: about 14 (`status-badge.component.ts:30`, `autopilot-popover.component.ts`, `skill-sh-browser.component.ts`); `role="status"` present on 5 loaders.
- **Shared:** `ptah-skeleton-block` (local, chat-ui, 2 uses in `chat`); `ptah-catalog-card-skeleton` 4 (chat-ui); `ptah-state-panel` 0.

### F12 Toast / alert / banner
- **Raw:** `\balert\b` 56; `toast` 2 (TS names); `banner` 10 (core, comments); `role=(alert|status)` 37; `aria-live` 10.
- **Classified:** `alert` elements 8 (5 looks: `alert alert-error py-1.5 px-3` ×2 `autopilot-popover.component.ts:134`; `alert alert-error alert-sm py-1 px-2` ×2 `mcp-directory-browser.component.ts:157`; `alert alert-info alert-sm py-1 px-2` `mcp-directory-browser.component.ts:144`; `alert alert-error` `apps/ptah-extension-webview/src/app/app.html:17`; plain `lane-usage-tile.component.ts:123`); `role=alert|status` elements 36 (21 looks, e.g. `border-l-2 border-info pl-2 text-[11px]` `inspector-limits-lanes.component.ts:19`); `aria-live` elements 10; toast: `notification-snackbar.component.ts:35` + `notification-announcer.component.ts` (live region).
- **Where:** chat-ui plan limits, autopilot, MCP browser, motion preference; notification-center; webview boot.
- **Binding:** signals + `@if`; `aria-live` 10. **a11y gaps:** `alert` class without `role="alert"`: not matched by the scan (check `autopilot-popover.component.ts:134`, `mcp-directory-browser.component.ts:144`). Status text without live region: not measured.
- **Shared:** none (`notification-center` is its own lib).

### F13 Avatar / mark
- **Raw:** `\bavatar\b` 43 (TS names and CSS); `ptah-brand-mark|provider-mark|monogram-tile|mark-svg` 9; `<img\b` 2.
- **Classified:** `avatar` class elements 0; `ptah-agent-avatar` (local, canvas 5, chat 3); `<img>` 1 (`display-file-viewer.component.ts:23`, `object-contain`); `ptah-monogram-tile` 5, `ptah-brand-mark` 1, `ptah-provider-mark` 1, `ptah-mark-svg` 0; svg elements 8 (3 without `aria-hidden`/`role`/label: `agent-avatar.component.ts:163`, `context-ring.component.ts:13`, `activity-grid.component.ts:130`).
- **Where:** chat-ui discovery views, agent avatar, display file viewer. **Binding:** inputs only. **a11y gaps:** `<img>` without `alt`: 0; svg without hidden/label: 3.
- **Shared:** `ptah-monogram-tile` 5, `ptah-brand-mark` 1, `ptah-provider-mark` 1.

### F14 Other
- **Raw:** `<progress\b` 4; `\bprogress\b` 97; `ptah-meter` 0; `\bdivider\b` 10 (5 markdown strings); `\bsteps?\b` 203 (prose); `\bbreadcrumbs\b` 0; `\bstat\b` 68; `\blink\b` 302 (prose and markdown).
- **Classified:** `<progress>` 4 (2 looks: `progress progress-success` ×2 `compact-session-activity.component.ts:826`; `progress` ×2 `provider-lane-limit-tile.component.ts:24`); `divider` 2; stat class 19; `link` class 2; `steps` 2 (`question-card.component.ts:80`); custom rings: `ptah-context-ring`, `ptah-plan-ring`, `ptah-progress-ring`, `ptah-readiness-ring`, `ptah-spend-bars` (local chart controls, no ui-lib use).
- **a11y gaps:** `<progress>` without label: 2 (`provider-lane-limit-tile.component.ts:24`). **Shared:** `ptah-meter` 0.

## 5. (b) Top 15 files by raw control markup

Elements counted: button, input, textarea, select, a, dialog, progress, img, table, details, and badge/alert/loading/skeleton/toggle/checkbox/radio class elements.

| Count | File |
|---|---|
| 19 | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts` |
| 16 | `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts` |
| 12 | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts` |
| 11 | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts` |
| 10 | `libs/frontend/chat-ui/src/lib/molecules/chat-input/autopilot-popover.component.ts` |
| 10 | `libs/frontend/chat-ui/src/lib/molecules/question-card.component.ts` |
| 9 | `libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts` |
| 8 | `libs/frontend/chat-ui/src/lib/atoms/theme-toggle.component.ts` |
| 8 | `libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-call-header.component.ts` |
| 8 | `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts` |
| 7 | `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts` |
| 7 | `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-activity.component.ts` |
| 7 | `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts` |
| 7 | `libs/frontend/core/src/lib/components/attention-permission-actions.component.ts` |
| 7 | `libs/frontend/notification-center/src/lib/notification-center.component.ts` |

## 6. (c) Reusable controls defined in Part 1 scope

Usage = `<selector` matches across `libs/frontend/**` + `apps/ptah-extension-webview/**` (no specs/stories).

| Selector | File:line | What it is | Usages | Top consumers |
|---|---|---|---|---|
| `ptah-theme-toggle` | `libs/frontend/chat-ui/src/lib/atoms/theme-toggle.component.ts:45` | dropdown + tabs + radios + toggle (popover) | 3 | chat 3 |
| `ptah-copy-button` | `.../atoms/copy-button.component.ts:23` | icon/text button | 1 | chat 1 |
| `ptah-copy-text-button` | `.../atoms/copy-text-button.component.ts:30` | icon button | 3 | chat-ui 3 |
| `ptah-report-response-button` | `.../atoms/report-response-button.component.ts:29` | link button | 1 | chat 1 |
| `ptah-status-badge` | `.../atoms/status-badge.component.ts:18` | badge | 0 | none |
| `ptah-token-badge` | `.../atoms/token-badge.component.ts:31` | badge | 1 | chat 1 |
| `ptah-cost-badge` | `.../atoms/cost-badge.component.ts:48` | badge | 4 | chat-ui 3, chat 1 |
| `ptah-duration-badge` | `.../atoms/duration-badge.component.ts:15` | badge | 2 | chat-ui 1, chat 1 |
| `ptah-skeleton-block` | `.../atoms/skeleton-block.component.ts:21` | skeleton | 2 | chat 2 |
| `ptah-typing-cursor` | `.../atoms/typing-cursor.component.ts:13` | spinner-like indicator | 7 | chat 7 |
| `ptah-context-ring` | `.../atoms/context-ring.component.ts:9` | meter | 1 | command-center 1 |
| `ptah-sidebar-tab` | `.../atoms/sidebar-tab.component.ts:29` | tab button | 5 | chat 4, canvas 1 |
| `ptah-split-handle` | `.../atoms/split-handle.component.ts:45` | resize handle | 3 | chat-ui 1, chat 1, canvas 1 |
| `ptah-electron-resize-handle` | `.../atoms/electron-resize-handle.component.ts:31` | resize handle | 3 | mcp-apps-page 1, chat-ui 1, chat 1 |
| `ptah-agent-avatar` | `.../atoms/agent-avatar/agent-avatar.component.ts:128` | avatar | 8 | canvas 5, chat 3 |
| `ptah-expandable-content` | `.../atoms/expandable-content.component.ts:22` | disclosure | 0 | none |
| `ptah-file-path-link` | `.../atoms/file-path-link.component.ts:31` | link (has the clickable `span`, F8 gap) | 0 | none |
| `ptah-motion-style-picker` | `.../atoms/motion-style-picker.component.ts:14` | radio tiles | 1 | chat-ui 1 |
| `ptah-motion-preference` | `.../atoms/motion-preference.component.ts:7` | radio group | 1 | chat-ui 1 |
| `ptah-tool-icon` | `.../atoms/tool-icon.component.ts:29` | icon | 1 | chat-ui 1 |
| `ptah-notification-snackbar` | `libs/frontend/notification-center/src/lib/notification-snackbar.component.ts:14` | toast | 2 | chat 2 |
| `ptah-attention-permission-actions` | `libs/frontend/core/src/lib/components/attention-permission-actions.component.ts:8` | buttons + text field | 5 | notification-center 3, chat-ui 1, canvas 1 |
| `ptah-agent-dock-menu` | `libs/frontend/canvas/src/lib/canvas-detail/agent-dock-menu.component.ts:28` | custom menu | 1 | canvas 1 |
| `ptah-autopilot-popover`, `ptah-deny-message-popover` | `libs/frontend/chat-ui/src/lib/molecules/chat-input/autopilot-popover.component.ts`, `.../permissions/deny-message-popover.component.ts` | popover with form | 1 each (not counted here) | chat |
| `ptah-install-scope-field` | `.../molecules/setup-plugins/install-scope-field.component.ts` | radio `join` group | 1 | chat-ui |
| `ptah-plan-ring`, `ptah-progress-ring`, `ptah-readiness-ring`, `ptah-spend-bars` | `libs/frontend/chat-ui/src/lib/molecules/**` | meters / charts | local | chat-ui |

Molecules and canvas components that are screens, not controls (not listed): `ptah-question-card`, `ptah-mcp-directory-browser`, `ptah-skill-sh-browser`, `ptah-lane-composer`, canvas rail components.

## 7. Decisions

1. `libs/frontend/chat` is outside Lane B scope; its numbers appear only in the usage tables of Part 2.
2. A button is "icon-only" when its only child is an svg/icon element or when it has `btn-square|btn-circle`.
3. Class-token counts (badge, loading, card, tab) use template element instances; computed class strings inside TS code are not counted as elements and are marked approximate. Raw counts are in the per-family lists.
4. `ptah-status-badge` in `chat-ui` and `ptah-ui-status-badge` in `ui` are treated as two components, not as one duplicate and one re-export.
5. `ui-gallery.component.ts` usages are shown separately as "gal" for Part 2 and are excluded from Part 1.
6. For a11y gaps, a wrapping `<label>` was checked only for the 10 flagged inputs; remaining gaps need a manual check before a fix.
