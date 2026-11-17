# Context — TASK_2026_2256_159f (PR B: settings wide layout)

Epic: TASK_2026_1177_9109. Branch: `feat/settings-wide-layout`. Base: `main` at `7adadbf49`.
Before evidence: `TASK_2026_2255_53ce/gap-analysis.md` (SH-1..SH-3, LN-9) and its
`screens/metrics.json`, `screens/probe.json`.

## Scope

1. Fluid settings content (ui, chat): centered main column capped at
   `--ptah-settings-content-max-w` (96rem). Text-only form sections stay at
   `--ptah-form-section-aside-w` (15rem) + `minmax(0, 36rem)`.
2. Lanes table (chat): `collapseBelow` 900 -> 950 (measured on the table host) and a colgroup
   6/20/12/14/11/17/13/7 %.
3. Providers read states (chat): "Loading CLI agents…", "Loading CLI instance models…",
   "Loading delegated CLI models…" show inside the CLI matrix card.

Out of scope (sibling PRs): `cli-matrix-rows.ts`, `moveLane`, `preferred-agent-order-save.ts`,
the screenshot fixture (PR A); `libs/frontend/ui/src/lib/patterns/table/**` (PR C); the expanded
lane row, `lanes-table-detail.component.ts`, the lanes header, the instrument band and the Ptah
CLI shared defaults (PR D).

## Decisions

- **Card grid utility in `libs/frontend/ui`.** New `PtahCardGridDirective` (`[ptahCardGrid]`)
  with variants `default` (16.5rem), `tight` (14rem), `pair` (20rem), `wide` (27rem). Columns:
  `repeat(auto-fill, minmax(min(var(--min), 100%), 1fr))`, gap `--ptah-card-grid-gap` (.75rem).
  `min(…, 100%)` keeps one column with no overflow at 1024 px. The `wide` variant is used for the
  Providers connections grid, because its cards hold a status line and two actions.
- **`wide` input on `PtahFormSectionComponent`.** It raises the fields cap to the content cap.
  Used only where a section holds a list or a table (output-style config).
- **Panel cap removed.** The settings panel has no own max width. The main column holds the
  cap, so every page (Providers, Context Management, Decision matrix, Advanced, Search & Voice)
  gets the same behavior with no per-page change.
- **Lanes colgroup.** The wide colgroup has 8 sized cols plus a 9th `<col />` with no width for
  the expander column. The collapsed table uses its own compact colgroup (10/34/31/15/10 %).
- **Read states by projection.** `agents-routing-settings` renders one `ng-template` in two
  places: inside the matrix (`<div read-states>` -> `<ng-content select="[read-states]" />`) and
  in the `@defer` placeholder. Only one of the two is in the DOM at a time. The matrix has a
  `hostReadStates` (booleanAttribute) input. When it is set, the matrix hides its own loading
  line, so one loading message shows. The labels did not change.
- **Grids that did not change.** `advanced-settings-group` `.settings-grid` (fields capped at
  22rem, also used in the codex-agents drawer), `provider-consumer-assignments` `.consumer-grid`
  (2 or 3 columns of 1fr, already fills its container), `session-budget-settings` field grid,
  `orchestration-settings` (Context Management, field sections only), `capability-matrix-setting`
  (Decision matrix, not in a form section, already full width), `search-voice-settings` (form
  sections, no tables).

## Risks

- `lanes-table.component.ts` was over the 700-line `max-lines` warning before this change and
  grew by about 6 lines (colgroups). The rule is a warning with no baseline file.
- The worktree has a `node_modules` junction to the main checkout (for Jest). It is untracked
  and is not committed.
- PR A (lane data fix) is not open. Screenshots use real CLI detection in an isolated profile.
