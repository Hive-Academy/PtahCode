# L2c ? Round 3 lanes fixes

## Changes by request

- C1: `lane-row-identity.component.ts` gives names nowrap/hidden/ellipsis and a title containing the full name (and version when present). Each identity reserves 2.5rem for two lines. Kind badges move to the second line in collapsed tables and containers at most 13rem wide; the secondary version/provider text has its own ellipsis track. Lane width increases from 18% to 25% at wide widths, taking space from Status and Model, with `width: max(25%, 15rem)` and a 15rem CSS minimum on the col. Collapsed Lane increases from 34% to 40%. These remain the table's existing colgroup API, without switching to column-priority reflow.
- C2: `lanes-table.component.css` constrains the model/effort flex children and their triggers to their cell, with one-line ellipsis. Existing model and effort title attributes remain. Detail values retain wrapping for narrow layouts.
- C3: Install guide now lives on identity line two, using shared ptahButton link styling. Its output invokes the existing table `recover(row)` handler, preserving installGuide emission and opening the install detail. Actions contains only optional Sign in and the existing overflow menu, in a nonwrapping group. Existing ids, data-testids and aria-labels remain.
- C4: Both compact system Unavailable values now explicitly use muted text-sm in `cli-lane-default-cell.component.ts`. Instance values retain the same classes, with a scoped direct-span font override in the table stylesheet to match the system text.
- C5: `claude-lane-account-cell.component.ts` exposes its existing presentation visibility as a public computed signal and adds a default-true showLabel input. Detail uses that signal to hide both the Account label and value when the account presentation is absent, and suppresses the redundant inner Account label when visible. It continues to use the account cell's real account state. Empty tier models show just `0 of 3 set`, preserving the summary testid; the duplicate `No tier models` sentence is removed. Configured tier rows and loading remain supported.
- C6: Detail actions now have two inner groups: Test with result, then all quiet actions including projected Edit/Delete. Quiet actions stay together with flex-wrap: nowrap; the outer shared actions slot wraps that entire group beneath Test when necessary. All action hooks and the existing testResults path remain.
- C7: Extracted the table template into `lanes-table.component.html`; the component uses templateUrl and singular styleUrl for its existing CSS file. TypeScript is 343 lines, below 744.

No shared UI, core, provider, orchestration, instances or section-header source files were edited in this round. No missing shared UI option was required. Existing uncommitted changes from earlier lanes were preserved.

## Files and final line counts

- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts`: 343 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html`: 515 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`: 83 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts`: 165 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts`: 332 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`: 415 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts`: 991 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts`: 231 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts`: 622 lines.

## Checks

Formatting: PASS, exit 0. Exact command:

```powershell
npx prettier --write libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts
```

Final focused Jest: PASS, exit 0, 5 suites / 102 tests (37.696s). Includes the four requested component suites plus account-cell coverage. Added assertions for action-group boundaries, Install guide in the identity header, and a single empty-tier summary; updated widths and the name/version tooltip expectation.

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.spec.ts
```

Earlier broader Jest: FAIL, exit 1, 85 passed / 3 failed. One table title expectation was corrected and passed in the final run. Two failures remain in the separate orchestration writes suite, whose source was not edited: `writes a permission selection from the table control` queries a native `select[aria-label="Codex permission default"]`; `resets a saved default from the table control` searches for `More default actions` in the old location. These need adaptation to the existing shared-select/reset UI by the orchestration owner. They were not bypassed or skipped.

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts
```

TypeScript: PASS, exit 0, no diagnostics.

```powershell
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
```

ESLint: PASS, exit 0, zero errors. Three warnings: two existing non-null assertions at cli-lane-default-cell.component.ts:439 and :443 (untouched logic), and CSS ignored because ESLint has no matching CSS configuration. CSS was formatted with Prettier.

```powershell
npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts
```

`git diff --check` on changed tracked source/spec files: PASS. No nx, npm run verify, build, serve or e2e command was run. No commit, push, stash or merge.

## Visual evidence and remaining gate

Inspected all five supplied iter2 Electron shots (1440 table/detail, 600 table/detail, 1824 Claude test), comparing name wrapping, model/actions overlap, Unavailable sizing, empty Account, duplicated tier text and orphan Delete against the supplied prototype references. Opened and inspected the 784-expanded and review-a3 1440 reference screenshots; navigated the in-workspace prototype using ptah_browser_navigate and inspected ptah_browser_screenshot.

Those are reference/previous-round renders, not a render of this round's Angular code. Updated Electron screenshots at 1824, 1440 and 600 remain required, including equal-row-height checks and scrollWidth/clientWidth measurements at 600. Visual quality and absence of overflow after these edits are NOT claimed as verified. The task prohibits starting the build/serve/e2e path that produces the Electron shots. A parent progress report requesting the visual gate was rejected with `parent-inbox-full`; it was not retried.

## Tools and skills

Read the workspace UI design and Angular frontend SKILL.md files. No dedicated CLI skill-loading mechanism is exposed in this session, so filesystem reading was the fallback. Ptah tools are available; the dependency lookup returned an incomplete graph with this worktree file missing, so local source searches were used for impact review. Used native file edits, focused Jest/TypeScript/ESLint and Ptah browser tools for reference inspection.
