# Card, panel surface and section header: research (composite family 3, step 1)

Epic: `.ptah/specs/TASK_2026_924_8ac1/design-system-epic.md`, section 3 row 3 and open decision 5.
Census base: `.ptah/specs/TASK_2026_940_eef5/composites-research.md`.
User direction: one owner for each look, so that one change applies globally.

## 0. Method

- Commit: `0823a07cc` (branch `feat/ui-card-surface-family`).
- Scope, file list and tag parser are the same as `composites-census.py` (lines 1 to 58 of that
  script, used without change). Files come from `git ls-files` under
  `apps/ptah-extension-webview/src` and `libs/frontend`. Excluded: `*.spec.ts`, `*.stories.ts`,
  `libs/frontend/webview-e2e-harness`.
- Result: 636 templates, 14,055 tags, 13,687 tags outside `libs/frontend/ui`.
- Extra queries (a temporary script outside the repository, appended to those 58 lines):
  owner tag counts, the panel heuristic of the old census (`panelish`, census line 308), class
  set frequency, heading tags and class sets, eyebrow labels, header rows.
- "Gallery" means a path that contains `ui-gallery`. Gallery uses are not consumers. They are
  given apart.
- A count is a static source occurrence. A `@for` loop counts one time. `[class]` and `ngClass`
  are not seen, so raw counts are a lower bound.
- The panel count is now 152 (old census: 158). The difference comes from merged adoption work
  after the old census. 29 of the 152 are gallery tags, so **123 consumer panels in 87 files**.

## 1. Card owners today

All are in `libs/frontend/ui/src/lib`. Counts are tags outside `libs/frontend/ui`, gallery apart.

| Owner | File | Look (root classes) | Uses | Gallery | Groups (uses) |
|---|---|---|---:|---:|---|
| `ptah-native-card` | `native/card/native-card.component.ts:104` | `rounded-xl border bg-base-200/40 border-base-300`, inner `p-4 gap-3` (`:109`, `:192`, `:93`) | 13 | 0 | memory-curator-ui 9, skill-synthesis-ui 2, chat-settings 1, cron-scheduler-ui 1 |
| `ptah-catalog-card` | `native/catalog-card/catalog-card.component.ts:106` | shell `rounded-xl border border-base-300 bg-base-200`, `p-4 gap-3` (`catalog-card-shell.styles.ts`) | 11 | 0 | marketplace 8, chat-ui 3 |
| `ptah-storefront-panel` | `native/catalog-card/storefront-panel.component.ts:52` | `rounded-xl border border-base-300 bg-base-200` (`:57`) | 8 | 0 | marketplace 6, chat-ui 2 |
| `ptah-stat-card` | `surfaces/stat-card.component.ts` (selector line 4) | `surface-2 rounded-xl p-4` | 4 | 2 | marketplace 4 (one file: `overview-page.component.html:49`) |
| `ptah-surface-card` | `surfaces/surface-card.component.ts:9` | `surface-2 rounded-xl p-4` + `elev-1` or `elev-3` (`:18-26`) | 1 | 1 | memory-curator-ui 1 (`memory-diagnostics-accordion.component.ts:158`) |
| `ptah-surface-tile` | `surfaces/surface-tile.component.ts:9` | `surface-2 rounded-lg p-3` (`p-2` compact) | 0 | 1 | none |
| `ptah-surface-section` | `surfaces/surface-section.component.ts:15` | `surface-2` or `surface-1`, `rounded-xl`, `p-5 gap-5` or `p-4 gap-3` | 0 | 0 | none |

Notes:

- The epic says "5 card owners". The code has 7 card-like shells. `ptah-storefront-panel` and
  `ptah-surface-section` were not in the old count.
- Two looks exist side by side. Group A (native-card, catalog-card, storefront-panel) uses DaisyUI
  `bg-base-200` and `border-base-300`. Group B (surface-card, surface-tile, surface-section,
  stat-card) uses the semantic classes `surface-1` and `surface-2` from
  `apps/ptah-extension-webview/src/styles.css:397-424`.
- Only `ptah-native-card` has behavior: `clickable`, `selectable`, `selected`, `disabled`, `tone`,
  `spine`, `density`, `ariaLabel`, an `activated` output, keyboard activation and a guard that
  ignores clicks on nested controls (`native-card.component.ts:150-245`). It also has the header
  and footer slots `[card-header]` and `[card-footer]` (`:134-136`).
