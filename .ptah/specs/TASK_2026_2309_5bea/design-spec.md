# Design Spec - TASK_2026_2309_5bea (stats sidebar redesign)

Surface: `ptah-session-inspector` in the Electron renderer (SESSION stats grid + AGENTS section; PLAN LIMITS unchanged).
Prototype: `prototype/index.html` (fixture switcher for F1, F2, F5-like, F6-like, F8, F9, running, unknown duration, plus loading/empty/error). This spec does not describe screenshots; none were reviewed by the author.
Tags: `[project-rule]` = taken from the project's tokens, components, parity inventory or requirements. `[lane-proposed]` = introduced by this design.

## 1. Audience and goals
- Audience: a developer running a multi-agent session who glances at the dock to learn "how much did the whole session cost, who spent it, is anything running or near its limit".
- Goals: (1) the top of the sidebar shows whole-session totals (orchestrator + subagents + CLI lanes), never main-agent-only figures (R1, R2). (2) No number appears twice (R2, R4). (3) Per-agent figures live in AGENTS; main-request context/model/cache live in the Orchestrator entry (R3). (4) Every number carries its accuracy state and scope (R1 precedence, R7). (5) Built from shared `ptah-stat`, `ptah-meter`, `ptah-ring`, `ptah-timer`, `ptah-countdown` (R6). (6) Nothing existing is lost (R9).

## 2. Current-state evidence (context.md screenshot of session "small tweaks")
1. Top grid shows main-agent numbers (25.9M, $17.54) and the Orchestrator row repeats them; the session total (56.0M, `≥ ~$30.58`) is only at the bottom of the agents table.
2. Time tile shows "—" for a session of 24 turns.
3. Caption "0 running · 15 · 7 CLI runs" has an unlabelled number.
4. Total cost cell wraps.
5. Agents table is plain text; no shared stat/meter/ring components.

## 3. Information hierarchy
1. SESSION: whole-session Tokens and Cost (largest figures), scope line, accuracy hints.
2. Where it came from: SDK vs CLI-lane share meters.
3. Time and turns; budgets if set.
4. Details disclosure (models, token categories, full precision, coverage notes), collapsed by default.
5. AGENTS: caption, Orchestrator entry, subagent and CLI-lane rows.
6. PLAN LIMITS (unchanged).

## 4. Layout per section
### 4.1 SESSION (`ptah-surface-section`)
- Header "Session"; scope line "Whole session: orchestrator + N subagents + M CLI lanes" (N, M from the roster rows; zero parts omitted).
- Two `ptah-stat layout=tile size=sm` tiles: Tokens, Cost. Two columns when container content width >= 280 px (sidebar >= ~304 px), one column below (so stacked at 300 px). Value text longer than 9 characters drops to `size=xs`.
- Accuracy marker is part of the value (`~`, `≥`, `≥ ~`); a visible hint word under it ("Estimate", "Lower bound: 1 lane has no cost", "Not priced"); `title` and screen-reader text carry the full value and scope.
- Unknown: muted "Unknown" (`valueTone` muted), cause in `title`/aria; never `0`.
- Legend line `~ estimate · ≥ at least · Unknown`, shown only while a marker is visible.
- "Where it came from": one `ptah-meter size=xs` per non-overlapping scope, SDK (orchestrator + subagents) and CLI lanes, `max` = session total, `valueText` e.g. "25.9M · 46%"; cost as trailing text. Shares of a non-exact total are `~`-prefixed; unknown rows show no share. The Orchestrator gets no share here (it overlaps SDK).
- Time + Turns row: `ptah-timer` (clock, small) when duration known, else muted `--:--` with title/aria "Duration not recorded"; turns as `ptah-stat plain xs` ("24 turns"), always shown.
- Budgets (only when set): `ptah-meter` named with scope ("Token budget · SDK snapshot scope"); lower-bound text when only a known-cost subtotal exists; weighted-token fallback label (R7.5); tone limit->err, tighten/handoff->warn, else gold; text value plus stage word.
- Details disclosure (`ptah-disclosure`): Models (SDK scope), per-model breakdown, token categories, coverage/cost notes, full-precision values (25,912,340 tokens; $17.5431). Each block labelled "SDK scope (orchestrator + subagents, no CLI lanes)". Session-keyed expansion state is kept.

