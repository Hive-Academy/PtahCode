# Phase 3 report, chain lane 3 (B3.9, B3.10, B3.12, B3.11a, B3.11b)

Working directory: `/home/amun/ptah-extension/.claude-worktrees/settings-lanes-modals`. Base HEAD c50342a09. No commit.

## B3.9 Section header
Files changed (4): `PA/lanes-section-header.component.ts`, `PA/lanes-section-header.component.spec.ts`,
`PA/cli-orchestration-matrix.component.ts`, `PA/cli-orchestration-matrix.component.spec.ts`.

Acceptance:
- Header = `Route` icon + "Lanes" + count badge + "x of y enabled" (`lanes-enabled-count`, now text as in
  design-spec "Card" and prototype :389; the ring is gone) + NEW `[controls]` slot + Reorder toggle
  (`ArrowUpDown` "Reorder" / `Check` "Done", `aria-pressed`, id `lanes-order-edit`, M-1). Description line kept (P-2).
- Header "New Ptah CLI instance" button, id `lanes-header-add-instance` and output `addRequested` deleted with the
  matrix binding and the spec subscription (M-2). Inputs `total`, `enabled`, `editing`, `disabled`, output
  `editRequested` kept.
- The matrix projects `<ptah-lanes-max-concurrent controls />` (DOM id `lanes-max-concurrent`).
- The order line `<ptah-agent-orchestration-config />` is hidden in Reorder mode (3.9 "Order line", P-7).
- Card inset: the `:host-context([data-glass='on'])` 1.25rem padding rule is deleted; NEW
  `@container (max-width: 639px) { [data-testid='settings-cli-matrix'] { padding: 0.75rem } }`, with
  `container-type: inline-size` on the matrix host so the query measures the card.
- Lanes card has no second card under it: the section holds header, order line, table, strip and read states only.

Checks: jest 6 suites, 130 tests pass (header spec + the 5); lib `tsc` 0 errors; spec `tsc` 382 errors (baseline,
0 in changed files); eslint 0 errors, 0 warnings.

Deviations: none from the plan. See Decisions D-1, D-2.

## B3.10 Policy bar cleanup
Files changed (5): `PA/agent-orchestration-config.component.html`, `.ts`, `.spec.ts`; deleted
`PA/lane-order-list.component.ts`, `PA/lane-order-list.component.spec.ts`.

Step 1 grep (`LaneOrderListComponent|ptah-lane-order-list|lane-order-list`, `libs apps`, ts+html) after the policy bar
edit: only `lane-order-list.component.ts` and `lane-order-list.component.spec.ts`. Then both files were deleted. After
the delete the grep (also `*.json`) has 0 hits.

Acceptance:
- Removed: Max concurrent field (`#agent-max-concurrent`), Re-detect button and public `redetectClis()`, the pencil
  popover (`policy-order-edit`, `policy-order-popover`), `toggleOrder`, `closeOrder`, `focusOrderTitle`,
  `orderFocusReturning`, `orderList` viewChild, `savePreferredOrder`, `saveMaxConcurrent`, `canWrite`, `canReorder`,
  the `feedback` and `element` injections, and the imports they used.
- Kept: `orchestration-policy-bar`, `settings-section-orchestration-policy`, `policy-order`, `policy-order-chip-<id>`,
  `policy-order-more`, the measuring copy and its `ResizeObserver` release path, `policy-order-empty`. Class and
  selector unchanged (barrel).
- The trigger carried the accessible name of the whole order. It is gone, so a NEW sr-only
  `policy-order-summary` names the order. The "+N" chip keeps its `title`.
- One scroll owner (decisions 32, 44): the component has no `overflow-y-auto` element now (the popover was the only
  one). A spec test asserts this.
- `LaneOrderChip` is now a file-local interface (its only user).
- Raw spacing utilities (`mb-2`, `gap-2.5`, `gap-1.5`, `gap-1`) left the template; component CSS uses `--ptah-*` tokens.
- Spec: the Max concurrent, popover and Re-detect describes are deleted (ported in B3.4 to
  `lanes-max-concurrent.component.spec.ts` and `lanes-redetect-button.component.spec.ts`, drag and up/down in
  B3.3/B3.7a to `lane-order-drag.spec.ts` and the lanes-table Reorder tests; Escape focus return deleted with the
  popover, R-3). Structure, chips, empty text and order strip tests kept; NEW: no controls, no scroll owner, sr-only
  summary, "Loading…".

Checks: jest 6 suites, 136 tests pass (`agent-orchestration-config` + the 5); lib `tsc` 0; spec `tsc` 382 (0 in changed
files); eslint 0.

Deviations: none.

## B3.12 E2E ids and steps
Files changed (5): `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-reachability.table.ts`,
`settings-cli-matrix.entries.ts`, `settings-visual.e2e.spec.ts`, `settings-orchestration.e2e.spec.ts`,
`apps/ptah-electron-e2e/src/design-preview/settings-providers-gate.shot.ts`. No e2e test was run (brief).