- `ptah-catalog-card` adds a stretched link activator and a hover lift
  (`catalog-card.component.ts:101`, `:198`). It is a content component, not a plain shell.
- Supporting tags that are not shells: `ptah-catalog-grid` 22 uses, `ptah-catalog-card-skeleton`
  10 uses.

## 2. Raw card and panel class sets

### 2.1 DaisyUI `card` class (exact)

9 tags in 5 groups. The ratchet already blocks the `card` root
(`tools/ui-class-audit/check-ui-classes.ts:74`).

| Count | Class set | Example |
|---:|---|---|
| 5 | `card card-bordered bg-base-100 text-base-content` (+ `p-3`, `p-4` or flex) | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:21` |
| 1 | `card card-border bg-base-200/50 border-base-300 shadow-sm my-3` | `libs/frontend/chat-ui/src/lib/molecules/thinking-block.component.ts:28` |
| 1 | `card bg-base-200 border border-info p-3 mt-2 text-xs` | `libs/frontend/chat/src/lib/components/molecules/notifications/install-scope-migration-notice.component.ts:62` |
| 1 | `card bg-base-200 border border-base-300 p-3` | `libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:79` |
| 1 | `card surface-2` | `libs/frontend/setup-wizard/src/lib/components/cards/enhanced-prompts-summary-card.component.ts:32` |

Related: `card-body` 3, `card-title` 2 (dashboard), `card-actions` 1 (dashboard).

### 2.2 Panel surface heuristic (div, section, article or aside with `bg-base-*`, `border`, `rounded*`, no `card`)

123 consumer tags in 87 files (plus 29 in the gallery).

| Group | Count |
|---|---:|
| chat-settings | 28 |
| marketplace | 21 |
| chat-ui | 20 |
| onboarding | 13 |
| chat | 12 |
| command-center | 9 |
| setup-wizard | 6 |
| machines-ui | 4 |
| canvas, git-ui, skill-synthesis-ui | 2 each |
| declarative-dashboard, memory-curator-ui, review-runs-ui, workspace-indexing | 1 each |
| app (all gallery) | 29 |

Parts of the 123 consumer panels:

| Part | Values (count) |
|---|---|
| Fill | `bg-base-200` 64 (any alpha: 85), `bg-base-100` 29, `bg-base-200/40` 17, `bg-base-200/50` 9 |
| Border color | `border-base-300` 76, `border-base-content/10` 13, none 9, `border-base-content/5` 7 |
| Radius | `rounded` 39, `rounded-lg` 30, `rounded-xl` 23, `rounded-md` 13, `rounded-box` 9, arbitrary 7 |
| Padding | `p-3` 39, none 16, `p-4` 16, `px-2 py-1` 12, `p-2` 10, `px-2 py-1.5` 6, `px-4 py-3` 6, `p-2.5` 6 |
| Shadow | none 113, `shadow-lg` 8, `shadow-xl` 2 |

Top full recipes (fill, border, radius, padding):

| Count | Recipe | Example |
|---:|---|---|
| 8 | `bg-base-200 border border-base-300 rounded p-3` | `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:225` |
| 5 | `bg-base-200 border border-base-300 rounded-xl p-3` | `libs/frontend/command-center/src/lib/components/command-live-panel.component.ts:92` |
| 4 | `bg-base-200 border border-base-300 rounded-xl` (no padding) | `libs/frontend/command-center/src/lib/components/command-center-page.component.html:182` |
| 4 | `bg-base-200 border border-base-300 rounded-lg p-3` | `libs/frontend/marketplace/src/lib/pages/servers/server-detail.component.html:145` |
| 4 | `bg-base-100 border border-base-300 rounded-md p-3` | `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:385` |
| 4 | `bg-base-100 border border-base-300 rounded px-2 py-1` | `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:142` |
| 4 | `bg-base-200/40 border border-base-content/5 rounded px-2 py-1` | `libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-output.component.ts:220` |
| 4 | `bg-base-200/40 border border-base-300 rounded-lg p-2.5` | `libs/frontend/marketplace/src/lib/external-consent-dialog.component.ts:244` |
| 3 | `bg-base-200 border border-base-300 rounded-xl p-4` | `libs/frontend/chat/src/lib/settings/settings.component.html:245` |

Fill and border pairs: `bg-base-200` + `border-base-300` 39, `bg-base-100` + `border-base-300` 18,
`bg-base-200/40` + `border-base-300` 10.

### 2.3 Semantic surface classes used raw (exact class token, gallery apart)

| Class | Uses | Top set | Example |
|---|---:|---|---|
| `surface-2` | 51 | `surface-2 rounded-xl` 14, `surface-2 rounded-xl p-4` 8, `surface-2 rounded-xl px-4 py-3` 4 | `libs/frontend/chat-ui/src/lib/molecules/notifications/compaction-notification.component.ts:13` |
| `surface-1` | 23 | `surface-1 rounded-xl p-5` 6, `surface-1 rounded-lg` 3 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:215` |
| `surface-3` | 17 | `surface-3 rounded-xl p-3` 3 | `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts:277` |

