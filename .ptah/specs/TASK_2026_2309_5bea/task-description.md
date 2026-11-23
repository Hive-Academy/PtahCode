# Requirements - TASK_2026_2309_5bea

## Context

The session inspector sidebar of the Electron app (`ptah-session-inspector`,
`libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.html:78-219`)
shows a SESSION stats grid (`ptah-inspector-session-stats`,
`libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts:53-358`),
an AGENTS table (`ptah-inspector-agents-section`,
`.../session-inspector/inspector-agents-section.component.ts:101-239`) and PLAN LIMITS. The
inspector is mounted three times by `CanvasInspectorDockComponent`
(`libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts:125` rail, `:193`
expanded dock, `:239` compact sheet); the dock is mounted by `canvas-rail-board.component.ts:285`,
which `orchestra-canvas.component.ts:98` mounts. The only other direct selector use is the test
host `session-inspector.component.spec.ts:66`.

The SESSION grid and the Orchestrator row both read the session stats snapshot
(`SessionStatsEntry`, `libs/shared/src/lib/types/rpc/rpc-session.types.ts:386-508`; Orchestrator
card `libs/frontend/chat/src/lib/services/session-inspector/session-inspector.store.ts:139-155`),
so the top grid and the first table row show the same snapshot-scoped figures (screenshot: 25.9M,
$17.54). The table's Total row (56.0M, `≥ ~$30.58`) is a UI row sum, `agentListTotal`
(`.../session-inspector/inspector-agent-list.ts:105-129`), which adds every finite row figure
without checking overlap.

The user asked for the sidebar to show totals for all agents and lanes at the top, to stop
repeating the main agent's context, model, tokens and other values in the first section, to fix
the agents section, and to use the shared stat, number, chart and bar components so the details
are organised and clean. Observed defects in the screenshot: Time shows "—" for a 24-turn session
(`durationMsOf`, `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-view.ts:149-152`,
normalises an absent, null or zero `durationMs` to unavailable; the live owner emits null for a
resumed owner with an unknown transcript prefix, `session-stats-owner.service.ts:527-545,1123-1126`,
and historical reader results omit it, `session-usage-aggregator.ts:298-316,447-472`; the
screenshot alone does not establish which cause applies); the caption
`{{ runningCount() }} running · {{ list().length }} · {{ laneRuns().length }} CLI runs` has an
unlabelled count (`inspector-agents-section.component.ts:105`); the Total cost cell wraps in the
3rem column (`AGENT_ROW_COLUMNS`, `inspector-agent-row.component.ts:15-16`); the table is plain
text.

KEY FACT (correctness): the snapshot's numeric usage fields already include Claude SDK subagent
usage (`session-stats-reader.service.ts:325-344,368-383` load parent and owned subagent ledgers;
`session-stats-owner.service.ts:1074-1111,1254-1261,1422-1455` fold SDK run and result-model
usage into the live snapshot). CLI lane usage is not in those fields (`session-stats-view.ts:154-156`,
"not in session totals"; `cliAgents` is separate metadata, `session-rpc.handlers.ts:1755-1760`).
`agentListTotal` sums the Orchestrator row (snapshot scope: orchestrator + SDK subagents), the
SDK subagent rows again, and the CLI lanes, so a reported subagent contribution can be counted
twice. The source establishes this failure mode; it does not establish the screenshot's corrected
figure, which this document does not state.

## Classification

- Type: FEATURE — a redesign of an existing UI surface with new presentation rules (task
  contract type set; `context.md` records FEATURE).
- Estimate: M — about four components (session grid, agents section, agent row, Orchestrator
  entry) plus view-model helpers and their specs; grows to L if the architect finds that the
  aggregation or the orchestrator-only figure needs a backend data-contract change (R2, R4).
- Priority: not defined here.

## Scope

In scope:

- The SESSION stats section and the AGENTS section of `ptah-session-inspector` in all three
  mounts (rail, expanded dock, compact sheet).
