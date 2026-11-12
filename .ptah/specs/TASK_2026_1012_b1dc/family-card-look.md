# Card family look: card, panel surface and section header (composite 3)

Date: 2026-11-12. Task: TASK_2026_1012_b1dc. Step 3 of the six steps. Research:
`card-family-research.md` (sections 4, 5 and 6 are accepted). Owners:
`libs/frontend/ui/src/lib/card` (recipe, directive, section header) and
`libs/frontend/ui/src/lib/surfaces/surface-card.component.ts`. Gallery: `/ui-gallery`, section
"Card, panel surface and section header family" (`#family-card`).

## The concept: one plane, one recipe

A card is a plane that groups content. It is quiet: one fill, one hairline border, one radius,
no shadow. The content gives the emphasis, not the card. One CSS file
(`card/ptah-card.css`) holds the look. The directive, the card component and the section header
read it, so a token change applies to each card.

Today the product has 7 card shells and about 170 raw panel recipes (123 `bg-base-*` panels and
51 `surface-2` tags). The proposal has 4 variants, 4 paddings, 8 tones and one section header.

## A. Owner checks

- [x] `SurfaceCardComponent` (`ptah-surface-card`), `PtahSurfaceDirective` (`[ptahSurface]`) and
      `PtahSectionHeaderComponent` (`ptah-section-header`) are exported from `@ptah-extension/ui`.
- [x] Tokens only. `card` is in `TOKEN_ONLY_DIRS`. The new tokens are in `ptah-tokens.css`.
- [x] The gallery shows each variant, each padding, each tone with the spine, default, hover
      (forced), focus-visible (forced), interactive, selectable, disabled, with header, with
      footer, empty, the panel directive, and the section header (title, description, eyebrow,
      status, actions, section size).
- [x] Behavior moved from `ptah-native-card`: activation by click, Enter and Space, the nested
      control guard, `aria-pressed` for a selectable card, `aria-disabled`, `ariaLabel`.
- [x] The one consumer of `ptah-surface-card` (`memory-diagnostics-accordion.component.ts:158`)
      is not changed. The old inputs `elevation` and `interactive` still work.
- [ ] Zero-pixel adoption: the default card equals the catalog card (zero pixels). The other
      owners and raw recipes change by the list in section 6.
- [x] `npm run verify -- -p ui,ptah-extension-webview` and `typecheck-templates`: see the PR.

## 1. Variants

### Card (`ptah-surface-card`) and panel (`[ptahSurface]`)

| Variant | Fill | Border | Radius | Shadow | Use it for |
|---|---|---|---|---|---|
| `card` (default) | base-200 | base-300 | 12 px | none | A card in a grid or a list, a settings panel |
| `subtle` | surface-1 | base-300 | 12 px | none | A quiet group plane, a page section |
| `inset` | base-100 | base-300 | 8 px | none | A nested block inside a card |
| `raised` | surface-3 | base-300 | 12 px | elevation 2 | A card that floats over the page |

| Padding | Value | Body gap | Use |
|---|---|---|---|
| `none` | 0 | 12 px | A card with a full-bleed list or table |
| `sm` | 12 px | 8 px | Compact cards and most raw panels (`p-3`) |
| `md` (default) | 16 px | 12 px | Standard cards |
| `lg` | 20 px | 12 px | Page sections (`surface-1 p-5`) |

`density` (`compact`, `comfortable`) of `ptah-native-card` maps to `sm` and `md` when `padding`
is not set.

The directive sets only the look. It does not set display, gap or position, so a raw panel
keeps its layout when it moves. The component adds the flex column and the body gap.

### States (component only)

| State | Look | Rule |
|---|---|---|
| default | the variant | A card is static unless `interactive`, `clickable` or `selectable` is set |
| hover | fill + 4 % base content, border base content 20 % | Interactive only |
| focus-visible | 2 px base content outline, 2 px offset | Interactive only. Measured 3:1 on each surface by the native card work |
| selected | 2 px ring in the tone color (neutral: base content 40 %) | Selectable only. `aria-pressed` |
| disabled | opacity 0.6, no activation, no tab stop | `aria-disabled="true"` |

| Tone | Spine and ring |
|---|---|
| `neutral` (default) | base content 30 % (spine), 40 % (ring) |
| `info`, `success`, `warning`, `error` | DaisyUI state color |
| `accent`, `secondary`, `primary` | DaisyUI brand color |

Spine: 4 px at the start edge. The content start padding is then 20 px for each padding.

### Section header (`ptah-section-header`)