### 4.2 AGENTS
- Caption: "Agents · 1 running · 3 subagents · 2 CLI lanes" (every count labelled; source = roster rows only).
- Order: live first, Orchestrator, rest (parity).
- Row (subagent / lane): L1 avatar + name (truncate, `title`) + status word with icon; L2 model or CLI role line; L3 three `ptah-stat plain xs` (Tokens, Cost, Time) in a 3-column grid `auto auto auto`, `justify-between`, `nowrap`, `tabular-nums` (fits 244 px even at `≥ ~$1,234.56`); thin `ptah-meter xs hideLabel` share of whole session (`valueText` "12%", `~` when not exact; omitted for unknown). Input/output split and start time in `title` and the selected-row detail.
- Orchestrator entry: same trio, but Tokens/Cost show muted "Not available" (cause in title/aria); Time `--:--`; primary model or "Model not attributed"; `ptah-meter` Context (main request) with `valueText` "6.7% · 67K / 1.0M", near-limit marker, tone auto, visible cue "Near limit" / "Limit reached" with glyph; "1 compaction" stat; Cache: `ptah-countdown size=sm` plus small TTL meter, idle/estimated/expired/low in text. Unknown context/cache = "Unknown", not 0.
- Selected row detail: request lines, actions menu (Steer / Background / Stop), steer error `role=alert`.
- "Show N more / Show fewer" with `aria-expanded`; selected row stays visible when collapsed.

### 4.3 PLAN LIMITS
Unchanged (`stats.limits`, one tile per provider, session provider first). [project-rule]

### 4.4 Rail (56 px)
Stacked buttons: label 10 px, value 11-12 px semibold, <= 7 characters including marker: Tokens (whole session), Cost (whole session), Context (main request) as `ptah-ring size=sm` with `centerText` % and limit-cue glyph "!". Full text in `aria-label`/`title`; attention dot kept.

## 5. Stat-to-component map
| Stat / encoding | Component and inputs | Notes |
| --- | --- | --- |
| Session tokens | `ptah-stat layout=tile size=sm label="Tokens" value hint title valueTone` | marker in value |
| Session cost | same, label "Cost" | `≥`, `~`, `≥ ~` per R1 precedence |
| Scope share (SDK, CLI) | `ptah-meter size=xs value max=total valueText tone=neutral` | no stacked bar: G1 |
| Time | `ptah-timer` (clock) or muted text `--:--` | G3 |
| Turns | `ptah-stat appearance=plain size=xs` | |
| Budget | `ptah-meter tone=auto/err/warn/gold label="… · scope" valueText` | R7 |
| Models / categories | rows of `ptah-stat plain xs` inside `ptah-disclosure` | |
| Agent tokens / cost / time | three `ptah-stat plain xs` | G2: visible xs labels |
| Agent share | `ptah-meter xs hideLabel valueText` | open question 1 |
| Orchestrator context | `ptah-meter tone=auto marker valueText` | |
| Rail context | `ptah-ring size=sm centerText ariaLabel` | |
| Cache TTL | `ptah-countdown size=sm` + small `ptah-meter` | |
| Sparkline | not used | no time series exists |
| Instrument band, `ptah-stat-card` | not used | buttons; tile layout of `ptah-stat` matches |
| Stacked scope bar | G1 gap | meters per scope instead; acceptable |
| Hidden stat label | G2 gap | visible xs labels |
| Duration-only timer | G3 gap | `ptah-timer` takes start/end; pass `startedAt=0`, `endedAt=durationMs` or add an input |

## 6. Accuracy-state rendering
| State | Prefix | Hint (visible) | Title / aria | Source |
| --- | --- | --- | --- | --- |
| exact | none | none | "Exact" | R1 |
| estimate | `~` | "Estimate" | "Estimated: includes provisional or estimated data" | R1 |
| lower bound | `≥` | "Lower bound: N lane(s) have no cost" / "Partial coverage" | "At least: …" | R1 |
| lower bound + estimate | `≥ ~` | "Lower bound, estimated" | both | R1 |
| unknown | none | "Unknown" (muted) | cause | R1 |

