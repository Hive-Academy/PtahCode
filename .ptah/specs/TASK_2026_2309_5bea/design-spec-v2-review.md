# Gate 1.7 design review

- Artifact: design-spec-v2.md + prototype/v2/
- Artifact revision: 2
- Author: ui-ux-designer subagents, claude family, model fable
- Reviewer: codex CLI lane
- Round: 1
- Verdict: REVISE

The compact grid, icon/name/model rows and whole-sidebar styling follow decisions 7–11. Revision is required for misleading shares and totals, incorrect budget scope, and capability gaps. Keep the layout direction.

Evidence: read all 442 lines of the v2 HTML in ranges, traced the fixture and interaction branches, and compared all eight supplied v2 captures with `reference/current-sidebar.png`. Checked current inspector behavior and shared component APIs. Visual conclusions are limited to the supplied captures and CSS analysis. This document-only gate did not launch a browser or Electron or run tests. The Codex tool list exposed no native skill loader. Used the on-disk `ui-ux-designer` and `angular-frontend-patterns` instructions, with Ptah file search/API enrichment and native targeted reads for exact source and template details.

## Known gaps 1-7

### 1. Extracted dimensions, tokens and ARIA

| Item | Prototype value or behavior |
| --- | --- |
| Section | `.sec` padding `.75rem` (12 px at 16 px root), 1 px top divider. Header 16 px high with 8 px bottom margin and 8 px gap. Header frame padding 12/8/12/12 px. Generic section rows have 10 px between siblings. |
| Agent row | No fixed height. 6 px top and bottom cell padding, 26 px avatar, name/model line heights 17 + 14 px. Nominal 43 px for both lines, before expansion. Token cell has a 3 px gap above a 2 px bar. |
| Type | Body 12/16 px, weight 400. Header title 14/20 px, 600. Tile figures 18/24 px, 600, reducing to 16/24 px when container ≤340 px. Row name 13/17 px, 600. Row numbers 12/16 px. Captions 11 px (section headings 11/16 px, 600, .06em tracking), model 11/14 px, tile subline 11/16 px or 10/16 px at ≤340 px. Tabular figures with nowrap. |
| Tokens | `--sp1:.25rem`, `--sp2:.5rem`, `--sp3:.75rem`, `--sp4:1rem`. `--line:color-mix(in oklch,var(--bc) 14%,transparent)`, `--line-strong` 22%, `--hover` 5%, `--meter-fill` 62%. Light `--hl:10%`, shadow `0 8px 24px color-mix(in oklch,var(--bc) 18%,transparent)`, radii 1rem/2rem/1rem (box/button/chip). Dark is 13%, `0 12px 30px oklch(0 0 0 / .42)`, .75/.375/.25rem. |
| Bars and rings | 3 px tracks, pill ends, 2 px segment gap, 2 px min segment width. Ring 16 px, 20 px rail, 2.5 SVG stroke, known arc visually floored at 3% including zero. Alert/arc warning at 80%, error at 95%. |
| Meter ARIA | Budget `role="meter"`, label “Budget used”, min/max 0/100 and percent now. Plan meters same role/range, label “{provider} {window} limit used”. Neither exposes basis/state in `aria-valuetext`. TASK is `role="progressbar"`, completed count now, total max, “{done} of {total} tasks complete”. |
| Bar/ring ARIA | Source bar `role="img"`, “SDK {value}, CLI lanes {value}”, without total, metric or coverage. Row share bar has no ARIA or denominator in its tooltip. Ring SVG and cue are hidden. Orchestrator generic wrapper has “Context {percent} percent” or “Context unknown”; generic-span naming is unreliable. Rail context button names main-request scope and value, but neither ring control announces whether the cue is active. |

Source: `prototype/v2/index.html:18–45,56–99,113–174,189–223,257–262,315–340,342–350,373–403`.

### 2. Budget and plan meter tone

