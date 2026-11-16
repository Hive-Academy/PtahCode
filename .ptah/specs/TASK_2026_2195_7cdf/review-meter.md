# Review: raw `<progress>` → `ptah-meter` migration (ui-meter-chat, ui-meter-memory, ui-meter-pages)

READ-ONLY review of the uncommitted diffs (`git diff`) in the three worktrees under
`.claude-worktrees/` of this task worktree. Reference for the intended per-site mapping:
`progress-vs-meter.md` in this task folder. Shared component under review:
`libs/frontend/ui/src/lib/charts/meter.component.ts` (Angular `~22.2.0`, daisyUI `^4.12.24`).

**Verdict: approve with fixes. No blocker. One major finding (compact-session `none` state), several minor notes.**

---

## Cross-worktree checks (all pass)

- **`typeof` in templates is valid for this Angular version.** The repo pins
  `@angular/compiler` `~22.2.0`. Verified in the installed compiler:
  the lexer keyword list includes `typeof` (`compiler.mjs:14588`), `parsePrefix()`
  consumes it into a `TypeofExpression` (`compiler.mjs:15771-15775`), AOT conversion
  emits `typeofExpr(...)` (`compiler.mjs:22012`), and the template type-checker emits
  `typeof ...` inside type-check blocks (`compiler.mjs:29216`). So
  `db-health-panel.component.ts:275` and `:281` compile, type-check and run. Not a finding.
- **`PtahMeterComponent` imported everywhere it is used** (from `@ptah-extension/ui`) and
  added to each component's `imports` array, in all 8 changed components. The export chain
  exists: `charts/index.ts:2` → `src/index.ts:47` (`export * from './lib/charts'`).
- **No settings files touched.** `system-prompt-drawer.component.ts`, `local-stt-panel.component.ts`,
  `local-tts-panel.component.ts` and `declarative-dashboard` are untouched in all three
  worktrees (verified by `git status` and a `<progress` grep). Matches the plan: those sites
  are out of this batch (dashboard needs the `native-progress-track` variant).
- **`role="progressbar"` preserved via `barRole="progressbar"`** at every determinate site
  (the meter default is `meter`; `meter.component.ts:79`). Indeterminate bars force
  `progressbar` and omit `aria-valuenow` because `ranged()` is false — same semantics as a
  native `<progress>` (`meter.component.ts:32`, `:78-81`).
- **ids and `data-testid` kept.** `turn-summary-tests-progress` moved onto the host
  (`turn-summary-tests.component.ts:66`), `embedder-progress` onto the host
  (`db-health-panel.component.ts:278`) — both match the meter's documented test hook
  ("put `data-testid` on the host", `meter.component.ts:25-26`). `task-row-rollup`,
  `task-row-rollup-glyph`, `review-detail-lens-count` untouched. No raw bar carried an `id`;
  none lost.
- **Decorative bar stays decorative.** `task-list.component.ts:510-521` keeps
  `aria-hidden="true"`, now on the meter host; it hides the whole meter subtree (inner
  progressbar plus sr-only label) from AT, and the button's sr-only name carries the counts,
  exactly as the in-template comment (lines 484-489) documents.
- **Layout kept.** Fixed widths stay on the host (`w-8`, `w-16`); `min-w-0 flex-1` kept where
  it was; `block` added on hosts in block/flow contexts (db-health `:268`, banner `:97`/`:109`,
  gateway `:192`, review-run `:43`). Hosts inside flex parents (compact-session cell span,
  task-list rollup button, turn-summary row, inspector row) are flex items, so the custom
  element's default `display: inline` is harmless; the meter's inner track is a block `div`
  that fills the host in every case.
- **Tone and size mapping matches the plan** (`progress-vs-meter.md`): `progress-success`→`ok`,
  `progress-warning`→`warn`, `progress-primary`→`primary`, inspector default→`neutral` (plan row 12);
  `sm`=`h-1.5`, `md`=`h-2`, `xs`=`h-1` (`meter.component.ts:5`). Sites with an explicit
  `h-*` class map exactly (turn-summary, inspector, banner, db-health, review-run `h-1`→`xs`,
  task-list). See minor notes for the two plan-approved height deltas at sites that relied on
  the daisyUI default height.
