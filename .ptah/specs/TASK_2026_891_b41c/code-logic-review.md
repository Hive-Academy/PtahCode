# Code Logic Review — TASK_2026_891_b41c

Review family: claude (implementer: codex)

Score: 7/10

Verdict: REVISE

The removal is correct. The removed branch is dead in every host that ships. All D4 items still
work. The moved helpers behave the same as the originals. One Medium defect blocks approval:
the diff removed the only reader of `changeSetErrors`, so the transcript now keeps write-only
error state, and a failed chip action shows nothing to the user. The fix is small. The other
defects are Low and are about stale comments and empty assertions.

## Scope and evidence

- Diff: `git diff HEAD` plus the untracked `turn-summary-files.utils.ts`. The worktree HEAD is
  `05d3bb160` (the task base). Local `main` moved to `ba9bb6e0c`, so `git diff main` also shows
  unrelated `.ptah/specs/TASK_2026_890_e3a7` deletions. Those are not part of this task.
- Files read in full or in the changed regions: the transcript component (`.ts`, `.html`),
  `transcript-display-feed.ts`, `chat-view.component.ts` (providers), `change-set-actions.service.ts`,
  `vscode.service.ts`, `apps/ptah-electron/src/preload.ts`, `app.html`, the e2e specs
  `git/change-set-card.spec.ts` and `git/visual-review.spec.ts`, `assert-eager-bundle.mjs`,
  the original card component and the removed spec at `HEAD`.
- Check run: `npm run verify -- -t test -p chat,chat-ui`. Header
  `starting verify test (chat,chat-ui)`. Result `2 tasks: 2 succeeded, 2 cached`, exit 0.
  The cache hit means the inputs are the same as the implementer's final run.
- Repository search (all of the repository except `tools/mcp-bench`, `.ptah`,
  `.claude-worktrees`, `node_modules`, `dist`) for `ChangeSetCardComponent`, `ChangeSetCardHost`,
  `chat-ui/change-set-card`, `change-set-card.component`, `molecules/change-set/`,
  `ptah-change-set-card`, `changeSetMarks(`, `changeSetError(`, `onChangeSetOpenScm`,
  `ChangeSetErrorIcon`, `chat-change-set`, `AUTO_EXPAND_MAX_FILES`, `ChangeSetRowState`, and
  the free text "change-set card". No code reference to a removed symbol or to the removed alias
  remains. The results that remain are comments and spec text, listed in defects 2 and 3.

## Check 1 — the removed branch was unreachable

The condition is `display.enabled`, not `isElectron` alone:

- `transcript-display-feed.ts:82`: `this.enabled = input.enabled && this.dock !== null`.
- `chat-transcript.component.ts:853-854`: `input.enabled` is `this.vscodeService.isElectron`.

So the `@else if` branch rendered in two cases: (a) a non-Electron host, (b) Electron with no
`DisplayDockState`. D2 names only case (a). Both cases are unreachable in shipped code:

- (a) The VS Code host app was removed (`1cee6fafe chore(electron,ci,docs,deps): remove the
  TUI, CLI and VS Code hosts`). `apps/` has no VS Code host. The Electron preload sets
  `ptahConfig.isElectron: true` before Angular starts (`apps/ptah-electron/src/preload.ts:31-33`),
  and `VSCodeService` reads it in its constructor (`vscode.service.ts:118-148`). The
  `display.enabled` value is read once at construction, so a late config would matter, but the
  config is synchronous.
- (b) `<ptah-chat-transcript>` mounts only in `chat-view.component.html:72`. `ChatViewComponent`
  provides `DisplayDockState` as `SESSION_DISPLAY_DOCK ?? new DisplayDockState()` whenever
  `isElectron` is true (`chat-view.component.ts:231-238`). So the dock is never null in Electron.

Conclusion: the branch was dead. D2 reaches the correct result with an incomplete proof (see
note N1).

## Check 2 — D4 preserve list