| Part | Value | Input or slot |
|---|---|---|
| Heading | 14 px / 20 px / 600, base content (`size="group"`, default) | `heading` (required), `level` 2, 3 (default) or 4 |
| Heading, section size | 16 px / 24 px / 600 | `size="section"` |
| Eyebrow | 11 px / 16 px / 600, uppercase, 0.05 em tracking, muted | `eyebrow` |
| Description | 12 px / 16 px, muted | `description` |
| Status | next to the heading, 8 px gap, not in the heading name | `[status]` slot |
| Actions | end of the row, 8 px gap | `[actions]` slot |

The level sets only the tag. Page titles stay with `ptah-page-header`.

## 2. Tokens

Dark is `anubis` / `ptah-glass`, light is `anubis-light` / `ptah-glass-light`. The values come
from the theme channels, so each theme works. With glass on, the fill is the glass tile fill.

| Token | Value | Dark | Light |
|---|---|---|---|
| `--ptah-card-bg` | `var(--glass-fill-tile, oklch(var(--b2)))` | base-200 | base-200 |
| `--ptah-card-bg-subtle` | `var(--glass-fill-tile, var(--surface-1))` | surface-1 | surface-1 |
| `--ptah-card-bg-inset` | `var(--glass-fill-tile, oklch(var(--b1)))` | base-100 | base-100 |
| `--ptah-card-bg-raised` | `var(--surface-3)` | surface-3 | surface-3 |
| `--ptah-card-border` | `oklch(var(--b3))` | base-300 | base-300 |
| `--ptah-card-border-width` | `var(--ptah-border-width)` (1 px) | same | same |
| `--ptah-card-radius` | 0.75rem (fixed) | 12 px | 12 px |
| `--ptah-card-radius-inset` | 0.5rem | 8 px | 8 px |
| `--ptah-card-padding-sm` / `-md` / `-lg` | space-3 / space-4 / 1.25rem | 12 / 16 / 20 px | same |
| `--ptah-card-gap` / `-gap-sm` | space-3 / space-2 | 12 / 8 px | same |
| `--ptah-card-shadow` | `var(--ptah-elevation-0)` | none | none |
| `--ptah-card-shadow-raised` | `var(--ptah-elevation-2)` | raised shadow | raised shadow |
| `--ptah-card-shadow-glass` | glass rim + glass elevation 1 | glass only | glass only |
| `--ptah-card-hover-border` | base content 20 % | same | same |
| `--ptah-card-hover-tint` / `-hover-mix` | base content / 4 % | same | same |
| `--ptah-card-selected-ring` | 2px | same | same |
| `--ptah-card-focus-color` | `oklch(var(--bc))` | same | same |
| `--ptah-card-disabled-opacity` | 0.6 | same | same |
| `--ptah-card-spine-width` / `-spine-pad` | 0.25rem / 1.25rem | same | same |
| `--ptah-card-tone-*` | DaisyUI `--in --su --wa --er --a --s --p`, neutral base content 40 % | theme | theme |
| `--ptah-section-title-size` / `-leading` / `-weight` | group-title role (14 px / 20 px / 600) | same | same |
| `--ptah-section-title-lg-*` | section-title role (16 px / 24 px / 600) | same | same |
| `--ptah-section-title-color` | `oklch(var(--bc))` | same | same |
| `--ptah-section-eyebrow-size` / `-leading` / `-weight` | caption (11 px / 16 px) / 600 | same | same |
| `--ptah-section-eyebrow-tracking` | 0.05em | same | same |
| `--ptah-section-eyebrow-color` | muted (`--bcm`) | same | same |
| `--ptah-section-description-*` | hint (12 px / 16 px), muted | same | same |
| `--ptah-section-gap` / `-text-gap` | gap-heading (12 px) / gap-label (4 px) | same | same |

## 3. White space

| Measure | Value | Rule |
|---|---|---|
| Card padding | 12 / 16 / 20 px | 4 px scale |
| Gap between slots in a card | 12 px (8 px with `sm`) | gap-heading |
| Heading to description | 4 px | gap-label |
| Heading row to actions | 12 px | gap-heading |
| Card to card | 16 px | gap-field (consumer layout) |

## 4. Visual hierarchy

- A card has no shadow by default. Only `raised` has one. Elevation means "floats", not
  "important".
- Order of fill from quiet to strong: `inset` (base-100), `subtle` (surface-1), `card`
  (base-200), `raised` (surface-3).
- Heading sizes: page title 20 px (`ptah-page-header`) > section 16 px > group 14 px (default)
  > eyebrow 11 px uppercase.

## 5. Reference pages

