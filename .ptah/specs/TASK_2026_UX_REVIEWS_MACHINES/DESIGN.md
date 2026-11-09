# Ptah design system brief (DESIGN.md)

Status: draft for user approval. Task: TASK_2026_UX_REVIEWS_MACHINES.

This brief is the one source of design rules for Stitch screens and for the Angular build of
the Reviews page (`libs/frontend/review-runs-ui`) and the Machines page (`libs/frontend/machines-ui`).
It reuses the rules of `TASK_2026_DASHBOARD_GLASS/design-audit.md` ("Glass language
inventory" and "Redesign spec"). It does not add a second spacing scale, type scale or
breakpoint ladder.

All `styles.css:N` references are `apps/ptah-extension-webview/src/styles.css` in this worktree.
All `tailwind:N` references are `apps/ptah-extension-webview/tailwind.config.js`.

---

## 1. Principles

1. **Calm, dense, readable.** The tone is the chat and Settings pages: quiet surfaces, one
   accent, small type with a 12 px floor, and strong alignment.
2. **One glass object per page.** A page is a shell with sections. Sections hold tiles. Do not
   nest more than three levels (page plane → section `content` → `tile`).
3. **State ink carries meaning, accent carries identity.** Status uses `--state-ink-*`. Provider
   brand colors are decorative and never the only carrier of meaning (always add text or icon).
4. **Every list has five states.** Loaded, empty, loading, error, partial. Each uses the shared
   state patterns in section 9.
5. **Electron first.** Design at 360, 768 and 1200 px container widths.

---

## 2. Color roles

The host sets `data-theme` (`anubis` dark default, `anubis-light`) and `data-theme-mode`
(`dark` / `light`). Glass is opt-in with `data-glass="on"` on `<html>` (`styles.css:2809-2812`).
Use the role names, not the hex values, in code.

| Role | Tailwind / token | Dark `anubis` | Light `anubis-light` | Source |
| --- | --- | --- | --- | --- |
| Page plane | `bg-surface-0` / `--surface-0` (= `--b1`) | `#131317` | `oklch(97.8% .004 56)` cream | `styles.css:159`, `tailwind:109,187` |
| Section plane | `.surface-1` / `--surface-1` | mix of `#1a1a20` + `#131317` | mix of base-200 + base-100 | `styles.css:160,395-399` |
| Raised plane | `.surface-2` / `--surface-2` (= `--b2`) | `#1a1a20` | `oklch(94% .007 61)` | `styles.css:161,401-405` |
| Overlay plane | `.surface-3` / `--surface-3` | near `#242430` | near base-300 | `styles.css:162,407-412` |
| Hairline | `border-surface-border` / `--surface-border` (bc 14%) | — | — | `styles.css:163` |
| Strong line, meter track | `--surface-border-strong` (bc 22%) | — | — | `styles.css:164` |
| Primary text | `text-base-content` | `#e8e6e1` | `oklch(23.6% .066 313)` | `tailwind:112,190` |
| Secondary text | `text-base-content-muted` (`--bcm`) — never `text-base-content/60` | 6.06:1 on base-100 | measured | `tailwind:31,117,195` |
| Primary action | `btn-primary` (`--p`) | `#2563eb` blue | `oklch(85% .138 181)` teal | `tailwind:89,161` |
| Brand accent | `--ptah-gold` (`text-secondary` for headings only) | `#d4af37` | `oklch(58% .132 75)` | `styles.css:59-61,131-135` |
| Link text | `--ptah-link` | gold | gold-strong | `styles.css:141-146` |
| Status: running / active | `--state-ink-run`, `text-state-run` | `#3b82f6` | `#2a56c6` | `tailwind:118,196` |
| Status: needs attention | `--state-ink-need`, `text-state-need` | `#f97316` | `#8f5200` | `tailwind:119,197` |
| Status: error / blocked | `--state-ink-err`, `text-state-err` | `#ef4444` | `#b4232a` | `tailwind:120,198` |
| Status: done / healthy | `--state-ink-done`, `text-state-done` | `#16a34a` | `#13713a` | `tailwind:121,199` |
| Status: idle / offline | `--state-ink-idle` | `#9ca3af` | `#6b6570` | `tailwind:122,200` |
| Accent ink (text) | `--ptah-accent-ink` | — | — | `styles.css:327-357` |

Rules:

- Warning is orange (`#f97316`), deliberately not gold (`tailwind:135-139`). Never use gold for
  a warning.
- Categorical chart series use the validated palette of the design audit: `#9560d8`,
  `#29a6ab`, `#c67a2e`, `#5a7fd6`, `#c25c8c`, then "Other". Never `i % length`.
- Provider identity colors come from `provider-accent.ts` (design audit "Provider accents") and
  `ptah-provider-mark`. They are decoration only.

---

## 3. Typography

System UI sans stack (the webview sets no custom font). Monospace (`font-mono`) only for ids,
paths, hashes, commands and code. 12 px floor: no `text-[9px]`, `text-[10px]`, `text-[11px]`.

| Role | Classes |
| --- | --- |
| Page title | `text-lg font-semibold tracking-tight text-base-content` (Settings, `settings.component.html:42`) |
| Section heading | `text-sm font-semibold` — the only section heading style |
| Sub-section heading | `text-xs font-semibold text-base-content-muted` (no uppercase, no `tracking-wide`) |
| Section sublabel / meta | `text-xs text-base-content-muted` |
| Card / row title | `text-sm font-semibold` (list rows: `text-sm font-medium`) |
| Body | `text-sm` |
| Meta, chips, footnotes, table cells | `text-xs` |
| KPI value | `text-xl font-semibold tabular-nums` (`ptah-stat-card` uses `text-2xl`; see open question in report.md) |
| Numbers, durations, counts | always `tabular-nums` |
| Code, ids, paths | `font-mono text-xs` |

---

## 4. Spacing scale (from the design audit, exact)

| Level | Class | px |
| --- | --- | --- |
| Page padding, narrow | `p-4` | 16 |
| Page padding, from 768 px | `p-6` | 24 |
| Gap between sections, narrow | `space-y-6` | 24 |
| Gap between sections, from 768 px | `space-y-8` | 32 |
| Section padding | `p-5` | 20 |
| Section internal gap | `gap-4` | 16 |
| Section header to body | `mb-4` | 16 |
| Card grid gap | `gap-4` | 16 |
| Card / tile padding | `p-4` | 16 |
| Card header to body | `mb-3` | 12 |
| List row padding | `px-3 py-2.5` (row height ≥ 40 px) | 12 / 10 |
| Inline gap (icon + label, chips) | `gap-2` | 8 |
| Meter label to bar / bar to note | `mb-2` / `mt-2` | 8 |

Rules: sections get their gap from the page `space-y-*` only. Inside a section use one
`flex flex-col gap-4`. Do not stack margins. Do not use `mt-0.5`, `gap-0.5`, `gap-1.5`.

---

## 5. Radius and elevation

| Item | Value | Source |
| --- | --- | --- |
| Section shell | `rounded-2xl` | design audit "Section shell" |
| Card / tile | `rounded-xl` | design audit "Charts" |
| Glass outer radius | `--glass-radius` 22 px | `styles.css:2840` |
| Glass inner radius (tile, plate, dropdown) | `--glass-radius-inner` 14 px | `styles.css:2841` |
| Small radius (chip, input) | `--glass-radius-sm` 10 px | `styles.css:2842` |
| Buttons | `--rounded-btn` 0.375rem dark / 2rem light | `tailwind:147,221` |
| Badges | `--rounded-badge` 0.25rem dark / 1rem light | `tailwind:148,222` |
| Flat | `.elev-0` | `styles.css:414` |
| Resting | `.elev-1` (`--elev-shadow`) | `styles.css:415` |
| Raised (popover, drawer) | `.elev-3` (`--elev-shadow-raised`) | `styles.css:416` |

### Glass surface roles

Allowed `data-glass-surface` values only: `chrome`, `bar`, `overlay`, `content`, `tile`,
`plate` (`styles.css:2814-2817`).

| Use | Role | Notes |
| --- | --- | --- |
| Page header bar, toolbar that sticks | `bar` | `styles.css:3184-3191` |
| Section shell | none — `surface-1` maps to the reading plane under glass | `styles.css:3694` |
| Nested card, list row group, detail block | `tile` | `styles.css:3208` |
| Menu, modal, drawer, popover | `overlay` | `styles.css:3126,3148` |
| Text on the scene (page title) | `plate` | `styles.css:3193-3198` |

---

## 6. Breakpoints (container queries, one ladder)

The route container owns the scroll. Use `@container` on the page root (`@container/page`).

| Name | Query | Typical host | Layout rule |
| --- | --- | --- | --- |
| Narrow | base | Electron side panel ~360 px | One column. List-detail becomes list → detail push view with a back button. Toolbars wrap; secondary actions go in an overflow menu. |
| Split | `@container (min-width: 480px)` | — | Two-column tile grids. Filters inline. |
| Medium | `@container (min-width: 768px)` | half window | Page padding `p-6`. List-detail side by side: list 320 px fixed, detail fluid. |
| Wide | `@container (min-width: 1200px)` | full window | Content max width `max-w-screen-2xl mx-auto`. Detail can show a right meta rail (280 px). |

---

## 7. Motion

- Route and panel enter: `.ptah-motion-enter` with `data-motion-style` (`styles.css:865-1025`).
- Durations: `--ptah-motion-in` 320 ms, `--ptah-motion-out` 180 ms, `--ptah-motion-switch` 380 ms,
  stagger `--ptah-stagger-step` 36 ms (`styles.css:41-46`).
- Live status: a 2 s pulse on the status dot only, never on text. Honor reduced motion
  (`styles.css:2928-3011`).

---

## 8. Component patterns

Each pattern names the shared component in `libs/frontend/ui` (existing) or marks it **NEW**.

### 8.1 Page shell

```html
<div class="@container/page h-full overflow-y-auto bg-surface-0">
  <div class="mx-auto w-full max-w-screen-2xl space-y-6 p-4 @[768px]/page:space-y-8 @[768px]/page:p-6">
    <!-- page header, then sections -->
  </div>
</div>
```

### 8.2 Page header — **NEW** `ptah-page-header`

Back button (`btn btn-sm btn-ghost btn-square`, lucide `ArrowLeft` `h-4 w-4`, `aria-label`), title
(section 3), optional one-line description `text-xs text-base-content-muted`, right slot for
the primary action and a refresh icon button. Bottom rule `border-b border-surface-border pb-3`.
At narrow width the description wraps under the title and actions stay right-aligned
(icon-only with `aria-label` and tooltip).

### 8.3 Section — existing `ptah-surface-section`

```html
<section class="surface-1 flex flex-col gap-4 rounded-2xl p-5" aria-labelledby="h-id">
  <header class="flex flex-wrap items-baseline justify-between gap-3">
    <h2 id="h-id" class="text-sm font-semibold">Title</h2>
    <p class="text-xs text-base-content-muted">sublabel</p>
  </header>
  ...
</section>
```

### 8.4 Card / tile — existing `ptah-surface-card`, `ptah-surface-tile`, `ptah-stat-card`

`rounded-xl border border-surface-border bg-surface-1 p-4` with `data-glass-surface="tile"`.
Selected tile: `border-primary/60 bg-primary/5` plus `aria-selected` or `aria-current`. Hover:
`hover:bg-base-300/40` (maps to `--glass-hover` under glass, `styles.css:3689-3690`).

### 8.5 List row — **NEW** `ptah-list-row`

Height ≥ 40 px, `px-3 py-2.5`, grid `[auto_1fr_auto]`: leading status dot or provider mark
(16 px), title + one meta line (`text-xs text-base-content-muted`, truncate with `title`), and a
trailing slot (badge, time, chevron). Rows are `role="option"` inside a `listbox`
(`@angular/aria` listbox) or links. Divider `divide-y divide-surface-border`.

### 8.6 List-detail — **NEW** `ptah-list-detail`

- From 768 px: two panes. List pane `w-80 shrink-0 border-r border-surface-border`, own scroll,
  sticky filter bar at the top. Detail pane fluid, own scroll.
- Narrow: one pane. Selection pushes the detail. Detail header shows a back button
  ("All runs" / "All machines"). Keep the selected id in the route or store so back restores
  the scroll position.
- No selection (wide): detail shows an empty state ("Select a run to see its findings").

### 8.7 Data table

DaisyUI `table table-xs` inside a tile, `text-xs`, header `text-base-content-muted` (already
from `styles.css:418-420`), numeric columns right-aligned `tabular-nums`. Under 768 px a table
turns into stacked list rows (section 8.5). No horizontal scroll for the primary columns.

### 8.8 Form field / row — existing `ptah-field` + `fieldControl` directive

Label `text-xs font-medium`, control `input input-sm input-bordered w-full` / `select select-sm`,
help `text-xs text-base-content-muted`, error `text-xs text-state-err` with `aria-describedby`.
Settings-style row: label + help on the left, control on the right from 480 px, stacked below.

### 8.9 Button hierarchy

| Level | Classes | Rule |
| --- | --- | --- |
| Primary | `btn btn-primary btn-sm` | One per view (for example "Start review", "Pair machine") |
| Secondary | `btn btn-outline btn-sm` or `btn btn-sm` (neutral) | Other actions |
| Tertiary / toolbar | `btn btn-ghost btn-sm` | Inline and toolbar actions |
| Icon only | `btn btn-ghost btn-sm btn-square` + `aria-label` + tooltip | Refresh, copy, overflow |
| Destructive | `btn btn-sm btn-outline btn-error`, confirm in `ptah-native-modal` | Delete, unpair, cancel run |

Busy buttons keep focus and use `aria-disabled="true"` plus a `loading loading-spinner loading-xs`.

### 8.10 Badge / chip — **NEW** `ptah-status-badge`

`badge badge-sm gap-1.5` with an 8 px dot in the state ink and a text label. Status → ink:
running → `run`, queued/pending → `idle`, needs review/warning → `need`, failed/offline →
`err`, completed/online → `done`. Filter chips: `btn btn-xs rounded-full` with
`aria-pressed`. Plan or tier tag: `badge badge-ghost badge-xs`.

### 8.11 Meter — existing pattern from the inspector, extract **NEW** `ptah-meter`

Track `h-1.5 overflow-hidden rounded-full bg-[var(--surface-border-strong)]`, fill in
`--ptah-gold` by default, `--state-ink-need` from 75 %, `--state-ink-err` from 90 % (one
threshold, design audit D2). Label row `text-xs font-medium` + value `text-xs font-semibold
tabular-nums`. `role="meter"` with `aria-valuenow/min/max`.

### 8.12 Empty / loading / error / no-permission / partial — **NEW** `ptah-state-panel`

One component, five variants, centered in its container, `py-10 px-4 text-center`, max width
`max-w-sm mx-auto`:

| Variant | Icon (lucide, 24 px, muted) | Title `text-sm font-semibold` | Body `text-xs text-base-content-muted` | Action |
| --- | --- | --- | --- | --- |
| empty | feature icon | "No reviews yet" | one sentence on what to do | primary button |
| loading | — | — | skeleton rows (`skeleton h-10 rounded-xl`) × 3–5, `aria-busy="true"` | — |
| error | `AlertTriangle` in `text-state-err` | "Could not load …" | the error summary, never a raw stack or secret | "Try again" secondary |
| no-permission | `Lock` | "Pro feature" or "Not available on this host" | why | "Upgrade" / "Learn more" |
| partial | inline `alert alert-warning` bar above the list | — | "Some items could not load. 3 of 5 shown." | "Retry" ghost |

Live regions: status text uses `role="status"`; errors use `role="alert"`.

### 8.13 Toolbar / filter bar — **NEW** `ptah-toolbar`

`flex flex-wrap items-center gap-2`, sticky inside the list pane with `data-glass-surface="bar"`.
Order: search (`input input-sm` with `Search` icon), filter chips, sort `select select-sm`,
then a right-aligned count `text-xs text-base-content-muted tabular-nums`.

### 8.14 Overlays — existing

Modal `ptah-native-modal`, drawer `ptah-native-drawer`, menu `ptah-native-dropdown`,
popover `ptah-native-popover`, tabs `ptah-native-tab-group`, provider icon `ptah-provider-mark`.
All overlays use `data-glass-surface="overlay"`.

---

## 9. Accessibility floor

- Text contrast 4.5:1, UI contrast 3:1 (tokens above are measured).
- Focus ring: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-base-content` (Settings).
- Hit target ≥ 28 px (`btn-sm`), ≥ 24 px only for dense icon buttons (`btn-xs`).
- Status never by color alone: dot + text label.
- Keyboard: list uses arrow keys (listbox), Enter opens detail, Esc closes detail on narrow.

---

## 10. Stitch prompt preamble

Use this text at the start of every Stitch prompt:

> Desktop app UI (Electron), dark theme. Background #131317, section panels #1a1a20 with a
> 1 px hairline border rgba(232,230,225,0.14) and 16 px radius, nested tiles #1f1f27 with 12 px
> radius. Text #e8e6e1, secondary text #a39f99. Primary button blue #2563eb with white text,
> small (28 px high). Brand accent gold #d4af37 used sparingly (meters, the active nav
> marker). Status colors: running #3b82f6, attention #f97316, error #ef4444, done #16a34a,
> idle #9ca3af, always shown as a dot plus a text label. System UI sans font, 14 px body, 12 px
> meta text (never smaller), 18 px semibold page title, 14 px semibold section headings,
> no uppercase eyebrows. Spacing on a 4 px grid: 16 px page padding, 20 px section padding,
> 16 px gaps. Calm, dense, professional, like Linear or VS Code. No gradients, no hero images,
> no marketing copy.

Light variant: background cream `#f8f6f2`, panels `#eeebe6`, text `#2d1e36`, secondary text
`#7a5566`, primary teal `#5ee0cf` with dark text `#0e4a47`, gold `#a87b16`, status inks
run `#2a56c6`, attention `#8f5200`, error `#b4232a`, done `#13713a`, idle `#6b6570`.
