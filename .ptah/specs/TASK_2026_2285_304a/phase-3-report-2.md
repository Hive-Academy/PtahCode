# Phase 3 chain lane 2 report (B3.6, B3.7a, B3.8, B3.7b)

Status: B3.6, B3.7a, B3.8, B3.7b complete; focused checks green. No commit. Coordinator still runs
`typecheck-templates` (every batch changed templates) and the Electron visual review.

## B3.6 Detail

Files changed:
- `PA/lanes-table-detail.component.ts`, `.html`, `.css`, `.spec.ts` (rewrite per 3.6).
- `PA/lanes-table.visual.component.spec.ts`: `:126` test adds a footer assertion; the `:200` test inverts its last
  assertion (see Deviations).
- `PA/cli-orchestration-matrix.component.ts`: only the `showCapabilities` selector, now
  `#lane-detail-<id> [data-lane-capabilities] button`.
- `PA/cli-orchestration-matrix.component.spec.ts`: only the `:407` test.
- `PA/lanes-table.component.spec.ts`: no change needed (`:181`, `:200` pass, `.quiet-actions` is kept).

Acceptance:
- Left facts: CLI = Provider, Account (Claude), Executable, Native behavior (inline, one-line clamp, More / Less when
  the text is longer than 72 characters), Copilot "Auto-approve" switch row (`ptah-copilot-auto-approve-toggle`,
  write unchanged). Ptah = Key status, Tier models ("n of 3 set" / "loading" + one line per tier). No Version, no
  Provider on the Ptah detail.
- Right: inline capability facts with icons (`MessageSquare`, `ShieldCheck`, `Globe`, `Plug`, `Gauge`), no buttons.
  "All capabilities" is a `ptah-disclosure` with `data-lane-capabilities`; it opens when `openKind() === 'capabilities'`
  (kebab route).
- Deleted: `toggleChip`, `openChip`, the chips and their popovers, the permission popover, `infoKinds` and its loop.
  One install-only popover branch, `@if (!system.installed)`, with the same trigger and `kind="install"`.
- Footer (`border-t`, `data-testid="lane-detail-footer"`): Test + `role=status` result left; Credentials, Install
  guide, Codex settings, Edit tiers, then `<ng-content select="[footer-actions],[laneActions]" />`.
- Inputs, outputs and `CliProviderInfoKind` unchanged. `:254-276` (install tests) pass unchanged.
- One scroll owner (decision 44 / 32): the detail has no `max-h`/`overflow-auto` panel now (the old instance
  capabilities popover had `max-h-72 overflow-auto`); `ptah-cli-capability-detail` sticky offset is reset in the detail.

Checks:
- Jest, the 5 specs: 104 passed, 0 failed (detail spec: 21 passed).
- `tsc` lib: exit 0. `tsc` spec: 382 errors (before: 384); 0 in changed files of this batch (2 old fixture errors in
  the detail spec are fixed).
- ESLint on the 6 changed files: 0 errors, 6 warnings (`no-non-null-assertion` in the detail spec).

Deviations:
- `lanes-table.visual.component.spec.ts:200` ("keeps the version line in compact rows ... detail version") asserted the
  version in the detail. Plan 3.6 removes Version from the detail, so the test failed. The Tests table does not name this
  line for B3.6. The file is in the B3.6 write set, so I inverted the one assertion (`not.toContain('v1.2.3')`).
- The instance "All capabilities" uses `ptah-cli-capability-detail` with the instance manifest (same
  `cliCapabilityView` groups as the old instance popover). See Decisions.


## B3.7a Reorder mode and write

Files changed:
- `PA/lanes-table.component.ts`, `.html`, `.css` (Order cell, Reorder mode, live region only).
- `PA/lanes-table.component.spec.ts` (`:11` import, the `order` describe block).
- `PA/cli-provider-grid.component.ts` (`moved` -> `reordered`, NEW `orderSettled(id, direction)` pass-through).
- `PA/cli-orchestration-matrix.component.ts` (`(reordered)="reorderLanes($event)"`, NEW `reorderLanes`, `moveLane`
  deleted).
