# Design spec v2 - session inspector sidebar (TASK_2026_2309_5bea)

Design of record: `prototype/v2/index.html` and `prototype/v2/screenshots/` (accepted by the orchestrator). This file documents it.

**Evidence limits of this document.** Written under a 10-call budget. Read in full: the `:root` token block, the rail CSS, the helpers (`num`, `time`, `ring`, `cue`, `tok`, `usd`, `clock`), the interaction handlers, and 3 screenshots (`lanes-400-dark`, `live-400-dark-selected-steer-error`, `rail-dark`). **Not read** (the file reader cut them): about 188 lines of section CSS and about 121 lines of render functions (`header`, `session`, `agents`, `limits`, `task`, `git`, `linked`). Items marked **[unread]** come from the brief or a screenshot, not from the code; take the exact value from the prototype CSS.

## 1. Principles

- Same density as the current sidebar: tile grid plus compact agent table (decisions 7, 8).
- Numbers first: each tile is label, one large figure, one small sub-line or bar.
- Markers, not sentences: accuracy is `~`, `≥`, `≥~` or a muted `—`; the cause is in the tooltip and the accessible label only.
- One section language for all seven sections: hairline divider, uppercase label left, muted caption or action right.
- One encoding per quantity: bar = share of a total, meter = use of a limit, ring = main-request context.
- Colour signals state only. Gold marks selection and the SDK series; warning and error mark limits.
- No "Not available" or "unknown" words in the layout.

## 2. Layout as built (400 px, top to bottom)

**Header.** Title (bold) left; icon actions right: rename, open folder, stop (red square, only while running), collapse to rail. Below: status chip (icon + label), workflow chip (`orchestrate`), branch chip (mono). The branch chip wraps to a second line when it does not fit (`lanes`) or truncates with an ellipsis (`live`). Attention banner, only when an agent asks: alert icon + one-line question + `Answer` button, full width, tinted background.

**SESSION.** Caption `all agents`. 3 x 2 grid, cells separated by hairlines:

| Cell | Figure | Second line |
| --- | --- | --- |
| Tokens | `25.9M` | two-segment source bar (SDK + CLI lanes) |
| Cost | `≥~$17.54` | two-segment source bar |
| Time | `42:17` (ticks while live) | `24 turns` |
| Agents | `10` | status dot + `1 live` |
| Models | `3`, chevron opens popover | `Fable +2` |
| Budget | `62%`; alert icon beside the label at warning | meter |

Legend row under the grid: swatch + `SDK 23.5M`, swatch + `CLI lanes 2.4M`.

**AGENTS.** Caption `1 running · 7 sub · 2 CLI`. Column header once: `Agent | Tokens | Cost | Time`, numeric columns right-aligned.
- Row: avatar (round, kind icon) with status badge at bottom-right; name (bold) over model (muted); Tokens with a thin share bar under the value; Cost; Time.
- Orchestrator row: no tokens or cost. Context ring + `6.7%`, then hourglass + cache countdown `58:38`. At 86% the ring and an alert icon take the warning tone (decision 10).
- Selected row: gold left edge and raised background; inline detail under it: `In 1.1M  Out 96K  Cache 2.4M`; steer input (`Steer <agent name>`) + send button + `...` menu (steer / background / stop); steer error line: alert icon + `Steer not delivered` + `Retry`.
- `Show 4 more` disclosure at the end; the selected row stays visible when collapsed.

**PLAN LIMITS.** Caption `3 providers`. Optional stale notice: alert icon + `Limits last refreshed 14 min ago`. Per provider: name (bold) + account id (mono, muted), percentage right (alert icon before it at warning), full-width meter, then `Weekly · resets Sat 28 Nov 04:59` left and source chip (`API` / `CLI`) right.

**TASK.** Task id chip (mono) right of the label. Title (bold). Status chip + phase (`design`) + progress meter + `3/7`. File chips (`task-description.md`, `design-spec-v2.md`, `+4 files`, `+2 related`).

**GIT.** Action `Review changes` right of the label. Branch icon + branch (mono) left; `+128` (success tone) and `−42` (error tone) right.

**LINKED SESSIONS.** Count right of the label. One line per session: title left, relation right (`this session`, `parent`, `child`). The current session has a gold left edge and raised background, like a selected agent row.

**Rail (56 px).** Expand chevron; up to 3 avatars with status badges; `+7`; divider; `Tok 25.9M`; `Cost ≥~$17.54`; ring + `86%` + alert icon. Each metric is a button that expands the pane to 400 px.

