# Report — UX: Reviews + Machines

Design-only task. No source file outside the task folder changed. No git action.

## 1. What I produced

| File | Content |
| --- | --- |
| [DESIGN.md](DESIGN.md) | Design-system brief: principles, color roles (dark + light, file:line), type, spacing, radius/elevation/glass roles, breakpoints, motion, component patterns 8.1–8.14, accessibility, Stitch preamble |
| [inventory-reviews.md](inventory-reviews.md) | Source inventory of `libs/frontend/review-runs-ui` (codex lane) |
| [inventory-machines.md](inventory-machines.md) | Source inventory of `libs/frontend/machines-ui` (Glm lane) |
| [reviews-ux.md](reviews-ux.md) | User jobs, IA, screens R1–R19, status map, actions, preserve list, known defects, layout options A/B |
| [machines-ux.md](machines-ux.md) | User jobs, IA, screens M1–M16, state map, actions, preserve list, 12 fixes, layout options A/B |
| [stitch/reviews/README.md](stitch/reviews/README.md) | Stitch status and the prompts to run again |
| [stitch/machines/README.md](stitch/machines/README.md) | Stitch status and the prompts to run again |

## 2. Options — decision

> **Decision (2026-11-09): the user approved option A ("Inbox" list-detail) for both Reviews
> and Machines.** Option B is rejected for both pages. The build uses `prototype/reviews-a.html`
> and `prototype/machines-a.html` as the visual reference, and `ptah-list-detail` +
> `ptah-list-row` as shared components. Open questions in section 5 are still open.

| Page | Option A (recommended) | Option B |
| --- | --- | --- |
| Reviews | "Inbox": repositories 240 px · runs 340 px · detail | Stat-card strip + full-width runs table + 480 px detail drawer |
| Machines | "Inbox": machine list 280 px · overview / session view | Fleet grid of machine tiles + approvals strip |

I recommend option A for both pages. One `ptah-list-detail` pattern then serves both pages, and
the frequent jobs (triage, approvals) keep the list and the detail visible together.

## 3. Shared components

Existing in `libs/frontend/ui` (use them):

- `ptah-surface-section`, `ptah-surface-card`, `ptah-surface-tile` — panels and tiles.
- `ptah-stat-card` — Reviews option B KPI strip.
- `ptah-field` + `fieldControl` — Settings drawer and Add/pair form.
- `ptah-native-modal` — Rerun live, Resume publication and Remove machine confirms.
- `ptah-native-drawer` — Reviews Settings drawer.
- `ptah-native-dropdown` / `ptah-native-popover` — overflow menus.
- `ptah-native-tab-group` — pairing method tabs (M5).
- `ptah-autocomplete` + `ptah-option` — SSH alias suggestions.
- `ptah-provider-mark` — session provider and lens family.
- `motionStage` directive — pane enter/leave.

New (proposed in DESIGN.md section 8; put them in `libs/frontend/ui`):

- `ptah-page-header` — title, description, status chip, actions slot.
- `ptah-list-detail` — container-query layout: 2/3 panes wide, push navigation narrow.
- `ptah-list-row` — listbox row with roving focus, `aria-current`, 40 px minimum height.
- `ptah-status-badge` — dot + label from the `--state-ink-*` map, with marker shapes.
- `ptah-state-panel` — loading / empty / error / partial / no-permission panel.
- `ptah-toolbar` — search + chips + count row.
- `ptah-meter` — gold meter, 90 % threshold (readiness, coverage).

## 4. Stitch deviations from DESIGN.md and the Angular mapping

Stitch made its own design system "Obsidian Precision" from the preamble. Its colors match our
anubis tokens. These rules do not match DESIGN.md:

| Stitch | DESIGN.md / Angular build |
| --- | --- |
| `code-xs` 11 px | 12 px floor → `font-mono text-xs` |
| Uppercase tracked column titles | Sentence case, `text-xs font-medium text-base-content/70` |
| 6 px status dots | 8 px dot in `ptah-status-badge` |
| Rows 26/32 px, `4px 8px` padding | ≥ 40 px, `px-3 py-2.5` (`ptah-list-row`) |
| Panel padding 16 px | `p-5` (`ptah-surface-section` padding default) |
| 12 px gutter | `gap-4` |
| 6 px button radius, 28 px controls | DaisyUI `btn btn-sm` and `--rounded-btn` |
| 4 px badge radius | DaisyUI `badge` |
| Inter / JetBrains Mono | System sans and the app mono stack |
| Icon rail below 1024 px | 480 / 768 / 1200 container ladder |
| `#1a1a20` / `#1f1f27` / `#272732` | `.surface-1` / `.surface-2` / `.surface-3` (styles.css:389-412), glass roles content/tile/overlay |
| Border `rgba(232,230,225,.14)` | `--surface-border` |
| Status hexes | `state-run/need/err/done/idle` utilities (tailwind.config.js:31-42) |
| Blue primary | DaisyUI `btn-primary` (light theme primary is teal; the token handles it) |
| Gold `#d4af37` | `secondary` / `--ptah-gold` only on meters and the active indicator |

## 5. Open questions — decided 2026-11-09

The user accepted every recommended answer (relayed by the session master):

| # | Decision |
| --- | --- |
| 1 | `ptah-page-header` title uses the Settings style `text-lg font-semibold tracking-tight`. |
| 2 | `ptah-stat-card` gets a size input. Default `text-2xl`; dense pages use `text-xl`. |
| 3 | Reviews minimum severity stays read-only: "Minimum severity: Minor (fixed)". No contract change. |
| 4 | The findings-load bug (`review:listFindings` never called) is a separate bug-fix PR first. |
| 5 | Reviews pagination uses a "Load more" button at the end of the list. |
| 6 | Reviews polls only while a run is `running`. No backend change. |

