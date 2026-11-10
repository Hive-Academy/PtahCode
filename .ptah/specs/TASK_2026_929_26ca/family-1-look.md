# Family 1 Look Sheet â€” Button, Icon Button & Tooltip (`TASK_2026_929_26ca` Batch 1c)

- **Owner library**: `libs/frontend/ui/src/lib/button/` (`ptahButton`, `ptahIconButton`, `ptahTooltip`)
- **Opt-in look stylesheet**: `libs/frontend/ui/src/lib/button/ptah-button.css` (scoped to `[data-ptah-look='next']`)
- **Foundation token source**: `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`
- **Gallery route (Electron only)**: `/ui-gallery` (`#family-button`, component `apps/ptah-extension-webview/src/app/ui-gallery/gallery-button-family.component.ts`)
- **Reference themes**: `ptah-glass` (dark) and `ptah-glass-light` (light)

---

## 1. Variant List

Emphasis order is strictly **`primary > danger > secondary > ghost > link`**. Every button in a product surface maps to one of these five variants:

| Variant | Host class | Purpose | When to use | When NOT to use |
| --- | --- | --- | --- | --- |
| `primary` | `.btn.btn-primary` | High-contrast brand accent fill (`--ptah-btn-primary-bg`) with dark/light matched ink (`--ptah-btn-primary-fg`). | The **single main commitment action** on a surface, dialog, drawer, or empty state (e.g., `Save changes`, `Create schedule`, `Activate`, `Connect`). | Never place two `primary` buttons in the same header, toolbar, or card. Do not use for row-level actions or filter pills. |
| `secondary` | `.btn.btn-secondary` | Neutral surface peer (`--ptah-btn-secondary-bg` = `--surface-2`) with a crisp 3:1 control edge (`--ptah-control-edge`) and primary text ink (`--bc`). | Secondary actions beside a primary CTA (`Cancel`, `Test connection`, `Verify`), standalone card actions (`Browse file`, `Deactivate`), or secondary header actions. | Do not use inside dense table/list rows where repeated borders create visual clutter (use `ghost` instead). |
| `ghost` | `.btn.btn-ghost` | Transparent fill and transparent border at rest; reveals `--ptah-btn-ghost-bg-hover` (`--b3`) on hover and `--ptah-btn-ghost-bg-active` on press. | Toolbar controls, filter chips, drawer/modal close buttons, inline row actions (`Refresh`, `Edit`, `Copy`), and most `ptahIconButton` instances. | Do not use as the sole primary submit CTA of a form or dialog where the user needs a clear visual anchor. |
| `danger` | `.btn.btn-error` | High-visibility semantic error fill (`--ptah-btn-danger-bg` = `oklch(var(--er))`) with high-contrast ink (`--ptah-btn-danger-fg` = `oklch(var(--erc))`). | Irreversible or high-impact destructive commitments (`Delete`, `Revoke key`, `Remove marketplace`, confirmation dialog destructive submit). | Do not use for non-destructive `Cancel`, `Close`, or `Disconnect` actions that can be trivially undone. |
| `link` | `.btn.btn-link` | Inline text action in `--ptah-btn-link-fg` (`--ptah-accent-ink`) with underline in all states and compact inline padding (`--ptah-space-1`). | Inline cross-references, secondary external links, or low-weight auxiliary actions (`View logs`, `Learn more`, `Reset to default`). | Do not use for primary form submission or toolbar icon actions. |

---

## 2. Token Table (Resolved Values in `ptah-glass` and `ptah-glass-light`)

Every rule in `libs/frontend/ui/src/lib/button/ptah-button.css` uses `--ptah-*` tokens only (enforced by `TOKEN_ONLY_DIRS` in `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`).

### 2.1 Dimensions, White Space, Typography, Radius & Motion Tokens