Behaviour table of 3.12, each row applied:
- `settings-visual.e2e.spec.ts` order strip check: `lanes-order-edit` has `aria-pressed="false"` and the accessible name
  "Reorder"; the sr-only `policy-order-summary` holds the last number.
- `settings-visual.e2e.spec.ts` `captureOrderPopover`: click `lanes-order-edit`; no `lanes-group-cli`,
  `lanes-group-ptah`, `lanes-strip`; every `policy-order-up-/down-/grip-<id>` target >= 24px; one move down, then
  the same `policy-order-down-<id>` has focus; "Done"; groups return and `lanes-order-edit` has focus. Capture name
  `orchestration-order-popover` kept.
- `settings-visual.e2e.spec.ts` permission/Copilot: Codex detail shows the inline `[data-capability="Permission"]`
  fact "Permission modes" and no `cli-provider-popover-content`; Copilot detail has `copilot-auto-approve` enabled
  inside `lane-detail-auto-approve`; `noOverflow('#lane-detail-copilot')`; captures kept.
- `settings-cli-matrix.entries.ts` #71: Pi is a card in `lanes-strip` ("Not installed", no Model cell, no switch, no
  Test); `lanes-strip-install-pi` opens the install popover (command + Re-detect); the "Details" disclosure opens.
  Cursor stays a table row before the strip card (document-position check kept) with "Not installed". The shared
  defaults now come from `lanes-ptah-defaults` (Ptah CLI permission/network comboboxes).
- `settings-reachability.table.ts` #72: `page.getByTestId('policy-redetect')`.
- `settings-reachability.table.ts` #74 and the loaded-state check: `[data-testid="policy-max-concurrent-input"]`.
- `settings-providers-gate.shot.ts`: row controls `[data-testid^="cli-provider-card-"] [role="combobox"]`, shared
  controls `[data-testid="lanes-ptah-defaults"] [role="combobox"]`; both `#shared-defaults-heading` →
  `[data-testid="lanes-group-ptah"]`.

Other steps that used removed DOM (needed so that "every id, selector and role query exists"):
- reachability #73 and orchestration "order popover" test → Reorder mode (same write payloads, Undo, focus checks;
  "Done" keeps focus on the toggle).
- reachability #77 (all CLIs not installed): the strip card `lanes-strip-install-codex` → `cli-provider-popover-content`
  (old `cli-install-popover` and the row "Install guide" button no longer exist).
- reachability #78, entries #50, #52, #55, orchestration "edit modal" and "More actions": Edit tiers / Edit / Delete /
  Test from the expanded detail footer (decision 23; the kebab holds Test only). The kebab geometry test now expects
  1 item ("Test"). The unused `openMoreActions` helper and the `expandMatrixDetail` import of the entries file were
  deleted. Entry #52 queried `Test Glm`, a label that exists only in the deleted `ptah-cli-instances` template.
- entries #57: the Add button text is "Add Ptah CLI instance" (lower-case i, lanes-table html :623).
- entries #63, #70: Copilot switch and Codex facts in the expanded detail (no permission popover); the
  `providerField(…, 'Safety')` variant is deleted.

Checks: `tsc` harness 0 errors, `tsc` ptah-electron-e2e 0 errors, eslint 0 errors (warnings: `max-lines` in the
entries and reachability files, which were over 700 lines before this batch). Id grep: 198 test ids in the 5 files.
All are in the templates, except dynamic compositions (`'prefix-' + id`) and 2 ids outside the Lanes scope that
are composed at runtime (`credentials-copy-<id>`, `settings-toast-<…>` through `testId()`).

Deviations: the steps listed under "Other steps" go past the 3.12 table; without them those steps would query removed DOM.

## B3.11a Dead components
Files deleted (5): `PA/ptah-cli-instances.component.ts`, `.html`, `.spec.ts`, `PA/cli-shared-defaults.component.ts`,
`.spec.ts`.

Step 1 grep (`PtahCliInstancesComponent|ptah-cli-instances|CliSharedDefaultsComponent|ptah-cli-shared-defaults|shared-defaults-heading`):
the 5 files, plus `cli-orchestration-matrix.component.spec.ts:423-424`, which are `expect(q('ptah-cli-instances')).toBeNull()`
and `expect(q('ptah-cli-shared-defaults')).toBeNull()` (B3.7b). These are absence checks, not callers (Decision D-3).
No hit in the e2e harness or `apps/ptah-electron-e2e` after B3.12. Neither component was exported from `CH/index.ts`.
After the delete, no `.ts`/`.html`/`.json` file imports them. `tools/ui-class-audit/baseline*.json` keep an entry for
the deleted `ptah-cli-instances.component.html` (a decrease to 0 passes; `--update-baseline` is forbidden here).

Checks: jest 6 suites, 136 tests pass (`agent-orchestration-config` + the 5); lib `tsc` 0; spec `tsc` 381 errors (baseline 382 minus 1 in a deleted spec; 0 new, no TS2307);
eslint: no changed file left (deletes only).