- The Orchestrator entry and the agent rows, their caption and their total.
- View-model helpers they use (`inspector-agent-list.ts`, `inspector-agent-usage.ts`,
  `lane-stats.adapters.ts`, `session-stats-view.ts`), kept backward compatible for other
  consumers.
- Use of the shared UI components in `libs/frontend/ui/src/lib/{charts,surfaces,patterns,time}`.
- Specs for changed components and helpers.
- A backend data-contract change only if the architect shows a requirement below cannot be met
  from renderer data (escalation to the orchestrator, not an assumption).

Out of scope:

- `ptah-session-stats-summary` behaviour (command center
  `libs/frontend/command-center/src/lib/components/command-center-page.component.html:298`,
  onboarding `libs/frontend/onboarding/src/lib/shared/builder-session-section.component.ts:43`)
  — not part of the sidebar; shared helpers stay backward compatible.
- `ptah-agent-lane-stats` behaviour (`subagent-lane.component.ts:78`) — lane thread view, not
  the sidebar.
- `apps/ptah-tui`, `apps/ptah-extension-vscode` — Electron first (CLAUDE.md).
- PLAN LIMITS tile redesign — kept as is; the AGENTS caption may stop depending on it.
- Header, TASK, GIT and linked sessions sections — untouched (see parity inventory).
- Deriving the duration of a resumed session from transcript timestamps — see Follow-ups.

## Requirements

### 1. Whole-session totals in the session section

Requirement: a user reading the sidebar sees, in the top section, token and cost totals for the
whole session (orchestrator, SDK subagents and CLI lanes owned by the session), each with an
accuracy state that says whether it is exact, estimated, a lower bound or unknown.

