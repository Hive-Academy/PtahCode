# Reviews page — UX brief

Feature lib: `libs/frontend/review-runs-ui`. Route `/review-runs`, Electron only
(`app.routes.ts:180-188`, guard `review-only-surface.guard.ts:3-7`). Full source inventory with
file:line: [inventory-reviews.md](inventory-reviews.md). Design rules: [DESIGN.md](DESIGN.md).

---

## 1. What the feature does today

The Reviews page shows automated pull request (PR) reviews that Ptah runs with CLI agent lanes
on allowed GitHub repositories. Ptah polls the repositories, runs review stages, and publishes
findings as PR comments through a bot token. The operator controls which repositories are
reviewed, dry run or live publication, and a global publication pause.

Data comes from explicit RPC calls only (no push events): `review:listRepositories`,
`review:listRuns {limit:100}`, `review:getRun`, `review:refresh`, `review:rerun`,
`review:getSettings`, `review:updateSettings`, `review:setPublicationPause`,
`review:getBotIdentity`, `review:setBotToken`, `review:clearBotToken`.

## 2. User jobs

1. **Monitor.** "Is the reviewer working, and is anything stuck or failed?"
2. **Triage a run.** "What did this run find, how much did it cover, and why did it fail?"
3. **Act on a run.** "Rerun this PR as a dry run, or live."
4. **Control publication.** "Stop all comments now" / "resume" / "pause one repository".
5. **Configure.** Add or remove repositories, set dry run or live, set thresholds, connect
   the bot token.

Jobs 1 and 2 are frequent. Jobs 4 and 5 are rare but high-risk, so they need clear state and
confirmation.

## 3. Information architecture

```
Reviews (page)
├── Page header: title, publication status chip + Pause/Resume, Refresh, Settings
├── Page alerts: offline (cached), poll failed, no bot connected
├── Repositories (filter scope): All + one row per repo with mode badge (Live/Dry run/Paused/Disabled)
├── Runs (list): toolbar (search, status chips, count) + run rows
└── Run detail
    ├── Header: PR #, title, repo, head SHA, attempt, status, actions (Rerun dry / Rerun live)
    ├── Failure / retry notice (stage, code, message, "Retry after …" or "Automatic retries stopped")
    ├── Stage timeline (8 stages: discovery … publication) with status, family, scope, duration
    ├── Coverage (per lens: family, verifier family, same-family warning) + Summary stats
    ├── Findings table (filters: status, lens; sort: severity, lens, location, status, confidence)
    └── Walkthrough / artifacts (shown as "not available yet")
Settings (drawer, right side, 480 px; full screen on narrow)
├── Repositories editor (add, remove, enable, dry run/live, per-repo pause)
├── Publication rules (maintainer logins, attestor login, poll minutes, max inline comments,
│   confidence floor, lane cap per PR, global pause)
└── Bot identity (connect/replace token, verify, remove; scopes; storage warning)
```

## 4. Screens and states

| # | Screen / state | Content | Pattern (DESIGN.md) |
| --- | --- | --- | --- |
| R1 | Main, loaded | Header, repositories, runs list, selected run detail | 8.1, 8.2, 8.6 |
| R2 | Main, loading (first load) | Header live, 3 skeleton rows in list, detail skeleton | 8.12 loading |
| R3 | Main, empty — no repositories | "No repositories yet" + "Add a repository" (opens Settings) | 8.12 empty |
| R4 | Main, empty — no runs | "No review runs yet. Runs appear after the next poll." + "Refresh now" | 8.12 empty |
| R5 | Main, filter empty | "No matching runs" + "Clear filters" | 8.12 empty |
| R6 | Main, error (no cache) | "Review history could not be loaded." + "Try again" | 8.12 error |
| R7 | Main, offline (cache) | Warning bar "Review service is unavailable. Showing cached runs from 14:02." + "Retry connection". List stays usable, actions that write are disabled with a reason | 8.12 partial |
| R8 | Main, poll failed | Warning bar "The last poll for <repo> failed <time>. Runs may be out of date." + "Retry" | 8.12 partial |
| R9 | No permission — no bot | Info bar "No bot connected. Live publication is unavailable." + "Connect bot" ; "Rerun live" disabled with tooltip | 8.12 no-permission |
| R10 | No permission — host | Route hidden off Electron (guard). No screen needed; the tab is not shown | — |
| R11 | Detail, loading / error | "Loading run details…" skeleton / "Run details are unavailable." + "Try again" | 8.12 |
| R12 | Detail, partial coverage | Orange badge "Partial coverage" + note "Coverage limited. Unchecked paths are not claimed clean." Stages/coverage missing → "Stage history unavailable." / "Lane coverage unavailable." | 8.12 partial |
| R13 | Detail, failed | Red notice with stage, code, message, retry line | 8.12 error (inline) |
| R14 | Detail, findings empty | "No findings for this run." / filtered "No matching findings." + "Clear filters" | 8.12 empty |
| R15 | Rerun live confirm | Modal: title, effect text, permission checkbox ("Pull requests: Read and write, Contents: Read, Metadata: Read"), Cancel (focus) / "Rerun live" | 8.14 modal, 8.9 destructive |
| R16 | Settings drawer | Sections from IA, sticky footer Save / Cancel, unsaved-changes dot | 8.3, 8.8 |
| R17 | Settings errors | Inline field errors; save error alert; token errors | 8.8 |
| R18 | Resume publication confirm | Modal as today | 8.14 |
| R19 | Narrow (360 px) | List view → push detail view with "All runs" back button; repositories become a select in the toolbar | 8.6 narrow |