The original questions:

1. Page title style: Settings uses `text-lg font-semibold tracking-tight`
   (`settings.component.html:42`). The dashboard uses `text-xl font-bold`. `ptah-page-header`
   needs one style. I propose the Settings style.
2. `ptah-stat-card` value is `text-2xl`. The design audit asks for `text-xl` in dense pages.
   Change the component or add a size input?
3. Reviews minimum severity is a fixed `Minor` input. Add a config field to the contract, or keep
   it read-only "Minimum severity: Minor (fixed)"?
4. Findings never load (`review:listFindings` is not called). Fix it in the redesign PR or in a
   separate bug fix first? I propose a separate fix first.
5. Reviews pagination: `nextCursor` is ignored. "Load more" at the list end or infinite scroll?
   I propose "Load more".
6. Reviews has no push events. Is polling while a run is `running` acceptable, or will the
   backend add `review:event` pushes?

## 6. What I could not do

- **Stitch: one screen only.** The first three generations timed out. On the retry with a
  one-sentence prompt, Reviews option A (wide, dark) succeeded:
  [stitch/reviews/reviews-a-1280-dark-stitch.png](stitch/reviews/reviews-a-1280-dark-stitch.png).
  `list_screens` stays `{}`, so the PNG is the project thumbnail and no HTML export exists.
  The Machines retry timed out again, so Stitch is not used for Machines. The static
  prototypes below replace the missing screens.
- No visual review in Electron. That is out of scope for a design-only task.
- I did not verify the token file:line numbers again after the inventory lanes. They come from
  my reads of `styles.css` and `tailwind.config.js` on this branch.

## Prototypes

Static HTML in [prototype/](prototype/). They use the real tokens from
[prototype/tokens.css](prototype/tokens.css), copied with file:line comments from
`apps/ptah-extension-webview/src/styles.css` and `tailwind.config.js`, with the DaisyUI 4
variables mapped for `anubis` and `anubis-light`. Tailwind 3 and DaisyUI 4 load from a CDN
(prototype only). Open a file in a browser. Query: `?theme=dark|light&state=main|empty|error`.
The header also has a theme toggle and a Main / Empty / Error switch.

Audit against DESIGN.md (12 px floor, no uppercase, option rows ≥ 40 px, no horizontal scroll
at 400 px, state badges in their ink): all 16 main captures pass. See
[prototype/screens/audit.md](prototype/screens/audit.md). Data tables use `table-xs` (DESIGN.md
8.7) and are exempt from the 40 px row rule.

| Prototype | 1280 dark | 1280 light | 400 dark | 400 light | Empty | Error |
| --- | --- | --- | --- | --- | --- | --- |
| [reviews-a.html](prototype/reviews-a.html) | [png](prototype/screens/reviews-a-1280-dark.png) | [png](prototype/screens/reviews-a-1280-light.png) | [png](prototype/screens/reviews-a-400-dark.png) | [png](prototype/screens/reviews-a-400-light.png) | [png](prototype/screens/reviews-a-1280-dark-empty.png) | [png](prototype/screens/reviews-a-1280-dark-error.png) |
| [reviews-b.html](prototype/reviews-b.html) | [png](prototype/screens/reviews-b-1280-dark.png) | [png](prototype/screens/reviews-b-1280-light.png) | [png](prototype/screens/reviews-b-400-dark.png) | [png](prototype/screens/reviews-b-400-light.png) | [png](prototype/screens/reviews-b-1280-dark-empty.png) | [png](prototype/screens/reviews-b-1280-dark-error.png) |
| [machines-a.html](prototype/machines-a.html) | [png](prototype/screens/machines-a-1280-dark.png) | [png](prototype/screens/machines-a-1280-light.png) | [png](prototype/screens/machines-a-400-dark.png) | [png](prototype/screens/machines-a-400-light.png) | [png](prototype/screens/machines-a-1280-dark-empty.png) | [png](prototype/screens/machines-a-1280-dark-error.png) |
| [machines-b.html](prototype/machines-b.html) | [png](prototype/screens/machines-b-1280-dark.png) | [png](prototype/screens/machines-b-1280-light.png) | [png](prototype/screens/machines-b-400-dark.png) | [png](prototype/screens/machines-b-400-light.png) | [png](prototype/screens/machines-b-1280-dark-empty.png) | [png](prototype/screens/machines-b-1280-dark-error.png) |

Trade-offs:

- **Reviews A (Inbox):** list and detail stay visible together, so triage needs no
  navigation. The cost is that the detail pane is narrower at 1280 px.
- **Reviews B (Overview + drawer):** best for a quick health look (stat cards, full-width
  table). The cost is a 480 px drawer that is too narrow for the stages and findings table.
- **Machines A (Inbox):** the approval card sits next to its machine and its sessions, which
  is best for the 60 s timeout. The cost is that it shows only one machine at a time.
- **Machines B (Fleet grid):** best when there are 5 or more machines. The cost is an extra
  navigation step to sessions, and approvals are shown apart from their machine.

Review notes on the prototypes:

- The 4-machine sample has no `unpaired` machine. The err dashed-circle marker exists in
  `tokens.css` but no screenshot shows it.
- Light theme buttons are pills because `anubis-light` sets `--rounded-btn: 2rem`
  (`tailwind.config.js`). That is the real token, not a prototype error.
- The Stitch screen invents chrome, data and percentages (see `stitch/reviews/README.md`).
  Use the prototypes, not the Stitch screen, as the reference for the build.
