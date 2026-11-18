# Batch U06b report

Implemented the bot editor, save bar and conflict comparison drawer in the assigned worktree. No git commands or writes outside the brief's write set and this deliverable.

## Files changed

| File (relative to worktree)                                             | Physical lines | Change                                                                                                |
| ----------------------------------------------------------------------- | -------------: | ----------------------------------------------------------------------------------------------------- |
| libs/frontend/bots-ui/src/lib/bot-editor.component.ts                   |            463 | Composition, action menu, focus, enabled state, archived note, error owner and removal orchestration. |
| libs/frontend/bots-ui/src/lib/bot-save-bar.component.ts                 |             99 | Eight display states and sticky actions.                                                              |
| libs/frontend/bots-ui/src/lib/bot-conflict-drawer.component.ts          |            142 | Conflict alert, field comparisons and choice outputs.                                                 |
| libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts              |            368 | Editor integration, save-state, upload-race and effort regressions.                                   |
| libs/frontend/bots-ui/src/lib/bot-identity-runtime-section.component.ts |            619 | Only carry-forward #3/#4: invalidate older upload on invalid replacement; clear effort on null.       |

All five source files are below 700 physical lines, including blank lines and comments.

## Acceptance evidence

- Standalone Angular components use OnPush, signal inputs/outputs, computed state, inject(), signal queries and built-in control flow. No innerHTML, ngClass or execution controls. No page or barrel dependency.
- Editor composes all U05 form groups through the existing identity/runtime, skills/tools and memory/approval components, and mounts the delete dialog closed. Domain changes go exclusively through store methods; local signals hold only view state.
- Header shows saved revision, enabled status and the Enabled switch. Exact associated hint: "Applies at once. Does not save other edits." A persistent "Bots cannot start yet" note and existing Triggers information remain visible.
- Native action dropdown contains Rename, Enable/Disable, Archive, Delete; archived actions contain Restore and Delete. Keyboard navigation supports arrows, Home, End and Escape; menu closure restores trigger focus. Removal choices use the U05 dialog.
- Save bar renders pristine, new, dirty, invalid, saving, saved, conflict and error states. It announces validation assertively and other messages politely, disables actions appropriately, and exposes a reduced-motion spinner while saving. Archived records have no save bar.
- Editor focuses Name for a new draft after rendering and focuses the first invalid field on a save attempt. Conflict editing schedules focus after enabling the form.
- Conflict comparison uses the existing native drawer, escaped text interpolation and every editable field. It shows latest and local values, with compare/edit-mine/resubmit/load-latest outputs. Merely opening or closing comparison preserves the draft.
- Specs assert the exact Enabled association, execution-disabled message, archived read-only controls, Restore presence/pending disablement and disabled restored result, first-invalid focus, comparison, draft preservation after toggling and errors, explicit load-latest, full-draft resubmission, catalog bindings and closed removal dialog.

## Carry-forward rows

| Requirement                                                                     | Resolution                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disable ordinary controls using blockedReason/readonly; preserve conflict paths | Save, toggle and ordinary actions use both gates. A disabled fieldset gates all section controls. Edit mine unlocks conflict editing; compare and resolution remain available unless readonly.                                      |
| No upload scope; editor owns error                                              | Existing identity upload passes mediaType/dataBase64 only; no scope added. Editor alone renders store.error(), with retry and draft-preservation text.                                                                              |
| Bind five skills/catalog inputs                                                 | Editor exposes and binds installedSkills, knownToolIds, catalogLoaded, catalogLoading and catalogFailed. Loaded is forced false during loading/failure.                                                                             |
| Correct dialog target and mount state                                           | Pass saved target name, archived state and dirty state; isOpen starts false and changes on explicit removal actions.                                                                                                                |
| U05 re-review #3 invalid second file                                            | Re-patch the current avatar through store.patchDraft, invalidating uploadSequence without changing the avatar. A deferred-upload regression proves the older successful RPC cannot apply its image afterward. No extra RPC is sent. |
| U05 re-review #4 effort null                                                    | Null and empty effort both remove effort, consistently with tier. Regression verifies null clears.                                                                                                                                  |

## Decisions

Revision 1 retains the avatar-cancellation workaround at `libs/frontend/bots-ui/src/lib/bot-identity-runtime-section.component.ts:577`: patching the current avatar cancels application of an older upload through the existing store sequence. It also recomputes saveState as pristine or dirty (or conflict while a conflict exists), so a visible saved/error bar can disappear after an invalid replacement file. Dirty comparison and revision remain unchanged. An already completed server upload can leave an orphan image, as before this batch. Accept these side effects within the existing write set; the store is not edited.