| Token | Contract expression | Resolved (`ptah-glass` dark) | Resolved (`ptah-glass-light` light) | Role in Button Family |
| --- | --- | --- | --- | --- |
| `--ptah-control-h-xs` | `1.5rem` | `24 px` | `24 px` | Compact control height (`size="xs"`), square icon button `24 Ã— 24 px` |
| `--ptah-control-h-sm` | `2rem` | `32 px` | `32 px` | Default control height (`size="sm"`), square icon button `32 Ã— 32 px` |
| `--ptah-control-h-md` | `2.5rem` | `40 px` | `40 px` | Hero/CTA control height (`size="md"`), square icon button `40 Ã— 40 px` |
| `--ptah-control-px-xs` | `var(--ptah-space-2)` | `8 px` (`0.5rem`) | `8 px` (`0.5rem`) | Horizontal padding for `size="xs"` |
| `--ptah-control-px` | `var(--ptah-space-3)` | `12 px` (`0.75rem`) | `12 px` (`0.75rem`) | Horizontal padding for `size="sm"` |
| `--ptah-control-px-md` | `var(--ptah-space-4)` | `16 px` (`1rem`) | `16 px` (`1rem`) | Horizontal padding for `size="md"` |
| `--ptah-gap-inline` | `var(--ptah-space-2)` | `8 px` (`0.5rem`) | `8 px` (`0.5rem`) | Gap between leading/trailing icon and button label |
| `--ptah-gap-label` | `var(--ptah-space-1)` | `4 px` (`0.25rem`) | `4 px` (`0.25rem`) | Label grouping gap; busy spinner overlays without changing layout |
| `--ptah-gap-controls` | `var(--ptah-space-2)` | `8 px` (`0.5rem`) | `8 px` (`0.5rem`) | Gap between sibling buttons in a toolbar or action group |
| `--ptah-icon-xs` | `0.75rem` | `12 px` | `12 px` | Icon size inside `xs` buttons and CSS `::before` busy spinner size |
| `--ptah-icon-sm` | `1rem` | `16 px` | `16 px` | Icon size inside `sm` buttons |
| `--ptah-icon-md` | `1.25rem` | `20 px` | `20 px` | Icon size inside `md` buttons |
| `--ptah-radius-control` | `var(--rounded-btn, 0.375rem)` | `10 px` (`0.625rem`) | `10 px` (`0.625rem`) | Corner radius for all button sizes and `ptah-tooltip-panel` |
| `--ptah-border-width` | `1px` | `1 px` | `1 px` | Control border width and busy spinner stroke width |
| `--ptah-text-hint-size` / `leading` / `weight` | `0.75rem` / `1rem` / `500` | `12 px` / `16 px` / `500` | `12 px` / `16 px` / `500` | Label typography for `size="xs"` (never below `12 px`) |
| `--ptah-text-label-size` / `leading` / `weight` | `0.75rem` / `1rem` / `500` | `12 px` / `16 px` / `500` | `12 px` / `16 px` / `500` | Label typography for `size="xs"` and `size="sm"` |
| `--ptah-focus-ring-width` | `2px` | `2 px` | `2 px` | `:focus-visible` outline width (never a box-shadow) |
| `--ptah-focus-ring-offset` | `2px` | `2 px` | `2 px` | `:focus-visible` outline offset |
| `--ptah-duration-fast` | `120ms` (`0.01ms` reduced motion) | `120 ms` | `120 ms` | Button hover/active/focus transition duration |
| `--ptah-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | `cubic-bezier(0.2, 0, 0, 1)` | `cubic-bezier(0.2, 0, 0, 1)` | Standard transition easing |
| `--ptah-btn-spinner-duration` | `720ms` (`0.01ms` reduced motion) | `720 ms` | `720 ms` | Busy `::before` spinner rotation period |
| `--ptah-text-group-title-weight` | `600` | `600` | `600` | Medium button label weight |
| `--ptah-radius-chip` | `var(--rounded-badge)` | `9999px` | `9999px` | Busy spinner roundness |
| `--ptah-elevation-0` | `none` | `none` | `none` | No shadow on quiet states |
| `--ptah-elevation-1` | `var(--elev-shadow)` | theme glass shadow (`--glass-elev-1` when enabled) | theme glass shadow (`--glass-elev-1` when enabled) | Primary resting elevation |
| `--ptah-border-color-strong` | `var(--surface-border-strong)` | theme surface border | theme surface border | Ghost active edge |

### 2.2 Color, Surface, Edge & State Tokens

| Token | Expression in `ptah-tokens.css` | Resolved (`ptah-glass` dark) | Resolved (`ptah-glass-light` light) |
| --- | --- | --- | --- |
| `--ptah-focus-ring-color` | `var(--glass-focus, oklch(var(--p)))` | `#f2cd6b` (fallback `#e4b94a`) | `#6e4a00` (fallback `#7c5700`) |
| `--ptah-control-edge` | `color-mix(in oklch, oklch(var(--bc)) 55%, oklch(var(--b1)))` | `#858887` | `#78728a` |
| `--ptah-control-edge-strong` | `color-mix(in oklch, oklch(var(--bc)) 68%, oklch(var(--b1)))` | `#a3a6a4` | `#5c5770` |
| `--ptah-btn-primary-bg` | `oklch(var(--p))` | `#e4b94a` | `#7c5700` |
| `--ptah-btn-primary-bg-hover` | `color-mix(in oklch, oklch(var(--p)) 88%, oklch(var(--bc)))` | `#e3c164` | `#7b4913` |
| `--ptah-btn-primary-bg-active` | `color-mix(in oklch, oklch(var(--p)) 78%, oklch(var(--bc)))` | `#e3c876` | `#773e20` |
| `--ptah-btn-primary-fg` | `oklch(var(--pc))` | `#1b1403` | `#fff8e6` |
| `--ptah-btn-secondary-bg` | `var(--surface-2)` | `#202329` | `#eee8f8` |
| `--ptah-btn-secondary-bg-hover` | `oklch(var(--b3))` | `#2a2e35` | `#e2daf1` |
| `--ptah-btn-secondary-bg-active` | `color-mix(in oklch, oklch(var(--b3)) 92%, oklch(var(--bc)))` | `#363c42` | `#d0c9e1` |
| `--ptah-btn-secondary-fg` | `oklch(var(--bc))` | `#f2f2f1` | `#1e1936` |
| `--ptah-btn-secondary-border` | `var(--ptah-control-edge)` | `#858887` | `#78728a` |
| `--ptah-btn-secondary-border-hover` | `var(--ptah-control-edge-strong)` | `#a3a6a4` | `#5c5770` |
| `--ptah-btn-ghost-bg-hover` | `oklch(var(--b3))` | `#2a2e35` | `#e2daf1` |
| `--ptah-btn-ghost-bg-active` | `color-mix(in oklch, oklch(var(--b3)) 92%, oklch(var(--bc)))` | `#363c42` | `#d0c9e1` |
| `--ptah-btn-ghost-fg` | `oklch(var(--bc))` | `#f2f2f1` | `#1e1936` |
| `--ptah-btn-danger-bg` | `oklch(var(--er))` | `#ff6b6b` | `#cf3a3a` |
| `--ptah-btn-danger-bg-hover` | `color-mix(in oklch, oklch(var(--er)) 90%, oklch(var(--bc)))` | `#ff7d67` | `#bd344b` |
| `--ptah-btn-danger-bg-active` | `color-mix(in oklch, oklch(var(--er)) 82%, oklch(var(--bc)))` | `#ff8b68` | `#ae3154` |
| `--ptah-btn-danger-fg` | `oklch(var(--erc))` | `#2a0505` | `#ffffff` |
| `--ptah-btn-link-fg` | `var(--ptah-link, oklch(var(--p)))` | `#f0cf7a` | `#6e4a00` |
| `--ptah-btn-link-fg-hover` | `color-mix(in oklch, var(--ptah-link, oklch(var(--p))) 75%, oklch(var(--bc)))` | `#edda9b` | `#693320` |
| `--ptah-btn-link-fg-active` | `color-mix(in oklch, var(--ptah-link, oklch(var(--p))) 60%, oklch(var(--bc)))` | `#ece0ad` | `#5e2a2d` |
| `--ptah-btn-disabled-bg` | `var(--surface-2)` | `#202329` | `#eee8f8` |
| `--ptah-btn-disabled-fg` | `oklch(var(--bcm, var(--bc)))` | `#dcdee3` (at `0.48` opacity) | `#5b5379` (at `0.48` opacity) |
| `--ptah-btn-disabled-border` | `var(--ptah-border-color)` | `rgba(255, 255, 255, 0.08)` | `rgba(98, 70, 234, 0.12)` |
| `--ptah-btn-disabled-opacity` | `0.48` | `0.48` | `0.48` |
| `--ptah-btn-busy-opacity` | `0.8` | `0.8` | `0.8` |

