# Visual Review - TASK_2026_2309_5bea (session stats sidebar redesign, Electron)

## Verdict: PASS WITH DEFECTS (score 6/10). Visual breaking 0, Serious 4, Moderate 4, Minor 2.

The pane never overflows horizontally at 300/336/400/448 (dark and light; `scrollWidth <= clientWidth` on the pane, only `sr-only` spans exceed). Section order SESSION, AGENTS, PLAN LIMITS, GIT matches the reference, and `≥`, `~`, `—`, `--:--` render legibly. It departs from rev 3 in several visible ways (below).

## Environment
- Electron dev build from `dist/apps/ptah-electron`, CDP port 9333, driven with `.ptah/tmp/drive.mjs`. The launched window opened the worktree workspace, not `/tmp/ptah-live-test` (launcher ignored the arg); the open session was "Stats sidebar live test" (Orchestrator + 2 CLI lanes, codex and antigravity). No message was sent.
- Window: the driver `resize` is unsupported in this Electron (Browser.getWindowForTarget missing). Window was resized with `wmctrl` (renderer innerWidth 734 to 1434).
- **Sidebar width emulation**: no drag handle exists in the DOM (no separator, no col-resize cursor). The pane defaults to 336 px docked (300 px / 299 px at windows <= ~734 px, as a sheet/overlay). 300/400/448 were forced by setting `style.width` on the host `<aside>` (real `getBoundingClientRect` widths: 300, 400, 448, verified via eval). These are emulations of the layout, not user-reachable widths.
- Themes: dark = `ptah-glass`; light = `anubis-light` (the "Light" swatch did not apply). Theme restored to `ptah-glass` at the end.
- Electron process I launched (PIDs 1364902/1364910) was stopped.
- Side effect: `wmctrl -r PtahCode` initially matched a different user window (0x04400004) and resized it to 1500x900; its original size is unknown. Please check it.

## Screenshots (TF/visual-review/)
| File | State |
|---|---|
| rail-56-dark.png | collapsed rail (dark, 734 px window) |
| rail-56-light.png | rail after toggling in light (taken while the tooltip popover covered the page, not informative) |
| sheet-300-dark.png | overlay/sheet 300 px, dark, 734 px window |
| sheet-300-light.png | sheet 299 px, light |
| full-300-dark.png, full-336-dark.png, full-400-dark.png, full-448-dark.png | full-window, dark |
| bottom-400-dark.png | 448 px pane (taken after setting 448), shows GIT |
| models-open-400-dark.png | Models disclosure open, 400 |
| agent-detail-400-dark.png | Orchestrator row expanded, 400 (shows Models focus ring) |
| focus-400-dark.png | focused agent row, 400 |
| full-400-light.png, full-448-light.png | light |

## Defects
### Serious
1. **PLAN LIMITS window labels truncated to 2-3 characters at every width.** Antigravity rows read `Cla…`, `Ge…`, `Ge…`, `Cla…`, Codex row `We…` (full text: "Claude and GPT models · Weekly" etc.). Seen in full-400-dark.png, bottom-400-dark.png (448), full-300-dark.png; also at 400/448, so not a width issue. Reference limits-400-dark.png shows `5h` / `Week` labels and a Gemini/Claude sub-heading per group. The rows are indistinguishable (two `Ge…`, two `Cla…`).
2. **Models disclosure (models-open-400-dark.png, 400 dark)** dumps the screen-reader sentences as visible text ("SDK subtotal: 624,595 tokens. CLI lanes: Tokens unavailable. antigravity reported no tokens... 2 of 2 lanes report no usage", same for cost), duplicates the SDK subtotal (a "Haiku 5.5" row and an "SDK subtotal" row with identical figures) and then a third summary grid (`SDK subtotal / CLI lanes / Lanes with tokens / Lanes with cost / Cost basis`) that wraps unevenly. Reference partial-400-dark-models-open.png: one compact card, one row per model, one SDK subtotal row, "Cost basis" line.
3. **AGENTS rows have no share bars** (all widths, e.g. full-400-dark.png); reference lanes-400-dark/limits-400-dark show a share bar under tokens in every row. Orchestrator at ~100% of known tokens shows nothing. Also the header lacks the status chips row (Done / orchestrate / branch) of the reference.
4. **Opaque full-window popover when a tooltip is open in light theme** (sheet-300-light.png, first capture was a blank page). `div.cdk-overlay-popover.cdk-overlay-connected-position-bounding-box` (popover="manual", 100%x100%, background `oklch(0.978...)`) covered the whole window while the "Compact session details" tooltip was open, so the app looked blank. I set its background transparent to continue. Cause not fully isolated (it appeared after my toggle collapse/expand + theme switch); not seen in dark.

