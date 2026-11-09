# Machines page — UX brief

Feature lib: `libs/frontend/machines-ui`. Route `/machines`, Electron only
(`electron-only-surface.guard.ts:19-20`). Full source inventory with file:line:
[inventory-machines.md](inventory-machines.md). Design rules: [DESIGN.md](DESIGN.md).

---

## 1. What the feature does today

The Machines page lets the user control Ptah on other computers over SSH. The user pairs a
remote machine (by an 8-character code or automatically through SSH), checks its readiness,
sees its sessions, opens a session transcript, sends prompts, stops a turn, and answers tool
approval requests. The page is live: state arrives as `machines:event` and `machines:state`
push events. There is no polling. The 17 `machines:*` RPC methods are listed in the inventory.

Machine states: `connected`, `offline`, `reconnecting`, `version-mismatch`, `unpaired`. State
reasons: `worker-identity-changed`, `re-pair-required`, `session-reattach-failed`. Session
states: `running`, `idle`, `interrupted` (shown as "Unknown" while the machine is not connected).

## 2. User jobs

1. **Connect a machine.** "Add my build server and make sure it works."
2. **Know the fleet state.** "Which machines are up, and is any waiting for me?"
3. **Answer approvals.** "A remote session wants to run a tool. Allow or deny it, fast." (60 s
   timeout — this is the most time-critical job.)
4. **Work in a remote session.** Read the transcript, send a prompt, stop a turn, start a new
   session in a remote workspace.
5. **Fix a broken machine.** Readiness check, copy a fix command, re-pair, retry, remove.

## 3. Information architecture

```
Machines (page)
├── Page header: title, connected count ("2 of 3 connected"), pending approvals chip, "Add machine"
├── Machines list (left pane): search (new), status-grouped rows: name, alias, state, last seen
└── Machine detail (right pane), one of:
    ├── Intro (no machines): what it does, "Add machine", "What is checked?" (7 checks)
    ├── Add / pair pane: SSH alias (suggestions), 8-char code, "Pair and connect" | "Pair automatically via SSH",
    │   pairing command with Copy, per-code errors
    └── Machine overview
        ├── Header: name, alias, state badge, versions ("ptah 1.42 · protocol 7"), actions:
        │   Readiness check, overflow (Re-pair, Remove machine)
        ├── State banner (offline/reconnecting/mismatch/unpaired/reattach-failed) + Retry now / Re-pair
        ├── Pending approvals (new grouping, top of the pane when any exist)
        ├── Readiness (collapsible tile): summary, check rows ✓/!/✗, Copy fix, Check again, Copy report
        └── Sessions: Reload, New session (workspace select + first message + Start), rows → Open
Session view (replaces the detail pane; full screen on narrow)
├── Header: back "<machine>", session title, state, driver badge, sync chip, Refresh (watch-only)
├── Banners: Reconnected (replay counts), driven elsewhere (+ release command), Available, stale notice
├── Transcript (chat-ui pieces): user bubbles, "Claude on <machine>", thinking, tool calls, approval blocks
└── Composer: textarea, Send, Stop, disabled reason
```

## 4. Screens and states