## B3.11b Popover kind narrowing
Status: complete (write set widened by coordinator ruling, decisions.md row 50).

Files changed (4): `PA/cli-provider-card-popovers.component.ts` (no spec exists), `PA/lanes-table-detail.component.ts`,
`PA/lanes-table-detail.component.spec.ts`, `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-matrix-detail.ts`.

- `CliProviderInfoKind = 'install'`. The `info`, `capabilities`, `permission` cases, the `@default` branch, the heading
  map, the `detail` input (no caller binds it) and the `CliCapabilityDetailComponent` / `CopilotAutoApproveToggleComponent`
  imports are deleted. Close is an `X` icon-only `ptahIconButton` with the label "Close" (P8); the e2e
  `getByRole('button', { name: 'Close' })` still matches. Install command `<code select-all>`, note and Re-detect kept.
- `CliProviderOpenKind`: grep over `libs apps` found 0 users, so the type is deleted.
- Detail: the `linkedSignal` on `openKind` is now `capabilitiesOpen = signal(false)`; the stale comment about the table route
  is gone; `linkedSignal` import removed. Declared types `CliProviderInfoKind | 'credentials'` keep their text.
- Detail spec: the test "opens the All capabilities disclosure for the open kind capabilities (kebab route)" is deleted;
  in "has at most one open popover" the `'capabilities'` input becomes `null` (the install popover closes). Other tests kept.
- `settings-matrix-detail.ts`: the kebab "Details" fallback is deleted; the expander is clicked directly.

Checks: jest 6 suites, 132 tests pass (the 5 + `lanes-add-more-strip.component.spec.ts`; 136 − 4 is the suite set change
and the 1 deleted test); lib `tsc` 0; spec `tsc` 381 (0 new); harness `tsc` 0; eslint 0 errors (6 old
`no-non-null-assertion` warnings in the detail spec, lines I did not change); class audit exit 0.

## Decisions
| # | Decision | Options | Evidence | Reversible |
|---|---|---|---|---|
| D-1 | "x of y enabled" is a text span with id `lanes-enabled-count`; the `ptah-ring` goes | keep the ring; text; both | plan 3.9 header list; design-spec :87 "6 of 7 enabled"; prototype :389 is text; no e2e uses the id | yes |
| D-2 | Reorder toggle uses the kept `disabled` input only while Reorder is off (`disabled() && !editing()`); "Done" is never disabled | no binding (input unused); always disabled when busy | plan keeps `disabled`; the matrix binds `busy() \|\| !canWrite()`, and `busy` flips during each move save, which would block "Done" | yes |
| D-3 | B3.11a deletes the 5 files although the step 1 grep also hits `cli-orchestration-matrix.component.spec.ts:423-424` | stop and report; delete | the 2 hits are `toBeNull()` absence checks; they do not import or render the components and stay valid after the delete; decision 28 is about callers | yes (files are in git) |
| D-4 | Order line (`ptah-agent-orchestration-config`) hidden in Reorder mode in B3.9 | leave visible | plan 3.9 "Order line … hidden in Reorder mode"; design-spec :117 | yes |
| D-5 | Policy bar names the order with a NEW sr-only `policy-order-summary` | no name; `aria-label` on the group | the trigger that carried the name (R-3) is gone, the chip strip is `aria-hidden` | yes |
| D-6 | B3.12 also fixes the e2e steps of #50, #52, #55, #57, #63, #70, #73, #77, #78 and 2 orchestration tests | only the 3.12 table rows | B3.12 acceptance "every id, selector and role query in the 5 files exists in the templates" | yes |

## Clarifications Needed
None. Both earlier items (B3.11b write set, `settings-matrix-detail.ts` fallback) were settled by decisions.md row 50 and done.

## Class audit
`npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` exit 0 (after B3.11b, the last batch):
"ui-class-audit [raw-spacing]: TOTAL 533 blocked token(s) across 37 file(s); 0 token count(s) over baseline".
Decreases are reported (for example the 3 modals and `agent-orchestration-config.component.html`); the baseline was not
updated.

## Reads outside the read sets
`lanes-table.component.html` and `lanes-table-detail.component.html` (ids and labels for the header, Reorder and B3.12),
`lanes-max-concurrent.component.ts`, `lanes-redetect-button.component.ts`, `lanes-add-more-strip.component.ts`,
`copilot-auto-approve-toggle.component.ts`, `UI/patterns/disclosure/disclosure.component.ts`, `UI/tokens/ptah-tokens.css`,
`settings-matrix-detail.ts`, `tools/ui-class-audit/*`, prototype :380-400, design-spec :87-119.

## Handoff
- State: B3.9, B3.10, B3.12, B3.11a, B3.11b done. Nothing in work. No commit.
- Coordinator next: inner loop and gate (`npm run verify -- -p @ptah-extension/chat,@ptah-extension/webview-e2e-harness,ptah-electron-e2e`),
  `typecheck-templates` for `ptah-extension-webview`, e2e run of the 5 changed scenario files, visual review in Electron.