Revision 1 disables ordinary Discard during conflict. Resolution stays explicit through Edit mine, resubmit or load latest in the conflict drawer. Options were disabling Discard or redirecting it to load latest; the review request selects disabling. This is reversible and avoids reverting to the stale selected revision.

| Decision                                                                                      | Options                                                   | Evidence                                                                                                                                                 | Reversible |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Use patchDraft with the existing avatar to invalidate a pending upload on invalid replacement | Accept race; reuse patchDraft; add cancellation API       | Store.patchDraft already increments uploadSequence on an avatar patch and clears upload state. Brief prohibits store edits. Existing avatar is retained. | Yes        |
| Keep catalog transport and provider model loader outside the editor                           | Fetch in editor; expose catalog inputs and inherit loader | U05 already defines the section inputs and requires PROVIDER_MODELS_LOADER upstream. U06a owns page data composition. Editor reuses these contracts.     | Yes        |
| Keep edit-mine as transient editor state                                                      | Clear conflict; keep conflict and unlock fields           | Store.patchDraft explicitly preserves conflict and updates conflict.mine; resubmitConflict rebases the complete draft on latest revision.                | Yes        |

## Command results

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint` on the five changed TypeScript files above: final exit 0, no errors or warnings.
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts`: exit 0; 2 suites, 40 tests passed.
- `npx prettier --write` on all five changed TypeScript files: exit 0; final run unchanged.
- Scoped `ptah_get_diagnostics`: no diagnostics in requested files. Compiler-backed tool reports five TS2737 BigInt target diagnostics in unchanged shared capability-id-codec.ts and attention-identity.ts. The required library tsc command passes. Initial spec-only RpcResult generic diagnostics were fixed.
- Initial Jest run needed the same HTMLDialogElement showModal/close JSDOM shims used by the existing deletion-dialog spec; final suites pass with real child components.

## Integration and remaining validation

- U06a imports BotEditorComponent directly from its file, supplies installed skills/tool catalog inputs and provides PROVIDER_MODELS_LOADER above the runtime picker, as specified by U05. The editor does not fetch page catalogs.
- Rendered Electron visual review and screenshots were not performed: the lane may not launch build/serve/dev/e2e, and repository guidance requires visual review in Electron. No visual-quality claim is made from source or JSDOM. Coordinator must compare the integrated renderer with design-spec.md and prototype/bots.html (header/menu, sticky save bar, comparison, archived state, narrow layout).
- Renderer template gate remains coordinator-owned; no npm run verify or nx was run in this lane. Focused JIT component tests rendered the affected Angular templates in JSDOM.
- No host skill-loading/invocation tool is exposed in this lane. Read local angular-frontend-patterns and ui-ux-designer SKILL.md guidance via filesystem; followed the approved existing specification without creating a new design. ptah_search_files returned zero for the prototype glob, so rg --files located prototype/bots.html; no native symbol search replaced a usable Ptah symbol result.

- Coordinator integration-action message was rejected with parent-inbox-full; not retried. This report carries the integration requirements above.

## Revision 1

All seven requested review items are addressed. Only the editor, save bar, editor spec and this report were changed in this revision. The conflict drawer, identity/runtime section and store were not edited.

### Defect fixes

File references below are relative to `libs/frontend/bots-ui/src/lib/`.

| Defect                                           | Fix and evidence                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Enabled switch DOM state after failed request | `bot-editor.component.ts:425`: toggle is async and retains the originating checkbox. Its finally block restores checked from the current draft after setEnabled settles, including failures and revision conflicts. Regression at `bot-editor.component.spec.ts:153` covers both outcomes and preserves local instructions.                                                                                    |
| 2. Duplicate alerts during conflict              | `bot-editor.component.ts:200`: the ordinary error block renders only without a conflict. `bot-editor.component.spec.ts:281` verifies store.error is still set while exactly one alert shows, containing the conflict message.                                                                                                                                                                                  |
| 3. Validation attempt survives draft replacement | Superseded by Revision 2: attempted now links to the store draftEpoch, which changes for explicit draft replacement and stays stable during typing. `bot-editor.component.spec.ts:191` covers new-after-new, Cancel then New, and selection. Draft patches preserve attempted; the invalid save summary remains visible while validation issues remain. Field validation still derives from the current draft. |
| 4. Ordinary Discard during conflict              | `bot-save-bar.component.ts:75`: conflict is included in discardDisabled. `bot-editor.component.spec.ts:281` proves a disabled click preserves the local draft and conflict; `bot-editor.component.spec.ts:435` proves the save bar does not emit discard. Conflict comparison/edit/resubmit/load-latest controls remain available.                                                                             |
| 5. Avatar cancellation side effect               | Retained `bot-identity-runtime-section.component.ts:577` without edits. Documented the saveState reset and unchanged dirty/revision behavior under the report's `## Decisions`, including the possible pre-existing orphan-image behavior. Store not edited. Existing pending-upload cancellation regression remains passing.                                                                                  |
| 6. Neutral action error title                    | `bot-editor.component.ts:202`: title is now exactly "Could not complete the action". The draft-preservation sentence remains inside the outer draft-existence block, so it cannot render without a draft. Failed-toggle regression checks the title; Cancel-then-New regression checks the sentence is absent with no draft.                                                                                   |
| 7. Focus effect dependencies                     | `bot-editor.component.ts:337`: afterRenderEffect reads isNew first, then wraps focusName and its DOM query in untracked so the editor query does not become an effect dependency.                                                                                                                                                                                                                              |