| # | Screen / state | Content | Pattern (DESIGN.md) |
| --- | --- | --- | --- |
| M1 | Main, loaded | Header, machine list, machine overview of the selected machine | 8.1, 8.2, 8.6 |
| M2 | Main, first load | List skeleton (3 rows) **and** detail skeleton (fixes today's blank pane) | 8.12 loading |
| M3 | Main, empty (no machines) | One intro in the detail area; list pane hidden (fixes duplicate empty text) | 8.12 empty |
| M4 | Main, list error | "Machines could not be loaded" + message + "Try again" | 8.12 error |
| M5 | Add / pair | Two methods as tabs: "Pairing code" and "Automatic (SSH)". Copy command block. Errors: Pairing failed (nothing was stored), Cannot reach host, Version mismatch, Already connected | 8.8, 8.14 tabs |
| M6 | Machine offline / reconnecting | Banner "Lost contact 5 min ago. Sessions on build-01 keep running; they are shown as unknown, not failed. Next attempt in 30 s." + "Retry now". Session states "Unknown" | 8.12 partial |
| M7 | Version mismatch | Banner names both builds and which to update + "Retry now" | 8.12 partial |
| M8 | Unpaired / re-pair required | Banner "… has no pairing token on this machine. Pair it to connect." + "Pair" | 8.12 no-permission |
| M9 | Readiness | Loading "Checking <name>…", error "Check failed … Check again when <name> is reachable.", result rows | 8.12, 8.4 |
| M10 | Sessions empty / loading / error | "No sessions yet." / "<name> has no registered workspaces." / "Sessions show once <name> is connected." / error + Try again | 8.12 |
| M11 | Pending approvals | Approval cards at the top of the machine overview and in the session view: tool name, arguments (`font-mono`, Copy), countdown to 60 s, "Allow once" (primary) / "Deny" (outline). Timed-out copy as today | 8.4, 8.9 |
| M12 | Session view, live | Transcript + composer, sync chip "Caught up" | chat patterns |
| M13 | Session view, watch-only / driven elsewhere | "Showing the last saved state", "Saved up to <time>. Newer activity is not shown.", driver badge, release command, Refresh | 8.12 partial |
| M14 | Remove confirm | Modal (today inline). Cancel has focus. Destructive "Remove machine" | 8.14, 8.9 |
| M15 | Narrow (360 px) | List → push overview → push session. Back buttons at each level. Pending approvals chip in the header jumps to the first waiting request | 8.6 narrow |
| M16 | No permission — host | Route hidden off Electron. No screen | — |

State map (one map, list and detail):

| State | Label | Ink | Marker (keep today's shapes) |
| --- | --- | --- | --- |
| `connected` | Connected | done | filled circle |
| `reconnecting` | Reconnecting | run | spinning ring (reduced motion: static ring) |
| `offline` | Offline | idle | hollow circle |
| `version-mismatch` | Version mismatch | need | filled triangle |
| `unpaired` | Not paired | err | dashed circle |

## 5. Actions

| Action | Where | Level |
| --- | --- | --- |
| Add machine | Page header, intro | Primary |
| Search machines | List pane toolbar (**new**, client-side on name and alias) | Field |
| Select machine | Row click / Enter / Up, Down, Home, End | Row |
| Readiness check / Check again / Copy report / Copy fix | Overview header, readiness tile | Secondary / ghost / icon |
| Retry now | State banner | Secondary |
| Re-pair / Pair | Banner, overflow menu | Secondary |
| Remove machine | Overflow menu → modal confirm | Destructive (moved out of the header row) |
| Reload sessions | Sessions section header | Icon |
| New session (workspace, first message, Start) | Sessions section | Secondary → inline form, Start is primary |
| Open session | Session row (whole row is a button, roving focus — fixes problem 10) | Row |
| Send / Stop | Composer | Primary / outline error |
| Allow once / Deny | Approval card | Primary / outline |
| Refresh (watch-only) | Session header | Icon |
| Dismiss banner | Reconnected / Available banners | Icon |
| Back to machine | Session header | Ghost |

## 6. Preserve list (every capability of today's page)

- [ ] `/machines` route, Electron-only guard, titlebar tab with Server icon, pending-approval badge and accessible count label.
- [ ] Welcome screen entry "Machines (N connected)" and "Back to welcome" without a folder.
- [ ] `MachinesFeed` push handling (`machines:event`, `machines:state`); malformed pushes dropped.
- [ ] Machine list: roving tabindex, `aria-current`, Loading / error + Try again / empty.
- [ ] Status marker shapes and labels for the five states.
- [ ] Intro with "What is checked?" (7 worker checks).
- [ ] Add/pair: SSH alias with suggestions, 8-char code, Pair and connect, Pair automatically via SSH, Cancel/Escape, pairing command Copy, all per-code error messages ("Nothing was stored").
- [ ] Re-pair from banners; Retry now from offline/reconnecting/mismatch banners.
- [ ] Banner copy for each state and reason, including "shown as unknown, not failed" and next-attempt time.
- [ ] Versions line "ptah <v> · protocol <max>" and mismatch copy that names both builds.
- [ ] Readiness: auto-run on machine change, Check again, rows with pass/warn/fail, detail, Copy fix, Copy report, loading and error copy.
- [ ] Remove machine with confirm (Cancel focused); remove/retry error messages.
- [ ] Sessions: Reload, New session (workspace pick, first message, Start, Cancel), Open, provider, updated time, state ("Unknown" while disconnected), all empty/error copy.
- [ ] Session view: transcript with chat-ui thinking/tool pieces and inert markdown links; streaming caret; "Saved up to <time>" divider; snapshot / watch-only mode; driver badge; driven-elsewhere banner with release command; "Available" banner; Reconnected replay banner; sync chip three states; stale notice; Refresh on window focus for watch-only.
- [ ] Composer: Enter sends, Shift+Enter newline, Stop, disabled reason, send/stop error lines.
- [ ] Approval blocks: arguments with Copy, Allow once / Deny, per-request answer state, 60 s timeout copy, "The session continues without this tool."
- [ ] Sanitized worker text (`displayText` caps) everywhere a worker string shows.
- [ ] Live regions, labelled alerts, reduced-motion handling.

## 7. Known problems the design fixes (from the inventory, section 8)

1. Blank detail pane during first load → M2 skeleton in both panes.
2. Duplicate empty guidance → M3 shows only the intro.
3. No search → list search field from 5 machines (always shown at narrow).
4. No refresh indicator on a populated list → thin progress line under the list toolbar plus `aria-busy`.
5. "Last seen" goes stale in other rows → one page-level clock for all rows (build note).
6. Remove next to Readiness in the same style → Remove moves to the overflow menu, destructive style.
7. Inline remove confirm → modal (`ptah-native-modal`).
8. Everything at 12 px muted → row title `text-sm font-medium`, only meta at `text-xs`.
9. Ad hoc 760 px breakpoint → the 480/768/1200 container ladder.
10. Session rows not keyboard reachable → listbox rows with roving focus.
11. Static footer "This machine stays in Chat." → removed; the header description carries it.
12. Two tab stops on a read-only approval → one focusable region.

## 8. Layout options for the main screen (M1)

Stitch did not return screens (see [stitch/machines/README.md](stitch/machines/README.md)). The
text wireframes below are the source of the layout decision.

### Option A — "Inbox" (list-detail) — **APPROVED 2026-11-09**

Wide (≥ 1200 px container):

```
┌ Machines ── 2 of 3 connected ── [⚑ 1 approval waiting] [+ Add machine] ┐
├───────────────────────┬────────────────────────────────────────────────┤
│ [search machines]     │ build-01  (ssh: build)  ● Connected            │
│ ● build-01   now      │ ptah 1.42 · protocol 7   [Readiness check] [⋯] │
│ ↻ laptop     reconn.  │ ┌ Approval waiting ── 42 s ─────────────────┐  │
│ ○ gpu-box    5 min    │ │ Bash  `npm test`  [Copy] [Allow once][Deny]│  │
│                       │ └───────────────────────────────────────────┘  │
│                       │ ▸ Readiness  7 of 7 passed                     │
│                       │ ─ Sessions ──────────── [⟳] [New session]      │
│                       │ ● fix-auth   claude  running  2 min      ›     │
└───────────────────────┴────────────────────────────────────────────────┘
        280 px                    fluid (session view replaces it)
```

- Medium (768–1199 px): list pane 240 px. The session view takes the full content width, with a
  "‹ build-01" back button.
- Narrow (< 768 px, includes 360 px): list → pushed overview → pushed session (M15). The
  approvals chip jumps to the first waiting request.

Rationale: users usually work on one machine at a time, and approvals (60 s timeout) must be
visible next to the machine they belong to. The pattern matches Reviews option A.

### Option B — "Fleet grid"

```
┌ Machines ── 2 of 3 connected ─────────────────────── [+ Add machine] ┐
│ ┌ Approvals strip: build-01 · Bash `npm test` · 42 s [Allow][Deny] ┐ │
├──────────────────────────────────────────────────────────────────────┤
│ ┌ build-01 ──────┐ ┌ laptop ────────┐ ┌ gpu-box ───────┐             │
│ │ ● Connected    │ │ ↻ Reconnecting │ │ ○ Offline      │             │
│ │ 3 sessions     │ │ 1 session      │ │ last 5 min ago │             │
│ │ readiness 7/7  │ │ —              │ │ [Retry now]    │             │
│ └────────────────┘ └────────────────┘ └────────────────┘             │
└──────────────────────── tile → machine page or drawer ───────────────┘
```

- Narrow: one tile in each row. The approvals strip stays at the top.

Rationale: good for 5 or more machines and a glance at the fleet state. It adds one navigation
level before the sessions, and the approvals strip separates a request from its machine.

### Stitch deviations and the Angular mapping

See report.md section 4.