Both normal fills are neutral foreground at 62% opacity. Prototype Budget is orange for literal `stage:'warn'`, red at ≥100% regardless of stage. Plan limits are orange from 80%, red from 100%. The default grey is visible for Budget 62%, Claude 41% and Codex 6%. R7 is specifically about **session Budget**. Current `inspector-session-stats.component.ts:501–506` uses gold/default, warning/tighten or handoff, error/limit. Current provider lane limit meters use green (`ok`) for normal, warning based on tile state or ≥75%, error based on tile state. The green is visible in the current reference. Use one semantic rule: shared stage/state-driven tones, with gold for normal Session Budget, success for normal provider usage, and warning/error driven by their respective existing owners. Preserve plan-limit threshold, window and provider behavior while sharing the meter styling. Any deliberate neutral restyle of normal Plan Limits should be documented as presentation under decision 9, with warning/error behavior retained. [Finding 3](#findings)

### 3. Row share denominator

`agents()` chooses the largest `a.t` across the roster, including hidden rows, with a minimum denominator of 1. `agentRow()` floors each filled width at 6%. In the lanes fixture 9.6M fills 100% of its bar at a 25.9M session total (about 37% at face value). Even the 88K row and a known 0 receive at least 6%. The user chose **share** and the requirements decision specifies whole-session denominator. Use the independently owned, comparable row's tokens divided by the deduplicated R1 whole-session tokens. Skip the share for the Orchestrator, unknown/incompatible numerator, or a missing, zero or non-comparable denominator. Use a true zero-width fill for known 0 against a positive total. Prefer suppressing the proportional graphic when either amount is incomplete/estimated unless the relationship and uncertainty can be faithfully named. A partial denominator can inflate the ratio and does not give a lower bound on share. Give eligible bars a value and scope in accessible detail. The session split uses contributions to the same total, with unknown sides explicitly represented in detail and no full partition implied for incomplete coverage. [Finding 2](#findings)

### 4. Parity items

See the [parity matrix](#parity) for each named item, including where the prototype renders it and required disposition. Compactions and the rail context cue are present. The model popover contains SDK-wide categories, and the selected row contains a request preview. Those surfaces cover only part of current detail and request behavior.

### 5. Fixture and accuracy trace

The fixture JS hard-codes display values/markers. It supplies visual examples of a few precedence states and leaves R2 aggregation checks to implementation.

| Prototype fixture | Rendered by current JS | R1 / fixture disposition |
| --- | --- | --- |
| `exact` | 23.5M / $14.92, both unmarked, SDK only | Matches F1 shape. F3 (both sources complete and exact) has no example. |
| `partial` | 23.5M / ≥$12.51. Sonnet row/model cost becomes `—`. Tooltip names missing price. | Matches F2 marker shape. F4 (missing lane cost with no included estimate) has no representative fixture. |
| `lanes` / `live` | 25.9M unmarked / ≥~$17.54. Codex cost ~$2.62; Gemini cost `—`, Gemini tokens ~200K. | Combined cost marker is correct for included estimated cost and missing lane price (F6 state). The fixture includes estimated 200K in the CLI token subtotal, so the total needs `~25.9M` if comparable. If basis differs, exclude it and mark the remaining sum as a lower bound. Neither fixture demonstrates provisional SDK-only F5. |
| `missing` | Muted `—` for session and ordinary row tokens/cost, models, context; cache group absent. Existing known durations/turns remain. | Usage matches F9. Cache unknown behavior separately needs parity. Budget label persists despite no configured budget. |
| `resumed` | Same usage as `lanes`. Session and finished rows use muted `--:--`; 24 turns remain; base-running row retains its time and can tick. | Duration placeholder correct. Hard-coded resumed cause is in tooltip only, generic ARIA says “Duration unknown”. Inherits token marker defect. The JS's count of 0 live disagrees with the still-running row. The resumed capture shows that row as done and says “none live”, while the current code emits “0 live”; derive the fixture behavior from the JS. |
| `loading` | Six SESSION skeleton tiles, four AGENTS skeletons, both busy; other expanded sections hidden. Rail bypasses these branches and reads the cloned populated base. | Expanded hides usage values. Rail incorrectly exposes fixture totals as settled during loading. |
| `empty` | No SESSION grid, no token/cost rail buttons, idle Orchestrator with unknown context, no cache or explicit empty roster feedback. | No false usage zero. Needs a distinct empty roster state for R5.6. |

`tok(0)`, `usd(0)`, and `clock(0)` yield `0`, `$0.00`, and `0:00`; stopped Agent `a6` exercises the duration branch. F7 exact reported zero, F8 zero + missing (`≥0` / `≥$0.00`), and F10 partial snapshot (`≥` on both) have no end-to-end fixture equivalents. Preserve F1–F10 as architecture acceptance cases with both metrics and spoken causes. Keep genuinely known agent duration zero distinct from session `durationMs:0` used as unavailable under R8.2. For bounds, use precision/rounding that cannot claim a higher minimum than the underlying known amount; provide full values on focus, hover and to AT. [Finding 1](#findings)

### 6. Widths

| Width | Evidence and risk |
| --- | --- |
| 300, 336 | ≤340 px container branch. Chips may wrap, tile padding reduces to 6 px horizontally and figure to 16 px. At 300 the supplied fixture numbers fit, but the visible Orchestrator and several agent names truncate. At 336 the same source constraints apply with 36 px more name space. |
| 360, 400, 448 | Base 18 px tile figure and 10 px horizontal padding. Table gains width only in its name column. 400 dark/light captures fit sample numbers; 360 and 448 have no capture. The 400 dark lane capture wraps the branch chip, but the current CSS only enables chip wrapping at ≤340 px, so use the source rule for implementation. Two-line header title clamp and branch/chip ellipsis are intentional. The 360 compact-sheet mount still needs an explicit design handoff and host verification. |
| Rail 56 | 48 px buttons, 11 px figures and 9 px markers. Sample numbers fit narrowly. Larger costs with a prefix can exceed the button/rail. No overflow fallback or target section focus in JS; expand always sets 400 px. |

Numeric columns remain 54/62/58 px at every expanded width, leaving about 46/54/38 px after padding. `.num` prohibits wrapping but supplies no fit or full-value strategy. Long hour strings (e.g. `100:00:00`), larger currency with markers, long plan/task/Git numbers and compact localization can overflow or collide. The Models popover also fixes numeric columns at 64 px, stacks four auto-sized category columns and overlays the next section. Agent names/models ellipsize and the focus tooltip currently shows the status, not the full identity. Define a per-mount width budget with compact formatting and accessible full figures; verify long marked costs, large durations/counts, keyboard tooltip access and the compact sheet. [Finding 8](#findings)

### 7. Compound cost marker

At 400 px in both themes and at 300 px, the price is easy to pick out; the two muted glyphs run together at native screenshot size. The rail is hardest to read. The marker is weight 500 muted foreground, 1 px right margin, 12 px in the tile and 9 px on rail. Keep the prefix attached to its number. Give `≥` and `~` enough size, contrast and separation to read independently, and provide one accessible phrase such as “at least approximately …” with the cause in detail. No inline explanation is needed. [Finding 9](#findings)

## Requirement conformance

| Requirement | Gate judgment |
| --- | --- |
| R1 Whole-session totals | Revise. Headline location and exact/lower/combined/unknown examples fit. Estimated lane tokens lose their marker in the total; fixture and spoken states incomplete. |
| R2 Deduplication | Design keeps single SDK+CLI total and removes repeated row total. JS literals do not establish normalization, scope ownership or F1–F10 coverage. Carry precedence and scoped verification. |
| R3 Main-request / SDK detail | Revise. Context, compactions and model have places. Preserve cache state and scope/attribution, per-model categories and SDK subtotal. |
| R4 No duplicated Orchestrator total | Matches decisions 8 and 10 for summary layout. Keep labelled SDK subtotal in detail, including SDK-only sessions. |
| R5 Agents | Caption counts have labels and use roster independent of limits; shape/name pairing mostly present. Revise misleading live count/empty and width/accessibility risks. |
| R6 Shared components | Partial. Correct selectors exist for most primitives; the map needs the named API gaps and replacements below. Retain Electron dark/light verification for implementation. |
| R7 Budget | Revise. Fixture uses whole-session tokens; stage semantics, no-budget treatment, cost/known subtotal and weighted fallback need explicit handling. |
| R8 Duration | Visible `--:--` with preserved turns matches decision 5. Fix reason parity between hover and AT, and distinguish unavailable session zero from captured row zero. |
| R9 Existing capabilities | Revise. Expanded shell and rail are pictured; preserve missing actions, details, composer, rail/compact host behavior and state listed below. |

## Parity

Prototype buttons in static fixtures demonstrate placement. Existing hooks and outcomes are required in the shipping design. Keep every capability below or record an explicit proposed removal for the user to decide.

| Capability | Evidence in v2 | Required disposition |
| --- | --- | --- |
| Compactions and context | `agentRow()` 346–354. Context hover names used/capacity and compactions; selection exposes a labelled count and values. | Retain this placement and make both keyboard-accessible, including a known count when usage/capacity is unavailable. |
| Cost budget meter | `session()` 319, 331–332 has one generic tile with token-only samples; `missing` still shows “Budget” and a dash. | One slot can preserve the conditional cost/token capability. Bind the active stage measure with real limit and scope, partially priced cost lower bound and weighted fallback. Hide meter and budget text when unset. |
| SESSION token categories + coverage; cost explanation | `models()` 337–340 has SDK-wide Input/Output/Cache read/Cache write; exact/partial token tile has in/out. Tokens cannot open details. Cost tooltips include example price/estimate causes; category coverage and subscription/estimate basis details are missing. | Keep categories and coverage plus cost-basis detail reachable from SESSION, using existing labelled disclosures/tooltips with SDK scope. Preserve session-keyed disclosure state. |
| Per-model tokens/categories/cost + SDK subtotal | Models overlay has token total and cost per model only. Shared category strip is SDK aggregate; no SDK subtotal. | Keep per-model categories and SDK subtotal in the disclosure, including a single model and SDK-only sessions. Attribute the Orchestrator model only from reliable main-request data. |
| Cache states | `agentRow()` 349, 353 and tick code 436–437 give time/TTL and static idle tooltip for known cache. Missing cache silently removes group. No low/expired/estimated treatment; live text counts down but name and tooltip stay stale. | Keep existing estimated/idle/low/expired/unknown states and active-only time updates, with accessible state and no per-second announcements. |
| Lane composer | Selected rows get one generic steer form gated on running/needs at 355–359. CLI fixtures are done; no lane-specific composer exists. | Keep both existing steering surfaces and their eligibility and feedback. Any consolidation proposal needs behavioral proof and user approval if it removes a capability. |
| CLI run role label | 342–344 gives terminal icon, assigned name/model and generic “CLI lane” name only. | Retain actual run role when available, reachable in metadata/detail or focus/hover. |
| Start-time tooltip and live lane timing | No start timestamp rendered. Timer helper and interval tick generic `live` flags; fixtures exercise subagent/session time and cache, no live CLI timing demo. | Preserve start-time access and live lane timing. |
| Per-row requests and request outputs | `live` sets a request on `a4`. Selected `agentRow()` at 356 shows question + Answer. Live capture selects `a2`, so only the header request and steer error appear there. Answer has no handler. No lane request output, close/return focus or unselected-row request treatment shown. | Preserve request visibility and existing answer, lane, announcement and focus-release behaviors for row and header requests. |
| Rail metric buttons + limit cue | `rail()` 397–403 renders Tok/Cost/Context as buttons. Context cue appears at ≥80% with 95% error. `data-act="expand"` only sets width. Attention count/indicator from current rail is missing. | Restore SESSION-targeted activation, context target and main-request scope, existing limit/attention cues and accessible accuracy-state labels. Keep host focus and rail loading/empty feedback. |
| Agent ordering and selection | First six fixture rows remain in fixture order; selected row beyond fold stays visible. Thread opening/selection normalization across role transitions absent. “Show N more” can overcount hidden rows by one when selected row stays visible. | Preserve live-first/current ordering, conditional thread opening, remembered selection across transitions, focus and an accurate disclosure count. |
| Shell and surrounding sections | Header, Git, task files and linked sessions are visually mapped; several buttons are stand-ins. Settings are fixed fixture widths. SESSION enter animation occurs on fixture change, with no leave or session-key state. A live region exists, but `send` calls `say()` before replacing its DOM. | Retain existing actions/data providers, links and file/related disclosures, rail/dock/sheet mounts, session-switch leave/enter and durable announcements. |
| Plan limits and empty states | One percent/account/window per provider, source chip and optional stale notice; static prototype has simplified data model. Empty roster has Orchestrator alone. | Preserve session-provider-first order, source detail, provider/lane windows and extras, unavailable/status data and existing labels. Keep explicit empty vs loading feedback. |

## Component map

The HTML annotations are design intent. API checks use `libs/frontend/ui/src/lib/{charts,time,surfaces,patterns}`. Relevant badge and chat-specific selectors are noted separately.

| Design element | Verified component or required adaptation |
| --- | --- |
| SESSION figures, markers, unknown | `ptah-stat` is real. It supports `valueFormat`, `valueTone="muted"`, `placeholder` (set to `—`), `appearance="plain"`, media and default slots. Serve absent values through its supported empty value path. There is no separately styled/spoken accuracy prefix or value replacement slot for a timer. Use a compact extension or composition for this exact gap and handle tooltip/focus reason. `layout="tile"` uses larger value sizing and host clipping; check density with plain appearance. |
| Grid | `ptah-instrument-band` is real, but its public contract is segment data/selection and loading. It has no arbitrary tile projection for six rich stats. Use a CSS grid around real stat components. |
| Time | `ptah-timer` already ticks live from required `startedAt`, freezes via `endedAt`, supports `format="clock"` and has a start title. No elapsed-only input, `size` input or cause-aware `--:--` input. Use timestamp data where valid, with compact typography and an explicit fallback/composition for elapsed-only and unknown values. |
| Context | `ptah-ring` has `thresholds`, `tone`, semantic role, label/valueText, `bare`, `hideZeroArc` and `showValue`. Threshold capability already exists. `xs` is 24 px; the exact 16/20 px treatment needs a compact size. Handle unavailable outside a determinate ring. |
| Cache | `ptah-countdown` accepts `deadline`, `urgentBelowMs`, clock format, inline layout, small size, label, and expired event. Use or adapt existing inspector cache state to carry estimated/idle/frozen and unavailable behavior; deadline-only countdown does not own those domain states. |
| Budget, plan limits, task progress | `ptah-meter` supports one value/max, label/valueText, tone, hidden duplicate labels/value, `meter` and `progressbar` roles. `xs` height is 4 px at default root. A compact size is needed if 3 px is required. Keep existing provider limit components feeding it. |
| Two-color token/cost split and legend | `ptah-meter` has one fill with optional marker/stripes, no multi-series proportions or legend. No shared `ptah-legend` in these APIs. Add a small segmented variant or justify scoped markup with comparable sources, zero-length handling and accessible scope/coverage. |
| Table and shares | `ptah-table`, `th[ptahNumeric]` / `td[ptahNumeric]`, `ptah-table-row-title` (mark and secondary slots) and row/detail directives are real. `td[ptahBarCell]` is absent. Reuse numeric cell + `ptah-meter` where appropriate, with documented 2 px size gap and correct share semantics. |
| Frames and metadata | `ptah-surface-section` and `ptah-description-list` are real. Section exposes tone, md/lg padding and surface treatment, so check if compact 12 px needs composition. Compact descriptions and projected items fit details. Real badge selector is `span[ptahBadge]` (separate badge library). No composite kind-avatar and overlaid status badge found in named shared APIs; use existing inspector row icon/mark composition. |
| Disclosure and popover | `ptah-disclosure` supports inline controlled content (`open`, summary, region, size); no anchored dialog placement contract. Use the shared inline pattern where it fits, and a focus-managed anchored popover for Models if retaining the overlay. File/open and related-task actions keep their existing contracts. |

## Noise check

The screenshots preserve a two-row SESSION grid and six initial agent rows with one header. Table rows are more compact than the current reference, and the wrapped Total row is gone. At 400 px in the dark lane fixture, PLAN LIMITS begins near y=665 compared with about y=667 for the supplied current reference despite the added SESSION heading and source legend. At 300 px the same number of rows stays visible in roughly the same vertical space, with more name ellipsis. The flat, repeated dividers, aligned values and consistent chips give secondary sections the same visual hierarchy. This is a capture comparison of different fixtures and widths.

- The repeated `this session` relation on the already selected linked row is the only screenshot label that can be omitted visually if current/relationship remains exposed. The duplicate branch in header and GIT is existing decision/parity territory; the GIT row pairs it with review and diff data.
- Exact/partial JS also emits `this session` below Cost even with a SESSION heading and `all agents` caption. That subline can be empty when it carries no measure, basis or coverage information. The supplied lane captures use a source bar there.
- The stale timestamp, live request, `Steer not delivered` and `Retry`, provider source/reset, agent state and scope labels carry information or actions. Keep them conditional. Prototype-control instructions are outside the screenshot pane.

## Accessibility

- Status badges pair shape and color: check, dot, x, exclamation and square. Stopped and idle share a square and tone, so their textual names matter. Agent button labels include name/kind/status but omit model and actual CLI role. Rail avatar states are tooltip-only with hidden SVGs and no focus target or accessible name. Distinguish “running” from “needs you” in counts and names.
- Main-request ring alert and cache state need named value/scope/state. Centralize visual and spoken R1 markers, unknown reasons, full values, and scope for each share, segment and meter. The prototype's generic `aria-label` spans and unassociated `role="tooltip"` do not establish those semantics. Use associated descriptions and keyboard reachability, including non-button stat detail. Keep reduced-motion handling.
- Focus-visible outlines exist. Clicking the row-button keeps focus on it after rerender. The menu focuses its first item and Escape returns to the trigger; Models Escape returns to its tile. Row expansion lacks `aria-expanded`/controls, `Show more` has expanded but no controls, and Models declares a dialog while focus stays on the trigger; next tab can go behind the overlay. Supply correct focus order, keyboard menu movement and controlled panel semantics where used. Dismiss tooltips on Escape/blur and restore focus after request close, collapse/expand and retry. Keep live announcements across updates.
- The compound prefix contrast/legibility and muted text, status glyph, series and meter track contrast need Electron dark/light verification. Static captures confirm presence and relative legibility, with no measured contrast or assistive-technology result in this review.

## Findings

1. **Serious — usage accuracy can be misstated** (R1–R2; HTML 267–293, 323–326, 401–403). Correct the mixed token total marker or exclude the incomparable source with a lower-bound state. Write one explicit per-metric precedence contract for tile, detail, source split and rail, including F1–F10. The rail loading branch currently exposes populated fixture totals. Carry coherent live counts and spoken accuracy/cause.
2. **Serious — misleading share encoding** (decision 8; task-description rev 3 share decision; HTML 350, 362). Replace maximum-row scaling and positive minimum fill with the R1 session denominator and truthful eligibility/precision rules in gap 3. Fix source bars that imply complete coverage where lanes are missing.
3. **Serious — Budget compares a misleading scope and omits eligible states** (R7 and parity; HTML 269, 289, 293, 319–332). The base 25.9M of 42M uses SDK+CLI vs the stage's snapshot basis (23.5M SDK in that fixture). Specify active measure, matching numerator/limit, dollar and partial-price support, both weighted fallback cases, no-budget hiding and stage-driven tones. A tooltip for a removed active cost meter alone would fail parity.
4. **Serious — SDK and main-request detail parity is incomplete** (R3–R4, R9; HTML 337–340, 346–354, 436–437). Preserve SESSION categories, coverage and cost-basis detail, per-model categories plus SDK subtotal, and cache estimate/idle/low/expired/unknown states in the named surfaces. No removal approved. Compactions already have a location.
5. **Serious — steer/request and roster parity is unresolved** (R5.6, R9; HTML 293, 296, 353–371, 415–430). Specify both steering surfaces, actionable requests with outputs/focus return, same thread eligibility and selection transitions. Keep CLI run role/start-time information, live lane timing and explicit empty feedback. A generic steer form and unhandled Answer button are insufficient evidence for preserving these behaviors.
6. **Serious — rail and host parity is unresolved** (R9; HTML 397–430). Preserve rail attention and limit cues, metric target/focus and accessible states, all three mounts and session-switch announcements/transitions. Carry current PLAN LIMITS, TASK, GIT, linked-session and frame behaviors through the redesign.
7. **Serious — visual-only accuracy and inaccessible details** (R1.7, R5.5, R9.7; HTML 257–262, 315, 323–350, 397–435). Define spoken state/reason and full value access for known estimates/bounds and unknown placeholders, including Time. Ensure a keyboard-operable, correctly labelled detail disclosure/focus path that preserves the same information. The visual markers themselves satisfy the non-color part.
8. **Moderate — fixed number boxes can overflow** (R5.4; HTML 63, 114–132, 137–151, 213–219). Carry a fit strategy and checks for the stated widths, all hosts, long numeric strings, and focus/hover/AT access to full values and truncated identity. Sample captures show no wrapped values.
9. **Moderate — small compound marker is hard to parse** (HTML 64, 122, 218–219; lane and rail captures). Increase legibility within the existing number line, especially in the rail.
10. **Moderate — shared component map and tone details need correction** (R6; spec §§3–4, 11). Adopt the real APIs in the map above, isolate exact missing capabilities and preserve provider meter state mapping. Keep the contrast and compact-sheet checks for implementation verification.
11. **Minor — redundant conditional copy** (HTML 326, 395). Use the noise check to trim duplicate scope text while retaining meaning in labels and detail.

## Carry to architecture

- Keep the existing design direction and seven-section hierarchy. Carry the measured spacing/type values, real shared APIs and the identified gaps in size, segment and value composition.
- Use one normalized R1 model for expanded and rail totals. Record ownership, comparable units, SDK coverage and price provenance, and use F1–F10 for scoped verification. Model Budget separately with its stage-defined snapshot measures.
- Reuse the existing inspector integrations for capabilities called out in the parity matrix. Retain dedicated compact sheet and rail activation behavior and session-keyed state.
- Verify the revised artifact in the project's Electron review at the dock's configured minimum and default, the 360 px compact sheet, and 56 px rail, with 300/336/360/400/448 px design samples as applicable. Cover both themes, long values and accuracy prefixes, keyboard/focus and AT labels. Use the supplied current screenshot as the density baseline.