### New regression specs

- `bot-editor.component.spec.ts:153`: failed Enabled writes and revision-conflicted Enabled writes restore the checkbox to the store's false value after settling; the local draft survives.
- `bot-editor.component.spec.ts:191`: three replacement flows reset validation attempts; Cancel removes the draft before New.
- `bot-editor.component.spec.ts:281`: one conflict alert, ordinary Discard disabled, local draft retained after clicking it.
- `bot-editor.component.spec.ts:435`: save-bar conflict state cannot emit ordinary discard.

Seven new parameterized test cases; 47 tests now pass across the two required suites.

### Line counts

| Source file                                           | Physical lines |
| ----------------------------------------------------- | -------------: |
| bot-editor.component.ts                               |            471 |
| bot-save-bar.component.ts                             |            100 |
| bot-editor.component.spec.ts                          |            467 |
| bot-conflict-drawer.component.ts (unchanged)          |            142 |
| bot-identity-runtime-section.component.ts (unchanged) |            619 |

All remain below 700 lines including comments and blank lines.

### Command results

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint libs/frontend/bots-ui/src/lib/bot-editor.component.ts libs/frontend/bots-ui/src/lib/bot-save-bar.component.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`: exit 0, no errors or warnings.
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts`: exit 0; 2 suites and 47 tests passed.
- `npx prettier --write` on the three revised TypeScript files: exit 0. Report also formatted with Prettier.
- Scoped `ptah_get_diagnostics` on all three revised TypeScript files: no diagnostics in requested files. The same five unchanged shared-file TS2737 BigInt target diagnostics remain; required library tsc passes.
- No npm run verify, nx, git writes, build, serve, dev, e2e or package commands. Electron visual review and renderer template gate remain coordinator-owned as recorded above.

## CI fix (ui-class-audit)

Replaced raw DaisyUI control classes with the shared directives in the five authorized component files. The audit baseline was not edited. No spec changes were needed: the existing specs select by accessible names, native elements and component directives rather than the removed classes.

| File (under libs/frontend/bots-ui/src/lib/) | Physical lines | Directive mapping                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | -------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bot-conflict-drawer.component.ts            |            144 | btn/btn-sm -> ptahButton (default secondary, sm); btn-ghost -> variant="ghost". Imports PtahButtonDirective.                                                                                                                                                                                                                    |
| bot-delete-dialog.component.ts              |            223 | Cancel -> ptahButton variant="ghost"; dynamic primary/error action -> ptahButton [variant]="method() === 'archive' ? 'primary' : 'danger'". Imports PtahButtonDirective; no dynamic raw control classes remain.                                                                                                                 |
| bot-editor.component.ts                     |            481 | Text actions -> ptahButton with secondary/ghost variants; Delete keeps danger ink via variant="ghost" tone="danger". Icon-only menu trigger -> ptahIconButton label="More actions" (default ghost, sm), preserving its accessible name, menu attributes and reference. Imports PtahButtonDirective and PtahIconButtonDirective. |
| bot-save-bar.component.ts                   |            105 | Cancel/Discard -> ptahButton variant="ghost"; Save/Create -> ptahButton variant="primary". Saving uses the directive's busy input so the shared owner controls aria-busy; the existing spinner and disabled rules remain. Imports PtahButtonDirective.                                                                          |
| bot-memory-approval-section.component.ts    |            174 | badge -> span[ptahBadge], retaining ml-2 spacing and the "Not available yet" label. Default neutral tone, soft appearance and sm size. Imports PtahBadgeDirective.                                                                                                                                                              |