`surface-2` uses are mostly in memory-curator-ui (22) and messaging-gateway-ui (7). These are a
second raw recipe of the same card. The family must adopt them too.

### 2.4 Wider net (upper bound)

Any tag (also `li` and `header`) with `border`, `rounded*` (not `rounded-full`), any `bg-*`, and no
`card` or `badge`: 268 tags in 154 files. Most of the extra tags are list rows. List rows belong to
composite 6. Use this number only as an upper bound.

## 3. Section header patterns

Counts outside `libs/frontend/ui`. Gallery: 23 heading tags.

| Pattern | Count | Notes |
|---|---:|---|
| `h1` | 37 | Page titles. Top sets: `text-2xl font-semibold` 7, no class 6, `text-xl font-semibold tracking-tight` 4 |
| `h2` | 120 | Top sets: `text-sm font-semibold text-base-content` 17, `font-semibold` 15, no class 11, `text-base font-semibold text-base-content` 11, `text-sm font-semibold` 10, `text-xs font-bold uppercase tracking-wider text-base-content` 9 |
| `h3` | 180 | Top sets: `text-sm font-semibold` 37, `text-sm font-semibold text-base-content` 21, `font-semibold` 20, `text-ptah-group-title text-base-content` 13 (already a token), `text-xs font-semibold` 8, `text-base font-semibold` 8 |
| `h4` | 29 | `text-xs font-semibold` 5, `text-xs font-semibold uppercase tracking-wide text-base-content-muted` 5 |
| `h1`-`h3` by group | 337 | chat-settings 58, marketplace 45, onboarding 44, app 21, chat 19, review-runs-ui 17, tasks-ui 16, 16 other groups |
| Header row: `div`/`header`/`section` with `flex items-center justify-between` and a first child `h*` | 35 in 33 files | Example `apps/ptah-extension-webview/src/app/git-window/git-window.component.ts:23` |
| `<header>` tag | 57 | onboarding 10, marketplace 9, memory-curator-ui 6, tasks-ui 6 |
| Eyebrow label: `uppercase` + `tracking-*` + `text-xs` or `text-[1x px]` | 84 in 61 files | Top sets: `text-xs font-bold uppercase tracking-wider text-base-content` 12, `text-xs font-semibold uppercase tracking-wide text-base-content-muted` 9, `text-[10px] uppercase tracking-wide text-base-content-muted` 9. Groups: chat-ui 21, chat-settings 14, marketplace 11 |

Owners today:

- `ptah-page-header` (`foundation/page-header.component.ts:5`): page level, `h1` with
  `text-lg font-semibold tracking-tight`. 0 consumer uses, 1 gallery use.
- `ptah-toolbar` (`foundation/toolbar.component.ts:5`): search bar, not a header. 0 consumer uses.
- `ptah-surface-section` has a `[section-header]` slot but 0 uses.
- No section header owner exists.

The most used section title is `text-sm font-semibold` (h3: 37 + 21 = 58, h2: 17 + 10 = 27). This
equals the token role `--ptah-text-group-title-*` (0.875rem, 1.25rem leading, weight 600,
`libs/frontend/ui/src/lib/tokens/ptah-tokens.css:52-54`). The second size `text-base font-semibold`
equals `--ptah-text-section-title-*` (1rem, 1.5rem, 600, `:49-51`).

## 4. The most used card look today

