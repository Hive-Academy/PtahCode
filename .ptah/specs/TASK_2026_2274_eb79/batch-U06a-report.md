# U06a implementation report

Implemented the Electron renderer bots roster page, public page export, styles, regression specs and permitted provider-model RPC adapter. Only the brief's five implementation files and this report were written. No git operations or disallowed targets were run.

## Files

| File                                                           | Lines |
| -------------------------------------------------------------- | ----: |
| `libs/frontend/bots-ui/src/lib/bots-page.component.ts`         |   458 |
| `libs/frontend/bots-ui/src/index.ts`                           |     1 |
| `libs/frontend/bots-ui/src/lib/bots-page.css`                  |    75 |
| `libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts`    |   404 |
| `libs/frontend/bots-ui/src/lib/bots-provider-models-loader.ts` |    17 |

All files are below 700 lines. Prettier was run on every listed file and this report.

## Acceptance evidence

- Angular standalone component with OnPush, inject, signals, computed state, built-in control flow and stable bot-id tracking. Existing editor, row, list-detail and UI primitives are reused. No chat import, execution control, innerHTML, ngClass/ngStyle or template `$any`.
- Public `src/index.ts` exports only `BotsPageComponent`.
- Roster has search, all/current/user scope filtering and Show archived with the server's archived count. User bots remain visible by default and existing rows render the User badge.
- Shared list-detail uses its 960px split and Back to bots output. Narrow back confirms dirty discard before returning to the roster. Returning keeps the selected saved draft available.
- Loading disables search, sets aria-busy and shows three skeleton lines. List failure renders listError with Retry and keeps New bot available. Empty state removes the list pane and exposes one New bot action. Selection/read errors render store.error when draft is null.
- Initial workspace effect obtains ElectronLayoutService roots and active path, calls setWorkspaceRoots before load, and requests all scopes including archived. Local filters hide archived rows initially. Workspace changes reload the roster and catalogs.
- Dirty navigation awaits the shared WORKSPACE_COORDINATOR confirmation, then calls discard before select. A declined confirmation keeps the existing draft and selection. Navigation is guarded while saving/selecting or confirming.
- Unreadable rows are separate diagnostic-only row components; unidentified rows produce one notice. Neither receives application actions.
- Import saved custom agents / Preview later is an inert div and badge with no click handler or focusable control.
- Page specs cover populated/loading/error/retry/empty, User badge, archived filtering/count, edit text, preview inertness, root/load ordering, discard ordering and refusal, narrow back, selection errors, unreadable/unidentified rows, create scope, catalogs and avatars.

## Carry-forward evidence

- Pagination mounts at most 32 summary rows, hence at most 32 roster image avatars (below the 64 limit). Avatar requests originate from row avatarNeeded/Retry outputs and are deferred with queueMicrotask. Pending requests are deduplicated and queued work checks destruction and row visibility.
- avatarFor observes cache entries for mounted rows only. If a previously observed entry disappears it queues recovery, without a synchronous store signal write during change detection. Recovery is bounded to once per mounted image to avoid unbounded reload cycles under byte pressure; leaving/remounting rows or explicit Retry permits another request. A regression test evicts an image via 65 cache insertions while retaining the row instance and verifies recovery. Pagination tests cover 70 images and cache eviction across pages.
- lastEdit provides localized edit date/time text to each row and its accessible name.
- Installed skills from skillsSh:listInstalled and known tool ids from agent:getClaudeBuiltins flow to the editor. catalogLoaded remains false while either request loads or fails; loading/failure inputs are passed explicitly. Runtime lane catalogs load through the store separately.
- PROVIDER_MODELS_LOADER is provided above the editor using the permitted new RPC adapter.
- Multi-root creation shows an explicit scope selector. No implicit first-root scope is supplied. Missing scope leaves the store's refusal visible; choosing User or a named workspace supplies BotScope to newDraft.
- Button, badge, checkbox, input and select styling uses shared UI directives. Class audit reports zero increases and no bots-ui FAIL line. Baseline was not edited.

## Decisions

