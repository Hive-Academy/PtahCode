# Batch B3 — Machines page aligned with the approved prototype

Batch: B3 (Machines page, Electron renderer). Target: `.ptah/specs/TASK_2026_UX_REVIEWS_MACHINES/prototype/machines-a.html` (approved option A). All changes inside `libs/frontend/machines-ui/src/lib/components/`.

## Files changed

- `machine-list/machine-list.component.ts` — reworked to the prototype row; pane add button, alias span and footer removed; unused imports/outputs removed.
- `machine-list/machine-list.component.spec.ts` — updated for the removed elements and the new row content.
- `remote-session-list/remote-session-list.component.ts` — flat, bordered, whole-row-button session rows; grouping markup removed; `durationText` import and `flatRows` computed added.
- `remote-session-list/remote-session-list.component.spec.ts` — updated for flat rows, age, and the moved open testid.
- `machines-view/machines-view.component.ts` — binding change only: removed `(add)="openAdd()"` from `ptah-machine-list` (the output no longer exists).
- `machines-view/machines-view.component.spec.ts` — the add-flow test now clicks the page header button `machines-add`; the empty test asserts the pane has no add control.

## Testids removed / moved

- Removed: `machine-list-add` (pane header add button). The page header button `machines-add` (`machines-page-header.component.ts`, untouched) stays the only one.
- Removed: `remote-session-workspace` (the workspace group wrapper; rows are flat now).
- Moved: `remote-session-open` — from the separate "Open" text button to the whole-row button (the old separate Open text is gone). `remote-session-row` stays on the wrapping `li`.
- Added: `remote-sessions-empty-list` — workspaces exist but no session: "No sessions yet." (machines-ux.md M10 copy).
- Kept: `machine-row`, `machine-row-meta`, `machine-list-search`, `machine-list-loading`, `machine-list-error`, `machine-list-retry`, `machine-list-empty`, `machine-list-no-match`, `remote-session-state`, `remote-session-driver`, `remote-sessions-reload`, `remote-session-new`, `remote-sessions-loading`, `remote-sessions-error`, `remote-sessions-empty`, and every `remote-session-new-*` form testid.

## What machines-ux.md says (items 3 and grouping)

- Item 3, footer: machines-ux.md:139 — "Static footer 'This machine stays in Chat.' → removed; the header description carries it." So the footer line is removed from the list pane (inventory-machines.md:133 lists it as a static caption with no action).
- Grouping: greping "group" in machines-ux.md hits only "status-grouped rows" for the machine list (line 36) and "new grouping" for pending approvals (line 45). For sessions, line 47 keeps the workspace only inside the New-session form ("workspace select"), and line 99 wants "Session row (whole row is a button…)". Nothing keeps session rows grouped by workspace, and the prototype shows flat rows with no workspace labels → session rows are flat. The workspace path still travels with every open request (`RemoteSessionOpenRequest.workspacePath`), and the New-session form still lists workspaces.

## Row changes

- machine-list row: line 1 = machine name only (the SSH alias is gone from the row; the search still matches it, and the alias still shows in the detail pane). Line 2 = state marker + state label + "· last seen" in one line: "now" (< 10 s), "12 s ago", "Not connected" (offline/reconnecting without a last-seen time), "Pair to connect" (unpaired); version-mismatch rows carry no meta (prototype parity). The state label can no longer truncate: the status host gets `shrink-0` and the meta span lost `truncate`/`min-w-0`. The Ptah version was dropped from the row (the detail pane keeps it). Row testids, aria (`role="listbox"`, roving `tabindex`, `aria-selected`, `aria-current`) and keyboard behavior are unchanged.
- remote-session row: a bordered row (`rounded border border-base-300`), the whole row one `<button type="button">` that performs the old Open action by mouse and keyboard. Line 1 = session title · provider · age (relative, short, e.g. "2 min", from `updatedAt` via `durationText`). Line 2 = an 8 px state dot (`bg-current`, it follows the text ink) + state label with the same theme inks as before: Running `text-state-run` (info/blue), Interrupted `text-state-need` (warning/orange), Idle and Unknown `text-base-content-muted`; all three states plus "Unknown" while disconnected are kept. The driver badge ("Driver: …", watch-only) and the row's `aria-label` ("Open session: …, driven by …, watch only") are kept. Refresh, New session (with its workspace select, prompt, Start, Cancel), loading, empty and error states and all load/start behavior are unchanged.

## Decisions

- Last-seen text: "now" under 10 s, else "X ago" from `durationText` — reproduces the prototype rows "Connected · now" and "Offline · 5 min ago" without editing `machine-copy.ts` (outside the write set). Reversible.
- Session age uses `Date.now()` at render time inside `flatRows`: the component has no `now` input and adding one would change `machine-overview` bindings (outside the write set); there is no timer, so an age is fixed per render, as documented in the component docblock. Reversible.
- The driver badge sits under the state line (the prototype has no driven-row sample; the badge and its copy are preserved). Reversible.

## Verification

- `ptah_get_diagnostics` (TypeScript compiler) scoped to the six changed files: no errors in the requested files. Eight pre-existing sibling errors (BigInt literals vs. ES2020 target) exist in `libs/shared` and `libs/worker-protocol`; those files are untouched by this batch.
- Jest, typecheck and lint were not run here; the coordinator runs `npm run verify -- -p machines-ui` (lint, test, typecheck) for this batch.

## Not done

- machines-ux.md:99 also names "roving focus" as the full fix for problem 10. This batch delivered the whole-row button (each row is a native, Tab-reachable button that opens on Enter/Space); a roving-`tabindex` reduction like the machine list was not requested and remains open.
- No rendered screenshot review: running the Electron app is out of this batch's scope (the coordinator runs verify only).