---

## 3. White Space & Layout Contract (`foundation-tokens.md` Â§3 & Â§5)

1. **Three discrete heights only**:
   - `xs`: `24 px` (`--ptah-control-h-xs`), horizontal padding `8 px` (`--ptah-control-px-xs`), icon `12 px` (`--ptah-icon-xs`).
   - `sm` (default): `32 px` (`--ptah-control-h-sm`), horizontal padding `12 px` (`--ptah-control-px`), icon `16 px` (`--ptah-icon-sm`).
   - `md`: `40 px` (`--ptah-control-h-md`), horizontal padding `16 px` (`--ptah-control-px-md`), icon `20 px` (`--ptah-icon-md`).
   - `ptahIconButton` (`.btn-square`): width and height both equal the control height (`24 Ã— 24 px`, `32 Ã— 32 px`, `40 Ã— 40 px`) with zero horizontal padding (`padding-inline: 0`).
2. **Internal icon-to-label gap**: `8 px` (`--ptah-gap-inline`).
3. **Zero-width-jump busy state (`[aria-busy='true']`)**:
   - On icon buttons (`.btn-square`) and buttons with a leading `<svg>`, the leading SVG is visually hidden but keeps its layout space; the `12 px` CSS `::before` spinner is centered over the button.
   - On text-only buttons, the spinner is absolutely positioned over the visually hidden label. Padding and layout remain unchanged, keeping total button width constant without inserting a DOM node.
