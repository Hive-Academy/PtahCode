# Phase 3 — PR #1454 review fix report

Status: DONE. Base HEAD `bc27c8f88`. Nothing is committed. No template or CSS file changed.

Paths below are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/` unless they start with `libs/`.

| Item | Verdict |
| ---- | ------- |
| A | VALID + FIXED |
| B | VALID + FIXED |
| C | VALID + FIXED |
| D | VALID + FIXED (service + component) |
| E | NOT VALID for the product (the U-7 handoff already covers the detail path). Two tests added as proof. |

## A. `requestDelete` uses `event.target` — VALID + FIXED

- Cause: `event.target instanceof HTMLElement` is false for the SVG icon, so `deleteOrigin` was `null` and Cancel
  used `deleteFocus.cancel()` (the row actions trigger).
- Fix: `lanes-table.component.ts:461-464`. `requestDelete` reads `event.currentTarget` (the bound footer button).
  The `closest('button')` step is gone, because `currentTarget` is the button.
- Test: `lanes-table.component.spec.ts:614` "returns focus to the footer Delete after Cancel when the click landed
  on its icon (PR review A)". It dispatches the click on an SVG element in the button, asserts that the target is
  not an `HTMLElement`, selects Cancel, and expects focus on the footer Delete.

## B. `applyDisplayedAgentOrder` with duplicate saved ids — VALID + FIXED

- Cause: the slot of an id was only its first index. A later copy of a displayed id kept its index, so a stale
  earlier copy could outrank the displayed order (`[A,A,B,C]` + `[B,C,A]` gave `[B,A,C,A]`, shown as B,A,C).
- Fix: `move-preferred-agent-order.ts:11-35` (doc comment `:1-10`). The slots are now all the indexes that hold a
  displayed id, duplicates included. The first slots take the displayed order. The stale copies move to the slots
  after them, in their saved sequence. Result for the case above: `[B,C,A,A]`, shown as B,C,A.
  - Ids that are not displayed keep their exact index. The length and the set of entries do not change.
  - `null` (nothing to write) is now "the first-occurrence ranking already equals the displayed order". Without
    this, a no-op call on a saved order with duplicates would write.
  - With no duplicates the result is the same as before (the payload tests in
    `cli-orchestration-matrix.writes.spec.ts` are unchanged and pass).
- Tests in `move-preferred-agent-order.spec.ts`:
  - `:24` existing duplicate test updated (new name "moves the stale duplicates of displayed ids behind the
    displayed order"; expected `[copilot, uninstalled, codex, pi, codex, copilot]`, plus a first-occurrence check).
  - `:32` new "does not let an earlier stale duplicate outrank the displayed order (PR review B)": the
    `[A,A,B,C]` case, and `[A,x,A,B,C]` to show that an undisplayed id keeps its slot.
  - `:42` new "writes nothing when a saved order with duplicates already ranks the displayed order".

## C. Post-save position announcement — VALID + FIXED

- Cause: `settleOrder` announced when only the orchestration read was verified. It did not look at the Ptah CLI
  instance list, and it did not compare the lanes before and after the move.
- Fix: `cli-orchestration-matrix.component.ts:383-408` (`settleOrder`) and `:323-330` (new private
  `laneReadsComplete()`). The position is announced only when all of these are true:
  - the save succeeded and `verifiedOrder()` is not `null`,
  - `orchestration` and `cliAgents` are `ready` and `rows().missing` is empty,
  - the numbered ids after the save are the same set as `move.order` (same length, each id present).
  In all other cases `orderSettled` gets `saved: false` and `order: []`, so nothing is announced. Focus handling
  did not change.
- Tests: `cli-orchestration-matrix.writes.spec.ts:749` `it.each`, 4 cases "announces no position after a saved
  move when … (PR review C)": instance list not ready, instance list incomplete, a lane joined, a lane left.
  The existing "announces the confirmed position…" test still passes.

## D. `redetectFromGuide` reads the installed state too early — VALID + FIXED

- Cause: `readSection` publishes nothing for a superseded read. When the table's Retry superseded a read-back,
  `redetectClis()` resolved while the store was still `loading` with the previous snapshot. The guide then read
  the installed state from that snapshot.
- Fix 1 (service): `libs/frontend/core/src/lib/services/providers-settings-state.service.ts`
  - `:735-737` two private fields hold the newest orchestration and CLI-agent read promises.
  - `:738-744` `refreshCliAgents` and `:816-839` `refreshOrchestration` record their read.
  - `:865-872` `redetectClis()` waits, after its own read-backs, until the newest reads of both sections ended.
    Doc comment `:840-848`. The return type is still `Promise<boolean>`, so no other caller changed.
    `cliRedetecting` stays `true` during this wait.
- Fix 2 (component): `cli-orchestration-matrix.component.ts:599-608`. The installed state counts only when
  neither store is `loading`. A read that still runs goes to the "lane list could not be read" branch.
- Tests:
  - `libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts:2390` "waits for a newer lane
    read that supersedes its read-back (PR 1454 review D)".
  - `cli-orchestration-matrix.component.spec.ts:736` "reads no installed state from the previous snapshot while a
    lane read still runs (PR review D)".

## E. Detail `@if (!system.installed)` removes the focused trigger — NOT VALID (already covered)

- The detail Install guide emits `redetect` to the same `redetectFromGuide(rowId)` as the strip guide
  (`lanes-table-detail.component.html:213` → `lanes-table.component.html:465` → matrix).
- After a detection that installs the row, `redetectFromGuide` already moves focus to
  `[data-testid="cli-provider-card-<id>"] input[type="checkbox"]`. That selector is the table row of the same lane
  (the keyless Cursor recovery row is the only system row with a detail and `installed: false`). The fallback is
  the matrix region (U-7, round 2 fix 6). So focus does not fall to body.
- No product change. I first added the row actions trigger as a second fallback, but it broke the existing test
  "focuses the matrix region when the found lane has no enabled toggle (finding 6)". That test records an approved
  behavior, so I removed the fallback. Tell me if the coordinator wants the row actions trigger instead; then that
  test must change too.
- Tests added as proof, `cli-orchestration-matrix.component.spec.ts`:
  - `:764` "moves focus into the row when Re-detect from the detail Install guide installs the lane (PR review E)".
  - `:791` "focuses the matrix region when the lane installed from the detail has no usable toggle (PR review E)".
- With fix D, a row that a newer Retry installs is also evaluated by the same handoff, because `redetectClis()`
  now waits for that read.

## Changed files

- `lanes-table.component.ts`, `lanes-table.component.spec.ts`
- `move-preferred-agent-order.ts`, `move-preferred-agent-order.spec.ts`
- `cli-orchestration-matrix.component.ts`, `cli-orchestration-matrix.component.spec.ts`,
  `cli-orchestration-matrix.writes.spec.ts`
- `libs/frontend/core/src/lib/services/providers-settings-state.service.ts`,
  `libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts`
- `lanes-table-detail.component.html`: not changed.
- `decisions.md` shows as modified in `git status`. I did not change it.

## Checks

- Jest, chat (6 suites: the 5 lanes specs + `move-preferred-agent-order.spec.ts`): 6 passed, 163 tests passed.
  Log: `.ptah/tmp/pr-review-chat-jest.log`.
- Jest, core (`providers-settings-state.service.spec.ts`, `providers-settings-state.orchestration.spec.ts`):
  2 suites passed, 134 tests passed. Log: `.ptah/tmp/pr-review-core-jest.log`.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: 0 errors.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json`: 0 errors.
- `npx eslint` on the 9 changed files: 0 errors, 32 warnings (all were there before, for example `max-lines`).
- Not run: `npm run verify`, `nx`, e2e, `typecheck-templates` (no template changed).
- Not done: I did not run the new tests against the old code to see them fail (no `git stash` permitted).

## Class audit

`npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0, 0 token counts over the baseline.
The baseline was not updated.
