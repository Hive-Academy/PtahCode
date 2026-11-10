# PR #1038 review fixes, round 4

Base head: `4a0d5b7db` (verdict CHANGES_REQUIRED in `code-review-head-4a0d5b7db.md`).
Code head after this round: `d455fdd146cdbe5df3847cceed621445370290dc`.
Review record: `code-review-head.md` (verdict APPROVED on `d455fdd14`).

## Finding 1 (Major): the Git child could write any setting

- Cause: `git-window-scope-guard.ts` had `settings:get` and `settings:set` in
  `UNSCOPED_METHODS`. The guard authorized them with no check of key or value.
- Correction (`9e192a5e3`): the two methods left `UNSCOPED_METHODS`. The guard
  parses the params with Zod:
  - `settings:get`: key is `diff.renderSideBySide` or `editorLauncher.lastTarget`.
  - `settings:set`: `diff.renderSideBySide` with a boolean value, or
    `editorLauncher.lastTarget` with a string of 1 to 128 characters.
  - Each other key, a wrong value type and missing params are refused before
    the RPC handler runs. The main window is not restricted.
- Source of the key set: the Git window root
  (`apps/ptah-extension-webview/src/app/git-window/git-window.component.ts`)
  mounts only the review shell of `libs/frontend/git-ui`. Its settings calls
  are in `comparison-bar.component.ts` (`diff.renderSideBySide`) and
  `open-in/open-in-button.component.ts` (`editorLauncher.lastTarget`). The
  review lane found no other settings call.
- `settings:set` stays in `GIT_WINDOW_ALLOWED_METHODS`: the child needs it
  for these two preferences.

## Finding 2 (Major, found by the round-4 review of `b3da01f39`)

- Cause: the guard authorized `gitWindow:setMode` with no check of params. The
  child could send `{ mode: 'pinned', tabId }` for an open tab of another
  repository. The main renderer then published that repository as the scope.
- Correction (`d455fdd14`): the guard parses the params with
  `GitWindowSetModeParamsSchema` (strict object). `pinned` is accepted only
  when `tabId` is the active tab of the acknowledged scope, which is the tab
  that `requestWindowMode` sends. `follow-session` is accepted only with
  `tabId: null`.

## Audit of the other non-Git methods in the allowlist

| Method | Result |
| --- | --- |
| `gitWindow:getScope` | Returns the acknowledged scope. No params. Kept. |
| `gitWindow:close` | Closes the child itself. Kept. |
| `gitWindow:setMode` | Was not bound. Corrected (finding 2). |
| `settings:get`, `settings:set` | Were not bound. Corrected (finding 1). |
| `editor:detectTargets` | Lists the installed editors. No scope data. Kept. |
| `editor:openWorkspace` | Root must be a read root of the scope. Kept. |
| `editor:openFile`, `editor:openMerge`, `file:viewContent` | Path is checked against the read roots after links are resolved. Kept. |
| `file:saveContent` | Path is checked against the write root (`repoRoot`). Kept. |

No other `settings:*` method is in the allowlist.

## Tests

- `git-window-scope-guard.spec.ts`: allowed settings keys pass. Nine negative
  cases for settings (unrelated writable key, wrong value type, missing key,
  missing value, missing params, unrelated read). One spec for `setMode`
  (active tab passes, another open tab, a null pin, an extra property and
  missing params are refused).
- `ipc-bridge.git-window-scope.spec.ts`: an unrelated writable key
  (`agentOrchestration.codexWebSearch`) and an unrelated read from the child
  do not reach `handleMessage` and get the out-of-scope error. The four
  allowed calls reach the handler. The main window can write the unrelated
  key. A pin of another open tab is refused, and the pin of the active tab
  and `follow-session` reach the handler.

## Merge of main

`origin/main` (`2cde6accc`, with PR #1039, #1041, #1043 and #1044) was merged
in `b3da01f39`. No conflict. The merge changed no file in
`apps/ptah-electron/src/windows` or `apps/ptah-electron/src/ipc`.
`content-manifest.json` was not generated again.

## Verification (head `d455fdd14`)

- `npm run verify -- -p ptah-electron`: exit code 0. Lint and typecheck: 0
  errors (35 lint warnings that were there before). Tests: 113 suites passed,
  1 skipped. 1931 tests passed, 3 skipped.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`:
  passed. Each directory is at or below its baseline. No baseline changed.
- Only `ptah-electron` files changed, so no other project was checked.
- Note: the worktree had no `node_modules`. After the merge, the `marked`
  mapper of `jest.preset.js` needs `<worktree>/node_modules`. A junction to
  the `node_modules` of the main checkout was added, as in the other
  worktrees. It is git-ignored.

## Independent review

- Round 1, codex lane, head `b3da01f39`: CHANGES_REQUIRED (finding 2). The
  settings correction was confirmed complete.
- Round 2, codex lane, head `d455fdd14`: APPROVED, no finding.
- The commits after `d455fdd14` change only files in `.ptah/specs`.

## Open limits

- `follow-session` from the child moves the scope to the active session of
  the main window. This is the designed default mode, not a defect.
- The accepted limits of the earlier rounds (`decisions.md` rows 19 to 24,
  `review-fixes-1038.md`) did not change.
- CodeRabbit is not mandatory while its limit is active. No
  `@coderabbitai review` comment was posted.