| Page | Recipes today | Proposed | Expected visible difference |
|---|---|---|---|
| Marketplace catalog and server detail | `ptah-catalog-card`, `ptah-storefront-panel`, `bg-base-200 border-base-300 rounded-lg p-3` | `.ptah-card` shell, `ptahSurface padding="sm"` | Catalog: none. Raw panel: radius 8 to 12 px |
| Memory curator diagnostics | `ptah-native-card` (9), `surface-2` (22), `ptah-surface-card` (1) | `ptah-surface-card`, `ptahSurface` | Fill /40 to opaque base-200 (or surface-1 with `subtle`), border, no shadow |
| Settings providers | `bg-base-200 border-base-300 rounded p-3`, `bg-base-100 ... rounded px-2 py-1` | `ptahSurface padding="sm"`, `inset` | Radius 4 to 12 px (8 px for inset) |
| Command center | `bg-base-200 border-base-300 rounded-xl p-3` | `ptahSurface padding="sm"` | None |
| Canvas rail | `surface-3` | exception | None |

## 6. Pixel differences from today

Measured from the class values. Screenshots wait for Electron (no serve run in this step).

1. `ptah-catalog-card` shell and `bg-base-200 border border-base-300 rounded-xl p-4` panels:
   none in a normal theme. Glass: none (tile fill and rim, as today).
2. `ptah-surface-card` (1 use, memory diagnostics "Curator model"): border `--surface-border`
   (base content 14 %) becomes base-300. The `elev-1` shadow (`--elev-shadow`, 1 px) is removed.
   Fill stays base-200. Radius and padding stay 12 / 16 px. Glass: the reading-plane scrim
   (`--glass-scrim-text`) and content shadow become the tile fill and the rim.
3. Old `interactive` of `ptah-surface-card`: hover border `--surface-border-strong` (22 %)
   becomes base content 20 %. Hover also adds a 4 % fill tint. The card now has `role="button"`
   and a tab stop when interactive (no consumer uses it).
4. `ptah-native-card` (13 uses, at adoption): fill base-200 at 40 % becomes opaque base-200
   (`card`) or surface-1 (`subtle`). Hover fill base-200 at 70 % becomes the 4 % tint. The
   transition is 120 ms in place of 150 ms. Spine, ring, focus, disabled: no change. Compact
   padding 12 px, gap 8 px, spine padding 20 px: no change.
5. `ptah-surface-tile` (0 uses) as `inset`: fill surface-2 becomes base-100. Border 14 % becomes
   base-300. Radius 8 px: no change. Compact padding 8 px has no step (nearest `sm` 12 px).
6. `ptah-surface-section` (0 uses) as `subtle` `lg`: surface-1 fill and 20 px padding stay.
   Border 14 % becomes base-300. Inset top highlight removed. Gap 20 px becomes 12 px.
7. `ptah-stat-card` and raw `surface-2` (51): border 14 % becomes base-300. The top highlight
   (`inset 0 1px 0 --surface-highlight`) and `--elev-shadow` are removed. Glass: scrim becomes
   tile fill.
8. Raw `surface-1` (23): fill stays with `subtle`. Same border and highlight change as item 7.
9. Raw panels with `rounded` (4 px, 39), `rounded-md` (6 px, 13) or `rounded-lg` (8 px, 30):
   the radius becomes 12 px (`inset`: 8 px). `rounded-box` panels (9) change only in light
   (16 px) and glass (24 px) themes, to 12 px.
10. Raw panels with `bg-base-200/40` or `/50` (26): the fill becomes opaque (`subtle` or `card`).
11. Raw panels with `border-base-content/10` or `/5` (20): the border becomes base-300.
12. Raw panels with `shadow-lg` or `shadow-xl` (10): use `raised` (elevation 2) or keep the
    utility. Decide at adoption.
13. Section title `text-sm font-semibold` and `text-base font-semibold`: none.
14. Eyebrow `text-xs font-bold uppercase tracking-wider` (12): 12 px / 700 becomes
    11 px / 600. Tracking 0.05 em: no change. Color base content becomes muted.
15. Eyebrow `text-[10px] uppercase tracking-wide` (9): 10 px becomes 11 px, tracking 0.025 em
    becomes 0.05 em.
16. Description text: any size becomes 12 px muted.

## Exceptions (keep their look)

- `declarative-dashboard` cards (5 `card card-bordered`): rendered from a schema. They move
  later with that lib.
- Chat `thinking-block` (`thinking-block.component.ts:28`, `card card-border bg-base-200/50`).
- Canvas rail `surface-3` tags (`canvas-rail-board.component.ts:277` and others).
- Row-like panels (`px-2 py-1`, `li` panels): list row family (composite 6).
- Gallery token pages (29 raw panels): not consumers.