### Moderate
5. Agent names truncate in the sheet: `Orchestr…`, `Sonnet 5.5…` at 299-300 px (sheet-300-light.png, full-300-dark.png); at 300 the reference (lanes-300-dark.png) keeps the name and drops the secondary column.
6. Agent detail (agent-detail-400-dark.png) is cramped: `Status done` wraps to two lines, `Compactions 0` sits alone; fields in a loose grid.
7. SESSION footer: legend `SDK 624.5k / CLI — / 2 unreported (tokens) / 2 unreported (cost)` wraps into an orphaned "2 unreported (cost)" line at 336-448 (full-400-dark.png).
8. Plan-limit percentages use a `? 3.4%` prefix with no visible explanation; claude provider row shows three near-duplicate lines ("Limits not tracked", "Usage Unavailable", "no open session", "Plan usage could not be read (no open session).").

### Minor
9. Zero-share bar: the `? 0%` Antigravity row shows a ~1 px sliver in the screenshot; exact fill width not measured (the selector approach found no matching bar). Reference demands zero width. Unverified.
10. Header icon controls (edit, folder, compact) have an always-on cyan ring on the compact button after tooltip focus (sheet-300-light.png); intended focus style, noting only.

## Checks that passed
- No horizontal overflow of pane or sections (all widths, dark/light; only `sr-only` spans and a 26 px avatar in a 24 px box).
- Section order and headings consistent (uppercase 11 px labels, right-aligned counts); no TASK section rendered (no linked task), no GIT/linked-sessions break; GIT visible at 448.
- Number columns (Tokens/Cost/Time) right-aligned and consistent; `~624.5k`, `~$0.02`, `≥624.5k`, `—`, `--:--` legible.
- Light contrast (anubis-light, estimated through computed colour on blended background): muted 12 px labels (Agent, Tokens, 0 live, "≥ = lower bound") 5.39:1; 11 px "Limits not tracked" / "no open session" 6.04:1; 10.5 px "0 running" / "3 providers" 6.04:1; "Review changes" 6.31:1. All above 4.5:1. (Approximate: translucent background composited against an assumed page colour.)
- Focus: Tab shows a 2 px solid outline (plus 5 px dark halo) on controls (focus-400-dark.png); Models button ring visible in agent-detail-400-dark.png.
- Escape on the Models button closes the disclosure (aria-expanded true to false).

## Numbers sanity check (raw text)
SESSION: `Tokens ≥624.5k`, `Cost ≥$0.02`, `Time --:--` (4 turns), Agents 3 (0 live), Models 1 Haiku 5.5, Budget 2% (624.6k / 30.0M), `SDK 624.5k`, `CLI —`, "2 unreported (tokens)", "2 unreported (cost)".
AGENTS: `Orchestrator Haiku 5.5 7% ~624.5k ~$0.02 --:--`, `codex gpt-6-sol — — 0:40`, `antigravity Sonnet 5.5 (medium) — — 0:15`. Header "0 running · 0 sub · 2 CLI".
Consistent: total (≥624.5k, ≥$0.02) equals the Orchestrator row; lanes report no usage so are unreported and the lower-bound mark is correct. Orchestrator context 7% (66,686 of 1,000,000) vs Budget 2% are different bases.

## Not checked
- Real drag-resize of the sidebar (no handle found); 300/400/448 are style emulation.
- Subagent (non-CLI) rows, running/live state, limit-reached provider (no live data; only Antigravity at 3.4% and Codex 10%), provider "usage unavailable" (Claude shown as "Limits not tracked / Unavailable"), TASK and linked-sessions sections (no data).
- 56 px rail in dark was captured at a 734 px window only; rail-56-light.png is uninformative (covered by the popover).
- Console errors (cannot read past logs); only visible error states checked: none seen.
- Tooltip Escape behaviour; hover states; share-bar zero width exactness.