| Fixture | Tokens | Cost |
| --- | --- | --- |
| F1 | 1,000 | $0.50 |
| F2 | 1,000 | ≥ $0.30 "Lower bound: pricing partial" |
| F3 | 1,200 | $0.60 |
| F4 | 1,200 | ≥ $0.50 "Lower bound: 1 lane has no cost" |
| F5 | ~800 "Estimate" | ~$0.40 "Estimate" |
| F6 | 1,200 | ≥ ~$0.40 |
| F7 | 0 | $0 |
| F8 | ≥ 0 | ≥ $0 |
| F9 | Unknown | Unknown |
| F10 | ≥ 1,000 "Partial coverage" | ≥ $0.50 |
Share meters: exact total -> "46%"; non-exact -> "~46%"; unknown -> no meter. [project-rule: task-description R1 fixtures]

## 7. Tokens
Authoritative: `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`; theme values `apps/ptah-extension-webview/tailwind.config.js` (anubis / anubis-light) and `apps/ptah-extension-webview/src/styles.css`. No new tokens. [project-rule]
| Token | Dark (anubis) | Light (anubis-light) |
| --- | --- | --- |
| base-100 / surface-0 | #131317 | oklch(97.788% .004 56.375) |
| base-200 | #1a1a20 | oklch(93.982% .007 61.449) |
| base-300 | #242430 | oklch(91.586% .006 53.44) |
| content | #e8e6e1 | oklch(23.574% .066 313.189) |
| muted (`--bcm`) | oklch(66.51% .0074 31.09) | oklch(48.955% .0448 348.48) |
| ink run | #3b82f6 | #2a56c6 |
| ink need | #f97316 | #8f5200 |
| ink err | #ef4444 | #b4232a |
| ink done | #16a34a | #13713a |
| ink idle | #9ca3af | #6b6570 |
| `--ptah-gold` | #d4af37 | oklch(58% .132 75) |
| chart warn | (theme default) | oklch(55% .17 45) |
| meter track | base-content 14% | base-content 6% + 50% edge (`--ptah-meter-track-edge`) |
| `--surface-border` / `-strong` | bc 8% / bc 14% | bc 8% / bc 14% |
| spacing | `--ptah-space-1..` 0.25/0.5/0.75/1/1.5/2 rem | same |
Series inks `--ptah-series-1..5` are not needed: scope shares are identified by position and label.

## 8. Measured contrast (WCAG 2.x AA; text 4.5:1, non-text 3:1)
Method: author's script (reproduces the project's published gold/track 3.64/3.26/3.03 and muted 6.06/5.66/5.01). Columns b1/b2/b3.
| Pair | Dark | Light | Result |
| --- | --- | --- | --- |
| content text | 14.86/13.89/12.29 | 15.91/14.21/13.21 | pass |
| muted text | 6.06/5.66/5.01 | 6.03/5.39/5.01 | pass |
| run ink | 5.04/4.71/4.17 | 6.07/5.42/5.04 | pass b1,b2; dark b3 fail |
| need ink | 6.61/6.18/5.47 | 5.83/5.21/4.84 | pass |
| err ink | 4.92/4.60/4.07 | 6.12/5.47/5.08 | pass b1,b2; dark b3 fail |
| done ink | 5.62/5.25/4.65 | 5.71/5.10/4.74 | pass |
| idle ink | 7.30/6.82/6.04 | 5.29/4.73/4.39 | pass b1,b2; light b3 fail |
| meter gold/track | 6.20/5.66/4.93 | 3.64/3.26/3.03 | pass |
| meter warn/track | 4.65/4.25/3.70 | 4.33/3.87/3.61 | pass |
| meter err/track | 3.47/3.17/2.76 | 5.44/4.87/4.53 | pass; dark b3 fail |
| track edge vs surface | n/a | 3.28/3.19/3.13 | pass |
| selected fill bc 8% on b2, status ink text | err 3.78, run 3.86 | idle 4.04, done 4.36 | FAIL |
Rules derived: (a) status-ink text sits on surface-2 or lighter, never surface-3. (b) Selected row = 3 px inset left bar + 1 px `--surface-border-strong` ring + fill of at most bc 3%; the 3% fill was not re-measured (the measuring command was blocked) and the reviewer must re-measure it, falling back to no fill if a status ink drops below 4.5:1. (c) The dark meter err fill on surface-3 fails 3:1, so meters never sit on surface-3 and the limit state always has a text cue plus glyph. (d) Status is never colour only.