- `PA/cli-orchestration-matrix.writes.spec.ts` (`:469`, `:508` triggers; 2 NEW tests).
- `PA/move-preferred-agent-order.ts`, `.spec.ts` (`movePreferredAgentOrder` -> `applyDisplayedAgentOrder`).

Acceptance:
- Order cell in Reorder mode: `GripVertical` grip (`draggable`, `aria-roledescription="sortable"`,
  `policy-order-grip-<id>`), `ChevronUp` / `ChevronDown` `ptahIconButton` (`policy-order-up-/down-<id>`, label
  "Move X up/down", `aria-disabled="true"` at the ends and while a move cannot run). Drop indicator
  `policy-order-drop-indicator` (plus a 2px row line through `tr[data-drop]`). Live region `policy-order-live`.
- One `LaneOrderDrag` with `ids` = numbered rows in display order, `move` = `reordered.emit`. Unpositioned rows keep the
  dash and get no grip or buttons. Not-enabled lanes stay movable. After the save, focus returns to the same button of
  the moved row (or its other button at an end) and the position is announced.
- Turning Reorder on closes the expanded detail and its popovers (decision 26).
- `PtahTableOrderButtonsComponent` use and `moveRow` deleted. `moved` deleted from the table, grid and matrix binding.
- `applyDisplayedAgentOrder` keeps undisplayed saved ids in their slots; the 4 old cases are ported. The writes spec
  payloads stay byte-equal (`['antigravity','cursor','codex','glm-1','copilot','opencode']`).
- Drag and up / down persist in this batch (NEW writes tests for both, Undo restores the old order).

Checks:
- Jest, the 5 specs + `move-preferred-agent-order.spec.ts`: 117 passed, 0 failed.
- `tsc` lib: exit 0. `tsc` spec: 382 errors (unchanged from B3.6), 0 new.
- ESLint on the 8 changed files: 0 errors, 14 warnings (`no-non-null-assertion` in specs).

Deviations:
- NEW public `orderSettled(id, direction)` on the table and the grid; the matrix calls it after the save. The plan
  names the focus and announcement rules but no settle path. See Decisions.
- The live region renders only in Reorder mode. The table already has one polite region (`ptah-table`), and
  `lanes-table.visual.component.spec.ts:267,:313` (not in the B3.7a write set) count exactly one outside Reorder mode.
- Group headers in Reorder mode: there are none yet (they come in B3.7b), so the flat list is today's single `tbody`.


## B3.8 Add more strip

Files changed: NEW `PA/lanes-add-more-strip.component.ts`, NEW `PA/lanes-add-more-strip.component.spec.ts`.

Acceptance:
- `ptah-lanes-add-more-strip` with `rows: readonly SystemCliMatrixRow[]` (required), `guides` (required), `busy`,
  output `redetect: string`, public `closeGuide(rowId)`. Not bound yet (B3.7b binds it).
- Header `PackagePlus` "Add more CLI agents" + count (`lanes-strip-count`) +
  `<ptah-lanes-redetect-button testId="lanes-strip-redetect" />`. No render when `rows` is empty.
- Grid `repeat(auto-fill, minmax(11rem, 1fr))` in component CSS with `--ptah-*` tokens (no raw spacing utility).
  Card `cli-provider-card-<id>`: monogram tile, name, `CircleDashed` "Not installed", `BookOpen` "Install"
  (`lanes-strip-install-<id>`) -> `ptah-native-popover` (cap on, the default) with
  `ptah-cli-provider-card-popovers kind="install"`; `ptah-disclosure` "Details" (Provider, Native behavior,
  `ptah-cli-capability-detail`, read-only).
- The strip owns `openId` (one popover at a time) and the focus: a close without re-detect returns focus to the Install
  button; `closeGuide` moves no focus (the matrix moves it to the new table row, U-7).

Checks:
- Jest `lanes-add-more-strip.component.spec.ts`: 7 passed, 0 failed.
- `tsc` lib: exit 0. `tsc` spec: 382 errors (unchanged), 0 in the new files.
- ESLint on the 2 files: 0 errors, 10 warnings (`no-non-null-assertion` in the spec).

Deviations: none.


## B3.7b Groups, rows and strip binding