## 3. Shared rules

Tokens read from the prototype `:root` (dark `anubis` / light `anubis-light`):

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--b1` / `--b2` / `--b3` | `#131317` / `#1a1a20` / `#242430` | oklch 97.8% / 94.0% / 91.6% | pane, raised row, chip and track |
| `--bc` | `#e8e6e1` | `oklch(23.574% 0.066 313.189)` | figures, names |
| `--bcm` | `oklch(66.5% 0.0074 31.09)` | `oklch(48.96% 0.0448 348.48)` | labels, captions, markers, unknown |
| `--gold` | `#d4af37` | `oklch(58% 0.132 75)` | selection edge, share bar |
| `--series-1` / `--series-2` | `oklch(78% 0.14 85)` / `oklch(76% 0.12 180)` | `oklch(52% 0.12 75)` / `oklch(50% 0.1 180)` | SDK / CLI lanes |
| `--st-run` `--st-need` `--st-err` `--st-done` `--st-idle` | `#3b82f6` `#f97316` `#ef4444` `#16a34a` `#9ca3af` | `#2a56c6` `#8f5200` `#b4232a` `#13713a` `#6b6570` | status badges, tones |
| `--r-box` / `--r-btn` / `--r-chip` | `.75rem` / `.375rem` / `.25rem` | same | radii |
| `--hl` | `13%` | **[unread]** | highlight mix |
| `--shadow-raised` | `0 12px 30px oklch(0% 0 0 / .42)` | **[unread]** | popover, menu |

- Also used: `--sp1`, `--line`, `--hover`. Their values, the section padding, the row height and the pane type scale are **[unread]**.
- Rail type and size (read): caption `.625rem`; figure `.6875rem` weight 600; marker `.5625rem`; ring 20 px; button 48 px wide, min-height 40 px; divider 32 px.
- Ring: 16 x 16 viewBox, r 6, arc never shorter than 3%; warning tone from 80%, error tone from 95%. The alert cue uses the same two thresholds.
- Number format: tokens `412` / `1.2K` / `88K` / `25.9M`; cost `$0.31`; time `m:ss`, or `h:mm:ss` from one hour.
- Status = icon shape + colour: done check (green), running dot (blue), failed x (red), stopped and idle square (grey), needs-you exclamation (orange).
- Tone mapping asked by the brief: limit → error, tighten/handoff → warning, default → gold. **Discrepancy to settle:** in the two screenshots the Budget meter at 62% and the plan-limit meters at 41% and 6% have a neutral grey fill, not gold; warning (91%, 83%) is orange. The fill rule in the CSS is **[unread]**.
- Motion: every animation and transition is off under `prefers-reduced-motion: reduce`.

## 4. Stat-to-component map

The first three rows were read in the code (`data-component`). The others are named by the brief; their attributes are in the unread render functions.

| Element | Component | Status |
| --- | --- | --- |
| Tile and cell figures, markers, unknown `—` | `ptah-stat` | confirmed |
| Session Time, row Time, unknown `--:--` | `ptah-timer` | confirmed; gap: live duration, see section 11 |
| Orchestrator context, rail context | `ptah-ring` | confirmed |
| Budget, plan-limit and task-progress meters | `ptah-meter` | [unread] |
| Cache countdown | `ptah-countdown` | [unread] |
| Agent table cells | `ptah-table` cells | [unread] |
| Section frame and header | `ptah-surface-section` | [unread] |
| `Show N more`, Models popover, file chips | `ptah-disclosure` | [unread] |
| Two-segment source bar and its legend | none | **gap** |
| Share bar in the Tokens cell | none | **gap** (or a `ptah-meter` variant) |
| Avatar with status badge | not determined | check for an existing shared avatar |

## 5. Accuracy markers

| State | Rendering | Cause |
| --- | --- | --- |
| Estimate | `~` before the figure, muted, smaller | tooltip |
| Lower bound | `≥` | tooltip |
| Both | `≥~` | tooltip |
| Unknown value | muted `—` | tooltip + `aria-label` (default `Not reported`) |
| Unknown duration | muted `--:--` | tooltip (default `Duration not recorded`) + `aria-label="Duration unknown"` (decision 5) |
| Known zero | `0`, `$0.00`, `0:00` | none |