4. **Group & surface white-space rules (`foundation-tokens.md` Â§3)**:
   - Sibling buttons in a group use `--ptah-gap-controls` (`8 px`).
   - The one `primary` action on a surface is separated from adjacent `secondary`/`ghost` actions by `--ptah-space-3` (`12 px`) to `--ptah-gap-field` (`16 px`), or aligned to the opposite edge of the toolbar/footer.
   - Distance inside a control group (`8 px`) is always smaller than distance between groups (`24 px` `--ptah-gap-group` or `32 px` `--ptah-gap-section`), and at least 25% of any viewport remains open `surface-0`/`surface-1`.

---

## 4. Visual Hierarchy & Typography (`foundation-tokens.md` Â§4)

- **Type roles**:
  - `size="xs"` and `size="sm"` use the **Label** role (`--ptah-text-label-size: 12 px`, `--ptah-text-label-leading: 16 px`, `--ptah-text-label-weight: 500`).
  - `size="md"` uses the **Group Title** size (`--ptah-text-group-title-size: 14 px`, `--ptah-text-group-title-leading: 20 px`, `--ptah-text-group-title-weight: 600`).
  - **Hard floor**: Button labels never use the `11 px` caption role (`--ptah-text-caption-size` is forbidden on actions) and never apply `text-transform: uppercase` (`text-transform: none` is enforced on `.btn`).
- **Emphasis order at a glance**:
  1. `primary` â€” solid brand gold/amber fill (`#e4b94a` dark / `#7c5700` light), highest luminance/chromatic contrast against the surface.
  2. `danger` â€” solid semantic crimson/coral fill (`#ff6b6b` dark / `#cf3a3a` light), unmistakable for destructive actions.
  3. `secondary` â€” quiet `--surface-2` fill with a crisp â‰¥ 3:1 border (`--ptah-control-edge`), clearly interactive without competing with `primary`.
  4. `ghost` â€” borderless and transparent at rest, surfacing its `--surface-3` fill only on hover/active.
  5. `link` â€” inline accent text (`--ptah-accent-ink`) with zero box chrome at rest and underline on hover/focus.

---

## 5. Five Reference Pages (`button-research.md`) â€” Variant & Size Mapping

1. **`libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts` (`CredentialsTabComponent`)**
   - `Verify` / `Save` primary submission CTA â†’ `ptahButton variant="primary" size="sm" [busy]="saving()"`
   - `Browse` file-picker action â†’ `ptahButton variant="secondary" size="sm"`
   - `Use another account` / `Switch mode` inline action â†’ `ptahButton variant="secondary" size="xs"`
   - `Disconnect` / `Remove credentials` destructive action â†’ `ptahButton variant="danger" size="sm"`
2. **`libs/frontend/marketplace/src/lib/pages/connectors/connectors-page.component.html` (`ConnectorsPageComponent`)**
   - Error banner `Retry` action â†’ `ptahButton variant="secondary" size="xs"`
   - Search input clear (`Ã—`) button â†’ `ptahIconButton variant="ghost" size="xs" label="Clear search"`
   - Category filter pills (`All`, category chips) â†’ `ptahButton variant="ghost" size="xs"` with `[attr.aria-pressed]`
3. **`libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts` (`CronSchedulerTabComponent`)**
   - Toolbar `Refresh` button â†’ `ptahIconButton variant="ghost" size="sm" label="Refresh schedules" [busy]="loading()"`
   - Toolbar `New Schedule` button â†’ `ptahButton variant="primary" size="sm"`
   - Empty state `Create First Schedule` CTA â†’ `ptahButton variant="primary" size="sm"`
   - Error banner `Dismiss` action â†’ `ptahButton variant="ghost" size="xs"`
4. **`libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts` (`LicenseStatusCardComponent`)**
   - `Refresh` license status button â†’ `ptahButton variant="ghost" size="xs" [busy]="refreshing()"`
   - `Deactivate` license button â†’ `ptahButton variant="secondary" size="xs"`
   - `Activate` license submit button â†’ `ptahButton variant="primary" size="sm" [busy]="activating()"`