Aggregation rules (the outcome; the arithmetic is the architect's):

- Units: only comparable quantities are added — tokens with tokens of the same counting basis,
  cost in one currency. A source whose usage is in a different unit or basis is not added; it
  makes the total a lower bound.
- Ownership: only sources owned by the inspected session contribute (CLI runs scoped to that
  session, SDK subagents of that session).
- One contribution per source: each SDK subagent and each CLI lane contributes once.
- Normalized contribution: each source in scope yields, per metric, either a usable amount
  (a number, a genuine 0 included) with a flag for estimate, or "missing". The SDK cost
  contribution is `totalCost` when it is not null, otherwise `knownCost` when present (partially
  priced), otherwise missing (`session-usage-aggregator.ts:290-305`). A source whose usage is in
  a different unit or basis counts as missing for that metric. A snapshot whose coverage is
  partial (R2.3) counts as missing part of its usage.

Precedence table, applied separately to the token total and to the cost total, over the
normalized contributions of every source in scope. The first matching row sets the value; rows
3 and 4 then add markers (the glyphs are design's choice; `≥` and `~` here are notation):

| # | Condition | Shown value | State |
| --- | --- | --- | --- |
| 1 | No source has a usable contribution for the metric | none | unknown (never 0, never a lower bound) |
| 2 | At least one usable contribution | sum of the usable amounts, known zeros included | set by rows 3-5 |
| 3 | Any source in scope is missing the metric, the SDK cost is partially priced (`totalCost` null, `knownCost` present), or snapshot coverage is partial | the row-2 sum | lower bound (`≥`) |
| 4 | Any included amount is an estimate (provisional snapshot, estimated lane cost) | the row-2 sum | estimate (`~`); with row 3, lower-bound estimate (`≥ ~`) |
| 5 | Neither row 3 nor row 4 applies: complete comparable coverage, no estimate | the row-2 sum, a 0 included | exact (no marker) |

An exact 0 therefore needs the same complete coverage as any other exact value; a 0 summed with
a missing source is `≥ 0`.

Fixtures (each has one expected value and one state per metric; amounts are illustrative):

| ID | Sources in scope | Expected tokens | Expected cost |
| --- | --- | --- | --- |
| F1 | SDK only: final snapshot, 1,000 tokens, `totalCost` $0.50, coverage complete | 1,000 exact | $0.50 exact |
| F2 | SDK only, partial pricing: final, 1,000 tokens, `totalCost` null, `knownCost` $0.30 | 1,000 exact | ≥ $0.30 |
| F3 | F1 plus one CLI lane: 200 tokens, $0.10, both reported | 1,200 exact | $0.60 exact |
| F4 | F1 plus one CLI lane: 200 tokens, no cost reported | 1,200 exact | ≥ $0.50 |
| F5 | SDK provisional during a live turn: 800 tokens, $0.40, no lanes | ~800 | ~$0.40 |
| F6 | F2 plus one CLI lane with estimated cost $0.10 and 200 tokens | 1,200 exact | ≥ ~$0.40 |
| F7 | All sources report 0: final snapshot 0 tokens, $0; one CLI lane 0 tokens, $0 | 0 exact | $0 exact |
| F8 | Known zero plus missing source: final snapshot 0 tokens, $0; one CLI lane, no usage reported | ≥ 0 | ≥ $0 |
| F9 | All usage missing: no snapshot usage and one CLI lane with no usage reported | unknown | unknown |
| F10 | F1 but snapshot coverage partial (a subagent transcript could not be read) | ≥ 1,000 | ≥ $0.50 |

Acceptance criteria:

1. When a session has SDK usage only (no CLI lanes), each session total shall equal the
   normalized SDK contribution for that metric with the state the precedence table gives
   (fixtures F1, F2, F5, F10), and SDK subagent rows shall not be added a second time.
2. When a session has SDK usage and CLI lanes with known usage, each total shall equal the
   normalized SDK contribution plus each lane's contribution once, with the state the precedence
   table gives (F3, F6), and the section shall label it as the whole session.
3. When the SDK cost is partially priced (`totalCost` null, `knownCost` present), the cost total
   shall include the known subtotal and show the lower-bound state (F2, F6); its details shall
   say that some usage is not priced.
4. When a CLI lane in scope is missing a metric, that lane shall add nothing to that total, the
   total shall show the lower-bound state (precedence row 3; F4, F8), and its details shall say
   which kind of source is missing; when no source has a usable value, R1.6 applies instead.
5. When the snapshot is provisional and updates during a live turn, the totals shall update with
   it and keep the estimate state until a final value arrives (F5).
6. When every source in scope reports 0 for a metric with complete coverage and no estimate, the
   total shall show 0 as exact (F7); when a reported 0 is summed with a missing source, it shall
   show `≥ 0` (F8); when no source has a usable value, it shall show an unknown state with its
   cause in the tooltip and accessible label, never 0 and never a lower bound (F9).
7. When an accuracy state is shown, it shall be distinguishable without colour and explained in
   the section (legend, tooltip or accessible text).
8. When the session section and the agents section are both visible, the whole-session total
   shall be shown once, in the session section; the agents section shall not show a second total
   of the same scope.

### 2. No double counting

Requirement: the session total counts each source exactly once, and specs pin that.

Acceptance criteria:

1. When a fixture has an SDK snapshot that includes SDK subagent usage, SDK subagent rows with
   that usage, and CLI lanes, a spec shall assert that the totals count the subagent usage once
   and each CLI lane once.
2. When the specs run, they shall include fixtures F1-F10 of R1 and assert, for each fixture and
   metric, exactly the value and the accuracy state listed in the R1 fixture table.
3. When the overlap between snapshot and subagent rows cannot be resolved from the data (for
   example a subagent transcript could not be read, coverage partial), the total shall show the
   lower-bound state (precedence row 3, F10), or unknown when no usable contribution remains
   (row 1), and its details shall say why.

Architect options (not requirements): use the snapshot as the SDK contribution and add CLI lanes;
derive an orchestrator-only figure by subtracting SDK subagent rows from the snapshot — only after
reconciling scope, units and completeness between the two, which is not established today; or a
backend per-agent split (escalation).

### 3. Per-agent values move to the Orchestrator entry

Requirement: values that belong to the main request are shown on the Orchestrator entry, not in
the session section; the session section keeps only session-scoped values.

Acceptance criteria:

1. When the sidebar renders, main-request context used and capacity, the compaction count, the
   context limit cue and the cache TTL countdown shall be available from the Orchestrator entry
   and shall not appear in the session section.
2. When the main request's model is known, the Orchestrator entry shall show it; when it is not
   attributed (today's display can fall back to a session-wide model or the first aggregate model
   row, `inspector-session-stats.component.ts:450-465`), the entry shall show that the model is
   not attributed rather than presenting a session-wide model as the main request's.
3. When the cache countdown is active, it shall keep its current behaviour (time remaining, idle
   and estimated states, expired and low states, ticking only while active) in its new place.
4. When context or cache data is missing, the Orchestrator entry shall show an unknown state, not
   0.
5. When the session has SDK model usage, the per-model breakdown (per-model tokens by category and
   cost, and their total) shall stay reachable from the session section and shall be labelled as
   SDK scope (orchestrator and SDK subagents, no CLI lanes), including when there is a single SDK
   model and when there are no CLI lanes.

### 4. Orchestrator entry without a repeated total

Requirement: the Orchestrator entry stops repeating a session-level aggregate and shows data
scoped to the orchestrator, or says truthfully that such data is not available.

Duplication is defined by scope, not by equal numbers: a summary figure (a headline total or an
entry's summary stat) duplicates another summary figure when both describe the same scope and
metric. Two figures of different scopes may be numerically equal. The rule applies to repeated
summary figures only. The SDK subtotal inside the labelled SDK model breakdown (R3.5) is detail,
not a repeated summary figure, and is allowed even when it covers the same population and metric
as the headline, including in a session without CLI lanes. When CLI lanes contribute to the
headline, any token-category detail that comes from the snapshot alone shall name its SDK scope.

Acceptance criteria:

1. When the session has no CLI lanes and the snapshot covers the whole session, the Orchestrator
   entry shall not show the snapshot tokens or cost again under any label.
2. When an orchestrator-only token or cost figure is available, the Orchestrator entry shall show
   it with its accuracy state.
3. When no orchestrator-only figure is available (the snapshot today mixes orchestrator and SDK
   subagents), the Orchestrator entry shall show a "not available" state for that metric, with the
   cause in the tooltip and accessible label, and shall not present the snapshot figure as
   orchestrator-only.
4. When the Orchestrator's duration is unknown, it shall follow R8.
5. When the session has no CLI lanes, the labelled SDK model breakdown shall still show its SDK
   subtotal, and a reviewer shall not count it as a duplicate of the headline.
6. When CLI lanes contribute to the headline and snapshot-only token-category details are shown,
   each such detail shall carry a visible or accessible SDK-scope label.

### 5. Agents section organisation

Requirement: the agents section reads at a glance in every mount.

Acceptance criteria:

1. When the caption renders, every number in it shall have a visible label (no bare count).
2. When the caption shows a CLI run count and the list shows CLI rows, the two shall come from one
   source, or the caption shall explain the difference in visible or accessible text.
3. When plan limits have not loaded yet, the unloaded limits projection shall not supply any
   value, a 0 included, to the caption's CLI run count; the caption shall show the count from the
   loaded roster (which may be a genuine 0 when the roster is loaded and empty) or a
   loading/unavailable state.
4. When the inspector is shown in each mount at the widths listed under Non-functional
   requirements, no numeric value (tokens, cost, time, and the whole-session total in its new
   place) shall wrap onto a second line or be clipped without its full value being available to
   pointer and keyboard users and to assistive technology.
5. When an agent's status is shown, it shall be readable as text or an icon with an accessible
   name, not by colour alone.
6. When the section is loading or empty, it shall show distinct loading and empty feedback.

### 6. Shared components

Requirement: the redesigned sections use the shared stats, number, chart, bar and time components
the user asked for.

Acceptance criteria:

1. When the design spec is delivered, it shall name, for each displayed stat or visual encoding in
   the session section, the Orchestrator entry and the agents section, the shared component from
   `libs/frontend/ui/src/lib/{charts,surfaces,patterns,time}` that renders it, or the reason no
   shared component fits.
2. When the implementation is reviewed, each displayed stat or encoding shall be rendered by the
   component the design spec names, or by markup the spec justified.
3. When the reviewer inspects the shipped UI in Electron, they shall observe the shared stat,
   number, chart and bar components in actual use wherever those functions occur (a stat value,
   a formatted number, a chart, a meter or bar). An exception passes only when the spec names a
   specific gap of the shared component (a missing input, state or format) for that item; a
   general preference for custom markup does not pass. Which component renders which metric
   remains design's choice.
4. When the sections render in the dark and the light theme, labels, accuracy states and numeric
   values shall be legible in both, checked in the Electron visual review.

### 7. Truthful budget scope

Requirement: budget meters compare like with like.

The budget stage today measures snapshot scope: snapshot raw or weighted tokens, and snapshot cost
with the known-cost subtotal as a lower bound when the cost is not fully priced
(`libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.ts:69-113`).

Acceptance criteria:

1. When a token or cost budget is set, the meter shall compare the budget with the same measure the
   budget stage uses for that session (snapshot tokens on the basis the stage uses; snapshot cost,
   or the known-cost subtotal when the cost is not fully priced), and shall name that scope; a spec
   shall assert the meter value for a priced, a partially priced and a token-only fixture.
2. When the meter compares with the known-cost subtotal, it shall show the lower-bound state.
3. When the budget stage is limit, the meter tone shall be error; when it is tighten or handoff,
   warning; otherwise gold (as today, `inspector-session-stats.component.ts:501-506`).
4. When no budget is set, no budget meter or budget text shall appear.
5. When a dollar budget is configured but the stage measures weighted tokens (`weighted-fallback`:
   the snapshot has no `totalCost` and is not partially priced, or the session already entered
   the fallback and it is sticky, `session-budget-stage.ts:86-113`), the meter value shall equal
   the stage's weighted token figure, its limit shall be the configured fallback weighted-token
   limit (not the dollar amount), and its label shall say that weighted tokens are measured in
   place of cost; a spec shall assert value, limit and label for a non-sticky fallback fixture
   and for a sticky fixture whose snapshot now has a `totalCost`.

### 8. Time and duration

Requirement: Time is shown with the shared time component, and a reader understands when the
duration is not recorded.

Acceptance criteria:

1. When `durationMs` is known and greater than 0, Time shall be rendered by the shared time
   component (`ptah-timer`, clock format, small size; `libs/frontend/ui/src/lib/time`).
2. When `durationMs` is absent, null or 0 — whether or not the turn count is known — Time shall
   show a muted `--:--` placeholder in the same size and position as a known value, never zeroes
   and never a bare dash.
3. When the placeholder is shown, its tooltip and accessible label shall state the cause: a
   specific cause (for example a resumed session whose earlier transcript was not timed) only when
   the data identifies it; otherwise "duration not recorded".
4. When the turn count is known, it shall stay visible and accessible in the same stats section
   whether the duration is known or missing; its placement is design's choice.
5. When the Orchestrator entry shows a duration (today unconditionally null,
   `inspector-agents-section.component.ts:449-474`), the same rules 1-3 shall apply.

Note: the user suggested zeroes for an unknown duration; the orchestrator recommended `--:--`
because a resumed live owner with an unknown earlier prefix emits a null `durationMs` and
historical records can omit the value, so a zero would be a false value
(`decisions.md` row 5). The user may still overrule; then only R8.2 changes.

### 9. Parity of existing capabilities

Requirement: every capability marked keep or move in `parity-inventory.md` still works; the
presentation is the designer's choice.

Acceptance criteria:

1. When a row is activated, it shall become the selected row, exposed to assistive technology as
   current, and its thread shall open under the same conditions as today.
2. When the selected row is outside the visible part of a collapsed list, it shall stay visible.
3. When an agent moves between subagent and background states, the selection shall follow it.
4. When a row's request control closes, keyboard focus shall return to that row.
5. When the actions menu is used, steer, background and stop shall work, both steering surfaces
   shall open, and a steer error shall show an alert.
6. When there are more agents than the collapsed list shows, a control shall expand and collapse
   the list and expose its expanded state.
7. When a details disclosure is activated, it shall expose its expanded state and the element it
   controls, and Escape shall close it.
8. When the rail presentation is active, its metric buttons shall open the inspector, keep their
   accessible labels and attention indicator, show session values that follow R1 and R2, and keep
   access to main-request context and its limit cue (labelled as main-request scope).
9. When the session changes, the leave/enter transition shall still run, and the live region
   shall still announce.
10. When a capability listed in the parity inventory has a named spec, that spec (updated to the
    new structure) shall pass.

## Non-functional requirements

- Compatibility: Electron renderer (`apps/ptah-extension-webview`) only; dark and light themes.
- Widths at which numeric legibility (R5.4) is checked, per mount: the expanded dock at its
  minimum and its default width; the compact sheet at a board width of 360 px (compact below
  400 px, `canvas-inspector-dock.component.ts:60`); the rail at its fixed width.
- Accessibility: meters and rings have accessible labels with value and scope; no status or
  accuracy state is conveyed by colour alone; keyboard access and Escape behaviour as today.
- Compatibility: `ptah-session-stats-summary` and `ptah-agent-lane-stats` outputs unchanged;
  their specs pass.
- Verification: the coordinating agent runs the scoped gate of the worktree `CLAUDE.md`
  (`npm run verify -- -p ...` over the changed projects and the affected shared consumers, plus
  `typecheck-templates` for `ptah-extension-webview` after template changes); CLI lanes run only
  focused checks; visual review in Electron only.

## Lane-introduced constraints

| Constraint | Tag | Justification |
| --- | --- | --- |
| Whole-session totals at the top; no repetition of main-agent values; fix the agents section; use shared stats/number/chart/bar components | user-requested | `context.md` request. |
| Small shared time component for Time; no zeroes for unknown duration, `--:--` placeholder | user-requested | `decisions.md` row 5 (user asked for the component; placeholder pending confirmation). |
| Electron renderer only; visual review in Electron only | project-rule | `CLAUDE.md` "Product focus: Electron first". |
| Scoped gate run by the coordinator, `typecheck-templates` after template changes, lanes run focused checks only | project-rule | `CLAUDE.md` "STRICT: Verification commands", "Two-level check". |
| Exact placement, cells, selection bar, skeleton, six-row limit, exact strings, popover placement | removed | Replaced by outcomes in R3, R5.6 and R9. |
| About 440 px target | removed | Replaced by per-mount widths under Non-functional requirements. |
| Numeric values not wrapped or clipped without full value access | lane-proposed | The screenshot shows the Total cost wrapping; the outcome is checkable at the listed widths. |
| Per-agent share for every eligible agent | removed as a requirement | Kept as a design option with guardrails (Decisions). |
| Accuracy states (estimate, lower bound, unknown) distinguishable and explained; unknown never 0 | lane-proposed | Existing states (`agentListTotal`, cost subtotal) and truthful-total intent; marker glyphs left to design. |
| Labelled caption counts and one CLI run source, or a documented difference between sources; an unloaded limits projection supplies no value (no 0), a loaded empty roster may show a genuine 0 | lane-proposed | Screenshot defect (unlabelled count) and two projections (`session-inspector.component.html:169-178`); R5.2-R5.3. |
| Budget meter scope equals the budget stage's measure; current stage tones kept | lane-proposed | Existing behaviour (`session-budget-stage.ts:69-113`, `inspector-session-stats.component.ts:501-506`). |
| Design spec maps each stat to a shared component or a reason | lane-proposed | Makes the user's shared-component ask checkable (R6). |
| Dark/light legibility, keyboard and Escape behaviour | lane-proposed | Preserves existing UI behaviour. |
| Backend change only after architectural proof and escalation | lane-proposed | Keeps the estimate bounded; the review notes it is a planning choice, so it is an escalation path, not a ban. |
| Session-switch transition, live-region announcements, PLAN LIMITS and surrounding sections unchanged | lane-proposed | Parity objective; not named by the user. |

## Stakeholders

| Stakeholder | What they need from this change | How they will judge it |
| --- | --- | --- |
| Electron user running multi-agent sessions | One true whole-session total, per-agent detail without repetition | Top total counts each source once with a truthful accuracy state; no summary figure of the same scope and metric shown twice; the labelled SDK model breakdown keeps its SDK subtotal, also without CLI lanes (R4) |
| User watching budgets | Budget meters that compare the right scope | Meter names its scope; value matches the budget stage's measure |
| Command center / onboarding owners | Their stats summary unchanged | Their screens and specs unchanged |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Subagent usage counted twice in the session total (snapshot includes SDK subagent usage; `agentListTotal` adds subagent rows) | HIGH | HIGH | Architect states the aggregation for every case of R1 and the specs of R2 pin it. |
| No orchestrator-only figure exists in the data | HIGH | MEDIUM | Architect decides between a derived figure (after reconciling scope, units, completeness), a backend split (escalation) or the "not available" state of R4.3. |
| Partial pricing or missing lane usage presented as exact | MEDIUM | HIGH | R1.3-R1.4 specs with partially priced and missing-usage fixtures; reviewer checks the lower-bound state. |
| Caption CLI run count (`limits.inspectorRuns`) disagrees with CLI rows without explanation, or the unloaded limits projection shows as a measured 0 | MEDIUM | LOW | Architect picks one source or documents the difference (R5.2); R5.3 specs with limits not loaded and a loaded roster, plus one with limits not loaded and a loaded empty roster showing a genuine 0. |
| Shared helper changes alter command center / onboarding output | MEDIUM | MEDIUM | Developer keeps helper signatures backward compatible; coordinator includes their projects in the gate. |
| A change to inspector inputs breaks one of the three dock mounts | LOW | MEDIUM | Architect lists input changes against `canvas-inspector-dock.component.ts:125,193,239`; visual review covers all three. |

## Decisions

- Type FEATURE, estimate M. Options: FEATURE / REFACTORING. Evidence: new presentation rules and
  totals, `context.md` type. Reversible: yes.
- No capability removed; main-request values move to the Orchestrator entry; the whole-session
  total moves to the session section. Options: remove duplicates / move them. Evidence: user asks
  to stop repeating, not to lose data; parity rule. Reversible: yes.
- Accuracy states survive into every total; unknown is never 0, a reported 0 stays 0. Options:
  drop states in totals / keep them. Evidence: `agentListTotal` propagates them
  (`inspector-agent-list.ts:105-156`), `lane-stats.adapters.ts:99-178`, `inspector-agent-usage.ts:34-79`.
  Reversible: yes.
- Renderer-first; a backend change is an escalation after proof. Options: frontend-only ban /
  escalation path. Evidence: review notes no project rule requires frontend-only; the estimate
  depends on it. Reversible: yes.
- Per-agent share is a design option, not a requirement. Options: mandatory share / design option
  / drop. Evidence: no request or rule mandates shares; the Orchestrator row is an SDK-scope
  aggregate that overlaps its SDK subagent rows. If design shows shares, the numerator is a row's
  own-scope value and the denominator the whole-session total of the same metric; rows whose scope
  overlaps another row (today the Orchestrator row) or whose value is unknown show no share; a
  share from a lower-bound or estimated value carries that state. Reversible: yes.
- The rail keeps a main-request context metric and its limit alert, labelled as main-request
  scope. Options: drop it from the rail / keep it relabelled / replace it with a session metric.
  Evidence: rail metrics `session-inspector.component.html:26-56`, `session-stats-view.ts:167-186`;
  parity rule forbids silent removal. Reversible: yes.
- Time: shared `ptah-timer`, `--:--` placeholder for unknown duration (`decisions.md` row 5).
  Options: unknown text / zeroes / placeholder. Evidence: user request; a resumed live owner with
  an unknown earlier prefix emits a null duration, and historical records can omit it.
  Reversible: yes (user may choose zeroes; then only R8.2 changes).
- PLAN LIMITS stays as is. Evidence: user request does not mention it; screenshot shows no defect
  there. Reversible: yes.

## Open questions

- None blocking. The duration placeholder awaits user confirmation (`decisions.md` row 5); only
  R8.2 changes if the user chooses zeroes.

## Follow-ups (out of scope)

- Backend derives the duration of a resumed session from transcript timestamps, so the
  placeholder is needed less often (`decisions.md` row 6).

## Handoff

- Next specialist: ui-ux-designer (design phase), then software-architect (architecture).
- Why: the layout and the stat-to-component mapping (R6) are the open shape for design; the
  aggregation (R1-R2), the orchestrator-only figure (R4), the budget measure (R7) and the CLI run
  source (R5.2-R5.3) must be settled by the architect.
- Moved to the architecture phase (accepted by the Gate 1 reviewer, round 2): the concrete width
  fixtures for the expanded dock (minimum and default width) and for the rail (its fixed width)
  at which R5.4 is checked; the architect states them in `implementation-plan.md` from the dock
  and rail code.

## Revision history

Revision 2, 2026-11-23 (Gate 1 review round 1):

- Finding 1: R1 rewritten around aggregation rules (units, ownership, one contribution per source,
  partial pricing, estimates, unknown, reported zero) with outcomes R1.1-R1.6; R2 specs cover them;
  subtraction moved to an architect option needing reconciliation; conjectured screenshot total
  dropped.
- Finding 2: R4 defines duplication by scope, adds no-lane case and a "not available" state; R3.2
  covers unattributed main-request model; R3.5 keeps the SDK-scope model breakdown.
- Finding 3: layout prescriptions replaced by outcomes (R3, R5.6, R9); R9.2-R9.4 and R9.8 added;
  per-agent share downgraded to a design option with guardrails (Decisions); rail context
  disposition recorded.
- Finding 4: R8 rewritten for `ptah-timer`, `--:--` placeholder, cause rules, turn count, and the
  Orchestrator duration; open question removed; follow-up added.
- Finding 5: three dock mounts recorded, host risk replaced; R5.3 for limits not loaded; R7 tied to
  the budget stage measures and tone mapping; per-mount widths stated.
- Finding 6: R6 requires a stat-to-component map in the design spec and dark/light legibility;
  coordinator runs the scoped gate with affected consumers.
- Finding 7: caption line 105, Orchestrator card lines, row-sum and snapshot-scope wording,
  duration provenance corrected.
- Lane-introduced constraints: section added with tags.

Revision 3, 2026-11-23 (Gate 1 review round 2):

- Finding 8: R1 accuracy rules replaced by one per-metric precedence table over normalized
  contributions; R1.1 uses the normalized SDK contribution; fixtures F1-F10 (incl. SDK-only
  partial pricing, known zero plus missing source, all usage missing) each with one value and
  state; R1.1-R1.6 and R2.2-R2.3 aligned to the table.
- Finding 9: R4 restricts duplication to repeated summary figures, allows the SDK subtotal in the
  labelled SDK breakdown (also without lanes), requires SDK-scope labels on snapshot-only detail
  when lanes contribute (R4.5-R4.6); Stakeholders row aligned; parity inventory unchanged.
- Finding 10: R7.5 adds the weighted-token fallback fixture (non-sticky and sticky): value, limit
  and label.
- Finding 11: R6.3 requires observed use of the shared stat, number, chart and bar components in
  the shipped UI, with exceptions only for a named gap; component choice stays with design.
- Finding 12: R8.4 placement removed (turns stay accessible in the same stats section); duration
  provenance note and Decisions aligned with Context; `--:--` kept, zeroes still the user's option.
- Finding 13: R5.3, the caption constraint row and the caption risk row distinguish an unloaded
  limits projection (no value, no 0) from a loaded roster's genuine 0.
- Widths: expanded dock and rail width fixtures moved to the architecture phase (Handoff).