All files remain below 700 physical lines. Action handlers, labels, roles, test ids, dialog choices and state rules are retained. Shared button defaults are size sm; the delete action uses the confirmed danger variant rather than a raw btn-error class.

### Command results

- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; scanned 1458 files, 0 token counts over baseline, no bots-ui FAIL line. The raw-spacing summary also reports 0 token counts over baseline. Baseline decrease notices are informational; the baseline was not updated.
- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint libs/frontend/bots-ui/src/lib/bot-conflict-drawer.component.ts libs/frontend/bots-ui/src/lib/bot-delete-dialog.component.ts libs/frontend/bots-ui/src/lib/bot-editor.component.ts libs/frontend/bots-ui/src/lib/bot-save-bar.component.ts libs/frontend/bots-ui/src/lib/bot-memory-approval-section.component.ts`: exit 0, no errors or warnings.
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts libs/frontend/bots-ui/src/lib/bot-delete-dialog.spec.ts`: exit 0; 3 suites, 61 tests passed.
- `npx prettier --write` on all five changed component files: exit 0. Report also formatted with Prettier.
- Scoped `ptah_get_diagnostics` on all five changed component files: no diagnostics in requested files. The same five unchanged shared-file TS2737 BigInt target diagnostics remain; required library tsc passes.
- Targeted search confirms no remaining raw btn/badge control classes in the five files. `ptah_code_search_symbols` returned an empty index for PtahButtonDirective, so one native text search located existing import examples. Shared directive sources and type unions were read before use.
- No npm run verify, nx, git writes, build, serve, dev, e2e or package commands. Rendered Electron visual review remains coordinator-owned.

## Revision 2

Fixed N1 by separating explicit draft replacement from immutable draft patches. Corrected the Revision 1 D3 description above: editing must preserve the attempted-validation state, and only explicit draft replacement resets it.

### Fix and specs

- `libs/frontend/bots-ui/src/lib/bots.store.ts:129`: private writable `_draftEpoch = signal(0)`; public readonly view at line 167.
- Epoch increments only after successful explicit replacement: select at line 252, newDraft at line 286, discard at line 324, and loadConflictLatest at line 386. Incrementing is deliberately outside the shared accept helper, so save, setEnabled and resubmitConflict do not advance it. patchDraft does not advance it either. Other store logic is unchanged.
- `libs/frontend/bots-ui/src/lib/bot-editor.component.ts:310`: attempted now uses only `store.draftEpoch` as its linkedSignal source. A keystroke leaves attempted true and keeps the invalid summary visible while issues remain.
- `libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts:223`: new regression attempts to create an invalid draft, types one character into Description using its real input event, and asserts that both validation issues and the invalid save summary remain. The Description field has a generated id; the test locates it through the labeled field rather than assuming an absent id.
- Existing D3 replacement regressions at `bot-editor.component.spec.ts:191` remain passing: new after new, Cancel then New, and select.
- `libs/frontend/bots-ui/src/lib/bots.store.spec.ts:138`: new regression checks the epoch starts at zero, advances for successful newDraft/select/discard, and stays unchanged through patchDraft calls.

### Line counts and inherited limitation

| File                         | Before | After |
| ---------------------------- | -----: | ----: |
| bots.store.ts                |    683 |   689 |
| bots.store.spec.ts           |   1072 |  1085 |
| bot-editor.component.ts      |    481 |   481 |
| bot-editor.component.spec.ts |    467 |   491 |

The production store remains below 700 lines, so the requested store stop condition was not triggered. The existing store spec already exceeded 700 before this revision; the explicitly requested regression adds 13 lines. This file still does not meet the physical line limit. No unrelated test restructuring or extra files were introduced. The coordinator was notified of the inherited size conflict with a recommendation for a narrow baseline exception, but the message was rejected with parent-inbox-full and was not retried; no exception approval is claimed.

### Command results

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts libs/frontend/bots-ui/src/lib/bot-editor.component.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`: exit 0, no errors or warnings.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0; scanned 1458 files. Control-class total: 0 token counts over baseline; raw-spacing total: 0 over baseline. No bots-ui FAIL line. Baseline unchanged.
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts`: exit 0; 3 suites and 94 tests passed.
- `npx prettier --write` on the four changed TypeScript files: exit 0. Report also formatted with Prettier.
- Scoped `ptah_get_diagnostics` on the four changed TypeScript files: no diagnostics in requested files; the same five unchanged shared-file TS2737 BigInt target diagnostics remain. Required library tsc passes.
- Write set restricted to the four requested TypeScript files and this report. No npm run verify, nx, git writes, build, serve, dev, e2e or package commands. Electron visual review remains coordinator-owned.