## Proposed Removals

At step 6, after the adoption:

- `ptah-native-card` (`native/card`), `ptah-surface-tile`, `ptah-surface-section`.
- The `elevation` input of `ptah-surface-card` and the `clickable` alias.
- `CATALOG_CARD_SHELL_CLASS` classes: the shells of `ptah-catalog-card`,
  `ptah-storefront-panel` and `ptah-stat-card` read `.ptah-card`.
- Raw panel recipes (`bg-base-*` + `border` + `rounded*`) and raw `surface-1/2/3` outside
  `libs/frontend/ui`, with a lint rule that names `ptahSurface` and `ptah-surface-card`.
- Raw eyebrow labels and header rows that `ptah-section-header` replaces.

## D. Review

- [ ] Contrast: no new text color. Focus outline is the measured base content outline of the
      native card. The 4 % hover tint and the base-300 border are decoration (no 3:1 need for a
      card edge). Step 4 checks the border on base-100 in the light glass theme.
- [x] Spacing: 4, 8, 12, 16 and 20 px. All on the 4 px scale.
- [x] One design language: one recipe for all cards and panels.
- [ ] Independent reviewer lane: see the pull request.

## C. Screenshots

Screenshots wait for Electron (no serve run in this step). The coordinator supplies the gallery
in dark and light, glass on and off, and the reference pages before and after. Record the file
names and the SHA-256 hashes here.

## Open questions for the user

1. Default look: base-200 fill + base-300 border (the catalog card, used in this step) or
   surface-2 + `--surface-border`? Recommendation: base-200 + base-300. The fill is the same
   value. Only the border of the 51 `surface-2` tags changes.
2. Radius: fixed 12 px (used in this step) or the theme radius `--ptah-radius-surface`
   (12, 16 or 24 px)? Recommendation: fixed now. Zero change for the owners in each theme.
3. `subtle` fill: opaque surface-1 (used in this step) or base-200 at 40 %? Recommendation:
   surface-1. It is a token and it is stable in glass.
4. Glass mode: the owner does not set `data-glass-surface`. It reads the glass tile fill and
   rim through tokens, which equals the glass look of today's catalog card. Is the tile look
   right for every card, or must page-level cards get the reading-plane scrim (`content`)?
   Recommendation: tile for all, check in the glass screenshots.
5. Glass border: with glass on, a raw `border-base-300` box gets `--glass-line`. The recipe now
   does the same (`ptah-card.css`, low-specificity rule), so the glass border of the catalog
   shell is kept. Screenshots in Electron must confirm it (light and dark glass).
6. Panel directive scope: `[ptahSurface]` has `variant` and `padding` only. It has no `tone`
   input and sets no `data-glass-surface` (research 5.2 named both). Reason: a panel keeps its
   DOM, and the attribute would change which global glass rules apply. Add them in adoption if a
   row needs them. Recommendation: keep as is.

## Default look and `stat-card` (coordinator check)

- The default `card` variant equals the catalog-card shell. The catalog-card shell is the
  59-use look: fill `bg-base-200`, border `border-base-300`, `rounded-xl`, `p-4`, `gap-3`
  (research section 4). Fill, border, radius, padding and shadow have zero difference for
  those 59 consumers. No separate catalog-card variant is needed.
- Consumers that change when they adopt the default: the 56 `surface-2` uses (border changes
  from `--surface-border` to `oklch(var(--b3))`) and the 23 `bg-base-200/40` uses (fill is
  opaque base-200 for `card`, or surface-1 for `subtle`).
- `ptah-stat-card` (4 uses, one file) stays out of this family. `ptah-stat` (appearance
  `card` or `plain`) is its owner since #1143. `stat-card` is recorded as a duplicate for a
  later decision. It is not migrated here.

7. Old consumer look: the "Curator model" card (`memory-diagnostics-accordion.component.ts`)
   used `ptah-surface-card` with `surface-2 rounded-xl p-4 elev-1`. The new default has
   a base-200 fill, a base-300 border and no shadow. In glass, the old card used the reading
   plane (`--glass-scrim-text`, `--glass-frame`, content shadow), and the new default uses the
   tile fill, `--glass-line` and the rim. To keep zero look change in this PR, the card uses
   the temporary variant `legacy` (the old classes). Does the user approve the new card look
   for this card? If yes, remove `legacy` and use the default. If no, keep `legacy` or
   choose another variant.

## Review record

An independent review (Codex) found two major defects. Both are fixed: the selected ring (the
default shadow was `none`, which made the shadow list invalid; it is now `0 0 0 0 transparent`)
and the glass border (see question 5).

## Approval record

Open.
