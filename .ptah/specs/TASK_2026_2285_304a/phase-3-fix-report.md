# Phase 3 fix round 1 report

Status: all 10 findings of `phase-3-code-review.md` FIXED. Nothing is committed (coordinator owns git).
Paths below are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/` unless they start with `libs/`.

## Findings

### 1. Reorder on a partial preferred-order read — FIXED
- `preferred-agent-order-save.ts:13` new `verifiedPreferredAgentOrder(state)`: returns the saved order only when
  `orchestration().status === 'ready'`, data exists, and `missingFields` does not hold `preferredAgentOrder`.
  Otherwise `null`.
- `preferred-agent-order-save.ts:30` `savePreferredAgentOrder(state, feedback, displayed)` is the write boundary.
  It re-reads the verified base, refuses with no context or no verified base, applies `applyDisplayedAgentOrder`
  to that base, and snapshots the same verified base for Undo. It returns the save result or `'unchanged'`.
- `cli-orchestration-matrix.component.ts:348` `verifiedOrder`, `:355` `canReorder` (= canWrite, verified base,
  at least 2 numbered lanes). `:148` header Reorder entry uses `busy() || !canReorder()`. The header keeps Done
  enabled while editing (`lanes-section-header.component.ts` `[disabled]="disabled() && !editing()"`, unchanged).
  `:366` `reorderLanes` refuses before the write when `!canReorder()`, and settles with `saved: false`.
- Moves are not requested without a verified base: new `canReorder` input on the table
  (`lanes-table.component.ts:221`), used by `LaneOrderDrag.canReorder` and by the up / down `aria-disabled`
  (`lanes-table.component.html:239`, `:263`). Pass-through input on `cli-provider-grid.component.ts:34`.
- Tests (`cli-orchestration-matrix.writes.spec.ts`): `:631` failed `agent:getConfig` with a usable two-instance
  list (Reorder disabled, table `canReorder` false, emitted move writes nothing); `:645` `missingFields:
  ['preferredAgentOrder']`; `:664` Done stays operable when the read goes to `loading` during Reorder. The
  existing Undo test (`routes order moves through preferredAgentOrder with undo`) still passes on the verified base.
  `lanes-table.component.spec.ts:968` area: no move requested while `canReorder` is false.

### 2. Full CLI version tooltip (P-42) — FIXED
- `lane-row-identity.component.ts:206` new `versionTitle`: the trimmed raw `version` line when it is not a process
  dump (`isCliProcessDump` from `@ptah-extension/shared`), else the short `versionLabel`. `:155` identity title =
  `name - versionTitle`. Line 2 keeps the short label. Banner / multi-line normalization is unchanged.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts:1420`: the live-shape
  check now asserts the short label on `[data-testid="cli-matrix-version"] .ptah-table-row-title-secondary` and a
  title that ends with ` - ${LIVE_VERSIONS[cli]}` on the identity locator. It also asserts no detail `Version` fact.
- Tests: `lane-row-identity.component.spec.ts:84` Copilot full line `GitHub Copilot CLI 1.0.83.` in the title with
  `v1.0.83` on line 2; a multi-line probe falls back to the short label. Updated expectations in
  `lane-row-identity.component.spec.ts` and `lanes-table.component.spec.ts:1127` (`Codex - 1.2.3`).
- The e2e spec was edited statically only (no e2e run, per the rules).

### 3. Short native note clipped with no More (P-43) — FIXED
- `lanes-table-detail.component.html:45`: the one-line clamp applies only when `nativeIsLong(...)` is true, which is
  exactly when More / Less renders. A short note wraps in full. `lanes-table-detail.component.ts:66` comment updated.
- Test: `lanes-table-detail.component.spec.ts:102` a short "with full access" note has no clamp class and no More.
  The existing long-note More / Less test still passes.

### 4. Drag resolved by a stale index — FIXED
- `lane-order-drag.ts:46` the drag records the dragged id and the id sequence at drag start. `:131` `dragSource()`
  resolves the source by id and cancels the drag (and clears the indicator) when the sequence changed. `dragOver`
  and `drop` both use it. `dataTransfer` carries the same id.
