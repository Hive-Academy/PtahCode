# Batch B1 — Machines page, approved "Inbox" list-detail design (option A)

Status: complete. Built against the landed B0 contract
(`libs/frontend/ui/src/lib/surfaces/list-detail.component.ts`,
`list-row.directive.ts`), imported from `@ptah-extension/ui`. No file outside
`libs/frontend/machines-ui/**` was touched. Git untouched (no commit, push, or
branch action, per the lane rules).

## Files changed

Created:

- `libs/frontend/machines-ui/src/lib/components/machines-view/machines-page-header.component.ts` — NEW `ptah-machines-page-header` (72 lines).
- `libs/frontend/machines-ui/src/lib/components/machines-view/machine-overview.component.ts` — NEW `ptah-machine-overview` (312 lines), the detail-pane overview.

Rewritten (split, not grown — `machines-view.component.ts` went 476 → 365 lines):

- `libs/frontend/machines-ui/src/lib/components/machines-view/machines-view.component.ts` — page shell + page header + `ptah-list-detail` wiring + pane modes + all store logic.
- `libs/frontend/machines-ui/src/lib/components/machine-list/machine-list.component.ts` — list pane content: heading + add, client-side search, listbox rows.

Restyled / small edits:

- `machines-intro.component.ts` — approved empty-state copy ("No machines yet", "Add a machine to run sessions on a remote workspace."), SSH sentence and "What is checked?" kept.
- `add-machine-pane.component.ts` — form `p-5` removed (the shell pane provides it).
- `readiness-panel.component.ts` — section `p-5` removed.
- `remote-session-view.component.ts` — header and body `px-5` removed (two spots).
- `remote-composer.component.ts` — container `px-5` removed.
- `remote-session-list.component.ts` — "Reload" label → "Refresh" (testid `remote-sessions-reload` kept; no spec asserts the label).
- `machine-status/machine-status.component.ts` — private `INK` map replaced by the exported `MACHINE_STATE_INK` (approved state map); markers and labels unchanged.

Specs updated (DOM updated, behavior assertions kept):