Fixtures in the prototype selector: `lanes`, `exact`, `partial`, `missing`, `live`, `resumed`, `loading`, `empty`. Confirmed by screenshot: `lanes` shows `≥~` on Cost; `live` shows the banner, warning tones and the steer error. Which marker each of the other six shows is **[unread]** (the fixture code was cut, and `missing-400-dark.png` and `resumed-400-dark.png` were not opened).

## 6. Responsive

- Widths in the prototype selector: 300, 336, 360, 400, 448 px, and the 56 px rail. The pane width is set on the root; there is no viewport media query in the part read.
- Seen at 400 px: the layout of section 2. Header chips wrap or truncate with an ellipsis.
- 300 px has a screenshot (`lanes-300-dark.png`) that was not opened. 336, 360 and 448 px have no screenshot. Column and tile behaviour at these widths is **[unread]**.
- Rail: section 2. Any rail button expands to 400 px.

## 7. Accessibility

- Pane: `<aside aria-label="This session">` with a polite `role="status"` live region. It announces `Steer sent`, `Stop requested`, `Moved to background`.
- Ring SVG and alert cue are `aria-hidden`; the value and scope are on the control. Rail labels: `Main request context 86 percent`, `Session cost <value or cause>`. **Requirement for the implementation:** every bar and meter exposes value + scope the same way (for example `SDK 23.5M of 25.9M tokens`). The bar and meter aria in the prototype is **[unread]**.
- Status is never colour alone: each state has its own icon shape (section 3).
- Keyboard: a row is a button. Activating it selects or deselects it and keeps focus on it. Escape closes the actions menu or the Models popover and returns focus to its trigger. Opening the menu focuses its first item. `Steer` in the menu focuses the steer input. Tooltips show on hover and on focus.
- Contrast, criterion WCAG 2.1 AA (4.5:1 text, 3:1 graphics). Calculated by hand from the sRGB hex values, dark theme only; not measured with a tool: `--bc` on `--b1` ≈ 14.8:1; `--bc` on `--b2` ≈ 13.9:1; `--gold` on `--b1` ≈ 8.8:1.
- **Not measured:** muted `--bcm` text on `--b1`/`--b2`/`--b3` (dark), every light-theme pair, the status colours as text or badge, `--series-1`/`--series-2` against the track, and the grey meter fill against its track. These pairs need a measurement before implementation is accepted.

## 8. Parity checklist (`parity-inventory.md`)

| Group | Where in v2 |
| --- | --- |
| Frame: header, actions, close | Header; same content, chip style |
| Frame: Orchestrator request lines | Attention banner under the header |
| Frame: TASK, GIT, linked sessions | Same sections, new presentation (decision 9) |
| Frame: live region, rail / dock / sheet | Kept; the compact sheet is not in the prototype |
| Frame: rail metrics, context limit alert | Rail: Tok, Cost, ring + cue |
| Frame: session-switch transition | Not confirmed (an enter flag exists in the script; its CSS is [unread]) |
| SESSION: estimate legend | Replaced by markers + tooltips (section 5) |
| SESSION: context, context meter and cue | Orchestrator row ring; rail ring |
| SESSION: compaction count | **Not seen in v2.** Open question 1 |
| SESSION: tokens, cost (whole-session, accuracy state) | Tokens and Cost tiles |
| SESSION: token budget scope text and meter | Budget tile; the scope text is not visible, expected in the tooltip [unread] |
| SESSION: cost budget meter | **Not seen in v2** (one Budget tile). Open question 2 |
| SESSION: detail content and disclosure (token categories, coverage notes) | **Not seen in the screenshots opened.** Open question 3 |
| SESSION: time and turns | Time tile |
| SESSION: model disclosure, per-model breakdown | Models tile + popover (screenshot exists, not opened) |
| SESSION: cache TTL states | Orchestrator row countdown; idle / expired / low states [unread] |
| AGENTS: caption, column header | Kept |
| AGENTS: loading and empty feedback | Fixtures `loading`, `empty`; no screenshot |
| AGENTS: Orchestrator row | Redefined: ring + cache (decision 10) |
| AGENTS: row content, ordering, row VM states | Kept; In / Out / Cache move to the selected-row detail |
| AGENTS: CLI role label, start-time tooltip, live lane timing | Role label and start-time tooltip not confirmed [unread]; live Time ticks each second |
| AGENTS: selection, focus return, kept-visible rule | Kept |
| AGENTS: actions menu, steer input, steer error | Selected-row detail |
| AGENTS: request lines per row and outputs | Not confirmed in the reads; needs a check against the prototype |
| AGENTS: lane composer (second steering surface) | Not seen in v2 |
| AGENTS: list disclosure | `Show N more` |
| AGENTS: Total row | Moved to the SESSION tiles (decision 8) |
| PLAN LIMITS: provider count, refresh notice, provider and lane tiles | Kept, restyled (decision 9) |