5. **`libs/frontend/marketplace/src/lib/external-marketplaces.component.ts` (`ExternalMarketplacesComponent`)**
   - `Add` marketplace submit button â†’ `ptahButton variant="primary" size="sm" [busy]="adding()"`
   - Card `Update` button â†’ `ptahButton variant="ghost" size="xs" [busy]="updating()"`
   - Card `Remove` button â†’ `ptahIconButton variant="ghost" size="xs" label="Remove marketplace"` (or `ptahButton variant="danger" size="xs"` on confirmation)

---

## Before/after

No product page is modified in Batch 1c. The before/after outcomes below are predictions to confirm on Electron screenshots with equal viewport and data. When the migration batch runs and the `[data-ptah-look='next']` scope is lifted, these five pages will experience the largest visible improvements:

1. **`credentials-tab.component.ts` (Provider Connection Drawer)**
   - **Before**: Hand-rolled `<button class="rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-xs ...">` and raw primary buttons with custom hover opacity, inconsistent heights (`26â€“34 px`), and no shared focus ring.
   - **After**: `ptahButton` `primary` (`32 px`), `secondary` (`32 px` / `24 px`), and `danger` (`32 px`) with uniform `10 px` radius, â‰¥ 3:1 control edge on `secondary`, zero-width-jump busy spinner, and `--ptah-focus-ring-color` `2 px` outline.
2. **`connectors-page.component.html` (Marketplace Connectors)**
   - **Before**: Raw `<button class="px-2.5 py-1 text-xs rounded-md ...">` filter pills, ad-hoc clear search button without tooltip, and `btn btn-xs btn-outline` retry button using `11 px` text.
   - **After**: `ptahButton` (`ghost` `xs` `24 px` filter buttons with `12 px` label typography) and `ptahIconButton` (`ghost` `xs` `24 Ã— 24 px` with `ptahTooltip` on hover/keyboard focus).
3. **`cron-scheduler-tab.component.ts` (Cron Scheduler)**
   - **Before**: Mix of DaisyUI `btn btn-sm btn-ghost btn-square`, `btn btn-primary btn-sm`, and raw `<span class="loading loading-spinner loading-xs">` DOM nodes that shift button width when toggling busy state.
   - **After**: `ptahIconButton` (`ghost` `sm` `32 Ã— 32 px` with accessible tooltip) and `ptahButton` (`primary` `sm` `32 px`) using `[busy]` with the CSS `::before` spinner and zero width shift.
4. **`license-status-card.component.ts` (Settings License Card)**
   - **Before**: Raw Tailwind `<button class="inline-flex items-center gap-1.5 rounded-lg border ... px-2.5 py-1 text-xs">` buttons whose borders drop below 1.5:1 contrast in `ptah-glass` and whose disabled state uses raw `disabled:opacity-40`.
   - **After**: `ptahButton` (`ghost` `xs`, `secondary` `xs`, `primary` `sm`) with a 3.82â€“4.93:1 control edge in dark and 3.39â€“4.19:1 in light, plus consistent `--ptah-btn-disabled-opacity` (`0.48`).
5. **`external-marketplaces.component.ts` (External Marketplaces Settings)**
   - **Before**: Raw `<button class="btn btn-primary btn-sm">` beside unstyled/raw icon buttons with custom hover text colors (`hover:text-error`) and inconsistent hit targets (`< 24 px`).
   - **After**: `ptahButton` (`primary` `sm`, `ghost` `xs`) and `ptahIconButton` (`ghost` `xs` `24 Ã— 24 px` minimum target size) with keyboard-accessible `ptahTooltip` labels.

---

## 7. Exceptions & Boundaries

1. **Chat Composer (`libs/frontend/chat/src/lib/components/molecules/chat-input.component.ts`)**:
   - The round send/stop orb (`28 Ã— 28 px` circular pill integrated into the glass composer pill) and compact model/mode selector triggers inside the composer bar are specialized composer chrome governed by the chat composer design spec, not standard `ptahButton` rectangular controls.
2. **Workspace Canvas Rail (`libs/frontend/chat/src/lib/components/organisms/workspace-canvas-panel.component.ts`)**:
   - Canvas zoom/pan HUD pills and dock tab handles are specialized canvas chrome and remain outside Family 1.
3. **`ptahSetupAction` & `ptahRailIconAction` (`libs/frontend/ui/src/lib/action/ui-action.directive.ts`)**:
   - `ui-action.directive.ts` currently serves onboarding/setup cards (`ptahSetupAction`) and the left navigation rail (`ptahRailIconAction` with active indicator bar). They remain untouched in Batch 1c so no product surface changes look prematurely (see Â§8 for consolidation plan).

---

## Proposed Removals