- Chip inputs and outputs: `[summary]`, `(openFile)`, `(review)` are unchanged
  (`chat-transcript.component.html:136`). `onTurnSummaryReview` / `onTurnSummaryOpenFile`
  still call `onChangeSetReview` / `onChangeSetOpenFile` (`chat-transcript.component.ts:1091-1109`).
- `ChangeSetStore`: still injected and used by `changeSetAnchors`, the turn snapshots, the
  display feed `marksFor`, and `ensureLoaded` (`chat-transcript.component.ts:325, 651-690, 862, 1168`).
- `git:turnChangeSet` / `git:turnChangeSets`: no file in that flow is in the diff.
- `apps/ptah-electron-e2e/src/specs/git/change-set-card.spec.ts`: it selects only
  `chat-turn-summary` and `turn-summary-chip-*` test ids (lines 30, 166, 217-289). Both still
  render. `git/visual-review.spec.ts` also captures the chip only (`chat-turn-summary`).
- `ChangeSetActionsService.openScm` keeps a caller (`inspector-git-section.component.ts:169`),
  so it is not dead.
- Error display of the chip actions: see defect 1. It did not work before this diff in Electron
  either, but this diff removed its last reader.

## Check 4 — moved helpers

`ROW_PAGE_SIZE` (50) and `formatFileCounts` in `turn-summary-files.utils.ts:4-21` have the same
bodies as `change-set-card.component.ts:50` and `:59-73` at `HEAD`, character for character
(including the U+2212 minus sign). Only the doc comment changed (defect 4).

## Check 5 — removed spec coverage

- `chat-transcript.change-set.spec.ts` (deleted): all three cases use `isElectron: false` and the
  card. Placement is still covered for the chip by `chat-transcript.display.spec.ts:393-412`
  (`contentChildren` order) and by `transcript-change-set-anchors.spec.ts`. The case "shows a
  failed action inline and clears it on the next attempt" was the only coverage of the
  `runChangeSetAction` catch path. That path still runs for the chip (defect 1).
- `chat-transcript.display.spec.ts`: the two removed cases asserted the card (VS Code host, and
  Electron with no dock). No chip assertion was lost.

## Defects

1. **Medium — write-only error state; a failed chip action is silent.**
   `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.ts:1083`
   (`changeSetErrors`), `:1115-1141` (`runChangeSetAction`, `setChangeSetError`).
   The removed `changeSetError()` at the old `.html:158` (at `HEAD`) was the only reader. Now the signal is
   written and never read. When `ChangeSetActionsService.openInDock` fails
   (`change-set-actions.service.ts:141-146`), or `openFile` throws for an unknown path (`:99`),
   the user who clicks Review or a file row in the chip sees nothing. The only trace is a
   `console.error`. The Display panel path reports the same failure through
   `runDisplayChangeSetAction(..., onFailure)` (`change-set-actions.service.ts:190`), so the
   transcript chip is the odd one out.
   Fix (recommended): in the `display.enabled` block of `chat-transcript.component.html:129-138`,
   render the error under the chip:
   `@if (summary.model.files && changeSetErrors().get(changeSetKey(summary.model.files.changeSet)); as error)`
   → `<p role="alert" data-testid="chat-turn-summary-error">…</p>` with the old icon and
   `text-error` classes. Make `changeSetErrors` readable (`protected`), and add a display spec:
   reject `review`, expect the alert, retry with success, expect it to clear (the deleted spec's
   case, moved to the chip). Alternative fix if the user wants no behavior change: delete
   `changeSetErrors` and `setChangeSetError`, keep a plain `try/catch` that logs, and record the
   silent failure as a follow-up task. Do not leave the write-only signal.

2. **Low — empty assertions and a stale test title.**
   `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.display.spec.ts:409`
   and `:453` assert `query(fixture, 'chat-change-set')).toBeNull()`. The `chat-change-set` test
   id no longer exists anywhere, so these lines always pass and test nothing. `:393` is titled
   "Electron: replaces the change-set card and tests row with the chip at the turn end".
   Fix: delete lines 409 and 453. Rename line 393 to
   "Electron: renders the chip at the turn end, with no tests row".