## 9. User decisions applied

- Row 5: Time uses `ptah-timer`; unknown duration is a muted `--:--`; no zeroes for unknown.
- Row 7: restart from the current compact layout; numbers first; bars and rings in place of hint sentences; causes in tooltips.
- Row 8: current grid with true whole-session totals; two-colour source bar; share bar in the Tokens cell; Total row moved into the tiles; rows keep avatar + badge, name, model.
- Row 9: one visual system for the whole sidebar, PLAN LIMITS / TASK / GIT / linked sessions included.
- Row 10: Orchestrator row shows context ring + cache countdown, no tokens or cost.
- Row 11: designed by a `ui-ux-designer` subagent on `fable`.

## 10. Open questions and known gaps

Questions for the user (the answer changes what the sidebar shows):
1. Compaction count has no place in v2. Recommended: add it to the Orchestrator row tooltip. Alternative: a small count beside the ring.
2. Cost budget meter: v2 has one Budget tile. Recommended: the tile shows the stage's measure (R7) and the other measure goes in its tooltip. Alternative: two meters in the tile.
3. SESSION token breakdown by category (uncached input / output / cache read / cache creation) and coverage notes. Recommended: a popover on the Tokens tile, the same pattern as Models. Alternative: remove (needs a `Proposed Removals` entry).
4. Lane composer as a second steering surface. Recommended: keep one steer input in the selected row for both subagents and lanes, if the behaviour is equal.

Known gaps of the prototype and of this spec:
- Fixtures `exact`, `partial`, `loading`, `empty` have no screenshot. Widths 336, 360, 448 px have no screenshot. Light theme has one screenshot (`lanes`). The compact sheet presentation is not built.
- 5 of the 8 screenshots were not opened for this spec.
- Meter default tone: grey in the screenshots, gold in the brief (section 3).
- All **[unread]** items above. `prototype/v2/README.md` with `## Lane-introduced constraints` does not exist in `prototype/v2/`.
- Gate 1.7 for v2 is not recorded as passed in `decisions.md`.

## 11. Handoff to the architect

Data the design needs:
- **Whole-session totals** for tokens and cost with one accuracy state each (exact / estimate / lower bound / both / unknown) and the cause text. Needs a precedence rule when the SDK snapshot and the lane sums overlap or one is missing.
- **SDK vs CLI lanes split** of tokens and of cost (bar segments and legend). Rule needed when one side is unknown: a partial bar, or no bar.
- **Share-bar denominator** per row. In `lanes-400-dark.png` the 9.6M row looks full-width against a 25.9M total, so the prototype seems to scale to the largest row, not to the session total. The code is [unread]. Decide and document one rule; the aria text must name the same scope.
- **Orchestrator**: main-request context percentage (or unknown), cache countdown seconds with its idle / estimated / expired states.
- **`ptah-timer` duration gap**: the tiles and rows need an elapsed duration that ticks while live and renders `--:--` with a reason when unknown. Confirm that `ptah-timer` supports both, or extend it.
- **Caption sources**: `N running · N sub · N CLI`, `N live` in the Agents tile, `all agents`, `N providers`, turn count, model count and the first model name.
- **Budget**: percentage, stage (default / tighten / handoff / limit) and the measure it applies to.
- **Tooltip strings** for every marker and unknown value, built in one place, so the tooltip and the accessible label are the same text.

New shared-component gaps:
- Two-segment source bar with legend (series tokens, per-segment accessible text).
- Share bar for a table cell (or a `ptah-meter` size variant).
- Tone thresholds for `ptah-ring` (80 / 95) if the component does not have them.
- Accuracy marker prefix and muted unknown state on `ptah-stat`, if not present.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| File name `design-spec-v2.md`; `design-spec.md` (rev 1, rejected) left as is | overwrite rev 1 / separate v2 file | Orchestrator brief names this file | yes |
| Unread values are marked, not filled in | mark / estimate from screenshots | Role rule: no invented token values | yes |