- **`hideLabel`/`showValue` used correctly.** Every site passes `[hideLabel]="true"`
  `[showValue]="false"` with adjacent visible text. The label stays in the DOM and becomes the
  bar's `aria-label` (`meter.component.ts:31-32`), the value text stays sr-only in the DOM,
  and the row collapses to `sr-only` so no visual row is added (`meter.component.ts:118-120`).
  No call site regressed; see the duplication notes below.
- **Specs test the same behavior.**
  - compact-session spec: `progress[value]='2'` → `ptah-meter [role="progressbar"]` `aria-valuenow='2'`
    (spec `:1312-1317`); unknown states assert no `aria-valuenow` (`:1269-1274`, `:1291-1296`).
  - inspector spec: `progress[value]='3'` → `aria-valuenow='3'`, plus a new `aria-valuetext`
    `'3 of 7 tasks complete'` assertion consistent with `valueText` (spec `:151-158`);
    `'3/7 tasks'` textContent check unchanged.
  - review-run spec: `max='2'` → `aria-valuemax='2'` + `aria-valuenow='1'` + `aria-label`
    (spec `:93-99`); absent-meter case updated in lockstep (`:120-124`).
  - db-health spec: `'42'` `aria-valuenow` (spec `:159-166`) and a new indeterminate test
    (`:170-183`).
  - No stale `querySelector('progress')` / `progress-*` queries remain in any spec of the
    touched libs (checked chat-ui, chat, memory-curator-ui, messaging-gateway-ui, review-runs-ui,
    tasks-ui). `turn-summary-tests`, `memory-indexing-banner` and `messaging-gateway-tab` have
    no specs asserting the bar, so nothing went stale.

---

## ui-meter-chat

Changed: `compact-session-activity.component.{ts,spec.ts}`, `turn-summary-tests.component.ts`,
`inspector-task-section.component.{ts,spec.ts}`.

### Major

- **compact-session-activity.component.ts:843-857** — the `@else` branch renders an
  indeterminate progressbar for every non-`known` todo state, including `kind: 'none'`.
  `compact-session-metrics.ts:69` maps `total <= 0` to `{ kind: 'none' }`: the session
  *reported* zero todos, so the total is known, not unknown. The old markup rendered only
  "—" in this state. Now a session with no todos gets an animated indeterminate bar plus
  sr-only "Todos completed / In progress" and a `progressbar` role — a false
  "something is in progress" signal. This violates the acceptance rule
  "indeterminate only when the total is unknown". The spec codified it
  (compact-session-activity.component.spec.ts:1272-1276 asserts no `aria-valuenow` in the
  `kind: 'none'` test at `:1265`). Fix: render the meter only for `todo === null ||
  todo?.kind === 'unknown'`, and no meter for `'none'` (the "—" and cell title already carry it).

### Minor

- **compact-session-activity.component.ts:832-842** — accessible name changed from
  `"Todos"` (old `aria-label`) to `"Todos completed"` (new `label`). Plan row 15 prescribes
  `"Todos completed"`, so this is an approved change, recorded here for the diff reader.
- **compact-session-activity.component.ts:837** — size `xs` (`h-1`, 0.25rem) replaces the raw
  bar's daisyUI default height (0.5rem). Plan row 15 allows `xs` or `sm`; approved visual
  delta, thinner bar.
- **compact-session-activity.component.ts:845-856** — even for the genuinely unknown state
  (`null`/`'unknown'`), the meter is new AT content where the old UI had none; the cell
  (`aria-label="Todos"`, title "Todos unknown") already names the state. The extra
  "Todos completed / In progress / progressbar" announcement is deliberate and spec-tested,
  but noisier than before. Worth a conscious keep/skip decision when fixing the major above.
- **turn-summary-tests.component.ts:58-70** — name reorganization: old bar name was
  `passedShareLabel()` ("2 of 3 tests passed"); new name is `"Tests passed"` with
  `valueText` carrying the share as `aria-valuetext`. Plan row 14 prescribes exactly this;
  no information lost. Edge: with `summary.total === 0` the old native progress fell back to
  `max=1` (empty bar); the new meter marks the range invalid → no `progressbar` role and
  sr-only "Unavailable". Edge-state behavior change, acceptable.
