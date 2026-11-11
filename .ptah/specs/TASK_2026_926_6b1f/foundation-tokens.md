# Foundation tokens: decisions

Task TASK_2026_926_6b1f. Step 0a of `.ptah/specs/TASK_2026_924_8ac1/design-system-plan.md`.
This file is the contract for the token file, the Tailwind names and the gallery specimens.

## 1. Rules

1. A component in `libs/frontend/ui` uses tokens only. It has no raw pixel value and no raw
   palette value (hex, `rgb()`, `oklch()` literal).
2. A token is a CSS custom property with the prefix `--ptah-`. The values come from the DaisyUI
   theme variables (`--b1`, `--bc`, `--p`, `--rounded-btn`, ...) and from the surface tokens
   (`--surface-*`) where that is possible. Thus each picker theme works.
3. Step 0 adds tokens. It does not change the look of a product page (zero pixel).
4. One density (decision U6). There is no density switch.
5. The reference themes for a Look approval are `ptah-glass` (dark) and `ptah-glass-light`.

## 2. Spacing scale (4 px base)

The scale is the Tailwind spacing scale. Use only these steps in the ui lib.

| Token | Value | Tailwind step |
|---|---|---|
| `--ptah-space-1` | 0.25rem (4 px) | 1 |
| `--ptah-space-2` | 0.5rem (8 px) | 2 |
| `--ptah-space-3` | 0.75rem (12 px) | 3 |
| `--ptah-space-4` | 1rem (16 px) | 4 |
| `--ptah-space-6` | 1.5rem (24 px) | 6 |
| `--ptah-space-8` | 2rem (32 px) | 8 |
| `--ptah-space-12` | 3rem (48 px) | 12 |

Steps 5, 7, 9, 10 and 11 are not in the scale. Half steps (0.5, 1.5, 2.5) are not in the scale.

## 3. White-space rules

White space shows which items belong together. A smaller gap means a closer relation. Each level
is larger than the level before it.

| Rule | Token | Value |
|---|---|---|
| Icon to label in a control | `--ptah-gap-inline` | space-2 (8 px) |
| Label to control, control to hint | `--ptah-gap-label` | space-1 (4 px) |
| Control to control in one row (buttons, filters) | `--ptah-gap-controls` | space-2 (8 px) |
| Field to field | `--ptah-gap-field` | space-4 (16 px) |
| Group to group in one section | `--ptah-gap-group` | space-6 (24 px) |
| Section to section | `--ptah-gap-section` | space-8 (32 px) |
| Page gutter (page edge to content) | `--ptah-page-gutter` | space-6 (24 px), space-4 below 640 px |
| Padding of a card or a panel | `--ptah-surface-pad` | space-4 (16 px) |
| Padding of a dialog | `--ptah-dialog-pad` | space-6 (24 px) |
| Section title to the first item | `--ptah-gap-heading` | space-3 (12 px) |

Control dimensions:

| Token | Value | Use |
|---|---|---|
| `--ptah-control-h-xs` | 1.5rem (24 px) | Toolbar, row action, inline action |
| `--ptah-control-h-sm` | 2rem (32 px) | Default control: button, compact input, select trigger |
| `--ptah-control-h-md` | 2.5rem (40 px) | The one primary action of a page or a dialog |
| `--ptah-control-h-field` | 3.25rem (52 px) | Field with a floating label |
| `--ptah-control-px-xs` | space-2 (8 px) | Horizontal padding, size xs |
| `--ptah-control-px` | space-3 (12 px) | Horizontal padding, size sm |
| `--ptah-control-px-md` | space-4 (16 px) | Horizontal padding, size md |
| `--ptah-icon-xs` | 0.75rem (12 px) | Icon in a control of size xs |
| `--ptah-icon-sm` | 0.875rem (14 px) | Icon in a control of size sm |
| `--ptah-icon-md` | 1rem (16 px) | Icon in a control of size md |

The heights xs and sm are equal to DaisyUI `btn-xs` and `btn-sm`. Thus adoption at these sizes
moves no pixel.

An icon button is a square: its width is equal to its control height. The disabled look and the
top padding of a field with a floating label are decisions of the button family and the field
family (Look approval).

## 4. Type scale and visual hierarchy

One family for the interface (Inter, the current `font-sans`). One mono family for code. Each
role has one size, one weight, one line height and one color role. A page uses each level in
order and does not skip a level. Hierarchy comes from size and weight first, then from color.
Labels are not in upper case.

| Role | Token prefix | Size / line height | Weight | Color role |
|---|---|---|---|---|
| Page title | `--ptah-text-page-title` | 1.25rem / 1.75rem | 600 | `base-content` |
| Section title | `--ptah-text-section-title` | 1rem / 1.5rem | 600 | `base-content` |
| Group title (card, panel, dialog group) | `--ptah-text-group-title` | 0.875rem / 1.25rem | 600 | `base-content` |
| Body | `--ptah-text-body` | 0.875rem / 1.25rem | 400 | `base-content` |
| Field label | `--ptah-text-label` | 0.75rem / 1rem | 500 | `base-content` |
| Hint (help text, meta text) | `--ptah-text-hint` | 0.75rem / 1rem | 400 | `base-content-muted` |
| Caption (counter, time, table header) | `--ptah-text-caption` | 0.6875rem / 1rem | 500 | `base-content-muted` |
| Code | `--ptah-text-code` | 0.8125rem / 1.25rem | 400 | `base-content` |