Status labels and ink (one map, used in list and detail):

| Status | Label | Ink |
| --- | --- | --- |
| `queued` | Queued | idle |
| `running` | Running (pulse dot) | run |
| `succeeded` | Completed | done |
| `partial` | Partial coverage | need |
| `failed` | Failed | err |
| `interrupted` | Interrupted | need |
| `superseded` | Superseded | idle |
| `skipped` | Skipped | idle |

Severity badges: Critical → err, Major → need, Minor → idle outline, Nitpick → ghost.

## 5. Actions

| Action | Where | Level |
| --- | --- | --- |
| Pause publishing / Resume publishing | Header | Secondary; Resume asks to confirm |
| Refresh (poll now) | Header icon button; shows spinner and "Polling…" status | Icon |
| Open Settings | Header icon button | Icon |
| Select repository scope | Repositories pane / narrow select | Row |
| Search PR number, title or SHA | Runs toolbar | Field (**new**, client-side) |
| Filter by status | Runs toolbar chips | Chip |
| Clear filters | Empty filter state, toolbar | Ghost |
| Open run | Row click / Enter / arrow keys | Row |
| Close detail | Esc / back button (narrow) | Ghost |
| Rerun dry run | Detail header | Primary |
| Rerun live | Detail header, confirm modal | Secondary outline |
| Retry detail / retry load / retry poll | State panels and bars | Secondary / ghost |
| Filter and sort findings | Findings section | Chip + sortable header |
| Settings: all edits listed in IA | Drawer | Mixed; Save is primary |

## 6. Preserve list (every capability of today's page)

Each item must exist after the redesign.

- [ ] Reviews tab in the Electron top bar; `/review-runs` route; Electron-only guard; link from Cron scheduler.
- [ ] Repository list with count, mode badge Disabled / Paused / Dry run / Live, and selection.
- [ ] Repository filter and state filter, with Clear filters.
- [ ] Run rows: PR number, repo, head SHA (10 chars), trigger, status badge, progress label (Waiting / In progress / Finished), failure or retry notice.
- [ ] Arrow-key navigation in the run list.
- [ ] Global pause toggle; resume confirmation.
- [ ] Refresh: starts one poll per enabled repo in scope, then watches for up to 120 s.
- [ ] Queued count.
- [ ] Offline mode with cached runs and the cache time; Retry connection.
- [ ] Poll-failed warning, including the checkout-specific message; Retry with Refresh.
- [ ] Load error with Retry; three skeleton rows with "Loading review runs".
- [ ] Empty copy: no runs, no matching runs, no repositories.
- [ ] Detail: attempt id, status, failure stage/code/message, retry eligibility or "stopped".
- [ ] Detail: stage list with status, family, scope, duration, error.
- [ ] Detail: coverage per lens with lens family, verifier family and the same-family warning.
- [ ] Detail: "Partial coverage" and "Coverage limited. Unchecked paths are not claimed clean."
- [ ] Detail: "Stage history unavailable." / "Lane coverage unavailable."
- [ ] Detail: load state and Retry; stale responses ignored by attempt id.
- [ ] Rerun dry run (no confirm) and rerun live (confirm + permission acknowledgment); rerun error text.
- [ ] Live rerun disabled without a bot token, with the reason.
- [ ] Findings table: status filter, lens filter, sort on severity, lens, location, status, confidence; empty and filtered-empty copy.
- [ ] Walkthrough and artifacts shown as unavailable.
- [ ] Settings: add/remove repo, enable polling, dry run/live (live confirm), per-repo pause, maintainer logins, attestor login, poll minutes, max inline comments, confidence floor, lane cap per PR, global pause, Save with schema validation and save error.
- [ ] Save blocks live repos without token and identity; sends attestation.
- [ ] Bot identity: login, scopes, connected/verified dates, plaintext storage warning, connect/replace token (confirm), verify, remove (confirm).
- [ ] Confirm dialogs: Cancel, Escape, focus trap.

