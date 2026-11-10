# Button family research

Source: `ui-foundation-tokens` branch. Scope: `apps/ptah-extension-webview/src` and `libs/frontend/**` template HTML and inline TS; exclude specs, stories, webview E2E harness.

## Census

Method: read-only Python `pathlib.rglob`, regex `<(button|a)\b[^>]*>` (DOTALL), parse static `class="..."` or single-quoted class, split/deduplicate/sort tokens; group only tags with exact `btn` token. The script was piped via PowerShell to `python -`. Dynamic `[class]`/`ngClass` is not evaluated; interpolated class attributes remain literal. Counts are static source occurrences, not rendered repetitions.

**1,076 elements, 352 exact sorted class sets:** 1,051 `button`, 25 `a`. Variant-class counts (independent): primary 166; ghost 607; outline 174; error 17; link 10; neutral 0; accent 0; success 5; warning 18; secondary 1; info 4. Each name here means `btn-<name>`. Sizes: `btn-xs` 535, `btn-sm` 496, no size 45, `btn-md` 0, `btn-lg` 0. Shapes: `btn-square` 71, `btn-circle` 14, `btn-block` 0, `btn-wide` 0. Older inventory counts differ because its ratchet counts class tokens and its classified looks use a different method and branch.

| Count | Sorted recipe | Two examples (`file:line`) |
|---:|---|---|
|125|`btn btn-ghost btn-xs`|`libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:101`; `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:705`|
|70|`btn btn-ghost btn-sm`|`libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.ts:150`; `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:121`|
|54|`btn btn-primary btn-sm`|`libs/frontend/ui/src/lib/native/catalog-card/catalog-card.component.ts:53`; `libs/frontend/ui/src/lib/native/catalog-card/storefront-panel.component.ts:33`|
|44|`btn btn-outline btn-sm`|`libs/frontend/ui/src/lib/native/peer-session-picker/peer-session-picker.component.ts:167`; `libs/frontend/setup-wizard/src/lib/components/agent-next-steps.component.ts:108`|
|27|`btn btn-ghost btn-xs gap-1`|`libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:185`; `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:224`|
|20|`btn btn-sm`|`apps/ptah-extension-webview/src/app/git-window/git-window.component.ts:29`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/bulk-rebase-confirm.component.ts:64`|
|17|`btn btn-ghost btn-xs text-base-content`|`libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:148`; `libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:160`|
|16|`btn btn-outline btn-xs`|`libs/frontend/skill-synthesis-ui/src/lib/components/clones/lazy-diff-view.component.ts:86`; `libs/frontend/setup-wizard/src/lib/components/community-packs-panel.component.ts:106`|
|16|`btn btn-primary btn-xs`|`libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:328`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-body-editor.component.ts:107`|
|14|`btn btn-ghost btn-square btn-xs`|`libs/frontend/thoth-shell/src/lib/components/thoth-shell.component.ts:104`; `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:210`|
|13|`btn btn-xs join-item`|`libs/frontend/memory-curator-ui/src/lib/components/memory-indexed-code.component.ts:108`; `libs/frontend/memory-curator-ui/src/lib/components/memory-indexed-code.component.ts:117`|
|12|`btn btn-outline btn-xs gap-1`|`libs/frontend/marketplace/src/lib/ui/coverage-matrix.component.ts:144`; `libs/frontend/marketplace/src/lib/ui/needs-attention.component.ts:136`|
|12|`btn btn-primary btn-xs gap-1`|`libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:86`; `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:165`|
|11|`btn btn-ghost btn-xs shrink-0`|`libs/frontend/mcp-apps-page/src/lib/components/apps-page.component.ts:155`; `libs/frontend/marketplace/src/lib/external-install-report.component.ts:67`|
|10|`border-error btn btn-outline btn-sm text-base-content`|`libs/frontend/chat/src/lib/settings/advanced-settings.component.ts:97`; `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:397`|
|10|`border-error btn btn-outline btn-xs text-base-content`|`libs/frontend/git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:189`; `libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:146`|
|9|`btn btn-ghost btn-xs focusRing {{ }}`|`libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.ts:204`; `libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.ts:219`|
|9|`btn btn-ghost btn-xs px-1`|`libs/frontend/git-ui/src/lib/git-dock/git-dock-header.component.ts:75`; `libs/frontend/git-ui/src/lib/git-dock/git-dock-header.component.ts:118`|
|8|`border border-base-300 btn btn-ghost btn-sm`|`libs/frontend/onboarding/src/lib/proposal/proposal-status-card.component.ts:61`; `libs/frontend/onboarding/src/lib/proposal/proposal-status-card.component.ts:63`|
|8|`btn btn-ghost`|`libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:39`; `libs/frontend/setup-wizard/src/lib/components/confirmation-modal.component.ts:100`|
|8|`btn btn-sm min-h-9`|`libs/frontend/onboarding/src/lib/analyze/generate-agents.page.ts:194`; `libs/frontend/onboarding/src/lib/analyze/generate-agents.page.ts:201`|
|7|`border border-surface-border btn btn-ghost btn-sm`|`libs/frontend/tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:102`; `libs/frontend/tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:143`|
|7|`btn btn-ghost btn-sm btn-square`|`libs/frontend/tasks-ui/src/lib/components/tasks-view.component.ts:121`; `libs/frontend/tasks-ui/src/lib/components/tasks-view.component.ts:156`|
|6|`border border-surface-border btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-base-content focus-visible:outline-offset-2`|`libs/frontend/tasks-ui/src/lib/components/task-board-states.component.ts:80`; `libs/frontend/tasks-ui/src/lib/components/task-board-states.component.ts:150`|
|6|`btn btn-ghost btn-sm gap-1`|`apps/ptah-extension-webview/src/app/git-window/git-window.component.ts:24`; `libs/frontend/marketplace/src/lib/ui/bulk-action-bar.component.ts:94`|