## 9. Interaction and state map
| State | Rendering |
| --- | --- |
| Loading (stats) | tiles `loading` skeleton; scope line hidden |
| Loading (roster) | "Loading agents…" + skeleton rows; independent of plan-limits loading (R5.3) |
| Empty roster | "No agents in this session yet" (Orchestrator entry still shown if session exists) |
| Running | status "Running" with pulsing icon; `ptah-timer` live; row sorted first |
| Done | check icon, "Done" |
| Error | cross icon, "Error"; `ptah-stat error` retry where the stat provides it |
| Stopped | square icon, "Stopped" |
| Queued | hollow icon, "Queued" |
| Unknown | muted "Unknown" / `--:--`, cause in title and aria |
| Selected | inset bar + ring + `aria-current`; detail reveals request lines, actions menu, steer error |
| Focus | 2 px outline base-content, offset -2 (as today) |
| Keyboard | Tab to row; Enter/Space selects (opens thread conditionally, parity); menu: Arrow keys, Enter; Escape closes menu or disclosure and returns focus to the row |
| Show more / fewer | button with `aria-expanded`; selected row kept visible |
| Disclosures | `aria-expanded` + `aria-controls`; Escape closes |
| Actions menu | Steer / Background / Stop; Stop is the last item |
| Steer error | `role=alert` text under the steer input; two surfaces (steer input, lane composer) |
| Selection transitions | selection follows subagent/background transitions (parity) |

## 10. Responsive behaviour
| Width | Behaviour |
| --- | --- |
| 300 px | one tile column; rows keep trio grid (244 px content); share meter full width; caption wraps to two lines |
| 336 px | content about 272 px (< 280): one tile column; rows unchanged |
| 360 px (compact sheet) | two columns (content >= 280) |
| 400 / 448 px | two columns; scope line single line |
| 56 px rail | stacked buttons per 4.4; no section content |
The 2-column threshold is on container width (container query), not viewport. [lane-proposed]

## 11. Accessibility criteria
- Each meter/ring: accessible name = metric + scope, value text = value + share (e.g. "Context, main request: 6.7%, 67K of 1.0M"; "Share of whole session: ~12%"; "Token budget, SDK snapshot scope: 80%, tighten").
- Status by icon + word, never colour only; limit state by glyph + text.
- Accuracy markers have text equivalents in `title` and sr-only text ("estimate", "at least").
- Touch/keyboard: every disclosure and menu keyboard reachable; Escape behaviour per section 9.
- Polite live region (existing) kept. Contrast per section 8; prefers-reduced-motion disables pulse and countdown animation.

## 12. Copy deck
Visible: "Session"; "Whole session: orchestrator + {N} subagents + {M} CLI lanes"; "Tokens"; "Cost"; "Estimate"; "Lower bound: {n} lane(s) have no cost"; "Partial coverage"; "Not priced"; "Unknown"; "~ estimate · ≥ at least · Unknown"; "Where it came from"; "SDK (orchestrator + subagents)"; "CLI lanes"; "Time"; "Turns" ("{n} turns"); "--:--"; "Details"; "Models (SDK scope)"; "Agents · {r} running · {s} subagents · {c} CLI lanes"; "Loading agents…"; "No agents in this session yet"; "Orchestrator"; "Not available"; "Model not attributed"; "Context (main request)"; "Near limit"; "Limit reached"; "{n} compaction(s)"; "Cache"; "Running / Done / Error / Stopped / Queued"; "Steer / Background / Stop"; "Show {n} more"; "Show fewer"; "Plan limits".
Tooltips / aria: "Duration not recorded"; Orchestrator Tokens/Cost "The session snapshot mixes the orchestrator and SDK subagents; no orchestrator-only split is recorded"; "SDK scope (orchestrator + subagents, no CLI lanes)"; "Token budget · SDK snapshot scope"; "Context, main request: {pct}, {used} of {max}"; "Share of whole session: {pct}"; full-precision value titles; rail labels "Tokens, whole session: {v}", "Cost, whole session: {v}", "Context, main request: {pct}, limit {state}"; caption tooltip lists differences from `limits.inspectorRuns` if any; steer error text from existing RPC error.
No new assets.

