# Phase 3 fix round 2 report

Status: all 4 items of `phase-3-code-review-2.md` FIXED. Nothing is committed (coordinator owns git).
Chat paths are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/`.

## Items

### Finding 5 (PARTIAL → FIXED): position from an incomplete refresh
- `cli-orchestration-matrix.component.ts:386` `settleOrder()` announces only from a verified refresh. When
  `verifiedOrder()` is `null` after the save (the refresh dropped or malformed `preferredAgentOrder`, so rows fall
  back to discovery order), the settlement has `saved: false` and an empty `order`. No position is announced.
- Focus fallback: after the table's own focus return, if `canReorder()` is false (no move control usable), focus
  goes to Done (`[data-testid="lanes-order-edit"]`).
- Test: `cli-orchestration-matrix.writes.spec.ts:725`. The write is verified (`saveSettings` true, commit `saved`). The
  separate refresh sets `missingFields: ['preferredAgentOrder']` with an empty order. The live region stays empty and
  focus is on Done. The verified-refresh case (`:693`, "Codex moved to position 2 of 5") and the failed-save case
  (`:749`) still pass.

### Finding 6 (PARTIAL → FIXED): guide focus loss and overlapping Re-detects
- Shared pending state (core): `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:173`
  `redetectRuns` counter and `:179` `cliRedetecting` (true from the start of `redetectClis()` until its read-backs
  end). `:838` `redetectClis()` counts each run in `try/finally`. No other behavior change.
- Every Re-detect entry binds to it:
  - section button `lanes-redetect-button.component.ts:62`;
  - guide entries in the matrix, `cli-orchestration-matrix.component.ts:257` (`guideDetecting`), used by the strip and
    passed as `[detecting]` (`:174`) through `cli-provider-grid.component.ts:39` and `lanes-table.component.ts:220` /
    `lanes-table.component.html:463` to `lanes-table-detail.component.ts:114`. The Cursor detail guide now binds
    `[busy]="busy() || detecting()"` (`lanes-table-detail.component.html:212`), not save busy alone.
- Installed decision: unchanged from round 1. `redetectClis()` awaits the orchestration read-back, and the matrix
  requires a `ready` read that holds the row as installed.
- Focus after a failed read: `cli-orchestration-matrix.component.ts:618` `keepFocusAfterFailedRead()` runs on the
  "detection failed" (`:580`) and "incomplete read" (`:610`) branches. After render, if focus was lost (body or a
  disconnected element), it focuses the table Retry (`data-testid="lanes-retry"`, new on both Retry buttons,
  `lanes-table.component.html:61`, `:103`), else the `cli-matrix` region. Focus that the user moved elsewhere stays.
- Tests:
  - `cli-orchestration-matrix.component.spec.ts:665`: the focused strip Re-detect is destroyed by a failed
    orchestration read-back; focus goes to Retry.
  - `:685`: the user moves focus to Add during the read-back; focus stays there after the failure.
  - `:703`: a guide Re-detect is refused while `cliRedetecting` is true.
  - `lanes-redetect-button.component.spec.ts:102`: the section button is disabled and starts nothing while
    `cliRedetecting` is true.
  - `libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts:2365`: `cliRedetecting` stays true
    after `cliDetection` is `ready` until the `agent:getConfig` read-back resolves, then false.

### N1 → FIXED: detail dismissal moved focus to the old row
- `lanes-table-delete-focus.ts:44` new `dismiss()`: drops the captured targets and restores focus only when focus
  was lost (body or disconnected). `lanes-table.component.ts:375` the detail-dismissal effect calls `dismiss()`, not
  `cancel()`. Explicit Cancel and Confirm keep their round 1 behavior.
- Test: `lanes-table.component.spec.ts:626`. Delete is pending on A, then the keyboard-focused expander of B is
  activated. The confirmation is gone, B's detail is open, and focus stays on B's expander.

### N2 → FIXED: Version check with the detail closed
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts:1437`: each lane is
  expanded with `expandMatrixDetail`, its `cli-provider-facts` container must be visible, and then it must hold zero
  `Version` terms. Checked with the harness `tsc` only (no e2e run, per the rules).

## Files changed in this round
- Chat: `cli-orchestration-matrix.component.ts`, `cli-provider-grid.component.ts` (pass-through `detecting`),
  `lanes-redetect-button.component.ts`, `lanes-table.component.ts`, `lanes-table.component.html`,
  `lanes-table-detail.component.ts`, `lanes-table-detail.component.html`, `lanes-table-delete-focus.ts` (allowed).
- Core (allowed, finding 6): `libs/frontend/core/src/lib/services/providers-settings-state.service.ts`.
- Specs: `cli-orchestration-matrix.component.spec.ts`, `cli-orchestration-matrix.writes.spec.ts`,
  `lanes-table.component.spec.ts`, `lanes-redetect-button.component.spec.ts`, `lanes-add-more-strip.component.spec.ts`
  (stub gets `cliRedetecting` only), `libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts`.
- Harness: `settings-visual.e2e.spec.ts`.

## Checks
- Jest chat: `lanes-table.component.spec.ts`, `lanes-table.visual.component.spec.ts`,
  `lanes-table-detail.component.spec.ts`, `cli-orchestration-matrix.component.spec.ts`,
  `cli-orchestration-matrix.writes.spec.ts`, `lanes-redetect-button.component.spec.ts`,
  `lanes-add-more-strip.component.spec.ts`, `lane-order-drag.spec.ts`: 8 suites passed, 180 tests passed.
- Jest chat `agent-orchestration-config.component.spec.ts` (its stub has no `cliRedetecting`; it still passes):
  1 suite, 10 tests passed.
- Jest core `providers-settings-state.service.spec.ts`, `providers-settings-state.orchestration.spec.ts`:
  2 suites passed, 133 tests passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0, 0 errors.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json`: 379 errors (baseline 379), 0 new.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json`: exit 0, 0 errors.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.spec.json`: 117 errors, none in
  `providers-settings-state.service.spec.ts` (old errors in other files; no baseline was given).
- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`: exit 0, 0 errors.
- `npx eslint <16 changed files>`: exit 0, 0 errors, 38 warnings (non-null assertions in specs and `max-lines`,
  old patterns).
- Not run: `npm run verify`, `nx`, `typecheck-templates`, build, serve, e2e. The coordinator must run
  `typecheck-templates` for `lanes-table.component.html`, `lanes-table-detail.component.html` and the matrix and grid
  inline templates. A core change also needs the core project in the gate (`-p` with core, chat, harness,
  webview, onboarding as affected).

## Decisions
- **Shared pending state in core, not a join.** Options: make `redetectClis()` join an in-flight call, or count runs
  and expose `cliRedetecting`. Chose the counter: it changes no return value for other callers (Settings shell,
  onboarding readiness store), whose own core tests rely on per-call results. Reversible.
- **Done as the focus fallback after an unverified refresh.** Review fix text names Done. Reversible.

## Class audit
`npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0. "TOTAL 533 blocked token(s) across
37 file(s); 0 token count(s) over baseline". No baseline update. The only markup additions are `data-testid` and
input bindings.