- **turn-summary-tests.component.ts:216-419 and inspector-task-section.component.ts/spec** —
  most of the diff is prettier-only reindentation of unrelated template and test code
  (callout permission tests, `groupTaskDocuments`, `statusTone`, document dropdown). Verified
  the click/detectChanges sequences and the reformatted blocks are operation-for-operation
  identical; no behavior change found. The reformat inflates the diff and buries the actual
  change; prefer a separate formatting commit next time.

No blockers in this worktree.

---

## ui-meter-memory

Changed: `db-health-panel.component.{ts,spec.ts}`, `memory-indexing-banner.component.ts`.

### Minor

- **db-health-panel.component.ts:267-286** — "In progress" is announced twice: the
  indeterminate meter renders sr-only "In progress" as its value text
  (`meter.component.ts:31`, `valueText() ?? 'In progress'`), and the adjacent span renders a
  visible "In progress" (`:282-285`). Consider a distinct `valueText` (for example
  "Percent unavailable") or accept the duplication. Note: the conditional
  `[indeterminate]="typeof embedderStatus()?.progress !== 'number'"` goes beyond plan row 21
  (which said determinate) but is an improvement — the old code coerced an unknown percent to
  a misleading 0% and an empty bar — and the new spec test (`:170-183`) covers it. `typeof`
  usage is valid, see cross-worktree checks.
- **memory-indexing-banner.component.ts:109-121** — the indeterminate branch adds sr-only
  "In progress" plus the "Workspace indexing progress" label while the heading above already
  announces "Indexing workspace…". Plan row 20 accepts this ("heading already announces
  status"); recorded as AT-verbosity only. The determinate/indeterminate split mirrors the old
  `totalKnown` branches exactly, and the old bars were unnamed, so the added label is an
  a11y improvement.
- **db-health-panel.component.ts:244-250** — prettier-only reflow of the badge tone ternary;
  no behavior change.

Verified: size `md` matches the old `h-2`; tone `warn` matches `progress-warning`;
`block min-w-0 flex-1` keeps the old `flex-1` stretch; `embedder-progress` testid kept on the
host; `embedderProgressPercent()` always yields a number, so the required `value` input is
never undefined. No blockers, no majors in this worktree.

---

## ui-meter-pages

Changed: `messaging-gateway-tab.component.ts`, `review-run-detail.component.{ts,spec.ts}`,
`task-list.component.ts`.

### Minor

- **review-run-detail.component.ts:43** — the static `aria-label="Completed lenses"` on the
  `<ptah-meter>` host is dead markup. The host element has no ARIA role, so AT ignore the
  attribute; the bar's accessible name already comes from the `label` input rendered as
  `aria-label` on the inner track (spec asserts the inner bar, and passes). The meter's own
  doc comment (`meter.component.ts:22-23`) makes this exact argument for `role`. Drop the
  host attribute to avoid a copy-paste trap.
- **messaging-gateway-tab.component.ts:192-203** — the old raw bar had no height class
  (daisyUI default 0.5rem); the new `sm` track is 0.375rem. Plan row 17 prescribes `sm`, so
  this is an approved visual delta. The added `label="Whisper model download"` fixes a
  previously unnamed progressbar (improvement). `v.percent` is typed `number`
  (`gateway-state.service.ts:36`), so the meter is always determinate and the required
  `value` input is never undefined. No spec asserts the bar; nothing stale.

Verified: review-run size `xs` matches the old `h-1`, `mt-2 block w-full` keeps layout;
task-list `w-16` fixed width kept, `sm`=`h-1.5` and `primary` match the old classes, and the
`aria-hidden` decorative treatment is preserved (see cross-worktree checks). No blockers, no
majors in this worktree.

---

## Required follow-up

1. (Major, ui-meter-chat) Split the compact-session `@else`: indeterminate meter only for
   `null`/`'unknown'`, nothing for `'none'`; adjust the two spec assertions that pin the
   current behavior at `compact-session-activity.component.spec.ts:1269-1274` and
   `:1291-1296`.
2. (Optional minors) Remove the dead host `aria-label` in review-run-detail; decide on the
   "In progress" duplication in db-health; keep or drop the unknown-state meter announcement
   in compact-session.