1. **Local provider-model adapter.** Options: reuse existing adapter or add the permitted small adapter. Source search found ProvidersModelsLoader only inside chat settings; importing chat is forbidden. Added BotsProviderModelsLoader over the existing typed provider:listModels RPC and provided the picker port at page scope. Reversible when an allowed shared adapter exists.
2. **Bounded roster pagination.** Options: pagination or virtualization. The brief mandates a visible avatar bound and names no virtual-scroll primitive. Existing row outputs and a 32-row page satisfy it with no observers/timers per row. Reversible without changing bot state or storage.
3. **Local filters over a complete current-root roster.** Options: refetch per filter or filter loaded summaries. The store supports all scopes/includeArchived and already supplies archivedCount. Fetch all once per workspace and filter locally, preserving dirty drafts and avoiding request churn. Reversible.
4. **Available tool catalog.** Existing typed RPC agent:getClaudeBuiltins supplies known tool ids; skillsSh:listInstalled supplies installed skills. Unknown tool ids remain supported by the existing chip editor. This is a known built-in catalog, not a claim to discover every external tool. Reversible if a unified tool catalog RPC is added.
5. **Existing confirmation boundary.** WORKSPACE_COORDINATOR.confirm is exported by core and provides the host's confirmation UI. Reused it rather than introducing a new modal or browser confirm. Reversible.

## Command results

Working directory for all checks: D:/projects/ptah-extension/.claude-worktrees/bots-phase-1.

- `npx prettier --write` on all five implementation files: pass.
- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint libs/frontend/bots-ui/src/index.ts libs/frontend/bots-ui/src/lib/bots-page.component.ts libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bots-provider-models-loader.ts`: exit 0, no warnings.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; 1461 files scanned; controls and spacing each report 0 token counts over baseline; no bots-ui FAIL line.
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`: 2 suites passed, 44 tests passed.
- Scoped ptah_get_diagnostics after final edits: no diagnostics in any changed TypeScript file, including the page spec. The tool reports five sibling errors in shared capability-id-codec.ts and messages/attention-identity.ts about BigInt literals targeting below ES2020. Those files were not modified. The specified bots-ui tsc command passes.
- Intermediate lint found an unused catch binding and missing providedIn; corrected. Intermediate diagnostics found invalid error-code test fixtures; corrected. The new mounted-row eviction spec initially needed the initial avatar render explicitly stabilized; its final run passes with the same row instance.

## Visual verification and limitations

Read the supplied design spec and prototype and inspected its populated dark 1280px screenshot through ptah_browser_navigate and ptah_browser_screenshot. Checked the reference's title/action, execution-unavailable note, left roster, archive label, User badge, dashed preview and selection prompt. Implementation uses the reference structure and existing shared UI components, with pagination to meet the avatar bound.

The screenshot is the supplied prototype, not the new Angular page. Actual Electron rendered-page inspection and app-level template verification remain for integration: this brief forbids build, serve, dev, Nx and npm run verify, and supplied no running renderer URL. No screenshot files or extra artifacts were written outside the allowed set. Narrow behavior is covered through the real shared list-detail component in Jest, not claimed as a browser visual check.

A progress report asking the parent to include the Electron visual check was refused with parent-inbox-full; it was not retried. This report carries that integration requirement.

## Tool and skill availability

Used Ptah file discovery, AST analysis, scoped diagnostics, browser navigation and screenshot tools. Native reads followed structural inspection for the relevant store/editor/row/spec sources; free-text RPC/config searches used rg. No host skill-loading tool was listed; read the local angular-frontend-patterns and ui-ux-designer SKILL.md sources directly. Applied Angular conventions and the existing approved design rather than starting a new design phase.

## Revision 1

Implemented review defects 1?6 and 9. Review items 7 and 8 remain unchanged by coordinator instruction and are open for R01 below. Kept the coordinator's two `[compact]="true"` bindings at `bots-page.component.ts:71` and `:148`. No files outside the original implementation write set and this report were edited. No git operations, Nx, npm run verify, build, serve, dev, e2e or package targets were run.

### Fixes and regression evidence

Paths in this section are relative to `libs/frontend/bots-ui/src/lib/`.