1. **Removed in Batch 1c â€” `PtahButtonDirective.iconOnly`**:
   - **Evidence**: Full workspace search across `libs/` and `apps/` confirmed only a single template (`apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts`) bound `[iconOnly]="true"`.
   - **Action taken**: Migrated `gallery-components.component.ts` to `<button ptahIconButton label="More actions" type="button">â‹¯</button>` and removed the deprecated `iconOnly` input and `[class.btn-square]` binding from `libs/frontend/ui/src/lib/button/button.directive.ts`. All icon-only buttons now go through `ptahIconButton` (which enforces a required `label` for `aria-label` + `ptahTooltip`).
2. **Candidate for Later Batch â€” `PtahSetupActionDirective` (`libs/frontend/ui/src/lib/action/ui-action.directive.ts`)**:
   - `ptahSetupAction` (`primary` / `secondary` / `ghost` / `danger`) duplicates `ptahButton` (`size="sm"`). Once the proposed button look is approved and unscoped in Batch 1d/1e, `ptahSetupAction` callers in `libs/frontend/onboarding` can migrate to `ptahButton` and `PtahSetupActionDirective` can be deleted. `ptahRailIconAction` should remain a navigation-rail primitive (Family 4 Navigation) because it represents a persistent rail destination rather than an action button.

---

## 9. Contrast Verification (WCAG 2.1 AA)

All ratios below are computed from the committed theme definitions in `apps/ptah-extension-webview/tailwind.config.js` and `apps/ptah-extension-webview/src/styles.css` using `culori` (`wcagContrast`) and guarded by Jest assertions in `apps/ptah-extension-webview/src/app/design-tokens.spec.ts`.

### 9.1 `base-content-muted` (`--bcm`) Across Every Surface Level (Requirement: â‰¥ 4.5:1)

| Surface token | `ptah-glass` surface hex | `ptah-glass` `--bcm` (`#dcdee3`) ratio | `ptah-glass-light` surface hex | `ptah-glass-light` `--bcm` (`#5b5379` / glass `#484065`) ratio | Status |
| --- | --- | --- | --- | --- | --- |
| `base-100` | `#17191d` | **13.07 : 1** | `#f7f3fd` | **6.49 : 1** (glass **8.49 : 1**) | Pass (â‰¥ 4.5:1) |
| `surface-0` | `#17191d` | **13.07 : 1** | `#f7f3fd` | **6.49 : 1** (glass **8.49 : 1**) | Pass (â‰¥ 4.5:1) |
| `surface-1` | `#1f2228` | **11.87 : 1** | `#efe9f9` | **5.99 : 1** (glass **7.83 : 1**) | Pass (â‰¥ 4.5:1) |
| `base-200` / `surface-2` | `#202329` | **11.70 : 1** | `#eee8f8` | **5.93 : 1** (glass **7.76 : 1**) | Pass (â‰¥ 4.5:1) |
| `surface-3` | `#292c33` | **10.35 : 1** | `#e4dcf2` | **5.34 : 1** (glass **6.99 : 1**) | Pass (â‰¥ 4.5:1) |
| `base-300` | `#2a2e35` | **10.13 : 1** | `#e2daf1` | **5.25 : 1** (glass **6.86 : 1**) | Pass (â‰¥ 4.5:1) |

### 9.2 Button Variants â€” Label Text vs Fill (Requirement: â‰¥ 4.5:1)

| Variant & State | `ptah-glass` (dark) fg on bg | `ptah-glass` ratio | `ptah-glass-light` (light) fg on bg | `ptah-glass-light` ratio | Status |
| --- | --- | --- | --- | --- | --- |
| `primary` (default) | `#1b1403` on `#e4b94a` | **9.88 : 1** | `#fff8e6` on `#7c5700` | **6.16 : 1** | Pass (â‰¥ 4.5:1) |
| `primary` (hover) | `#1b1403` on `#e3c164` | **10.56 : 1** | `#fff8e6` on `#7b4913` | **7.10 : 1** | Pass (â‰¥ 4.5:1) |
| `primary` (active) | `#1b1403` on `#e3c876` | **11.15 : 1** | `#fff8e6` on `#773e20` | **7.96 : 1** | Pass (â‰¥ 4.5:1) |
| `danger` (default) | `#2a0505` on `#ff6b6b` | **6.74 : 1** | `#ffffff` on `#cf3a3a` | **4.86 : 1** | Pass (â‰¥ 4.5:1) |
| `danger` (hover) | `#2a0505` on `#ff7d67` | **7.50 : 1** | `#ffffff` on `#bd344b` | **5.59 : 1** | Pass (â‰¥ 4.5:1) |
| `danger` (active) | `#2a0505` on `#ff8b68` | **8.15 : 1** | `#ffffff` on `#ae3154` | **6.25 : 1** | Pass (â‰¥ 4.5:1) |
| `secondary` (default) | `#f2f2f1` on `#202329` | **14.05 : 1** | `#1e1936` on `#eee8f8` | **14.05 : 1** | Pass (â‰¥ 4.5:1) |
| `secondary` (hover) | `#f2f2f1` on `#2a2e35` | **12.17 : 1** | `#1e1936` on `#e2daf1` | **12.45 : 1** | Pass (â‰¥ 4.5:1) |
| `secondary` (active) | `#f2f2f1` on `#363c42` | **9.96 : 1** | `#1e1936` on `#d0c9e1` | **10.50 : 1** | Pass (â‰¥ 4.5:1) |
| `ghost` (default on `b1`/`b2`/`b3`) | `#f2f2f1` on `b1`/`b2`/`b3` | **15.71 / 14.05 / 12.17 : 1** | `#1e1936` on `b1`/`b2`/`b3` | **15.39 / 14.05 / 12.45 : 1** | Pass (â‰¥ 4.5:1) |
| `link` (default on `b1`/`b2`/`b3`) | `#f0cf7a` on `b1`/`b2`/`b3` | **11.66 / 10.43 / 9.03 : 1** | `#6e4a00` on `b1`/`b2`/`b3` | **7.26 / 6.64 / 5.88 : 1** | Pass (â‰¥ 4.5:1) |