- `machines-view.component.spec.ts` — mock store gains `pendingApprovalsByMachine`/`pendingApprovalCount`; intro title assertion → "No machines yet"; NEW: approvals badge + overview notice test; NEW: narrow "All machines" test (asserts the shell's `detailOpen` input through `ListDetailComponent`).
- `machine-list.component.spec.ts` — `ul li` → `role="listbox"`; `.font-semibold` → `.font-medium`; NEW: search-filter spec (name + alias + no-match + clear); NEW: three skeleton rows asserted; NEW: `aria-selected` on the option rows.
- `machine-status.component.spec.ts` — ink table updated to the approved map (reconnecting → `text-state-run`, version-mismatch → `text-state-need`, unpaired → `text-state-err`).

## Behavior → where it is now

| Behavior | Where |
| --- | --- |
| `ptah-machines-view` selector, OnPush, store-injected | `machines-view.component.ts:57,70,218` |
| Page shell: `max-w-[1600px] mx-auto`, `p-4`, `p-6` from 768 px, flex column | `machines-view.component.ts:73-76` |
| Page header: h1 "Machines", sub line, approvals badge, primary Add | `machines-page-header.component.ts:25-56` |
| Approvals badge only when the store counts approvals (no new RPC) | `machines-page-header.component.ts:34-45,61`; count from `store.pendingApprovalCount()` at `machines-view.component.ts:78` |
| Shared `ptah-list-detail`, `[listWidth]="280"`, `[detailOpen]` | `machines-view.component.ts:82-88` |
| List pane: heading "Machines", search, listbox | `machine-list.component.ts:60-83,134-173` |
| Client-side search by name/alias, no-match line | `machine-list.component.ts:75-83,125-131,213-221` |
| Rows: `ptahListRow` options, name + mono alias, second line in state ink with marker + label + meta | `machine-list.component.ts:136-170`; ink map `machine-status.component.ts:15-23` |
| Roving tabindex, ArrowUp/Down/Home/End, one Tab stop | `machine-list.component.ts:140-147,223-265` |
| `aria-current` + `aria-selected` on the selected row | `machine-list.component.ts:140-141`; directive `ui/src/lib/surfaces/list-row.directive.ts:26-28` |
| Loading: 3 `skeleton h-10 rounded-xl`, `role="status"` `aria-busy` | `machine-list.component.ts:85-96`; detail pane `machines-view.component.ts:188-208` |
| Load error: `role="alert"`, `state-err` title, safe sentence, Try again primary | `machine-list.component.ts:97-117`; `reload()` `machines-view.component.ts:305-307` |
| Select machine (clears confirm/error on change, resets pane) | `machines-view.component.ts:275-284` |
| Detail header: name, meta line, status badge, Readiness check, more-actions | `machine-overview.component.ts:69-130` |
| Remove machine + confirm block (alertdialog, labelled/described, Escape, Cancel focus) | `machine-overview.component.ts:117-125,145-182,290-297`; `remove()` `machines-view.component.ts:321-327` |
| Action error (sanitised alert) | `machine-overview.component.ts:184-193`; `act()` `machines-view.component.ts:333-354` |
| State banners (reconnect etc.), Repair / Retry now | `machine-overview.component.ts:195-231`; `banners` `machines-view.component.ts:242-246`; `machineBanners` util unchanged |
| One-second clock only while selected machine is offline/reconnecting; stops otherwise and on destroy | `machines-view.component.ts:253-265,356-364` |
| Readiness check with back (`machines-back`) | `machine-readiness` `machine-overview.component.ts:92-99`; pane mode `machines-view.component.ts:122-139` |
| Add / pair and repair panes (add-machine-pane, alias fixed in repair) | `machines-view.component.ts:107-121` |
| `onPaired` → select + straight to readiness | `machines-view.component.ts:309-315` |
| Session list (open, new session, refresh) hosted in the overview | `machine-overview.component.ts:251-254`; `showSession()` `machines-view.component.ts:286-289` |
| Session view with back (`machines-session-back`), fills the pane | `machines-view.component.ts:140-164` |
| Approval blocks in the session view (allow/deny) + count notice in the overview | session view component untouched (only `px-5` removed); notice `machine-overview.component.ts:132-143` |
| Narrow: one pane; detail opens when a machine is selected or a non-list pane is open; "All machines" back clears only the narrow flag | `machines-view.component.ts:222-223,248-251`; back button `machine-overview.component.ts:55-67` |

`data-testid` kept (all found): `machines-view`, `machines-pane` (now the detail-slot wrapper), `machine-detail` (now the overview host), `machine-detail-meta`, `machine-readiness`, `machine-remove`, `machine-remove-confirm`, `machine-remove-confirm-yes`, `machine-remove-confirm-no`, `machine-action-error`, `machine-banner`, `machine-repair`, `machine-retry`, `machines-back`, `machines-session-back`, `machines-empty`, `machines-empty-add`, `machines-checked`, `machine-list-add`, `machine-list-loading`, `machine-list-error`, `machine-list-retry`, `machine-list-empty`, `machine-row`, `machine-row-meta`, `machine-status`, `add-machine-form/alias/code-cell/cancel`, `readiness-*`, `remote-session-list/open/new/reload/...`, `remote-session-*`, `remote-composer`, `remote-send`, `remote-session-title/meta/owner-chip/refresh/stop/watch-banner/live`. New: `machines-add`, `machines-approvals-badge`, `machines-narrow-back`, `machine-actions`, `machine-approvals-waiting`, `machine-readiness-tile`, `machine-list-search`, `machine-list-no-match`, `machines-detail-loading`.

## Differences from the prototype that remain, and why

1. **Approval cards in the overview.** The prototype shows approval cards with a countdown in the overview. The store exposes only COUNTS
   (`pendingApprovalsByMachine`, `pendingApprovalCount`); the request objects live inside per-session views. Per the brief (no new RPC, no store change) the
   overview shows a `state-need` count notice ("Open the session to allow or deny
   it") and the header badge shows the total. The real allow/deny cards stay in
   the session view.
2. **Readiness "7 of 7 passed" summary.** The prototype's summary line needs check results, but the app's readiness is one RPC per run. The overview hosts a collapsed
   `<details>` tile (`machine-readiness-tile`) that mounts the existing
   `ptah-readiness-panel` only when expanded — no automatic readiness RPC on
   machine selection. The full readiness pane mode with `machines-back` also
   stays.
3. **Empty and error states stay in the list pane.** `machine-list-empty`, `machine-list-error`, `machine-list-retry` and their copy are asserted by specs and were
   required to be kept. The restyled intro (empty state, `surface-1` via the
   shell) is the detail pane. At ≥ 768 px both texts can be visible ("No
   machines yet." in the list, the intro in the detail).
4. **Marker classes.** The prototype's `status-dot/-ring/-hollow/-triangle`, `active-line` and plain `state-*` classes do not exist in the app and `styles.css`
   may not be edited. Markers come from the existing `ptah-machine-status` SVG
   shapes in the approved ink map; the badge dot is Tailwind utilities
   (`inline-block h-2 w-2 rounded-full bg-current`); the gold active line comes
   from the shared `ptahListRow` directive.
5. **Breakpoints are viewport media variants.** The brief's `@container/page` class and `[@container(max-width:767px)]:` variant generate no CSS without the
   container-queries plugin (B0's evidence, `tailwind.config.js` lists daisyui
   only) and no `container-type` ancestor exists on the page. The shell
   (`ptah-list-detail`) switches panes at `min-[768px]:`; the "All machines"
   back button uses the matching `max-[767px]:inline-flex` so it appears in
   exactly the single-pane range.
6. **Session rows** are not listbox options (prototype problem 10) and the session list keeps its own structure — out of this batch's scope.
7. **File size.** `machines-view.component.ts` is 365 lines, above the 300 target but down from 476. What remains is the pane-mode switch and the store logic
   (clock, act/remove/retry). Further splitting (readiness/session back buttons)
   would add files for no cohesion gain.

## Decisions

| # | Decision | Evidence | Reversible |
| --- | --- | --- | --- |
| 1 | Media variants, not container queries, for the narrow back button; no `@container/page` on the shell | B0's landed shell uses `min-[768px]:`; no container-queries plugin; no `container-type` ancestor (styles.css has it only on unrelated widgets) | yes |
| 2 | Approvals as a header badge + count notice, no new data path | Store exposes counts only (`pendingApprovalsByMachine`); brief forbids new RPC/store changes | yes |
| 3 | Readiness tile is lazy (`<details>` + toggle signal), no auto-RPC on selection | Readiness panel runs one `machines:readiness` per mount ("Check again" only); the overview would otherwise fire an RPC on every selection | yes |
| 4 | `machine-detail` testid moved to the overview host element | Specs query by testid, not tag; keeps one detail root | yes |
| 5 | `narrowDetailOpen` set in `select()` and `onPaired()`, cleared only by "All machines" | Brief: clear only the narrow flag, keep selection semantics; pairing selects a machine | yes |
| 6 | Kept `machine-list-add` (ghost/primary switch) next to the new primary `machines-add` | Brief requires keeping every existing testid and its spec assertions | yes |
| 7 | Ink map changed to the approved state map (reconnecting run, version-mismatch need, unpaired err); spec table updated | `machines-ux.md` approved state map; `machines-a.html` | yes |
| 8 | "Reload" → "Refresh" label | Approved prototype wording; testid kept; no spec asserts the label | yes |
| 9 | Padding strips (`p-5`, `px-5`) in hosted panes | The shell panes carry `surface-1 rounded-2xl p-5`; a second wrapper would double the padding (brief: do not add a second surface/padding wrapper) | yes |

## Proposed Removals

None removed. Two candidates for a later pass:

1. **`machine-list-add`** — redundant with the page header's primary "Add machine" (`machines-add`). Kept because the brief requires every existing testid
   and its spec assertions (ghost/primary switch).
2. **Footer "This machine stays in Chat."** in the list pane — kept (spec asserts it); the approved design has no equivalent line (ux doc problem 11).

## Verification

- `npm run verify -- -t lint -p machines-ui`: **passed** — lock slot acquired after 3 s (memory settle wait), `NX 1 task: 1 succeeded`, 0/1 cache hits, exit
  code 0, 16.4 s under the lock. One run, as allowed.
- `ptah_get_diagnostics` scoped to all changed files: **no errors in the changed
  files** after fixing two `jasmine.stringContaining` typings in my new search
  spec. The reported BigInt errors in `libs/shared`/`libs/worker-protocol`
  sibling files are pre-existing repo noise (B0's report lists the same), in
  files I did not touch.
- All changed files formatted with the repo prettier config (`.prettierrc`).

## Not verified

- **Jest**: not run in this lane (coordinator runs tests and typecheck). The three updated spec files are written but their execution is unverified.
- **Typecheck**: not run as an Nx task; only editor diagnostics plus lint.
- **Visual check**: no Electron render, dev server, or screenshot in this lane
  (dev/serve/build not allowed). The layout follows the landed shell classes and
  repo-proven idioms (`min-[768px]:`, `max-[767px]:`, daisyUI), but the rendered
  result was not inspected.
- `services/**` and `utils/**` untouched; no compile-error-forced change was
  needed there.