| Defect                                     | Fix                                                                                                                                                                                                                                                                                                                                                          | Regression specs                                                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Out-of-range page after list shrink     | `bots-page.component.ts:302`: currentPage clamps requested page to the available page range. Slice and all pager controls use it (`:192`, `:307`).                                                                                                                                                                                                           | `bots-page.component.spec.ts:409`: 33 bots, page 2, then either archive or delete its sole bot on refresh; page 1 displays 32 rows and no stranded pager.                                                                                                 |
| 2. Detail stays open after draft removal   | `bots-page.component.ts:243`: stable hasDraft computed feeds linked detail visibility, resetting visibility when draft existence changes while preserving it during field edits. Empty state now follows last-bot deletion.                                                                                                                                  | `bots-page.component.spec.ts:440`: actual store.delete with last/non-last bot; verifies empty page or Select a bot with no detail selection. `:470` covers discarding a new draft. Existing dirty narrow-back spec still passes.                          |
| 3. Old workspace editor survives switching | `bots-page.component.ts:327`: compare actual root/active workspace identity, clear selected/draft using public store methods, close detail and reset page. Dirty changes generate exactly one polite notice with the requested text (`:75`). Workspace generation checks prevent an old confirmation continuing navigation (`:426`, `:451`, `:465`, `:489`). | `bots-page.component.spec.ts:481`: pristine and dirty switches both clear selected/draft and close detail, with one notice only for dirty. `:514` verifies a pending confirmation cannot select in the new workspace.                                     |
| 4. Roster flashes on refresh               | `bots-page.component.ts:249`: firstLoading requires loading and a null list. Search disabling (`:120`) and skeleton (`:161`) use firstLoading. Existing list rows remain mounted and enabled during refresh.                                                                                                                                                 | `bots-page.component.spec.ts:537`: deferred refresh preserves the exact row DOM node, keeps search/row enabled and shows no skeleton. Existing initial-loading spec remains.                                                                              |
| 5. Stale create scope                      | `bots-page.component.ts:343`: reset createScope on root/active changes. `:467`: validate requested scope against current store roots or User immediately before newDraft; reject stale root rather than passing it.                                                                                                                                          | `bots-page.component.spec.ts:560`: reset on workspace roots change; `:595`: stale scope is rejected even before layout catches up with store roots.                                                                                                       |
| 6. Dynamic options selection               | `bots-page.component.ts:79`: removed select value binding for createScope; placeholder, User and each dynamic root option bind selected (`:82`, `:85`, `:89`).                                                                                                                                                                                               | `bots-page.component.spec.ts:560`: selectedOptions matches chosen roots before and after replacing the dynamic options, and creation receives the displayed root.                                                                                         |
| 9. Archived count ignores filters          | `bots-page.component.ts:275`: matchingRows applies scope and search before archive visibility; archivedCount (`:291`) counts archived matching rows independently of the checkbox. Label binds this count (`:141`).                                                                                                                                          | `bots-page.component.spec.ts:613`: all scopes gives 3, User gives 2, search gives 1, and checking Show archived reveals exactly that matching archived bot. Initial populated expectation now correctly shows zero when no archived summaries are loaded. |

The first revision test run found linkedSignal visibility resetting on ordinary draft object patches. Fixed it by inserting the stable boolean hasDraft computed; the final run passes all existing and added cases.

### Final files and line counts

| File                                                           | Lines | Revision change                                          |
| -------------------------------------------------------------- | ----: | -------------------------------------------------------- |
| `libs/frontend/bots-ui/src/lib/bots-page.component.ts`         |   520 | State, navigation, scope and template fixes              |
| `libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts`    |   657 | Regression cases and corrected archive count expectation |
| `libs/frontend/bots-ui/src/index.ts`                           |     1 | Unchanged                                                |
| `libs/frontend/bots-ui/src/lib/bots-page.css`                  |    75 | Unchanged                                                |
| `libs/frontend/bots-ui/src/lib/bots-provider-models-loader.ts` |    17 | Unchanged                                                |

All remain below 700 lines. Prettier --write was run on both changed implementation files and this updated report.

### Revision check results

- `npx ngc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0. This is the Angular/template check requested for revision 1; no tsc substitute was used for this round.
- `npx eslint libs/frontend/bots-ui/src/lib/bots-page.component.ts libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts`: exit 0, no warnings.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; controls and spacing both report 0 token counts over baseline; no bots-ui FAIL. Baseline unchanged.
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`: exit 0; 2 suites, 56 tests passed.
- Final scoped ptah_get_diagnostics: no diagnostics in either changed file. The same five unrelated shared BigInt target diagnostics remain; the requested ngc check passes.
- Actual Electron visual inspection remains for R01/integration under the unchanged lane restrictions. No new screenshot or extra artifact was written.

## Decisions

- **Workspace switching, settled by coordinator:** discard dirty edits, clear selection, close detail and show the exact polite notice. Scope/active workspace changes are detected by value. The store exposes no clearSelection method and store edits are outside the write set, so the page synchronously calls newDraft(User) then discard to clear editor state and invalidate pending requests without persistence. This uses only public store writers and is reversible if an explicit reset API is later provided.
- **Review item 7, OPEN for R01:** keep avatar recovery once per mounted image. No change to recovery, request deduplication or row output handling in this revision. R01 must assess the visible fallback after a second eviction.
- **Review item 8, OPEN for R01:** keep WORKSPACE_COORDINATOR.confirm and its existing dialog copy. No change to the shared confirmation boundary or modal-versus-inline presentation in this revision.
- **Existing R01 design questions remain:** approve 32-row pagination versus virtualization, shared-confirm presentation, header composition, new-bot scope selector and final Electron visual appearance. Revision 1 resolves pager correctness without deciding those visual questions.