Files changed:
- `PA/lanes-table.component.html`, `.ts`, `.css`.
- `PA/lanes-table.component.spec.ts`, `PA/lanes-table.visual.component.spec.ts` (Re-detect stub override; rewritten
  tests named below; NEW `groups` and `keyless Cursor recovery row` blocks).
- `PA/cli-provider-grid.component.ts` (`ptahDefaults`, `addRequested`, `ptahDefaultSelected`,
  `ptahDefaultResetRequested` pass-through; `capabilities`, `installGuide` deleted).
- `PA/cli-orchestration-matrix.component.ts`: `recoveryRows`, `stripRows`, new `tableRows`; `ptahDefaults`;
  bindings `[ptahDefaults]`, `(addRequested)`, `(ptahDefaultSelected)`, `(ptahDefaultResetRequested)`; strip binding
  (hidden in Reorder mode) + `viewChild(LanesAddMoreStripComponent)`; `redetectFromGuide` also calls the strip
  `closeGuide`; deleted `ptah-cli-shared-defaults`, `ptah-cli-instances` elements and imports, `showCapabilities`,
  `showInstallGuide`, the `(capabilities)` / `(installGuide)` bindings; P-13 empty text.
- `PA/cli-orchestration-matrix.component.spec.ts`: `:390` (groups, recovery row, strip ids), `:458` kept (Add from
  the Ptah group header), `:531` (install + Re-detect through the strip card, U-7 focus); NEW counts, Reorder hides
  the strip, still-missing, keyless Cursor detail, one Add, P-13 text.
- `PA/cli-orchestration-matrix.writes.spec.ts`: `:577` (Edit tiers from the detail footer), `:604` (`'cursor'` for the
  table, a strip `redetect` emit for `pi`).
- Outside the B3.7b write set (B3.6 file, see Deviations): `PA/lanes-table-detail.component.html` (Edit tiers test id
  `cli-matrix-tiers-<id>`; the `[laneActions]` compatibility selector removed), `PA/lanes-table-detail.component.css`
  (the `[laneActions]` rule removed).

Acceptance:
- Two `tbody` groups: CLI agents (`lanes-group-cli`: `Terminal` + name + count + `<ptah-lanes-redetect-button />`) =
  system rows (installed, then recovery); Ptah CLI instances (`lanes-group-ptah`: `Boxes` + name + count + defaults
  cell `lanes-ptah-defaults` when `ptahDefaults()` is set, with `resetVisibility="always"`, + the header Add
  `cli-matrix-add` -> `addRequested('header')`). Empty Ptah group: `cli-matrix-no-instances` row with the primary Add
  -> `addRequested('empty')`. Exactly one Add renders.
- Group gap: `padding-top: 1.75rem` + hairline on the second header cells (`.lanes-group-second`), no spacer row.
- Reorder mode: one flat `tbody` (`data-lanes-group="flat"`), no group headers; the matrix hides the strip.
- Global numbers across both groups; recovery rows unnumbered (dash). Card badge total = installed + recovery =
  sum of the group counts; strip CLIs are not counted (matrix spec).
- Ptah rows: inherited Permission / Network with `Link2` + "(default)" (`lanes-inherited-*`), 2px gold
  `--color-secondary` inset on the first cell.
- Kebab = Test (+ Sign in for `needs-key`). Removed from the kebab: Details, All capabilities, Tiers, Edit, Delete.
  Status-cell recovery button = "Sign in" only (no "Install guide"). `recover` lost its `not-installed` branch.
- Detail footer `[footer-actions]`: Reset (`RotateCcw` icon-only, `lanes-detail-reset-default`, label = value), Edit
  (`Pencil`, `cli-matrix-edit-<id>`), Delete (`Trash2`, `cli-matrix-delete-<id>`, inline confirm). Cancel returns focus
  to the footer Delete; Confirm keeps the next-row focus rule of `LanesTableDeleteFocus`.
- States: loading = `Loader2` line + 3 `lanes-skeleton-row` rows in a `tbody[aria-busy="true"]`; error = `TriangleAlert`
  + message + Retry (`RotateCcw`), `role="alert"`; empty = `Inbox` "No lanes available"; partial error row above the
  groups (`lanes-partial-error`, `role="alert"`).
