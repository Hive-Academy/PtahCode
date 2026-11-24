# Design specification rev 3 - session inspector (deltas from `design-spec-v2.md`)

Prototype: `prototype/v3/index.html` (`?w=300|336|360|400|448|rail&theme=dark|light&fx=<fixture>`,
also `sel=<row id>`, `pop=1`, `more=1`, `chrome=0`). Screenshots: `prototype/v3/screenshots/`.
Everything not listed here stays as written in `design-spec-v2.md`. Design system applied: the existing
Ptah tokens (anubis / anubis-light, `ptah-tokens.css`), unchanged from v2; no new token.

## 1. Section-by-section deltas

| Section | Rev 3 change |
| --- | --- |
| Header | Unchanged. The request line's Answer button selects the asking row and moves focus into its request panel. |
| SESSION tiles | Tokens and Cost are whole-session totals computed from one model (§2). Each carries one accuracy marker. Budget tile has an SDK swatch when lanes exist and is removed when no budget is set (Models then spans two columns). Each tile is a focusable group whose tooltip and name hold the full value and cause. |
| Source bar | Segments are contributions to the same total. A hatched stub (10 px) marks lanes that reported nothing, so the bar never implies full coverage. Legend: `SDK 23.5M`, `CLI ~2.4M`, `1 unreported`. |
| Models | Inline disclosure under the tiles (no overlay): one row per model with its own categories line, `SDK subtotal`, `CLI lanes` row, then `Cost basis` and lane coverage (`with tokens 2/2`, `with cost 1/2`). |
| AGENTS | Orchestrator row has the same shape as every row (§3). Share bar uses the whole-session denominator (§4). Rows sort Orchestrator, needs-you, running, then roster order. `Show N more` counts the rows that are really hidden. An empty roster shows one muted line, `No subagents or CLI lanes yet`. |
| PLAN LIMITS | Provider header line, optional model-group caption, one 18 px line per window (§5). |
| TASK, GIT, linked | Unchanged layout. GIT shows a `detached` badge next to `HEAD`. |
| Rail | Agents button with attention count, Tok, Cost, Context, plan-limit cue. Loading shows skeletons, never settled totals (§7). |

## 2. One totals model (findings 1, 3; live defects 2, 3)

- Whole-session total = SDK snapshot + CLI lanes. Subagent rows are inside the SDK snapshot and are never
  added again. The prototype computes every total from the rows (`totals()`); no total is typed.
- Marker precedence, per metric, the same for tile, source bar, legend, Models detail and rail:
  `≥` when the SDK value is missing or incomplete, any lane reports nothing, or any lane value is a lower
  bound; `~` when any included value is estimated; `≥ ~` when both hold; no marker otherwise.
- Compact figures floor (never round up), so a lower bound cannot claim more than the known amount.
  Costs under $0.01 show three decimals. The rail drops cents from $10 up.
- Budget is a separate measure: SDK snapshot against the stage's limit. Numerator and limit share one unit
  (`tok`, weighted tokens, or dollars). A missing price gives `≥` on the percent. Tone follows the stage:
  gold (normal), warning (tighten, handoff), error (limit or 100%). The swatch and the tooltip say
  `SDK usage only, CLI lanes are not counted`. No budget configured: no tile.
- Live check (`fx=live-small`): Orchestrator `~588K / ~$0.03`, Codex `117K / ~$0.05`, Antigravity
  `≥35.4K / —`, spec-counter `35.7K / ~$0.004`; tiles `≥777K` and `≥ ~$0.08`. The old UI showed 812.8k.

## 3. Orchestrator row (decision 12)

- Avatar + status badge, name, model line, Tokens (+ share bar), Cost, Time: identical cells.
- Tokens/Cost = SDK snapshot minus SDK subagent rows, marked `~`, cause `SDK total minus subagent rows`.
  Not derivable (snapshot or any subagent value missing) = muted `—` with the cause. No subagents = the
  snapshot itself, no marker. Time = session time.
- Model line: `Fable 5.2  (ring 11 px) 6.7%  (hourglass) 58:38`. At 340 px and below the cache group and the
  CLI role text leave the line; both stay in the tooltip and the inline detail.
- Cache states on the same glyph: normal, low (warning tone), estimated (`~`), idle and expired (dimmed,
  expired shows `0:00`), unknown (`—`). Only an active cache ticks; the ticking text is not announced.
- Inline detail (selected row): Context used / capacity, Compactions, Cache TTL + idle + state, SDK total.

## 4. Share bar (finding 2)

- Width = row tokens / deduplicated whole-session tokens. No maximum-row scaling, no minimum fill; a
  known 0 is a zero-width fill.
- Hidden (space kept) when the row is unknown or a lower bound, or the session total is unknown, zero or a
  lower bound. With an estimate on either side it stays and its name says `About 37% of session tokens`.
- Consequence: when a lane reports only part of its tokens (live agy run), no row shows a share bar.

## 5. PLAN LIMITS (decisions 13 and 15)

- Provider line: name, account id, source badge. Session provider first.
- Window line, grid `30px | 1fr | 46px | 60px`: label (`5h`, `Week`), 3 px meter, percent (+ cue), reset.
  Full window name and reset sit in the tooltip and the meter name.
- Model groups: an 11 px muted caption (`Gemini models`, `Claude and GPT models`) above that group's lines.
- Unavailable provider: one line, muted italic `usage unavailable`, reason in the tooltip, no meter.
- Tone, one rule for all provider meters: success (normal), warning (owner state or 75% and above), error
  (owner state `limit` or 100%). A known 0% draws an empty track.
