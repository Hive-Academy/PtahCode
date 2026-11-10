# Batch 1c Execution Report — Proposed Button Family Look & Gallery (`TASK_2026_929_26ca`)

## 1. Summary of Changes

Implemented the proposed opt-in token-based look for Family 1 (`ptahButton`, `ptahIconButton`, `ptahTooltip`) scoped under `[data-ptah-look='next']` in `libs/frontend/ui/src/lib/button/ptah-button.css`, extended the foundation token contract and raw-value guard in `libs/frontend/ui/src/lib/tokens/`, added the side-by-side `Current` vs `Proposed` comparison section (`#family-button`) to the Electron UI gallery (`/ui-gallery`), migrated the sole gallery `[iconOnly]="true"` usage to `ptahIconButton`, removed the deprecated `iconOnly` input from `PtahButtonDirective`, and added WCAG AA contrast assertions for `base-content-muted` and the button family in both reference themes (`ptah-glass` and `ptah-glass-light`). No product page or feature library was modified.

---

## 2. Files Created & Modified (with Line Counts)

| File (repo-relative) | Status | Lines | Description |
| --- | --- | --- | --- |
| `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` | Modified | 157 | Added `--ptah-control-edge`, `--ptah-control-edge-strong`, and 26 `--ptah-btn-*` tokens (including reduced-motion `--ptah-btn-spinner-duration`). |
| `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts` | Modified | 178 | Registered all 28 new `--ptah-*` tokens in `TOKEN_NAMES` and tightened the raw pixel regex in `TOKEN_ONLY_DIRS` (`\b\d+(\.\d+)?px\b`) to guard `.css` files in `libs/frontend/ui/src/lib/button/`. |
| `libs/frontend/ui/src/lib/button/ptah-button.css` | Created | 297 | Opt-in `[data-ptah-look='next']` stylesheet for `.btn`, 5 variants (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-error`, `.btn-link`), 3 sizes (`.btn-xs`, `.btn-sm`, `.btn-md`), `.btn-square`, real + forced (`[data-state='hover\|focus\|active']`) states, disabled, zero-width-jump `[aria-busy='true']` CSS `::before` spinner; the tooltip panel keeps its existing shared CDK overlay styling. |
| `libs/frontend/ui/src/lib/button/button.directive.ts` | Modified | 25 | Removed deprecated `iconOnly` input and `[class.btn-square]` host binding after confirming zero remaining callers across `libs/` and `apps/`. |
| `apps/ptah-extension-webview/src/styles.css` | Modified | 4117 | Added single `@import '../../../libs/frontend/ui/src/lib/button/ptah-button.css';` at line 17 immediately after `ptah-tokens.css`. |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-button-family.component.ts` | Created | 54 | Standalone `OnPush` gallery section (`id="family-button"`, title `"Button family"`) rendering side-by-side `Current` (unscoped) and `Proposed` (`data-ptah-look="next"`) columns that stack below `1024 px`. |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-button-column.component.ts` | Created | 220 | Standalone `OnPush` column renderer with 5 variants × 3 sizes matrix (15 specimens), 5 variants × 6 states at `sm` (30 specimens), 3 variants × 3 sizes `ptahIconButton` matrix (9 specimens), leading icon + label button, and long-text button, each with a caption. |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts` | Modified | 268 | Migrated `<button ptahButton [iconOnly]="true" aria-label="More actions">` to `<button ptahIconButton label="More actions" type="button">`. |
| `apps/ptah-extension-webview/src/app/ui-gallery.component.ts` | Modified | 149 | Registered `GalleryButtonFamilyComponent` and added `{ id: 'family-button', label: 'Button family' }` to `sections`. |
| `apps/ptah-extension-webview/src/app/ui-gallery.component.spec.ts` | Modified | 222 | Added spec verifying `#family-button`, identical specimen counts across `Current` and `Proposed` columns, forced state attributes, `ptahIconButton` specimens, and exclusive `data-ptah-look="next"` scoping on the proposed column. |
| `apps/ptah-extension-webview/src/app/app.routes.spec.ts` | Modified | 177 | Added whitespace-tolerant source assertions for `<ptah-gallery-button-family`, `ptahIconButton`, and absence of `iconOnly` in the gallery. |
| `apps/ptah-extension-webview/src/app/design-tokens.spec.ts` | Modified | 167 | Added `ptah-button.css` import order assertion, outer theme token declarations, and WCAG contrast assertions for `base-content-muted` (≥ 4.5:1 across all 7 surface levels), button variant text/fill (≥ 4.5:1), and control edge / focus ring (≥ 3.0:1) in `ptah-glass` and `ptah-glass-light`. |
| `.ptah/specs/TASK_2026_929_26ca/family-1-look.md` | Created | 296 | Deliverable 1: Complete Family 1 look sheet following `look-approval-checklist.md`. |
| `.ptah/specs/TASK_2026_929_26ca/batch-1c-report.md` | Created | 108 | Deliverable 2: Batch 1c execution report. |

---

## 3. New Tokens Added to `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`

- **Control edges**: `--ptah-control-edge`, `--ptah-control-edge-strong`
- **Primary variant**: `--ptah-btn-primary-bg`, `--ptah-btn-primary-bg-hover`, `--ptah-btn-primary-bg-active`, `--ptah-btn-primary-fg`
- **Secondary variant**: `--ptah-btn-secondary-bg`, `--ptah-btn-secondary-bg-hover`, `--ptah-btn-secondary-bg-active`, `--ptah-btn-secondary-fg`, `--ptah-btn-secondary-border`, `--ptah-btn-secondary-border-hover`
- **Ghost variant**: `--ptah-btn-ghost-bg-hover`, `--ptah-btn-ghost-bg-active`, `--ptah-btn-ghost-fg`
- **Danger variant**: `--ptah-btn-danger-bg`, `--ptah-btn-danger-bg-hover`, `--ptah-btn-danger-bg-active`, `--ptah-btn-danger-fg`
- **Link variant**: `--ptah-btn-link-fg`, `--ptah-btn-link-fg-hover`, `--ptah-btn-link-fg-active`
- **Disabled & busy states**: `--ptah-btn-disabled-bg`, `--ptah-btn-disabled-fg`, `--ptah-btn-disabled-border`, `--ptah-btn-disabled-opacity`, `--ptah-btn-busy-opacity`, `--ptah-btn-spinner-duration` (with reduced-motion override `0.01ms`)

---

## 4. Checks, Evidence & Tool Availability

- **Skills loaded**: Read and applied `.claude/skills/angular-frontend-patterns/SKILL.md`, `.claude/skills/ui-ux-designer/SKILL.md`, and `.claude/skills/frontend-design/SKILL.md`.
- **Browser MCP tools**: screenshot tools were available to the independent reviewer, who inspected a static dark-theme button-state artifact. The Electron app was not launched; screenshot capture paths and instructions are recorded in `family-1-look.md` §10 (`## Screenshots needed`).
- **`iconOnly` workspace audit**: Searched all `.ts` and `.html` files across `libs/` and `apps/`; confirmed `gallery-components.component.ts` was the sole template using `iconOnly`, migrated it to `ptahIconButton`, and removed `iconOnly` from `PtahButtonDirective`.
- **Contrast verification**: Computed and guarded via `culori` (`wcagContrast`) in `apps/ptah-extension-webview/src/app/design-tokens.spec.ts`:
  - `base-content-muted` (`--bcm`) clears `10.13:1–13.07:1` in `ptah-glass` and `5.25:1–6.49:1` (`6.86:1–8.49:1` with glass mode active) in `ptah-glass-light` across `base-100`, `base-200`, `base-300`, `surface-0`, `surface-1`, `surface-2`, and `surface-3`.
  - All 5 proposed button variants clear `≥ 4.5:1` label-to-fill contrast in both themes, and `--ptah-control-edge` (`3.82–4.93:1` dark, `3.39–4.19:1` light) and `--ptah-focus-ring-color` (`8.91–11.50:1` dark, `5.88–7.26:1` light) clear `≥ 3.0:1` on `base-100`, `base-200`, and `base-300`.

---

## 5. Key Decisions

1. **Specificity without `!important`**: Scoped proposed button rules with `[data-ptah-look='next'] .btn:is(.btn, #ptah-next)` (`(1,1,0)`) so `ptah-button.css` can be imported at line 17 of `styles.css` (right after `ptah-tokens.css`) and still outrank the `(0,6,0)` `:root[data-theme^='ptah-glass'][data-glass='on'][data-glass-mode='dark'] .btn-primary:focus-visible` rules later in `styles.css` without using `!important`.
2. **Zero-width-jump `[aria-busy='true']` spinner**: The independent review replaced the padding adjustment with an absolutely positioned rotating spinner. Busy controls retain their original padding and gap, so width remains constant.
3. **Forced-state selectors**: Paired `:hover`, `:focus-visible`, and `:active` rules with `[data-state='hover']`, `[data-state='focus']`, and `[data-state='active']` so the gallery displays all six interactive states simultaneously.

---

## 6. Final Verification Output (`npm run verify -- -p ui,ptah-extension-webview`)

```text
Nx read the output from the cache instead of running the command for 2 out of 4 tasks.

Output of 4 successful tasks were not shown. Run with --verbose or --output-style=static to see it.

  Run duration:      39.4s
  Cache:             2/4 hit (50%)
  Critical path:     39.3s (1 task)
  Recoverable time:  1ms (0% of the run)

  Recommendations:
    - Speed up or split the longest tasks on the critical path:
        ptah-extension-webview:typecheck    39.3s
[verify 2026-11-10T20:37:05.788Z] starting verify test (ui,ptah-extension-webview)

 NX   Running target test for 2 projects:

- @ptah-extension/ui
- ptah-extension-webview


√  nx run @ptah-extension/ui:test  [local cache]
√  nx run ptah-extension-webview:test



 NX   Successfully ran target test for 2 projects

Nx read the output from the cache instead of running the command for 1 out of 2 tasks.

Output of 2 successful tasks were not shown. Run with --verbose or --output-style=static to see it.

  Run duration:      1m 16s
  Cache:             1/2 hit (50%)
  Critical path:     1m 16s (1 task)
  Recoverable time:  4ms (0% of the run)

  Recommendations:
    - Speed up or split the longest tasks on the critical path:
        ptah-extension-webview:test    1m 16s
[verify 2026-11-10T20:38:25.649Z] lock released after 134.3s, exit code 0
```