- Lane rows: `height: var(--ptah-lane-row-h)` (3.5rem) on `tr[data-lane-kind]`. Below 640px the kind badge hides.
- CSS for the removed hidden identity link (`.lane-install-guide`) deleted.
- Keyless Cursor: in the CLI group after the numbered rows, muted, dash, disabled switch, Sign in (status cell and
  kebab) -> detail with Credentials open and Install guide in the footer; its Re-detect emits `redetect('cursor')`.
- Not-installed CLIs are only in the strip.

Checks (after the last batch, all 7 specs: the 5 named + `lanes-add-more-strip` + `move-preferred-agent-order`):
- Jest: 7 suites, 139 passed, 0 failed.
- `tsc` lib: exit 0. `tsc` spec: 382 errors (start of this lane: 384); the 11 left in changed spec files are old
  fixture-type errors (`ProvidersOrchestration`, `ClaudeAmbientStatusView`, error-text literal, `CliPermissionNote.label`)
  at lines this lane did not write; 0 new.
- ESLint on the 15 changed files: 0 errors, 36 warnings (`no-non-null-assertion` in specs; the Nx module-boundary rule
  is skipped without a project graph).

Deviations:
- Column layout: the table keeps 8 columns (Status third, kebab inside the Status cell) and Status stays visible below
  640px. Plan 3.7 names a 9-column layout with a kebab column. See Decisions; this needs the coordinator's call.
- I edited `PA/lanes-table-detail.component.html` / `.css` (B3.6 files) in B3.7b: the footer Edit tiers button had no
  `cli-matrix-tiers-<id>` id (plan 3.7: the id moves to the footer button), and the `[laneActions]` compatibility
  selector had no user after the table moved to `[footer-actions]`.
