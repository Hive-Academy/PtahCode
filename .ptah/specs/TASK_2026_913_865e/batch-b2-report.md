# Batch B2 — Reviews page Inbox shell (review-runs-ui)

Status: DONE (code complete; see "What was not verified").

Scope: the page SHELL of the approved option A "Inbox" design — header/toolbar,
repositories pane, runs pane, detail host, empty/loading/error states, settings entry —
in `libs/frontend/review-runs-ui`, against the landed `ptah-list-detail` / `ptahListRow`
contract of B0 (`@ptah-extension/ui`, `libs/frontend/ui/src/lib/surfaces/list-detail.component.ts`
and `list-row.directive.ts`, exported through `surfaces/index.ts` and the lib barrel).

B0 landed on disk before this batch's components were written, so the code targets the
real contract, not the planned one. B0 uses viewport media variants
(`min-[768px]:`, `min-[1200px]:`), so this page does the same — no container queries
anywhere in B2.

## Files changed / added

| File | Change |
| --- | --- |
| `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts` | Additive: `nextCursor`, `loadingMore`, `loadMoreError`, `searchQuery` signals; search condition in `filteredRuns`; cursor handling in `load()`; new `loadMore()`; `setSearch()`; `clearFilters()` also clears the search. No existing behavior changed. |
| `libs/frontend/review-runs-ui/src/lib/review-runs.store.spec.ts` | 3 new tests: run search, cursor append with duplicate skip, failed next page + retry. |
| `libs/frontend/review-runs-ui/src/lib/components/review-page-header.component.ts` | NEW. Presentational header (title, sub, "Last refreshed", publishing badge, Pause/Resume, Refresh, Review settings). |
| `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts` | Rewritten to the Inbox shell: header component, banners, `ptah-list-detail` with leading/list/detail slots, search input, Load more, inline detail host, unchanged drawer/dialog blocks. |
| `libs/frontend/review-runs-ui/src/lib/components/review-runs-list.component.ts` | Rewritten: rows are `button[ptahListRow]` options of a `role="listbox"`, with the option-A title/meta/status lines and the kept failure and head-retry lines. |
| `libs/frontend/review-runs-ui/src/lib/components/review-repositories.component.ts` | Rewritten: listbox with "All repositories" + per-repo rows as `ptahListRow` options, publication badges in state ink, kept enabled line and empty state. |
| `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.spec.ts` | Updated to the new DOM (listbox rows, header Pause/Resume, search, Load more); every behavior assertion kept or extended. |
| `libs/frontend/review-runs-ui/src/lib/components/review-runs-list.component.spec.ts` | Updated to option rows + ink/selected assertions; failure/head-retry lines now covered too. |
| `libs/frontend/review-runs-ui/src/lib/components/review-repositories.component.spec.ts` | NEW. |

Untouched (as required): `review-run-detail.component.*`, `review-findings-table.component.*`,
everything under `src/lib/findings`, `review-settings-drawer.*`, `review-repositories-editor.*`,
`review-confirm-dialog.*`, `review-bot-identity.*`, `apps/ptah-extension-webview/src/styles.css`,
`tailwind.config.js`, any other library or app.

## Behavior -> where it is now

