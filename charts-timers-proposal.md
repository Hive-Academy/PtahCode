# Proposal: chart, timer and countdown families

Date: 2026-11-12. Task: TASK_2026_970_fa60. Status: proposal, no code changed.
Plan used: `.ptah/specs/TASK_2026_924_8ac1/design-system-epic.md` (six steps, definition of done).
Raw evidence: `inventory.md` (code, file:line) and `web-research.md` (web, URL and date for each fact)
in this folder. Both were produced by a CLI lane and spot-read by the coordinator. All web facts
are dated 2026-11-12. Web text is untrusted data. Items marked "not confirmed" are not verified.

## 1. Need inventory

### 1.1 Charts today (all hand-made SVG or CSS, no library in `package.json`)

| Area | Evidence | Note |
|---|---|---|
| Usage stacked bars, cost donut | `libs/frontend/dashboard/.../usage-dashboard/stacked-bar-chart.component.html:38-110`, `usage-cost-donut.component.ts:22` | Own geometry files |
| Declarative dashboard line/bar, sparkline, stat, progress | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:74-108`, `dashboard-sparkline.component.ts:31-36` | Second, separate geometry (`charts/chart-geometry.ts:1`) |
| Vitals: spend bars, activity grid, ring | `libs/frontend/chat-ui/.../vitals/spend-bars.component.ts:31-40`, `activity-grid.component.ts:86-92`, `progress-ring.component.ts:32-46` | |
| Context ring | `libs/frontend/chat-ui/src/lib/atoms/context-ring.component.ts:13-36` | Duplicate of progress ring |
| Plan limit bars | `plan-limit-tile.component.ts:137-149` and `:235-247`; `provider-lane-limit-tile.component.ts:24,57`; `plan-window-detail.component.ts:59`; `provider-account-tile.component.html:33-34` | 5 copies of a track and fill |
| Budget and progress | `session-budget-banner.component.ts:72`, `workspace-indexing.component.html:146-156`, `onboarding/.../step-meter.component.ts:4` | |
| Stat cards | `marketplace/.../stat-card.component.ts:66`, `vitals/stat-cell.component.ts:45` | |
| Benchmarks | `skill-synthesis-ui/.../scorecard-detail.component.ts:41-51,93-138` | Metrics as text. No trend chart yet. |
| Existing owner | `libs/frontend/ui/src/lib/foundation/meter.component.ts:5-9` (`ptah-meter`) | No chart owner in `libs/frontend/ui` |

Duplicates an owner would replace: two chart geometry sets (usage and declarative), two rings,
five meter bars, two stat cells.

### 1.2 Time today

| Area | Evidence |
|---|---|
| Shared wall clock | `libs/frontend/core/src/lib/services/wall-clock.service.ts:39-83` |
| Shared countdown clock (Machines only) | `libs/frontend/machines-ui/src/lib/services/countdown-clock.ts:6-12,33` |
| Own intervals (should join one clock) | `plan-limits.store.ts:304` (30 s), `generate-agents.page.ts:456` (250 ms), `analyze-workspace.page.ts:442`, `machines-view.component.ts:384`, `background-task-tiles-container.component.ts:57`, `subagent-lane.component.ts:379`, `voice-input.service.ts:221`, `canvas.store.ts:200`, `agent-monitor.store.ts:830`, `boot-status.service.ts:334`, `back-office-activity.service.ts:153` |
| Elapsed time | `agent-card.component.ts:160`, `agent-card-header.component.ts:180-215`, `agent-monitor.store.ts:494` |
| Reset and cooldown text | `plan-ring.component.ts:22-45`, `plan-limit-tiles.ts:361-378,592-602`, `lane-tiles.ts:327-359` |
| Session budget and runtime cap | Budget shows tokens and cost only (`session-budget-format.ts:57-68`). A runtime-cap clock does not exist yet. |
| Duplicate duration formatters (7) | `dashboard/.../format.utils.ts:162`, `session-stats-format.ts:34`, `inspector-agent-list.ts:197`, `workspace-indexing.component.ts:209`, `scorecard-detail.component.ts:249`, `clone-action-gating.ts:206`, shared `formatDurationMs` used by `duration-badge.component.ts:2-19` |
| Duplicate relative-time helpers (6) | `session-display-utils.service.ts:30`, `command-relative-time.ts:2`, `format.utils.ts:197`, `cron-format.ts:51`, `storage-health-panel.component.ts:64`, `workspace-indexing.component.ts:70` |

CSP: `apps/ptah-electron/scripts/copy-renderer.js:160` sets `style-src 'self' 'unsafe-inline'`.
The preparing page is stricter (`preparing-workspace.html:7`). No remote host is allowed.

## 2. Chart library comparison

Facts from `web-research.md`. Sizes are Bundlephobia whole-package estimates, not measured in this
app. Do not add wrapper and engine sizes as a reliable total.

| Library | Latest (npm date) | Angular 22 | Licence | min/gzip kB | Draw | Main point |
|---|---|---|---|---|---|---|
| ECharts + ngx-echarts | 6.1.0 (2026-05-19) + wrapper 22.0.0 (2026-06-11) | Peer `>=22` | Apache-2.0 + MIT | engine 1114.8/368.0 full, modular import smaller; wrapper 34.6/9.3 | Canvas or SVG | Most features. Largest. ARIA is opt-in. CSS variables have limits. |
| Chart.js + ng2-charts | 4.6.1 (2026-10-22) + 11.0.0 (2026-09-29) | Peer `>=22` | MIT + MIT | engine 204.7/69.6, register only needed parts; wrapper 5.5/2.0 | Canvas | Small. Canvas needs own text alternative and JS theme read. |
| ApexCharts + ng-apexcharts | 8.8.1 (2026-11-08) + 3.2.0 (2026-10-09) | Peer `>=20` | Custom, with commercial terms above a threshold | engine 947.5/277.3; wrapper 18.4/3.8 | SVG | Licence risk. Tree shake not confirmed. |
| @swimlane/ngx-charts | 25.0.3 (2026-10-05) | Peer `^22.0.0` | MIT | 816.4/114.2 | SVG | Heavy for what it adds. Tree shake not confirmed. |
| D3 own components | 7.9.2 (2026-11-03) | n/a | ISC | whole 280.9/93.2; import single modules | SVG or Canvas | Full control. All a11y, theme and tests are ours. |
| Own inline SVG | none | n/a | none | 0 library | SVG | Fits sparkline, meter, ring. Already used in the code. |
| Unovis (extra) | 1.8.1 (2026-11-10) | Peer 20-22 | Apache-2.0 | not confirmed | not confirmed | Worth a prototype only if complex charts are needed. |

Not confirmed (from the lane, not resolved): zoneless and signal behavior of every wrapper, CSP
details (eval, worker) of every library, per-library open issue trend, Unovis bundle size.
Peer ranges prove install only. A prototype in the zoneless Electron renderer must test live input
change, resize and theme switch before the final choice (Angular zoneless guide:
https://angular.dev/guide/zoneless).

## 3. Recommendation

At most two:

1. **Chart.js 4 with `ng2-charts` 11** for real charts (line, area, bar, doughnut, trends over time,
   benchmark trends). Reasons: MIT, smallest full engine (about 70 kB gzip whole, less with tree
   registration), Angular 22 peer range, canvas needs no style injection, no commercial licence.
2. **Own inline SVG** (no dependency) for sparkline, meter, ring and stat. The code already does
   this. The family only removes the copies.

Why not ECharts: about 5x the engine size, and the app needs simple charts. Keep as the fallback
if a prototype fails on Chart.js (for example heatmaps, many series). Why not ApexCharts: custom
licence. Why not ngx-charts: large, little gain. Why not D3 only: we would write axes, tooltip and
a11y for every chart.

Timers and countdowns: **no library.** A small own service is better than a dependency (see 4.3).
The existing `WallClockService` and Machines `CountdownClock` show the pattern.

Cost:

- **Bundle:** about +70 kB gzip at most for Chart.js plus 2 kB wrapper (Bundlephobia estimate,
  not measured here). The renderer budget value was not read in this research. Not confirmed:
  whether the budget has room. Lazy-load the chart owner with `@defer` or a lazy route so the
  initial bundle does not grow. Measure in PR 2.
- **Licence:** MIT, no obligation beyond the notice in third-party licence lists. Check that the
  Electron packager lists the notice.
- **Electron `validate-deps` gate:** the renderer is bundled by Angular, so Chart.js is not a
  runtime external dependency of the main process. Not confirmed: the exact rule of the gate.
  PR 2 must run it (`apps/ptah-electron` validate-deps build gate runs on push).
- **VS Code webview host:** same Angular bundle. Canvas and inline styles fit CSP `style-src
  'unsafe-inline'`. The VS Code webview CSP was not read. Not confirmed. Electron is the first
  host. Verify VS Code only if the user asks.
- **Theme:** Chart.js cannot read CSS variables in canvas. The wrapper component must read computed
  token values and rebuild the chart on theme change (dark and `ptah-glass-light`).

## 4. Component proposal

All owners in `libs/frontend/ui`, exported from `@ptah-extension/ui`, folders added to
`TOKEN_ONLY_DIRS`, gallery section for each variant and state, accessibility spec, ratchet roots.
Standalone, OnPush, signal inputs.

### 4.1 Family A: meters and light charts (no dependency)

| Component | Key inputs | Replaces |
|---|---|---|
| `ptah-meter` (extend) | `value`, `max`, `tone`, `size`, `label`, `indeterminate` | 5 bar copies, budget bar, step meter |
| `ptah-ring` | `value`, `max`, `tone`, `size`, `label` | context ring, progress ring, plan ring |
| `ptah-sparkline` | `values`, `tone`, `area`, `label` | declarative sparkline |
| `ptah-stat` | `label`, `value`, `delta`, `trend` | stat card, stat cell |

A11y: meter and ring use `role="meter"` or `progressbar` with `aria-valuenow`, `aria-valuemin`,
`aria-valuemax` and an `aria-label`. Sparkline has a text alternative ("trend, from X to Y").
Color is never the only signal (text value always shown).

### 4.2 Family B: chart wrapper (Chart.js)

| Component | Key inputs |
|---|---|
| `ptah-chart` | `type` (`line`, `bar`, `doughnut`), `series` (typed, Zod-checked at the edge), `labels`, `valueFormat`, `tone[]` or `palette`, `height`, `ariaLabel`, `summary` (text takeaway), `showTable` |

- Reads token colors from computed style. Rebuilds on theme change. Registers only used parts.
- A11y: canvas has `role="img"`, `aria-label` and the `summary` text. A visually hidden data
  table (or toggle "Show data") gives the exact values. No chart is the only source of a number.
- `prefers-reduced-motion`: set Chart.js `animation: false`.
- First adopters: usage dashboard line/area trend, benchmark trend. The existing stacked bars and
  donut can stay SVG until Family B proves equal (decision for the user, see 6).

### 4.3 Family C: time

| Component or service | Purpose |
|---|---|
| `ClockService` (in `libs/frontend/core`, extends or replaces the role of `WallClockService`) | One interval for all timers. Signal `now`. Cadence of 1 s. Components subscribe with a needed granularity. The interval runs only while at least one consumer exists. |
| `ptah-timer` | Elapsed time from `startedAt` (and optional `endedAt` to freeze). Output `hh:mm:ss`. `role="timer"`. |
| `ptah-countdown` | Time left to `deadline`. Inputs `deadline`, `urgentBelowMs`, `format`, output `expired`. Tone changes below the urgent limit. |
| `ptah-relative-time` | "5m ago" or "in 5m" in a `<time datetime>` element. Update rate depends on age (1 s, 1 min, 1 h). |
| Pure helpers `formatDuration`, `formatRelative` | One implementation. Replaces 7 + 6 copies. |

A11y policy: `role="timer"` has implicit `aria-live="off"`. Keep it off for ticks. Announce only
state changes (for example "less than 1 minute left", "expired") with a separate polite live
region. Never announce every second. Always give an absolute time in `title` or `<time datetime>`.
Reduced motion: no animated ring on countdown when the preference is set.

Background window: use Page Visibility. When the window is hidden, stop the display tick. On
return, recompute from timestamps (`Date.now() - startedAt`), never from a counted tick, so no
drift. Deadlines use epoch time, not tick count. Expiry events still fire on return.

Sources of truth: elapsed and countdown always derive from a timestamp. Plan reset text uses
the reset epoch from the plan-limit store.

## 5. PR plan

Each PR follows the six steps. Electron first. Commands use the rule from CLAUDE.md. The
`typecheck-templates` target is added whenever a template changes.

| # | PR | Projects | Verify |
|---|---|---|---|
| 1 | Time owner: `ClockService`, `formatDuration`, `formatRelative`, `ptah-timer`, `ptah-countdown`, `ptah-relative-time` + gallery + a11y spec | `ui`, `core`, `ptah-extension-webview` | `npm run verify -- -p ui,core` then `npm run verify -- -t typecheck-templates -p ptah-extension-webview` |
| 2 | Chart spike: add Chart.js and `ng2-charts`, `ptah-chart` + gallery, token theme, lazy load, bundle measure, `validate-deps` check. **This PR changes `package.json` and the lock file: it needs user approval first.** | `ui`, `ptah-extension-webview`, `ptah-electron` | `npm run verify -- -p ui,ptah-extension-webview` plus the Electron `validate-deps` gate |
| 3 | Meters and light charts: `ptah-meter` extension, `ptah-ring`, `ptah-sparkline`, `ptah-stat` + gallery | `ui` | `npm run verify -- -p ui` |
| 4 | Look sheet and Electron screenshots (dark and light) for all three families, user approval | `ui` (docs only) | none (docs) |
| 5 | Adoption A: meters, rings (plan limits, budget, account tile, vitals) in batches of at most 6 files | `chat-ui`, `chat`, `dashboard` | `npm run verify -- -p chat-ui,chat,dashboard` |
| 6 | Adoption B: time (duration and relative helpers, own intervals to `ClockService`, onboarding, machines, voice, plan limits) | `core`, `chat`, `chat-ui`, `dashboard`, `machines-ui`, `onboarding`, `command-center`, `cron-scheduler-ui`, `memory-curator-ui`, `workspace-indexing`, `skill-synthesis-ui` | scoped verify per batch |
| 7 | Adoption C: charts (usage trend, benchmark trend, optional move of SVG charts) | `dashboard`, `declarative-dashboard`, `skill-synthesis-ui` | `npm run verify -- -p dashboard,declarative-dashboard,skill-synthesis-ui` |
| 8 | Removal: delete private geometry and formatters, add ratchet roots and lint rules (`ui-class-audit`, ban raw `setInterval` clock in feature libs), baselines down | affected libs, `tools/ui-class-audit` | scoped verify |

PR 1 and PR 3 can run in parallel (file-disjoint). PR 2 waits for the user answer on Q1.

## 6. Open questions for the user

| # | Question | Recommended answer |
|---|---|---|
| 1 | Is it allowed to add Chart.js and `ng2-charts` (two npm packages, MIT)? | Yes. Lazy load them. |
| 2 | Replace the working SVG usage bars and donut with `ptah-chart`? | No at first. Use the library for new trend charts. Move the old ones only if the look matches. |
| 3 | Is the ECharts fallback acceptable if Chart.js fails the prototype? | Yes, after a second prototype. |
| 4 | Which time features are wanted first: runtime-cap clock, budget countdown, rate-limit reset countdown? | Rate-limit reset countdown and session elapsed first, because the data exists. Runtime cap needs host data. |
| 5 | Tick rate: 1 s for all timers? | 1 s for visible timers. Relative time at the coarser rate. Paused when the window is hidden. |
| 6 | Should `ClockService` replace `WallClockService` and Machines `CountdownClock`? | Yes, one service. Keep the old API as thin wrappers for one PR. |
| 7 | Renderer bundle budget: what is the limit and the room? | Not read in this research. PR 2 measures it. The user states the hard limit if one exists. |
| 8 | Does VS Code webview need to be checked for these families? | Not now. Electron first. |