Count the owner uses and the raw panels together (consumers only):

| Look | Owner uses | Raw panels | Total |
|---|---:|---:|---:|
| Fill `bg-base-200` + border `border-base-300` (any radius, any padding) | catalog-card 11 + storefront-panel 8 | 39 (+ 1 `card`) | 59 |
| `surface-2` (fill `--surface-2`, border `--surface-border`) | stat-card 4 + surface-card 1 | 51 | 56 |
| Fill `bg-base-200/40` + `border-base-300` | native-card 13 | 10 | 23 |
| Fill `bg-base-100` + `border-base-300` (nested block) | 0 | 18 | 18 |

The radius and padding of the owners are `rounded-xl` and `p-4` (all five owners with a fill).
The raw panels mostly use `p-3`, with a mixed radius.

**Most used look: `bg-base-200 border border-base-300 rounded-xl p-4` (gap `gap-3`).**
This is the `ptah-catalog-card` shell (`catalog-card-shell.styles.ts`, `CATALOG_CARD_SHELL_CLASS`).

Resulting values:

| Property | Class today | Value (dark theme `anubis`) | Token that gives the same value |
|---|---|---|---|
| Fill | `bg-base-200` | `oklch(var(--b2))` | `--surface-2` = `oklch(var(--b2))` (`styles.css:169`) |
| Border | `border border-base-300` | 1px, `oklch(var(--b3))` | none today. `--ptah-border-color` is `--surface-border` (`bc` at 14%), not equal. New `--ptah-card-border` must be `oklch(var(--b3))` for zero change |
| Radius | `rounded-xl` | 0.75rem | `--ptah-radius-surface` = `--rounded-box` = 0.75rem in `anubis` only. It is 1rem in `anubis-light` and 1.5rem in `ptah-glass` (`apps/ptah-extension-webview/tailwind.config.js:220`, `:294`, `:339`) |
| Padding | `p-4` | 1rem | `--ptah-surface-pad` = `--ptah-space-4` = 1rem (`ptah-tokens.css:28`) |
| Gap | `gap-3` | 0.75rem | `--ptah-space-3` |
| Shadow | none | none | `--ptah-elevation-0` |

Glass note: with `data-glass='on'`, global rules already restyle these raw classes.
`styles.css:3697` maps `.bg-base-200` to `--glass-fill-tile`. `styles.css:3778` restyles any
bordered rounded box with `border-base-300`. `styles.css:3702` restyles `surface-1` and `surface-2`.
The owner must set `data-glass-surface` (`content` for a card, `tile` for a nested block,
`styles.css:2824-2825`) so the glass look comes from one rule and not from class matches.

## 5. Proposed API

### 5.1 One look owner: CSS recipe + tokens

Follow the badge family (`badge/badge.directive.ts:10`, `badge/ptah-badge.css`): one CSS file holds
the look. Every owner reads it. A change to the file or to a token changes every card.

- New folder `libs/frontend/ui/src/lib/card/` with `ptah-card.css`, `card.types.ts`, the directive,
  the component, the section header, specs and `index.ts`. Add the folder to `TOKEN_ONLY_DIRS`.
- Class `.ptah-card` with `data-variant`, `data-padding`, `data-tone`, `data-interactive`,
  `data-selected`, `data-disabled` attributes.

### 5.2 Directive: `[ptahSurface]` (the panel recipe)

For the 123 raw panels and the 91 raw `surface-N` tags. A directive keeps the DOM equal, so a row
can move with zero pixels.

```html
<div ptahSurface>...</div>
<div ptahSurface variant="inset" padding="sm">...</div>
```

Inputs: `variant`, `padding`, `tone`. Host: class `ptah-card`, the data attributes and
`data-glass-surface`. No behavior.

### 5.3 Component: `ptah-surface-card` (the one card owner)

Keep the selector `ptah-surface-card` (the plan name, 1 consumer use today, so a new API is cheap).
Move the behavior of `ptah-native-card` into it. Its root applies the same `.ptah-card` recipe.