## 7. Known defects to fix during the build (from the inventory)

- The page never passes findings into `ReviewRunDetailComponent` (`findings` input stays `[]`).
  The table always shows "Findings unavailable". The build must load findings
  (`review:listFindings` exists in the contract and is not called).
- `nextCursor` is ignored. With more than 100 runs the list is cut. Add "Load more" at the list end.
- No `libs/frontend/ui` component is used. The build moves to the shared patterns.
- Contract fields not shown yet that the design uses: `prTitle`, `postedCount`,
  `suppressedCount`, `completedAt` (duration), `laneAvailability`. If a field is null, the UI
  hides the element (no "undefined").
- Minimum severity is a fixed `Minor` input, not bound to config. Keep it read-only and label it
  "Minimum severity: Minor (fixed)" until a contract field exists. Open question in report.md.

## 8. Stitch screens

Stitch project `9667497201590341954` exists. Stitch made the design system "Obsidian Precision"
(`assets/030c53978dec4f9f93aebce35c1c2878`) from the DESIGN.md section 10 preamble. All screen
generations timed out, and `list_screens` stays empty. No screen export exists. See
[stitch/reviews/README.md](stitch/reviews/README.md) for the prompts to run again. The text
wireframes below are the source of the layout decision until the screens exist.

## 9. Layout options for the main screen (R1)

### Option A — "Inbox" (3-pane list-detail) — **APPROVED 2026-11-09**

Wide (≥ 1200 px container):

```
┌ Reviews ─────────────── [● Publishing live] [Pause] [⟳] [⚙] ┐
│ ⚠ page alert bar (offline / poll failed / no bot), when any  │
├──────────────┬────────────────────┬──────────────────────────┤
│ Repositories │ [search] [chips ▾] │ #482 Fix cache key  ● Done│
│ ▸ All     12 │ ● #482 Fix cache…  │ org/api · a1b2c3d4e5 · #2 │
│   org/api Live│ ● #479 Add retry…  │ [Rerun dry run][Rerun live]│
│   org/web Dry │ ◐ #477 Partial…    │ ─ Stages (8) ───────────  │
│   org/cli ⏸   │ ✕ #470 Failed …    │ ─ Coverage per lens ────  │
│              │ [Load more]        │ ─ Findings table ───────  │
└──────────────┴────────────────────┴──────────────────────────┘
   240 px          340 px               fluid
```

- Medium (768–1199 px): the repositories pane becomes a select in the runs toolbar. Two panes
  stay: runs list (320 px) and detail.
- Narrow (< 768 px, includes 360 px): runs list only. A row opens the detail as a pushed view
  with the "All runs" back button (R19).

Rationale: jobs 1 and 2 (monitor, triage) are frequent and need list and detail at the same
time. The pattern is the same as Machines option A, so the two pages share
`ptah-list-detail` and `ptah-list-row`. It keeps today's arrow-key list navigation.

### Option B — "Overview + drawer"

```
┌ Reviews ─────────────── [● Publishing live] [Pause] [⟳] [⚙] ┐
│ [Running 2] [Queued 3] [Failed 1] [Partial 1]  ← stat cards  │
│ Repos: (All) (org/api Live) (org/web Dry run) (org/cli ⏸)    │
├──────────────────────────────────────────────────────────────┤
│ PR      Title          Repo     Status     Trigger  Updated  │
│ #482    Fix cache key  org/api  ● Done     push     2 min    │
│ #479    Add retry      org/web  ● Running  manual   now      │
└──────────────────────────────────────────── row → drawer ────┘
                                    ┌ Run detail drawer 480 px ┐
```

- Narrow: stat cards wrap 2 × 2, the table becomes stacked `ptah-list-row` rows, and the drawer
  is full screen.

Rationale: better for a quick fleet glance. Detail work is cramped in a 480 px drawer, and the
findings table needs width. Use it only if triage moves to its own page.

### Stitch deviations and the Angular mapping

See report.md section 4. They apply to both pages.