- `lanes` and `live-small` show agy with both groups and real values (Gemini 0% used on both windows;
  Claude and GPT 1% on 5h, 3% weekly). The agy lane cost stays `—`, so Cost is `≥`. `limits` shows two
  windows on Claude and Codex, agy with stressed groups, and Gemini unavailable.

## 6. Accuracy and spoken text (findings 7, 9)

- Marker glyphs: 84% of the figure size, foreground at 74%, 2 px gap between `≥` and `~`, 2 px before the number.
- Glyph and compact figure are `aria-hidden`. A visually hidden sentence carries state, full value and cause,
  for example `At least about $17.54, whole session. CLI lane cost is estimated; 1 of 2 lanes report no cost`.
  Words: `~` = "about", `≥` = "at least", both = "at least about", `—` = the cause, `--:--` =
  `Duration unknown.` plus the cause (decision 5).
- The same sentence is the tooltip, shown on hover and on keyboard focus (tiles, row buttons, rail buttons).
- Row button name: kind, name, model, role, status, and for the Orchestrator its context and limit state.
  Its tooltip is the full identity, including the CLI role and start time.
- Bars: source bar and share bar are `role="img"` with value and scope; meters use `role="meter"` with a value text.
- One live region outside the re-rendered pane announces send, answer, section focus and session change.

## 7. Parity carried (findings 4, 5, 6)

| Item | Where in rev 3 |
| --- | --- |
| Categories, per-model categories, SDK subtotal, cost basis, coverage | Models disclosure |
| Cache estimated / idle / low / expired / unknown | Orchestrator model line + detail |
| Steer input and lane composer | Selected running or needs-you row: `Steer <name>` (subagent), `Message <name>` (CLI lane); same error line with Retry |
| Actions menu steer / background / stop | Unchanged from v2 |
| Requests | Row request panel: question, lane output block (scrolls, focusable), answer buttons; answering returns focus to the row and announces it. Header request line jumps to that panel. |
| CLI role, start time, live lane timing | Model line (role), detail (Role, Started), ticking Time cell on a running lane |
| Rail | Agents button with attention count, metric buttons that open and focus SESSION, context button that opens AGENTS, plan-limit cue that opens PLAN LIMITS; expand returns to the last width |
| Mounts | Dock 300-448, compact sheet 360 (`w=360`), rail 56. Session switch: enter animation + announcement |

Duration of 1 h or more in a row shows `1h26m`; the full clock is in the tooltip. Tiles keep the full clock.

## 8. Width budget (finding 8; live defect 1)

| Width | Numeric columns (Tokens / Cost / Time) | Name column | Result |
| --- | --- | --- | --- |
| 300, 336 | 52 / 54 / 50 px, 6 px cell gap | 91 px text at 300 | names ellipsize, never collapse; header cells do not overlap; no clipped figure |
| 360-448 | 56 / 62 / 58 px, 8 px cell gap | 120 px and up | full model line with context and cache |

Checked by script at 300, 336, 360, 400, 448 and rail for all ten fixtures (dark, all rows shown, Models
open; 60 renders): no element past the pane edge, no clipped figure, no script error. Light theme was
checked only at 448 `lanes`. 360 has no capture.

## 9. Component map (finding 10)

| Element | Component |
| --- | --- |
| Tiles | CSS grid of `ptah-stat` (`appearance="plain"`, `placeholder="—"`); gap: accuracy prefix + spoken text |
| Time | `ptah-timer` clock; gap: elapsed-only input and cause-aware `--:--` |
| Context | `ptah-ring` with thresholds; gap: 11 px and 20 px sizes |
| Cache | `ptah-countdown` fed by the existing inspector cache state |
| Budget, limits, task, share | `ptah-meter` (tone, value text); gap: 2 px and 3 px heights |
| Source bar + legend | segmented `ptah-meter` variant (new) + scoped legend markup |
| Table | `ptah-table`, `th/td[ptahNumeric]`, `ptah-table-row-title`; no `td[ptahBarCell]` |
| Sections, detail | `ptah-surface-section`, `ptah-description-list`, `ptah-disclosure` (Models), `span[ptahBadge]` |
| Existing inspector parts kept | request panel, agent actions menu, session actions, limits lanes, task, git, linked sessions |

## 10. Contrast (WCAG 2.1 AA: text 4.5:1, graphics 3:1; measured on the pane background)

| Pair | Dark | Light |
| --- | --- | --- |
| Text / muted text | 14.86 / 6.05 | 15.92 / 6.04 |
| Accuracy marker | 8.38 | 7.10 |
| Meter success / gold / warning / error | 5.62 / 8.81 / 6.61 / 4.92 | 5.71 / 4.11 / 5.83 / 6.12 |
| Series SDK / CLI | 9.15 / 9.12 | 5.25 / 5.27 |
| Muted text on the Models panel | 5.07 | 5.06 |

## 11. Not verified, and open

- The prototype is static HTML. Electron hosts, the real compact sheet and assistive technology were not tested.
- Per-model category values in the fixtures are split in proportion to model tokens; real per-model data replaces them.
- Reset times for agy and the Codex limit in `live-small` are sample or omitted values; they were not captured.
- No `loading`, `missing`, `resumed`, `empty` or rail capture in v3 (limit of 8); they render without errors.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Context and cache sit in the Orchestrator model line; cache leaves it at 340 px and below | model line / detail only | decision 12; 91 px name column at 300 | yes |
| Share bar hidden for a lower-bound total, kept and named "about" for an estimate | hide for both / show both | review gap 3 | yes |
| No budget = no tile, Models spans two columns | empty tile / hide | review finding 3, fixture note on `missing` | yes |
| Models detail is an inline disclosure | anchored popover / inline | `ptah-disclosure` has no anchored placement (component map) | yes |
| Row durations of 1 h or more use `1h26m` | wider column / compact text | 50 px Time column at 300 | yes |