| Input / output | Type | Default | Source today |
|---|---|---|---|
| `variant` | `'card' \| 'subtle' \| 'inset' \| 'raised'` | `'card'` | card = catalog look; subtle = native-card `bg-base-200/40` and `surface-1`; inset = `bg-base-100` nested block; raised = `surface-3` / `elev-3` |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | none 16 raw; sm = `p-3` (native compact, 39 raw); md = `p-4`; lg = `p-5` (surface-section, `surface-1 p-5` 6) |
| `tone` | `NativeCardTone` (neutral, info, success, warning, error, accent, secondary, primary) | `'neutral'` | native-card `:56-64` |
| `spine` | `boolean` | `false` | native-card |
| `interactive` | `boolean` | `false` | native-card `clickable`, catalog-card `interactive`, surface-card `interactive` |
| `selectable`, `selected` | `boolean` | `false` | native-card, surface-tile `selected` |
| `disabled` | `boolean` | `false` | native-card |
| `ariaLabel` | `string \| null` | `null` | native-card (required when interactive) |
| `activated` | output `void` | | native-card |
| Slots | `[card-header]`, default, `[card-footer]` | | native-card `:134-136` |

### 5.4 Component: `ptah-section-header`

```html
<ptah-section-header title="Providers" level="3" description="...">
  <span status>...</span>
  <div actions>...</div>
</ptah-section-header>
```

| Input | Type | Default | Note |
|---|---|---|---|
| `title` | `string` (required) | | |
| `level` | `2 \| 3 \| 4` | `3` | Sets the tag. Look does not depend on the level. |
| `size` | `'group' \| 'section'` | `'group'` | group = `text-sm font-semibold` (most used); section = `text-base font-semibold` |
| `eyebrow` | `string \| null` | `null` | Replaces the uppercase label recipe (84 uses) |
| `description` | `string \| null` | `null` | Muted hint text |
| Slots | `[status]`, `[actions]` | | Header row with `justify-between` (35 raw) |

`ptah-page-header` stays the page level owner (`h1`). It reads the same title tokens.

### 5.5 Tokens

Add to `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`. Default values equal the look of section 4.

| Token | Default value |
|---|---|
| `--ptah-card-bg` | `var(--surface-2)` |
| `--ptah-card-bg-subtle` | `var(--surface-1)` |
| `--ptah-card-bg-inset` | `oklch(var(--b1))` |
| `--ptah-card-bg-raised` | `var(--surface-3)` |
| `--ptah-card-border` | `oklch(var(--b3))` |
| `--ptah-card-border-hover` | `color-mix(in oklch, oklch(var(--bc)) 20%, transparent)` |
| `--ptah-card-border-width` | `var(--ptah-border-width)` |
| `--ptah-card-radius` | `0.75rem` (see decision 2) |
| `--ptah-card-radius-inset` | `0.5rem` |
| `--ptah-card-pad-sm`, `-md`, `-lg` | `var(--ptah-space-3)`, `var(--ptah-space-4)`, `1.25rem` |
| `--ptah-card-gap` | `var(--ptah-space-3)` |
| `--ptah-card-shadow`, `--ptah-card-shadow-raised` | `var(--ptah-elevation-0)`, `var(--ptah-elevation-2)` |
| `--ptah-card-spine-width` | `0.25rem` |
| `--ptah-card-selected-ring` | `2px` |
| `--ptah-section-title-size`, `-leading`, `-weight` | `var(--ptah-text-group-title-*)` |
| `--ptah-section-title-lg-size`, `-leading`, `-weight` | `var(--ptah-text-section-title-*)` |
| `--ptah-section-eyebrow-size` | `var(--ptah-text-caption-size)` (0.6875rem) |
| `--ptah-section-eyebrow-tracking` | `0.05em` |
| `--ptah-section-gap` | `var(--ptah-gap-heading)` |
| `--ptah-section-desc-fg` | muted content color (same as `text-base-content-muted`) |

### 5.6 Why `ptah-surface-card` is the one owner

- The plan and the epic name it (decision 5).
- It has only 1 consumer use. A new API breaks almost nothing.
- `ptah-native-card` has the best behavior and 13 uses. Its logic moves into `ptah-surface-card`.
  Its 13 tags move in adoption, then `native/card` is deleted.
- `ptah-surface-tile` becomes `variant="inset" padding="sm"`. `ptah-surface-section` becomes
  `variant="subtle" padding="lg"` with a `ptah-section-header`. Both are deleted (0 consumer uses).