## Revision 2

Fixed re-review 1 defects A and B, following the coordinator's explicit store API decision. Changed only `bots.store.ts`, `bots.store.spec.ts`, `bots-page.component.ts`, `bots-page.component.spec.ts`, the permitted new `bots-store-helpers.ts`, and this report. Review items C, 7 and 8 remain unchanged for R01. The coordinator's boolean compact bindings remain intact.

### Fixes and specs

File references below are relative to `libs/frontend/bots-ui/src/lib/`.

- **A: old workspace rows during reload or after failure.** `bots.store.ts:190` adds public clearList: increments listSequence, drops the list, clears the prior list error/loading state and clears obsolete refresh parameters. Late responses from the old request cannot repopulate rows or replace the new workspace error state. `bots-page.component.ts:331` calls it synchronously on workspace change before the next load. The existing firstLoading computation consequently shows the initial skeleton, and no old row stays mounted/clickable. The normal same-workspace refresh behavior is preserved.
- **A: explicit selection reset.** `bots.store.ts:199` adds public clearSelection: advances selectionSequence, calls invalidateEditor, clears selected/draft and advances draftEpoch exactly once. `bots-page.component.ts:332` replaces the newDraft(User)+discard pair with this method. It performs no persistence and invalidates pending editor requests while preserving the coordinator-approved workspace-change behavior and dirty notice.
- **Store regressions.** `bots.store.spec.ts:151` checks cached rows disappear and a stale successful list response stays ignored. `:168` checks a stale failed response cannot overwrite the next workspace's successful list. `:182` checks dirty selection reset, epoch increment, pristine/cleared editor state and no create/update RPC. `:201` checks an outstanding select cannot restore cleared selection.
- **Page regression for A.** `bots-page.component.spec.ts:657` defers the workspace reload: old rows disappear, skeleton appears, initial-load search is disabled and no old row can invoke get. On a failed response, error shows while old rows remain absent and the skeleton ends.
- **B: stale discard notice.** `bots-page.component.ts:441` clears workspaceNotice when selecting a bot after the busy guard, including reopening the selected bot. `:462` does the same when starting a new bot. `bots-page.component.spec.ts:693` covers both actions after a dirty workspace switch and verifies the notice disappears while the new draft/editor becomes available.
- **Store size.** Moved the existing pure deepEqual function unchanged into `bots-store-helpers.ts:2`; `bots.store.ts:18` imports it. This is a private-folder helper, with no public barrel change. Existing dirty-draft comparisons retain their behavior, covered by the store/editor suites.

### Final line counts

| File                                                        | Lines |
| ----------------------------------------------------------- | ----: |
| `libs/frontend/bots-ui/src/lib/bots.store.ts`               |   678 |
| `libs/frontend/bots-ui/src/lib/bots.store.spec.ts`          |  1153 |
| `libs/frontend/bots-ui/src/lib/bots-page.component.ts`      |   521 |
| `libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts` |   716 |
| `libs/frontend/bots-ui/src/lib/bots-store-helpers.ts`       |    30 |

Production files stay below 700 lines; spec files use the explicit Revision 2 exemption. Prettier --write was run on all five changed TypeScript files and this report.

### Command results

Working directory: `D:/projects/ptah-extension/.claude-worktrees/bots-phase-1`.

- `npx ngc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts libs/frontend/bots-ui/src/lib/bots-page.component.ts libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bots-store-helpers.ts`: exit 0, no warnings.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; 1462 files scanned; controls and raw spacing each report 0 token counts over baseline; no bots-ui FAIL. Baseline unchanged.
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`: exit 0; 3 suites, 109 tests passed in the final run.
- Final scoped ptah_get_diagnostics: no diagnostics in all five changed TypeScript files. The same five shared-file BigInt target diagnostics remain outside this write set. Intermediate diagnostics found missing RpcResult generic arguments in two new failure fixtures; those were corrected and the final diagnostics/test run is clean for changed files.
- No npm run verify, Nx, git writes or forbidden build/serve/dev/e2e/package target was run. No raw DaisyUI control class or chat import was added. Actual Electron visual review remains for R01; this revision adds no layout or design choice.

### Decisions carried forward

- The explicit clearList/clearSelection APIs supersede Revision 1's temporary public-method reset sequence, as directed by the coordinator. The small helper extraction keeps store size within the hard limit without changing its comparisons.
- C (an already-open confirmation dialog across a switch), 7 (avatar recovery once) and 8 (shared confirmation presentation) are still OPEN for R01. No behavior change was made to them.