- Tests (`lane-order-drag.spec.ts:221` block): an insertion before the drop gives no move; a changed sequence gives
  no indicator and no `preventDefault`; an unchanged sequence moves the dragged id.

### 5. Move settlement read the old child input — FIXED
- `lane-order-drag.ts:13` new `LaneOrderSettlement { id, direction, saved, order }`. `:115` `settled()` announces
  from the confirmed `order` passed by the host, and only when `saved` is true. Focus is restored in every case.
- `cli-orchestration-matrix.component.ts:378` `settleOrder()` passes the save outcome and
  `rows().installed` ids (the read-back order from state, not the child input).
- `lanes-table.component.ts:416` `orderSettled(result)` moves focus in `afterNextRender`, after the rows render.
  `cli-provider-grid.component.ts:28` forwards the new signature.
- Tests: `cli-orchestration-matrix.writes.spec.ts:692` through the matrix with an asynchronous read-back (announces
  "Codex moved to position 2 of 5", focus on the moved row's Down); `:724` failed save restores focus with an empty
  live region. `lanes-table.component.spec.ts:930` settle before the rows render; failed-save test.
  `lane-order-drag.spec.ts:190` stale `ids()` binding and failed-save cases.

### 6. Install-guide Re-detect treated a missing row as installed — FIXED
- `cli-orchestration-matrix.component.ts:252` `guidePending` keeps `guideDetecting` true from the start of the
  detection call until its read-backs end (`redetectClis()` awaits them). `:550` `redetectFromGuide`:
  - closes the guides and moves focus only when `rows().installed` holds the row as an installed system row;
  - says "Still not found…" only after a complete read (`orchestration` and `cliAgents` ready, no `missing`) that
    still lists the row as uninstalled;
  - otherwise announces "Detection ran, but the lane list could not be read. Try again." (alert).
- Focus fallback: the row toggle, then the stable `[data-testid="cli-matrix"]` region (`tabindex="-1"`).
  `focusAfterRender` now skips a `:disabled` target (`:749`).
- No core change was needed: the matrix reads the section statuses after `redetectClis()` resolves.
- Tests (`cli-orchestration-matrix.component.spec.ts`): `:642` detection succeeds, read-back fails (alert, no
  "Still not found", no focus move); `:664` a second Re-detect during the read-backs does not run; `:684` a found lane
  with a disabled toggle focuses the matrix region.
- Limit: the detail install popover still shows `[busy]` from the table `busy` input (save in progress). The matrix
  guard refuses a second request from it, but that popover does not show the pending state. The strip does.

### 7. Two live Delete confirmation groups — FIXED
- `lanes-table.component.html`: the Status-cell copy is removed. The single `ptah-inline-confirm` is at `:594`,
  inside `footer-actions`, next to the footer Delete, with `lanes-delete-confirm-<id>` / `lanes-delete-cancel-<id>`
  test ids.
- `lanes-table.component.ts:366` an effect clears the pending confirmation (and its focus origin and the delete
  focus capture) when the detail of that row closes or another row's detail opens.
- Tests (`lanes-table.component.spec.ts`): the Cancel test now asserts exactly one group, no Status-cell group, and
  `document.activeElement` is the footer `lanes-delete-cancel-a`; `:614` closing the detail drops the confirmation.
  The next-row focus tests after a confirmed delete still pass unchanged.

### 8. Permanent Loading after failed reads — FIXED
- `cli-orchestration-matrix.component.ts:430` `loading` = no table row and a source status that is `unloaded` or
  `loading`. Two failed reads are not loading, so the table renders its terminal error and Retry
  (`lanes-table.component.html` error branch, unchanged).
- `:440` `confirmedEmpty` = no row, both sources `ready`, no `laneReadError`. `:192` the empty copy uses it.
- Tests (`cli-orchestration-matrix.component.spec.ts`): `:708` both failed → `aria-busy="false"`, no skeleton,
  "Could not load lanes." with Retry, no empty copy; `:722` one source pending → still busy; `:731` partial error with
  zero rows → no empty copy. The existing "projects the host read states" test now uses two `loading` reads (it
  asserted the old bug, `aria-busy="true"` after two failures).

### 9. Reachability harness stale locators — FIXED
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-cli-matrix.entries.ts`:
  - `:65` `matrixCard` uses the row expander as the single table-detail entry point (kebab Details fallback removed).
  - `:250` #42 asserts `data-lane-kind="instance"` and membership under `tbody:has(> [data-testid="lanes-group-ptah"])`,
    with the group name text "Ptah CLI instances".
  - `:693` #53 uses one detail-footer locator (`#lane-detail-<GLM> [data-testid="cli-matrix-tiers-<GLM>"]`) for
    opening and for the focus-return assertion in `closeMatrixModal`.
- Checked statically and with the harness `tsc`. Not run (no e2e, per the rules).

### 10. Reorder offered with fewer than two numbered lanes — FIXED
- Covered by `canReorder` (`cli-orchestration-matrix.component.ts:355`, `rows().installed.length >= 2`). Done stays
  enabled when the count drops during Reorder (header rule unchanged).
- Test: `cli-orchestration-matrix.writes.spec.ts:676` one lane → disabled; two → enabled; drop to one in Reorder →
  Done still enabled.

## Extra files (not named by a finding)
- `cli-provider-grid.component.ts`: pass-through of the new `canReorder` input and the new `orderSettled(result)`
  signature (findings 1, 5). The grid sits between the matrix and the table.
- No file in `libs/frontend/core` changed.

## Checks
- Jest, chat (`--runInBand --coverage=false --runTestsByPath`):
  - `cli-orchestration-matrix.writes.spec.ts`, `cli-orchestration-matrix.component.spec.ts`, `lane-order-drag.spec.ts`,
    `lanes-table.component.spec.ts`, `lane-row-identity.component.spec.ts`: 5 suites passed, 127 tests passed.
  - `lanes-table.visual.component.spec.ts`, `lanes-table-detail.component.spec.ts`,
    `move-preferred-agent-order.spec.ts`: 3 suites passed, 56 tests passed.
  - Total: 8 suites, 183 tests, 0 failures.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0, 0 errors.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json`: 379 errors (baseline 381). 0 new. The 2 fewer
  errors are the old `error: 'x'` literals of the test that now uses `loading` reads. The remaining errors in the
  touched specs are at old fixture lines (`ORCHESTRATION` shape, `ClaudeAmbientStatusView`, `CliPermissionNote.label`,
  `'secret server trace'`).
- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`: exit 0, 0 errors.
- `npx eslint <17 changed files>`: exit 0, 0 errors, 32 warnings (non-null assertions in specs, and `max-lines` on
  `settings-cli-matrix.entries.ts` at 925 lines, already over 700 before this round).
- Not run: `npm run verify`, `nx`, `typecheck-templates`, build, serve, e2e (lane rules). The coordinator must run
  `typecheck-templates` for the template changes in `lanes-table.component.html`, `lanes-table-detail.component.html`
  and the inline templates.

## Decisions
- **Finding 1 guard placement.** Options: guard only in the matrix, or also in the save helper. Chose both: the helper
  re-reads the verified base, so no caller writes on an unverified base. Evidence: the review asks for a guard at the
  write boundary. Reversible.
- **Finding 3 approach.** Options: wrap short notes, or measure overflow. Chose wrap (clamp only with More). No
  observer per row is needed. Evidence: review fix text offers both; role rule on observers per list item. Reversible.
- **Finding 4 approach.** Options: resolve by id on drop, or cancel on a changed sequence. Chose cancel: a drop index
  computed on an old sequence has no safe meaning. Reversible.
- **Finding 5 approach.** Pass the confirmed order and the outcome explicitly; focus still waits for render. Evidence:
  review fix text. Reversible.
- **Finding 6 copy.** New alert text "Detection ran, but the lane list could not be read. Try again." for an
  incomplete read-back. This is NEW copy for user review. Reversible.
- **Finding 8 test change.** The old test asserted `aria-busy="true"` after two failed reads, which is the bug. It now
  uses two `loading` reads for the same projection assertion. Reversible.

## Class audit
`npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0. "TOTAL 533 blocked token(s) across
37 file(s); 0 token count(s) over baseline". No baseline update. No raw Tailwind spacing utility or DaisyUI class was
added (the new markup uses existing components and test ids only).