## Current owner

`libs/frontend/ui/src/lib/surfaces/button.directive.ts`: selector `button[ptahButton]`. Exact host classes are the union of `btn`, one variant class (primary → `btn-primary`, secondary → `btn-secondary`, ghost → `btn-ghost`, danger → `btn-error`), one size class (xs → `btn-xs`, sm → `btn-sm`), optional `btn-square` for `iconOnly=true`, and optional `opacity-60 cursor-wait` for `busy=true`. Default is `btn btn-secondary btn-sm`. Busy adds `aria-disabled=true` and `aria-busy=true`, intercepts clicks in capture phase, and stays focusable per its spec. **20 template occurrences in 7 files** (`rg -l "ptahButton"` plus tag scan). Missing: md, link, anchor host, tooltip, loading-indicator DOM, default `type="button"`, and required icon-only name.

`extracted/setup-action/setup-action.directive.ts` owns onboarding looks: primaryCompact `btn btn-primary btn-sm`, primaryFull `btn btn-primary mt-4`, ghost `btn btn-sm`, glass `btn btn-primary btn-sm min-h-8`. `extracted/rail-icon-action/rail-icon-action.directive.ts` owns canvas rail: default `btn btn-ghost btn-xs`, required label, pressed and disabled bindings. Both paths are under `libs/frontend/ui/src/lib`. Preserve the rail look as an exception; preserve setup looks until their approved migration.

## Zero-pixel candidates

**293 raw elements in 10 exact class recipes** match some current `ptahButton` input combination: `btn btn-ghost btn-xs` 125; `btn btn-ghost btn-sm` 70; `btn btn-primary btn-sm` 54; `btn btn-primary btn-xs` 16; `btn btn-ghost btn-square btn-xs` 14; `btn btn-ghost btn-sm btn-square` 7; `btn btn-error btn-xs` 3; `btn btn-error btn-sm` 2; `btn btn-secondary btn-sm` 1; `btn btn-primary btn-square btn-xs` 1. The last belongs to chat composer and stays an exception. Class equality is a candidate gate, not DOM/pixel proof.