### 9.3 Control Edges & Focus Ring vs Surfaces (Requirement: â‰¥ 3.0:1 Non-Text Contrast)

| Non-text boundary | `ptah-glass` vs `base-100` / `base-200` / `base-300` | `ptah-glass-light` vs `base-100` / `base-200` / `base-300` | Status |
| --- | --- | --- | --- |
| `--ptah-control-edge` (`secondary` border) | **4.93 : 1** / **4.41 : 1** / **3.82 : 1** | **4.19 : 1** / **3.83 : 1** / **3.39 : 1** | Pass (â‰¥ 3.0:1) |
| `--ptah-control-edge-strong` (`secondary` hover border) | **7.15 : 1** / **6.39 : 1** / **5.53 : 1** | **6.30 : 1** / **5.76 : 1** / **5.10 : 1** | Pass (â‰¥ 3.0:1) |
| `--ptah-focus-ring-color` (`--ptah-focus-ring`) | **11.50 : 1** / **10.29 : 1** / **8.91 : 1** | **7.26 : 1** / **6.64 : 1** / **5.88 : 1** | Pass (â‰¥ 3.0:1) |
| `--ptah-focus-ring-color` fallback (`oklch(var(--p))`) | **9.50 : 1** / **8.50 : 1** / **7.36 : 1** | **5.96 : 1** / **5.44 : 1** / **4.82 : 1** | Pass (â‰¥ 3.0:1) |
| `primary` button fill edge vs surface | **9.50 : 1** / **8.50 : 1** / **7.36 : 1** | **5.96 : 1** / **5.44 : 1** / **4.82 : 1** | Pass (â‰¥ 3.0:1) |
| `danger` button fill edge vs surface | **6.34 : 1** / **5.67 : 1** / **4.91 : 1** | **4.44 : 1** / **4.06 : 1** / **3.60 : 1** | Pass (â‰¥ 3.0:1) |

---

## 10. Screenshots Needed (Checklist Â§C)

The Electron app was not launched for this review. Capture the following screenshots from the Electron `/ui-gallery` route (`#family-button`) before signing off on the Approval Record below:

1. `.ptah/specs/TASK_2026_929_26ca/screenshots/family-1-gallery-dark-matrix.png` â€” `#family-button` Variants Ã— sizes matrix (`Current` left, `Proposed` right) in `ptah-glass` (dark) at `1440 px` width.
2. `.ptah/specs/TASK_2026_929_26ca/screenshots/family-1-gallery-light-matrix.png` â€” `#family-button` Variants Ã— sizes matrix (`Current` left, `Proposed` right) in `ptah-glass-light` (light) at `1440 px` width.
3. `.ptah/specs/TASK_2026_929_26ca/screenshots/family-1-gallery-dark-states.png` â€” `#family-button` States by variant (`default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`) in `ptah-glass` (dark).
4. `.ptah/specs/TASK_2026_929_26ca/screenshots/family-1-gallery-light-states.png` â€” `#family-button` States by variant (`default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`) in `ptah-glass-light` (light).
5. `.ptah/specs/TASK_2026_929_26ca/screenshots/family-1-gallery-icons-and-tooltip.png` â€” `#family-button` Icon buttons (`xs`/`sm`/`md` Ã— `ghost`/`secondary`/`primary`), leading icon + label, long-text specimen, and an open `ptah-tooltip-panel` on keyboard focus.
6. `.ptah/specs/TASK_2026_929_26ca/screenshots/family-1-gallery-narrow-stack.png` â€” `#family-button` below `1024 px` viewport width showing the `Current` and `Proposed` columns stacked vertically without horizontal overflow.