- Identity line 2 "Sign in" link (design-spec P17) is not added: `lane-row-identity.component.ts` is not in the write
  set. The recovery "Sign in" is the status-cell button and the kebab item (visual spec `:569` rule "Sign in beside
  status").
- Kebab items have icons (`Play`, `LogIn`) inside `ptah-table-row-actions` menu items.


## Reads outside the read set

- `UI/patterns/table/table-detail-layout.ts`, `UI/patterns/description-list/description-list.component.ts`,
  `UI/button/button.directive.ts`, `UI/button/icon-button.directive.ts`, `UI/button/button-host.ts`,
  `UI/patterns/table/table.component.ts` (slots, inputs, the busy / aria-disabled behaviour, multiple `tbody`).
- `UI/native/popover/native-popover.component.ts` (`capToViewport`, `isOpen` inputs only).
- `PA/cli-capability-view.ts`, `PA/copilot-auto-approve-toggle.component.spec.ts` (stub shape),
  `PA/lane-order-list.component.ts` (settle and focus pattern), `PA/agent-orchestration-config.component.ts:345-362`,
  `PA/lanes-table-delete-focus.ts`, `PA/lane-option-labels.ts`, `PA/lanes-redetect-button.component.ts` + spec,
  `PA/lane-row-identity.component.ts:150-215`.
- `libs/shared/src/lib/types/cli-lane-defaults.types.ts:43-75` (`resolveCliLaneDefaultPair`,
  `PTAH_CLI_PERMISSION_CAPABILITIES`).
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` (token names only), `tools/ui-class-audit/check-ui-classes.ts`
  (rule text).

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Instance "All capabilities" renders `ptah-cli-capability-detail` with the instance manifest | own `@for` of groups (old popover markup) / the shared component | both render `cliCapabilityView(manifest).groups`; one component = one look | yes |
| Native behavior More / Less shows only above 72 characters | always / never / by length | a toggle that does nothing on a short text is noise; jsdom cannot measure line overflow | yes (one constant) |
| NEW `orderSettled(id, direction)` on the table and the grid, called by the matrix after the save | table effect on `rows()` / host call | `LaneOrderDrag.settled` must run after the read-back; `lane-order-list` uses the same host call (`agent-orchestration-config.component.ts:350-359`) | yes |
| Up / down buttons use `aria-disabled` (not native `disabled`) at the ends and while blocked; clicks are guarded | native disabled / aria-disabled | plan 3.7 says `aria-disabled`; a natively disabled focused button loses focus after a move | yes |
| `policy-order-live` renders only in Reorder mode | always / Reorder only | `lanes-table.visual.component.spec.ts:267,:313` count one polite region; the region is only used in Reorder mode | yes |
| Column layout of B3.2-B3.5 kept: 8 columns, Status third, kebab inside the Status cell | 9 columns with a kebab column (plan 3.7 text) / keep | the approved prototype keeps Status third (`prototype/index.html:625-635`); a column move rewrites the B3.2-B3.5 CSS and the colgroup / tier specs; not in the B3.7b acceptance list | yes (a later batch) |
| Status column stays visible below 640px | hide (plan) / keep | the kebab lives in the Status cell; hiding it removes Test and Sign in at 800px with nav | yes, with the column move above |
| Ptah inherited value uses `ptahDefaults().manifest` or `PTAH_CLI_PERMISSION_CAPABILITIES`, and `ptahDefaults().saved` or `defaults()['ptah-cli']` | only `ptahDefaults` / with fallbacks | a Ptah row must show a value also before the manifest is read | yes |
| CLI group empty row only when the whole table is empty ("No lanes available") | always / only when empty | `cli-orchestration-matrix.writes.spec.ts:622` (not in the write set) counts one message cell with a partial error; the matrix `cli-matrix-empty` text covers an empty CLI group | yes |
| Delete Cancel returns focus to the footer Delete button; Confirm keeps the next-row kebab rule | change `LanesTableDeleteFocus` / handle in the table | `lanes-table-delete-focus.ts` is not in any write set; the table passes the row's kebab trigger to `capture()` | yes |


## Needs an Electron visual check

- Detail: two columns at >= 600px container, one column below; footer rule; native behavior clamp; Copilot switch row.
- Group headers: wrap of the Ptah defaults cell + Add at 800px with nav; the 1.75rem gap; gold inset on Ptah rows.
- Reorder mode: Order column width 5.25rem; grip and buttons; drop line; focus return.
- Strip: card grid at 800px and 1600px; install popover cap; Details disclosure height.
- Row height 3.5rem with two-line identity; skeleton rows.

## Clarifications Needed

1. Table columns: keep the 8-column layout (Status third, kebab in the Status cell), or move to the plan's 9 columns
   (separate kebab column, Status hidden below 640px)?
   - (Recommended) Keep 8 columns for this PR; matches the prototype column order and keeps Test / Sign in at 800px.
   - Move to 9 columns in a follow-up batch (table html/css + the colgroup and tier specs).

## UI class audit

Command: `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` from the worktree root, after B3.7b.
Exit 0. `ui-class-audit: TOTAL 874 blocked token(s) across 216 file(s); 0 token count(s) over baseline`;
`[raw-spacing]: TOTAL 581 blocked token(s) across 39 file(s); 0 token count(s) over baseline`.
`--update-baseline` was not run. Log: `.ptah/tmp/l2-audit.log`.

## Handoff

- State: B3.6, B3.7a, B3.8, B3.7b done. Nothing in work. No commit.
- Chain 3 must know: table outputs now `reordered`, `addRequested`, `ptahDefaultSelected`,
  `ptahDefaultResetRequested`; public `orderSettled`; `capabilities`, `installGuide`, `moved` are gone. Test ids:
  `lanes-group-cli`, `lanes-group-ptah`, `lanes-ptah-defaults`, `cli-matrix-add`, `cli-matrix-no-instances`,
  `lanes-partial-error`, `lanes-empty`, `lanes-skeleton-row`, `lanes-sign-in`, `lane-detail-footer`,
  `lanes-strip`, `lanes-strip-install-<id>`, `lanes-strip-redetect`, `lanes-strip-count`,
  `policy-order-grip-/up-/down-<id>`, `policy-order-drop-indicator`, `policy-order-live`.
- Duplicate-id window began: `policy-redetect` renders in the CLI group header and in the old policy bar (B3.10
  removes the old one). The header `(addRequested)` binding of `lanes-section-header` still exists (B3.9).
- `ptah-cli-instances` and `ptah-cli-shared-defaults` are no longer used by the matrix (files deleted in B3.11a).