Each role has three properties: `<prefix>-size`, `<prefix>-leading`, `<prefix>-weight`.
Tailwind gets one `fontSize` key for each role (`text-ptah-page-title`, ...), which sets size,
line height and weight together. The color role is a separate class (`text-base-content`,
`text-base-content-muted`). Error text uses the hint role with the error ink.

## 5. Shape, border, focus, elevation, motion, layers

| Token | Value | Use |
|---|---|---|
| `--ptah-radius-control` | `var(--rounded-btn)` | Button, input, select trigger |
| `--ptah-radius-surface` | `var(--rounded-box)` | Card, panel, dialog, menu |
| `--ptah-radius-chip` | `var(--rounded-badge)` | Badge, chip, tag |
| `--ptah-border-width` | 1px | Each border of a control or a surface |
| `--ptah-border-color` | `var(--surface-border)` | Default border |
| `--ptah-border-color-strong` | `var(--surface-border-strong)` | Hover, emphasis, field edge |
| `--ptah-focus-ring-width` | 2px | Keyboard focus ring (`:focus-visible` only). The ring is an `outline`, not a box shadow |
| `--ptah-focus-ring-offset` | 2px | `outline-offset`. The space is transparent, thus it needs no color |
| `--ptah-focus-ring-color` | `var(--glass-focus)`, and the theme primary when glass is off | One focus color for each control |
| `--ptah-elevation-0` | none | Flat surface |
| `--ptah-elevation-1` | `var(--elev-shadow)` | Card that floats over a page |
| `--ptah-elevation-2` | `var(--elev-shadow-raised)` | Menu, popover, tooltip |
| `--ptah-elevation-3` | `var(--glass-shadow-overlay)`, and level 2 when glass is off | Dialog, drawer |
| `--ptah-duration-fast` | 120ms | Hover, press, focus |
| `--ptah-duration-base` | `var(--ptah-motion-out)` (180ms) | Open, close, expand |
| `--ptah-duration-slow` | `var(--ptah-motion-in)` (320ms) | Page and panel transitions |
| `--ptah-ease-standard` | `var(--ptah-ease-gentle-in)` | Default |
| `--ptah-ease-emphasis` | `var(--ptah-ease-soft)` | Enter transitions |
| `--ptah-state-ok`, `-warn`, `-err`, `-info` | `--state-ink-done`, `-need`, `-err`, `-run`, and the DaisyUI state color as fallback | State text and state icons |
| `--ptah-z-raised` | 30 | Sticky bar, raised panel |
| `--ptah-z-menu` | 50 | Menu, popover, tooltip |
| `--ptah-z-dialog` | 60 | Dialog, drawer |
| `--ptah-z-overlay` | 1000 | CDK overlay container (the top layer) |

Radius and border come from the theme. Thus a theme can change the shape and each component
follows. Motion durations become 0.01ms when the user prefers reduced motion. Elevation values
come from the current surface shadows and are not a new neutral gray shadow. The layer values
are the values that overlays use today. Step 0 changes no existing rule.

## 6. Where the tokens live

- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`: the custom properties only. No
  `@layer`, no `@apply`, no `@tailwind` (the file must be valid without Tailwind).
- `apps/ptah-extension-webview/src/styles.css`: one `@import` line for the token file.
- `apps/ptah-extension-webview/tailwind.config.js`: token-backed names in `theme.extend`
  (`fontSize` roles, `height`/`minHeight` for control heights, `borderRadius`, `boxShadow`,
  `transitionDuration`, `transitionTimingFunction`, `outlineColor`/`outlineWidth`/`outlineOffset`
  for the focus ring, `spacing` names for the white-space rules and the icon sizes).
  Focus classes: `outline outline-ptah-focus-width outline-ptah-focus outline-offset-ptah-focus`
  on `:focus-visible`.
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`: a guard in the ui lib. It fails when a
  token of this contract is missing or when a folder in the token-only list
  (`TOKEN_ONLY_DIRS`) contains a raw pixel or palette value. Each new family adds its folder.
- `apps/ptah-extension-webview/src/app/design-tokens.spec.ts`: a guard in the application. It
  fails when a Tailwind name points to a token that does not exist, or when the application
  does not define a token that the token file reads.

## 7. Removals

None in step 0. The older tokens `--btn-height-xs`, `--btn-height-sm`, `--btn-height-md` and
`--input-height` have users in `styles.css` (the sidebar scaling rules). The button family and
the field family replace these users, and remove the tokens in the same batch.