| Behavior | Where it is now |
| --- | --- |
| Pause/resume publication with confirm | Pause button: `review-page-header.component.ts:44-47` (disabled rule `!pauseAvailable() \|\| pauseSaving()`), page handlers `review-runs-page.component.ts:49-50,289-293`. Pause calls `setPublicationPause(true)` directly; Resume opens the confirm dialog (`review-runs-page.component.ts:264-271`); confirm calls `setPublicationPause(false, true)`. Same RPC and confirm dialog id `review-page-resume-confirm` as before. `pauseError` still drives the banner. |
| Publishing badge ("Publishing live" / "Publishing paused") | `review-page-header.component.ts:35-40` — `badge badge-outline` with `text-state-done` / `text-state-need` ink and a `bg-current` dot. |
| Refresh (header) | `review-page-header.component.ts:50-56` (aria-label "Refresh review runs", disabled while refreshing) -> page `:51` -> `store.refresh()`. |
| Refresh (empty state) | `review-runs-page.component.ts:215-219` ("No review runs yet" branch, `(click)="store.load()"`). |
| Review settings entry | `review-page-header.component.ts:59-64` -> page `:52,281-284` -> settings drawer block `review-runs-page.component.ts:247-261` (same inputs/outputs as before). |
| Repository filter (pane) | `review-repositories.component.ts:35-73` — "All repositories" row first (`:40-50`), per-repo rows, `(choose)` -> `store.setRepoFilter` at `review-runs-page.component.ts:110-112`. |
| Repository filter (select) | `review-runs-page.component.ts:123-142` — `id="review-repo-filter"`, sr-only label "Repository", "All repositories" option, hidden at >=1200 px viewport (`min-[1200px]:hidden`). |
| State filter | `review-runs-page.component.ts:142-158` — `id="review-state-filter"`, sr-only label "State", options from `ReviewStateSchema.options`; handler `:295-304` keeps the zod safeParse. |
| Clear filters | `review-runs-page.component.ts:200-212` -> `store.clearFilters()` (now also clears the search). |
| Open run | Run rows `review-runs-list.component.ts:36-44` -> page `review-runs-page.component.ts:180-184` -> `store.selectRun`. |
| Run detail outputs (retry / retryFindings / closed) | `review-runs-page.component.ts:230-238` — same bindings as before: retry -> `store.loadRun`, retryFindings -> `store.reloadFindings`, closed -> `store.closeRun`. |
| Offline / error / no-lanes / poll-failed / pause-error banners | `review-runs-page.component.ts:54-96` — same texts, `role="alert"`, same retry actions ("Retry with Refresh" aria-label at `:65`, "Retry connection" at `:79`, "Retry" at `:88`). Only the `mt-*` margins were dropped (the shell `main` now uses `gap-4`). |
| Loading skeleton | `review-runs-page.component.ts:166-175` — 3x `skeleton h-12 w-full`, `role="status"`, aria-label "Loading review runs", same condition `state() === 'loading' && !hasCache()`. |
| Empty: no matching runs | `review-runs-page.component.ts:200-212` — same texts + "Clear filters". |
| Empty: no review runs yet | `review-runs-page.component.ts:213-221` — same texts + "Refresh". |
| `aria-busy` on the runs region | `review-runs-page.component.ts:115-116` (section aria-label "Review runs list", `[attr.aria-busy]="store.isRefreshing()"`). |
| Selector `ptah-review-runs-page` | `review-runs-page.component.ts:26`. |
| All existing ids / data-testids | `review-repo-filter` (`:127`), `review-state-filter` (`:146`), `review-page-resume-confirm` (`:266`), `search runs` aria-label (`:160`), banner labels (`:55-96`). No id or data-testid was removed. The old checkbox "Pause all publication" had no id. |
| Run search (new) | Input `review-runs-page.component.ts:157-164` -> `setSearch` -> `store.searchQuery` (`review-runs.store.ts:64,238`) -> `filteredRuns` (`:90-104`). Local filter on PR number and "owner/name". |
| Load more (new) | Button `review-runs-page.component.ts:185-199` -> `store.loadMore()` (`review-runs.store.ts:137-159`) -> `review:listRuns` `{ limit: 100, cursor }`; dedupes by `attemptId`; error text "More runs could not be loaded." |
| Repositories empty state | `review-repositories.component.ts:75-80` — same texts. |
| Failure / head-retry lines | `review-runs-list.component.ts:56-65` — same texts, titles and `text-error` / `text-warning` inks. |

## Detail host classes

The detail host is an inline wrapper `div` around the untouched
`ptah-review-run-detail` (`review-runs-page.component.ts:226-239`), with exactly the
classes the batch named:

```
[&_ptah-review-run-detail>div]:static
[&_ptah-review-run-detail>div]:bg-transparent
[&_ptah-review-run-detail>div>aside]:static
[&_ptah-review-run-detail>div>aside]:max-w-none
[&_ptah-review-run-detail>div>aside]:border-0
[&_ptah-review-run-detail>div>aside]:p-0
[&_ptah-review-run-detail>div>aside]:shadow-none
[&_ptah-review-run-detail>div>aside]:bg-transparent
```

No `!` variants were needed: each arbitrary-descendant rule compiles to
`.HOST ptah-review-run-detail>div` (specificity 0,1,2) or
`.HOST ptah-review-run-detail>div>aside` (0,1,3), which beats the single-class utilities
`fixed`, `absolute`, `surface-1`, `max-w-2xl`, `border-l`, `p-5`, `shadow-xl`, `bg-black/60`
(0,1,0). The nested live-rerun confirm dialog inside the detail is one level deeper
(`<div>` > dialog), so it keeps its real `fixed z-[60]` modal.