3. **Low — stale comments that describe the removed card.**
   Fix each to name the turn summary chip, or delete the card part:
   - `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.ts:252-253`:
     two identical `// Used only inside @defer, so the compiler loads it lazily.` lines. The first
     one belonged to the removed `ChangeSetCardComponent`. Delete one.
   - `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.ts:48-49`:
     the deleted comment also gave the reason that the chip comes from its own entry point (the
     compiler defers an import only when every symbol is used inside `@defer`, and esbuild splits
     only a file that no eager code imports). That reason still applies to
     `TurnSummaryChipComponent`. Restore it above the `turn-recap` import.
   - `apps/ptah-extension-webview/scripts/assert-eager-bundle.mjs:29-30`: says the marker is "the
     card's own template text" and that the `ptah-change-set-card` tag stays in the eager
     transcript. The marker `No longer changes HEAD` now comes from
     `turn-summary-files.component.ts:174`. The guard still works (it is not stale), but the
     comment is wrong.
   - `apps/ptah-extension-webview/src/app/app.config.ts:319-321`: "Turn change-set cards" and
     "before any card chunk loads".
   - `libs/frontend/chat/src/lib/services/change-set/change-set-actions.service.ts:44`:
     "Opens what a change-set card asks for".
   - `libs/frontend/chat/src/lib/components/organisms/transcript/transcript-turns.ts:22`:
     "next to the change-set card that anchors the same way".
   - `libs/frontend/chat/src/lib/components/organisms/transcript/transcript-turn-snapshots.ts:40`:
     "The card placement the transcript renders".
   - `libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary.model.ts:44`: "the
     change-set card's own formatter". The formatter is now in `turn-summary-files.utils.ts`.
     Lines `:48` and `turn-summary-files.component.ts:31` ("the change-set card's
     capabilities (parity section 2)") are history references. Keep them only if you add "(removed
     in TASK_2026_891)".
   - `apps/ptah-electron-e2e/src/specs/git/visual-review.spec.ts:36` and `:952`: the test title
     `chat change-set card ${theme}` captures the chip. Rename it to `chat turn summary chip`.
     Note: a rename changes the screenshot folder name if `Capture` uses the title. It uses the
     `'card'` key (`:954`), so the rename is safe.
   - `apps/ptah-extension-webview/src/app/status-badge-contrast.spec.ts:205-212`: describes the
     colour pairs of "the change-set card". Confirm that the chip files card uses the same pairs,
     then rename it to the turn summary files card, or delete the describe block.
   - `libs/backend/vscode-core/src/services/git/git-change-set-numstat.reader.ts:135` and
     `README.md:115` ("A turn that changes nothing has no change-set card"): change "change-set
     card" to "turn summary chip".

4. **Low — moved helper lost its rule description.**
   `libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.utils.ts:6`. The
   original JSDoc (`change-set-card.component.ts:54-58` at `HEAD`) said: binary reads `binary`,
   unknown counts read `?`, a zero side is omitted unless both sides are zero. The new comment
   gives none of these rules. Fix: copy the original JSDoc.

## Notes (no change needed in source)

- N1 — D2 proof is incomplete. `decisions.md` D2 says `display.enabled` is `isElectron`. The
  real rule is `isElectron && dock !== null` (`transcript-display-feed.ts:82`). The conclusion
  holds because of `chat-view.component.ts:231-238`. Add this to D2 so that a later change to the
  dock provider does not silently hide every change-set UI in Electron.
- N2 — in a non-Electron runtime (no preload, for example a browser `serve`), the transcript now
  shows no change-set UI at all, and `ensureLoaded` (`chat-transcript.component.ts:1168`) still
  loads change sets that nothing reads. This is acceptable because no such host ships.
- N3 — `libs/frontend/chat-ui/src/lib/molecules/change-set/` remains as an empty directory in
  the worktree. Git does not track it, so it has no effect on the commit.

## Five logic questions

1. What happens when it fails? A failed chip action is caught and stored, but never shown
   (defect 1).
2. What did the requirement leave out? The error display of the chip actions. D4 lists the
   actions but not their failure path.
3. Which state can go stale? `changeSetErrors` keeps one entry for each failed change set for
   the life of the component, and nothing reads it (defect 1).
4. Which boundary is not validated? None is new. `openFile` still rejects a path that is not in
   the change set (`change-set-actions.service.ts:99`).
5. What is incomplete? The removal itself is complete for code. Comments and two spec lines
   still describe the card (defects 2-4).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Review against `HEAD`, not local `main`. | `git diff main` / `git diff HEAD` | `main` is `ba9bb6e0c`, the task base is `05d3bb160` (task.md). | yes |
| Verdict REVISE for defect 1. | APPROVED with a follow-up / REVISE | The diff removed the last reader and left write-only state. Each fix is less than 20 lines. | yes |

## Re-review

Review family: claude (implementer: codex)

Score: 8/10

Verdict: APPROVED

All four defects are fixed. The fix round added no Medium or High defect. Three Info notes
remain. None of them blocks the merge.

### Scope and evidence

- Diff: the working tree against the task base `05d3bb160`. Local `main` moved to `406c27f28`,
  and `git merge-base HEAD main` is still `05d3bb160`. So `git diff main` also shows changes from
  `main` that are not part of this task. I used `git diff HEAD` plus the untracked
  `turn-summary-files.utils.ts`.
- Inputs: `fix-report.md`, the full diff of the files that changed in the fix round, the current
  template `chat-transcript.component.html:127-149`, `chat-transcript.component.ts:1080-1141`,
  `chat-transcript.display.spec.ts:390-480`, `turn-summary-chip.component.ts:99`,
  `turn-summary-files.component.ts:85-174`.
- Check run: `npm run verify -- -t test -p chat,chat-ui`. Header
  `starting verify test (chat,chat-ui)`. Result `2 tasks: 2 succeeded, 2 cached`, exit 0. The
  cache hit means the inputs are the same as the implementer's run, and that run included the
  new spec case.

### Defects of the first review

1. **Fixed — chip action error is now shown.**
   `chat-transcript.component.html:137-144` renders a `role="alert"` paragraph under the chip,
   inside the `chat-turn-summary` wrapper.
   - Null safety: `TurnSummaryModel.files` is `TurnSummaryFilesCard | null`. The guard
     `summary.model.files && …` gives `null` when there is no files card, so `@if` renders
     nothing. `Map.get` gives `undefined` when there is no error. Both are falsy.
   - Correct key: `onTurnSummaryReview` and `onTurnSummaryOpenFile`
     (`chat-transcript.component.ts:1093-1099`) pass `summary.files.changeSet` to
     `runChangeSetAction`, which writes `changeSetKey(changeSet)`
     (`chat-transcript.component.ts:1121`). The template reads `changeSetKey` of the same
     `summary.model.files.changeSet`. The read key and the write key are the same.
   - `runChangeSetAction` clears the key before each attempt (`:1122`), so a successful retry
     removes the alert.
   - Lazy `@defer` contract: the new block uses only component members (`changeSetErrors`,
     `changeSetKey`, `ChangeSetErrorIcon`) and `lucide-angular`. `LucideAngularModule` is an
     NgModule, so it was always eager, also for the removed card branch. `AlertTriangle` was an
     eager import at `HEAD` too. The `@defer (when summary)` trigger did not change, and no new
     component import was added. The chip chunk is still lazy.
   - Signal reads: `changeSetErrors()` is read inside the deferred block of each chip only. A
     write causes a check of those views only. This is the same cost as the removed card.
   - Spec: `chat-transcript.display.spec.ts:435-460` (retry check at `:458`) rejects `review` once, then expects the
     alert with `role="alert"`, the exact `Error.message`, and an `aria-hidden` icon. It then
     clicks Review again and expects two calls and no alert. The test ids
     `turn-summary-chip-toggle` (`turn-summary-chip.component.ts:99`) and
     `turn-summary-review-all` (`turn-summary-files.component.ts:145`) exist. If a click target
     is missing, `?.click()` does nothing, but then the `role` and `toHaveBeenCalledTimes(2)`
     checks fail. So the test is not vacuous.
2. **Fixed — empty assertions and stale title.** The `chat-change-set` assertions were removed
   (old `:409` and `:453` at `HEAD`). The title at `chat-transcript.display.spec.ts:393` is now "Electron:
   renders the chip at the turn end, with no tests row". See note R1.
3. **Fixed — stale comments.** The duplicate comment at `chat-transcript.component.ts:252-253`
   is gone. The lazy-entry reason is restored at `:48-49`. Each of these comment edits is
   accurate and changes only a comment, a JSDoc, or a test title:
   - `README.md:115`
   - `git-change-set-numstat.reader.ts:135`: null counts show as `?` through `formatFileCounts`.
   - `change-set-actions.service.ts:44` (see note R2)
   - `transcript-turns.ts:21`
   - `transcript-turn-snapshots.ts:40`
   - `app.config.ts:319-321` (see note R3)
   - `visual-review.spec.ts:36` and `:952`: the title only. The `Capture` key is still `'card'`
     (`:954`), so the screenshot paths do not change.
   - `status-badge-contrast.spec.ts:205-210`: the comment and the `describe` name only. The
     checks did not change. The files card uses `badge-ghost` (`turn-summary-files.component.ts:104`)
     and ghost buttons (`:126`), so the comment is correct.
   - `provider-accent.ts:19`: the files card uses `border-base-content/10` and `/20` neutral
     borders (`turn-summary-files.component.ts:85, 126, 139, 170`).
   - `turn-summary.model.ts:44, 48` and `turn-summary-files.component.ts:31`
   - `assert-eager-bundle.mjs:29`: only the comment changed. The `No longer changes HEAD` marker
     was **not** removed, and it must not be removed. The text is still rendered at
     `libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.component.ts:174`,
     which is its only production source (`git grep`). So the guard is not stale: it still fails
     if the files card moves into the eager closure. The premise of the re-review brief ("the
     removed marker") is not correct. The fix report states the same fact under Decisions.
4. **Fixed — helper JSDoc.** `turn-summary-files.utils.ts:6-10` has the original rule text
   again. The code is unchanged and is still the same as the original.

### New findings (Info, no change required)

- **R1 — Info.** `chat-transcript.display.spec.ts:409` asserts that `chat-turn-tests` is absent.
  That test id is not in any production template, at `HEAD` or now (`git grep`). So the
  assertion always passes, and the new title "with no tests row" depends on it. This was already
  true before this task. Fix if wanted: drop ", with no tests row" from the title and delete
  line 409.
- **R2 — Info.** `change-set-actions.service.ts:44` now says "Opens what a turn summary chip
  asks for". `openScm` has one caller, `inspector-git-section.component.ts:169`, and the Display
  panel also calls `review` and `openFile` through `runDisplayChangeSetAction`. A more accurate
  text is "Opens a change set in the host's own review surface".
- **R3 — Info.** `app.config.ts:319` gives the chip the task id `TASK_2026_576`. That task added
  the store and the cards. The chip came from `TASK_2026_623`. Fix if wanted:
  "Turn change sets (TASK_2026_576), shown by the turn summary chip (TASK_2026_623)".

### Score reason

8, not 9: three Info comment and test-title inaccuracies remain, and the error key depends on a
change set's turn times. A change set that a live push updates gets a new key, and its earlier
error disappears instead of staying. That result is acceptable, because the next action clears
the error in either case. 8, not 7: the only behavior change has a spec that is not vacuous,
and the dead-code proof, the D4 items and the lazy contract all hold.