- `ptah-catalog-card`, `ptah-storefront-panel` and `ptah-stat-card` stay as content components.
  Their shell changes to the `.ptah-card` recipe (`CATALOG_CARD_SHELL_CLASS` and the stat-card
  root). They keep their content API.

### 5.7 Enforcement (step 6)

- The ratchet already blocks `card`. Add a lint rule (or ratchet entry) for the panel recipe:
  a tag with `bg-base-*` + `border` + `rounded*`, and for raw `surface-1`, `surface-2`,
  `surface-3` outside `libs/frontend/ui`. The message names `ptahSurface` and `ptah-surface-card`.
- A rule for headings is not exact (common tags). Use the eyebrow recipe and the header row as
  ratchet units. Do not block `h2` or `h3`.

## 6. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | Default variant look. Two looks exist with almost equal counts: `bg-base-200 border-base-300` (59) and `surface-2` (56). They have the same fill and a different border. | Default = fill `--surface-2`, border `oklch(var(--b3))`, `rounded-xl`, `p-4`. This equals the catalog-card look, so the marketplace and chat-ui catalog screens do not change. Show the `surface-2` group with the new border in the look sheet. |
| 2 | Card radius. `--ptah-radius-surface` follows the theme (0.75rem, 1rem, 1.5rem). The owners use a fixed `rounded-xl` (0.75rem). | Use a fixed `--ptah-card-radius: 0.75rem` now. Zero change in every theme. Make it a theme value later only if the user asks. |
| 3 | Fill of `subtle`: native-card uses `bg-base-200/40`, section and panels use `surface-1`. | Use `--surface-1` (opaque). It is a token, it works in glass, and it is close to `/40`. The memory-curator pages show the change. |
| 4 | Spine and tone on the card. Only native-card uses them. | Keep `spine` and `tone`. Memory and cron cards need them. |
| 5 | Directive and component, or only a component. | Both. The directive moves the 123 raw panels and 91 `surface-N` tags with an equal DOM. The component is for cards that need slots or behavior. Both read the same CSS. |
| 6 | Padding of the raw panels: `p-3` is the most used (39), the owners use `p-4`. | Keep each row's padding through the `padding` input (`sm` = `p-3`). Do not force `p-4`. |
| 7 | Row-like tags: `px-2 py-1` panels (12) and `li` panels (wider net). | Leave them to composite 6 (list row). Exclude them from this family's ratchet. |
| 8 | Exceptions | Keep: `declarative-dashboard` cards (5 `card card-bordered`, rendered from a schema; move later with that lib), chat `thinking-block` (`thinking-block.component.ts:28`), canvas rail `surface-3` tags. List them in the look sheet. |
| 9 | Heading tags: one component for all 337 `h1`-`h3`? | No. Adopt only the header rows (35), the eyebrow labels (84) and the section titles inside cards. Page titles stay with `ptah-page-header`. 337 is an upper bound. |
| 10 | Gallery panels (29) | They are in `gallery-tokens-*` pages. Exclude gallery paths from the baseline. Move them only if the page shows the card family. |

## 7. Reference pages for the look sheet (step 3)

- Marketplace catalog and server detail (catalog-card, storefront-panel, `server-detail.component.html:145`).
- Memory curator diagnostics (native-card 9, `surface-2` 22).
- Settings providers (`add-cli-instance-modal.component.ts:225`, `credentials-tab.component.ts:134`).
- Command center (`command-center-page.component.html:182`, `command-live-panel.component.ts:92`).
- Canvas rail (exception check).

Gallery: add `gallery-card-family.component.ts` in `apps/ptah-extension-webview/src/app/ui-gallery/`,
same shape as `gallery-badge-family.component.ts`: each variant, each padding, tone with spine,
interactive, selected, disabled, header and footer slots, and the section header sizes.

## 8. Risks

- Glass mode restyles raw classes by global rules (`styles.css:3697`, `:3702`, `:3778`). When a
  panel moves to the owner, its glass look comes from `data-glass-surface`. Check glass screenshots.
- The border of `surface-2` (`--surface-border`) differs from `border-base-300`. Moving the 51
  `surface-2` tags to the default variant changes their border color.
- Dynamic classes are not counted. The real counts are higher.
- A panel inside a dialog or popover must not get `data-glass-surface="content"` when its parent is
  an overlay. Use `inset` (tile role) for nested blocks.