What still behaves like a modal (reported, not changed — the file is owned by PR #1040):

- The `aside` keeps `role="dialog"` and `aria-modal="true"`.
- `ngAfterViewInit` still focuses `#review-detail-title` on open, and focus is restored
  on destroy; the `onKeydown` Tab trap and Escape -> `closed.emit()` remain. Escape
  therefore returns to the list through `store.closeRun()` (`detailOpen` false).
- `z-50` stays on the overlay `div` but is inert because `static` ignores z-index.
- `overflow-y-auto` stays on the `aside`; harmless because the detail pane scrolls too.

## Differences from the prototype that remain

- Prototype `state-done`/`status-dot`/`active-line` classes do not exist in the app
  (`styles.css` has no such selectors; `tailwind.config.js:32-36` defines `state-*` as
  Tailwind COLORS). B2 uses the app equivalents: `text-state-*` ink, a `bg-current`
  dot span, and B0's `ptahListRow` gold `border-[var(--ptah-gold)]` active line.
- The prototype's container-query tiers (`@container/page`, `@min-[1200px]`) are replaced
  by B0's viewport variants (`min-[768px]:p-6`, `min-[1200px]:hidden`) because
  `@tailwindcss/container-queries` is not installed. Same breakpoints as the prototype.
- The runs pane adds a "Search runs" input, a state filter select, "Load more",
  the queued count, and the failure/head-retry lines — all from the current product
  surface; the prototype pane only had the repo select and rows.
- The repositories rows keep the muted "Review enabled / Review disabled" line of the
  current product (the prototype rows show only name + badge).
- The header keeps the third muted line "Last refreshed ..." (the prototype has no
  equivalent).

## Decisions

1. **Ink idiom**: `text-state-*` + `bg-current` dot instead of prototype `state-*` /
   `status-dot`. Evidence: `apps/ptah-extension-webview/tailwind.config.js:32-36`
   (colors), no `.status-dot` in `styles.css`, same choice as B1
   (`machines-page-header.component.ts:36-42`) and B0 (`list-row.directive.ts:11`).
   Reversible.
2. **Viewport variants, not container queries**: B0's landed shell uses
   `min-[768px]:`/`min-[1200px]:`; the page follows so tiers stay coherent.
   Reversible.
3. **Run status ink map** (`review-runs-list.component.ts:11-20`): succeeded done,
   running run, queued idle, partial/superseded/interrupted need, failed err,
   skipped idle. The batch named succeeded/running/queued/partial/superseded/failed;
   interrupted follows the UX state table and skipped matches its "idle" family.
   Labels keep today's exact texts. Reversible.
4. **"Dry run" badge spelling** (was "Dry-run") per the batch text; other labels
   unchanged. Reversible.
5. **Kept from the current product** (nothing-removed rule): muted "Review enabled /
   Review disabled" repo line, repository count beside the heading, queued count,
   state filter, failure/head-retry lines, "Last refreshed" line. Dropped only the
   lucide RefreshCw icon box (prototype header has plain ghost buttons; the icon had
   no behavior).
6. **Search + Load more built in** (decisions.md #5/#6 said only without a contract
   change): `review:listRuns` already takes `cursor` and returns `nextCursor`
   (`review-rpc.schema.ts:60-64` region), and the search is a local filter — both are
   small additive store state, no contract change, verified against the schema.
7. **Banner margins** (`mt-3`/`mt-4`/`mt-5`) dropped: the shell `main` uses `gap-4`.
   Texts, roles, actions untouched.
8. **`ptah-list-detail class="min-h-0 flex-1"`**: B0's host already carries
   `flex min-h-0 min-w-0 flex-1`; the added classes are inert belt-and-braces for the
   `flex-col` shell and cost nothing.
9. **Empty pane message**: "Select a run to see its findings." centered muted, per the
   batch; shown only when no run is selected.

## Proposed Removals

- None. Everything the old page did still exists; only markup changed.

## What was not verified

- Jest and typecheck were NOT run in this lane (batch rule; the coordinator runs them).
  `ptah_get_diagnostics` (TypeScript language service) reported 0 errors in all 9
  changed files; the 5 errors it showed in `libs/shared` (BigInt/ES2020) are pre-existing
  and unrelated.
- `npm run verify -- -t lint -p review-runs-ui` was started once at the end; the result
  is recorded below.
- No visual review, screenshots or Electron run (not permitted in this lane; capture
  states belong to the coordinator per the batch plan).

### Lint result

- (recorded after the run)