## 13. Parity (every keep/move row -> new location)
- Inspector frame (header, TASK, GIT, linked sessions, live region, presentations, session-switch transition, `sessionTokens` split): untouched / same place; the transition wraps the new SESSION section.
- Orchestrator request lines: same place above SESSION (or inside the Orchestrator entry; architect picks one, no duplication).
- Rail metric buttons and context metric + limit alert: rail (4.4); context relabelled "main request".
- SESSION grid: Tokens/Cost -> session tiles (whole-session values); Time -> Time+Turns row; main-request context, compactions, cache TTL, primary model -> Orchestrator entry; models/categories -> Details.
- AGENTS: caption, loading/empty, column header (replaced by row layout), Orchestrator row (content redefined), ordering, row VM incl. estimate/lower-bound, CLI role label, start-time tooltip (row title), live lane timing, selection, selected-row visibility, selection normalisation, focus return, actions menu, request lines, steering surfaces and error, list expand/collapse: all kept as in 4.2 and 9.
- Total row -> replaced by SESSION tiles (corrected, no overlap).
- PLAN LIMITS: untouched.

## Decisions
Format: decision; options; evidence; reversible. All reversible in design.
1. Hierarchy SESSION -> AGENTS -> PLAN LIMITS; alternative: keep grid on top. Evidence: screenshot problem 1; R1-R3. `project-rule`.
2. One surface-section with two tile stats, markers in value plus hint word; alternative: single-line summary. Evidence: R1 precedence; ptah-stat tile API. `project-rule`.
3. Share meters per non-overlapping scope; Orchestrator gets none; alternative: stacked bar (G1). Evidence: no stacked component; task-description share guardrails. `project-rule`.
4. Time via `ptah-timer` or `--:--` plus Turns stat. Evidence: R8; screenshot problem 2. `project-rule`.
5. Budgets labelled with scope, tones per stage. Evidence: R7. `project-rule`.
6. Models and categories inside Details disclosure with SDK-scope labels. Evidence: R4, R7. `project-rule`.
7. Agents caption from roster rows only, all counts labelled. Evidence: screenshot problem 3; parity caption row; R5. `project-rule`.
8. Row = avatar/status, model line, 3 plain xs stats, thin share meter. Evidence: problem 4; `ptah-stat` sizes. `lane-proposed`.
9. Orchestrator entry shows "Not available" for tokens/cost, plus context meter, compactions, cache. Evidence: R3, R4, R8.5. `project-rule`.
10. Selection by inset bar + ring + `aria-current`, fill at most 3%. Evidence: section 8 failures. `lane-proposed`.
11. Rail shows Tokens, Cost, Context (ring) with <= 7 characters. Evidence: parity rail rows. `lane-proposed`.
12. No sparkline, no instrument band, no stat-card. Evidence: no time-series data. `lane-proposed`.
13. Gaps G1-G3 accepted and named (section 5). `lane-proposed`.
14. Per-agent share meters on rows (see open question 1). `lane-proposed`.
15. No removals. `project-rule`.

## Proposed Removals
None.

## Lane-introduced constraints
Two-column threshold at container width 280 px; size xs for values over 9 characters; <= 7-character rail values; 3% selected fill; status text on surface-2; `--:--` for unknown time. All `lane-proposed`; need Gate 1.7 acceptance.

## Open questions
1. Per-agent share meters on rows: recommend yes (shows who spent it at a glance, +4 px per row). If no, drop the meter line from section 4.2.
2. Time unknown: working decision `--:--` with "Duration not recorded"; the user may prefer zeroes (`00:00`). Zero would read as a real duration, so it is not recommended.

## Implementation handoff (for the architect)
- G3: `ptah-timer` takes start/end; pass `startedAt=0`, `endedAt=durationMs` or add a duration input; confirm in the shared lib.
- Orchestrator-only token/cost figure is unavailable in the data: render "Not available" with the cause; do not subtract.
- CLI caption source = roster rows (not `limits.inspectorRuns`); differences go in a tooltip only.
- Budget scope labels and weighted-token fallback label per R7; do not label SDK-snapshot budgets "session".
- Width fixtures for specs/visual review: 300, 336, 360, 400, 448 and the 56 px rail, each with F1, F6, F9 and a long-name/`≥ ~$1,234.56` row.
- Re-measure selected-row fill at 3% (both themes) and shipped CSS contrast before merge; run `typecheck-templates` after template change.
- Fixture IDs F1-F10 and precedence per task-description R1.