Ten largest files (exact candidates): `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts` 6; `libs/frontend/memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts` 6; `libs/frontend/marketplace/src/lib/external-marketplaces.component.ts` 6; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts` 5; `libs/frontend/memory-curator-ui/src/lib/components/corpus-list.component.ts` 5; `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts` 5; `libs/frontend/marketplace/src/lib/kept-items-repair-prompt.component.ts` 5; `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts` 5; `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts` 5; `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts` 4.

**41 more** differ only by layout utilities outside the control: `btn btn-ghost btn-xs shrink-0` 11; `btn btn-ghost btn-sm mt-2` 6; `btn btn-ghost btn-square btn-xs shrink-0` 4; `btn btn-ghost btn-sm mt-3` 3; `btn btn-ghost btn-xs ml-auto` 3; `btn btn-primary btn-sm w-full` 3; `btn btn-primary btn-sm mt-1` 2; and one each: `btn btn-ghost btn-sm mt-1`, `btn btn-ghost btn-sm mt-4 w-full`, `btn btn-ghost btn-sm w-full`, `btn btn-ghost btn-xs mb-1`, `btn btn-primary btn-sm mt-2 w-full`, `btn btn-primary btn-sm mt-3`, `btn btn-primary btn-sm shrink-0`, `btn btn-primary btn-xs flex-1`, `btn btn-primary btn-xs self-start`, `btn btn-primary btn-xs w-full`. Keep these consumer layout classes.

## Variant proposal

Five variants, one density. Mappings retain DaisyUI initially; nonidentical recipes need Look approval.

| Variant | Use / avoid | Mapping and recipes to fold |
|---|---|---|
| primary | Main commit/create per action region; avoid routine row actions | `btn btn-primary`: exact sm 54, xs 16; `btn btn-primary btn-xs gap-1` 12 after look approval |
| secondary | Neutral peer to primary; avoid destructive or quiet actions | `btn btn-secondary`: exact sm 1; fold `btn btn-outline btn-sm` 44, xs 16 and `btn btn-sm` 20 only with approved visual delta |
| ghost | Toolbar, row, dismiss; avoid primary commit | `btn btn-ghost`: exact xs 125, sm 70, square xs 14, square sm 7; review `gap-1` xs 27 and `text-base-content` xs 17 |
| danger | Destructive confirmed action; avoid warning/cancel | `btn btn-error`: exact xs 3, sm 2; fold `border-error btn btn-outline btn-sm text-base-content` 10 and xs 10 with approved delta |
| link | Inline text action; avoid major CTA | `btn btn-link`: 10 uses; use actual `a` with href for navigation |

Other recipes: `btn-success` 5, `btn-warning` 18, `btn-info` 4 should fold by action priority with meaning in adjacent status text. `btn-circle` 14 and `btn-square` 71 become icon-only when truly icon-only. `btn btn-xs join-item` 13 keeps joined-group geometry/pressed semantics under its group owner. `btn-gold` and custom gradient/glass require named visual review; chat composer and canvas rail keep their looks. Remove per-page height, padding, ink, border and focus overrides only after approved look; keep margin, width and flex-child classes outside the control.

Sizes map xs/sm/md to `--ptah-control-h-xs|sm|md` = 1.5/2/2.5rem; sm default. Hover/active initially follow theme DaisyUI; focused keyboard state uses 2px `focus-visible` outline, 2px offset and `--ptah-focus-ring-color`. Disabled uses native disabled on buttons and consistent muted styling; busy keeps focus, adds `aria-busy`/`aria-disabled`, blocks repeat activation, places spinner before label in a reserved or absolute slot so width does not jump. Icon-only is square at control height with required nonempty `aria-label` and tooltip.

## Tooltip

Parsed template tags contain **one** static `tooltip` class (`libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html:44`), **zero** `data-tip` attributes, and **171** `title` attributes (99 on buttons/anchors). No shared tooltip directive or renderer CDK overlay tooltip use was found by search. The older inventory's wider raw search counted more titles.

`package.json`: `@angular/aria` 22.2.6, `@angular/cdk` ~22.2.0; installed `node_modules/@angular/aria/package.json` and `node_modules/@angular/cdk/package.json` both say 22.2.6. Aria package exports accordion/combobox/grid/listbox/menu/tabs/toolbar/tree, **no tooltip**. CDK package exports `./overlay` at `node_modules/@angular/cdk/types/overlay.d.ts` and `fesm2022/overlay.mjs`. Recommend small CDK Overlay-backed `ptahTooltip` directive, composed by icon buttons: `tooltipText = input.required<string>()`; show on hover/focus, hide on leave/blur/Escape/dispose, set generated tooltip id via `aria-describedby`, retain `aria-label` as name. Use renderer document overlay and token colors/z-layer for Electron and VS Code; remove duplicate native `title` on adopted icons.

## API proposal

Native-host attribute selectors `button[ptahButton], a[ptahButton]`; `button[ptahIconButton], a[ptahIconButton]` composes the base plus tooltip. Inputs: `variant = input<'primary'|'secondary'|'ghost'|'danger'|'link'>('secondary')`, `size = input<'xs'|'sm'|'md'>('sm')`, `busy = input(false)`; compatibility `iconOnly = input(false)` can be retired after icon directive migration; icon `label = input.required<string>()`. Host bindings: variant/size/shape classes, busy `aria-busy`/`aria-disabled`, icon `aria-label`; button default `type="button"` only if no explicit type, preserve submit/reset. Anchors need disabled/busy activation and tab-order semantics. Keep native DOM for zero-pixel adoption; spinner DOM is a later visual-change step.

Small files: evolve `libs/frontend/ui/src/lib/surfaces/button.directive.ts` (~100 lines); add `surfaces/icon-button.directive.ts` (~50), `surfaces/tooltip.directive.ts` (~120), `surfaces/tooltip-panel.component.ts` (~40), focused specs and UI public exports. `apps/ptah-extension-webview/tailwind.config.js` already maps `h-ptah-control-xs|sm|md`, `min-h-ptah-control-*`, `px-ptah-control-x-xs|x|x-md`, `rounded-ptah-control`, `outline-ptah-focus` and `outline-offset-ptah-focus` to `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`. Resolve outline width/color utility-name overlap during implementation.

**Keep DaisyUI `btn`** through extraction and zero-pixel adoption. Its base controls spacing/states and theme `--rounded-btn`, `--border-btn`, `--animation-btn`; `apps/ptah-extension-webview/src/styles.css` also has `--btn-height-*`, ghost/glass button rules and Settings `.btn[aria-disabled=true]` selectors. Dropping base changes pixels and requires full replacement styling and Look approval. `tools/ui-class-audit/check-ui-classes.ts` blocks `btn` and `btn-*` outside `libs/frontend/ui` (including variant/important forms), ratcheted against `baseline.json`; owner-held classes let consumer raw-token counts fall. Later token-only styling needs a separate approved batch. Both `ptah-glass` themes use pill `--rounded-btn`; include VS Code host in visual review.

## Reference pages

Five Electron dark/light look-sheet pages, plus VS Code host spot check; counts are within the named component file.

| Page/panel | Recipes today | Proposed roles |
|---|---|---|
| `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts` | `btn btn-outline btn-sm` 8; `border-error btn btn-outline btn-sm text-base-content` 4; `btn btn-ghost btn-sm` 4; `btn btn-link btn-xs ...` 2 | secondary; danger; ghost; link |
| `libs/frontend/marketplace/src/lib/pages/connectors/connectors-page.component.html` | `border border-base-300 btn btn-ghost btn-sm` 2; `btn btn-xs font-medium rounded-full` 2; `btn btn-outline btn-sm gap-1` 1; `btn btn-primary btn-sm` 1 | ghost; inspect chip action; secondary; primary |
| `libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts` | `btn btn-sm join-item` 2; `btn btn-primary btn-sm duration-150 transition-colors` 2; `btn btn-ghost btn-sm` 1; `btn btn-ghost btn-sm btn-square ...` 1 | grouped secondary; primary; ghost; icon ghost |
| `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts` | `btn btn-primary btn-sm gap-1` 2; `btn btn-ghost btn-sm gap-1 text-base-content` 2; `btn btn-ghost btn-sm btn-square` 1; `btn btn-outline btn-sm gap-1 text-base-content` 1 | primary; ghost; icon ghost; secondary |
| `libs/frontend/marketplace/src/lib/external-marketplaces.component.ts` | `btn btn-ghost btn-xs` 5; `btn btn-primary btn-sm shrink-0` 1; `btn btn-error btn-xs` 1; `btn btn-ghost btn-sm text-error` 1 | ghost; primary; danger; inspect destructive intent |

## Risks and open questions

- Class equality is weaker than DOM/pixel equality. **Recommendation:** plan's normalized DOM and zero-pixel gates per state; exclude composer/rail from generic batch.
- Outline, default, semantic colors and custom geometry change appearance. **Recommendation:** one family look sheet with old/new mapping and dark/light Electron screenshots of five pages; obtain Look approval before adopting nonidentical recipes.
- DaisyUI and new height/focus tokens overlap. **Recommendation:** inspect computed gallery states before replacing base; check both glass themes and VS Code host.
- Tooltip can duplicate native title or miss focus/scroll behavior. **Recommendation:** CDK overlay lifecycle, Escape dismissal, `aria-describedby`, no `title` on migrated icons.
- Busy spinner DOM changes markup and anchor behavior needs care. **Recommendation:** add spinner only at visual-change gate, reserve width, suppress busy navigation while preserving focus.
- Link actions may be navigation. **Recommendation:** use anchor with href for navigation and button for in-place action.