---

## 11. Open Questions

1. **Stock DaisyUI `secondary` token in `ptah-glass-light` (`#9a6b12` on `#fff8e6` = `4.42:1`, below 4.5:1)**
   - *Context*: In `apps/ptah-extension-webview/tailwind.config.js`, the raw DaisyUI `secondary` / `secondary-content` pair in `ptah-glass-light` measures `4.42:1` (just under WCAG AA `4.5:1`) and produces an amber fill visually too close to `primary` (`#7c5700`). Our proposed `secondary` button (`--ptah-btn-secondary-*`) already avoids `--s`/`--sc` entirely and uses `--surface-2` (`#eee8f8`) + `--bc` (`#1e1936`, `14.05:1`) + `--ptah-control-edge` (`#78728a`, `3.39â€“4.19:1`). However, any legacy unscoped `.badge-secondary` or `.btn-secondary` outside `[data-ptah-look='next']` still inherits `#9a6b12`.
   - *Options*:
     - **Option A (Recommended)**: Keep `ptah-button.css` mapped to `--surface-2` / `--bc` / `--ptah-control-edge` for `secondary` buttons, and in a future theme-hygiene task darken `ptah-glass-light.secondary` from `#9a6b12` to `#8f620e` (`4.85:1` against `#fff8e6`).
     - **Option B**: Leave `ptah-glass-light.secondary` untouched since `ptahButton` `secondary` no longer reads `--s`.
2. **Destructive actions inside dense table/list rows**
   - *Context*: Solid `danger` (`#ff6b6b` / `#cf3a3a`) has strong visual weight suitable for dialog confirmations and section-level destructive buttons, but repeating solid red buttons on every row of `ExternalMarketplacesComponent` or a table can overpower the page's single `primary` CTA.
   - *Options*:
     - **Option A (Recommended)**: Keep the variant list strictly to the 5 contract variants; use `ghost` for row-level remove/delete icon triggers and reserve `danger` for the confirmation prompt or single-resource settings card.
     - **Option B**: Add a quiet destructive modifier in a later batch if a page requires an inline red text/icon button at rest.
3. **Folding `ptahSetupAction` (`libs/frontend/ui/src/lib/action/ui-action.directive.ts`) into `ptahButton`**
   - *Options*:
     - **Option A (Recommended)**: Fold `ptahSetupAction` into `ptahButton` during the product-page migration batch (Batch 1d/1e) once `[data-ptah-look='next']` is unscoped, while keeping `ptahRailIconAction` for Family 4 (Navigation).
     - **Option B**: Keep `ptahSetupAction` as a separate directive indefinitely.

---

## 12. Decisions Recorded in Batch 1c

1. **Opt-in scoping without `!important`**: `ptah-button.css` scopes every button rule under `[data-ptah-look='next'] .btn:is(.btn, #ptah-next)` (`(1,1,0)` specificity) so that importing `ptah-button.css` right after `ptah-tokens.css` (before `@tailwind components` and the `(0,6,0)` glass overrides in `styles.css`) wins cleanly inside `[data-ptah-look='next']` without `!important` and has zero effect outside `[data-ptah-look='next']`.
2. **Twin forced-state selectors for deterministic visual inspection**: Every `:hover`, `:focus-visible`, and `:active` rule in `ptah-button.css` is paired with `[data-state='hover']`, `[data-state='focus']`, and `[data-state='active']` so the gallery renders all six states simultaneously in static screenshots.
3. **Busy vs disabled separation**: Because `BUTTON_HOST` sets both `aria-disabled="true"` and `aria-busy="true"` when `busy()` is `true`, the disabled selector uses `:is(:disabled, [disabled], [aria-disabled='true']):not([aria-busy='true'])` so busy buttons display `cursor: wait` and the `::before` spinner rather than the disabled treatment.
4. **Deprecated `iconOnly` removed**: After migrating the sole `[iconOnly]="true"` usage in `gallery-components.component.ts` to `ptahIconButton`, `iconOnly` was removed from `PtahButtonDirective`.

---

## 13. Approval Record

- **Status**:
- **Reviewer**:
- **Date**:
- **Dark theme (`ptah-glass`) approved**:
- **Light theme (`ptah-glass-light`) approved**:
- **Scope removal (`[data-ptah-look='next']`) approved for Batch 1d**:
- **Notes**:






