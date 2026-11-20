# Batch U06a review

Review family: claude (implementer: codex)

Score: 6/10
Verdict: REVISE

Scope: five new files in `libs/frontend/bots-ui/src`, read in full. Context read: store, row, editor error display,
list-detail, chat loader, design-spec.

## Defects

1. **High-medium: page index is not clamped.** `bots-page.component.ts:278-283` (`visibleRows`) and `:177`.
   Example: 33 bots, the user opens page 2, then deletes or archives the one bot there. The store refreshes and
   `filtered()` has 32 rows. `page()` is still 1. `visibleRows()` is empty. The pager is hidden (`filtered().length > 32`
   is false) and the "No bots match" text is hidden (`filtered().length` is not 0). The roster looks empty with no
   control to recover. The same happens when a workspace change or refresh shrinks the list.
   Fix: clamp the page. Use `computed` with `Math.min(page(), max(pageCount()-1, 0))`, or an effect that resets it.
   Add a spec for it.

2. **Medium: the detail pane stays open after delete.** `bots-page.component.ts:104,234,401`.
   After `store.delete()` the store sets `selected` and `draft` to null. `detailOpen` stays true, so `selectedId` is
   `'new'`. The wide layout shows an empty editor, not the "Select a bot" prompt. The narrow layout stays on a blank
   detail with Back. If the last bot is deleted, `empty()` is false (`!detailOpen()`), so the empty state never shows.
   Fix: derive `detailOpen` from `store.draft() !== null` (for example an effect, or `selectedId` from the draft),
   and reset it when the draft becomes null. Add a spec for delete.

3. **Medium: selection and draft survive a workspace change.** `bots-page.component.ts:294-307`.
   The roster reloads, but the selected bot and the draft of the old workspace stay. The store uses the host
   workspace for ID calls, so a save can fail with a confusing error. A failed reload also keeps the old list under
   the error (`bots.store.ts:225-234`). Fix: on a root change, confirm and discard a dirty draft, or clear the
   selection and `detailOpen`. Record the choice. The report decision 3 covers only filters, not workspace change.

4. **Low: whole roster flashes on each save.** `bots-page.component.ts:152`. `store.refresh()` after each write
   sets `loading`. The rows unmount and the search input is disabled (focus is lost). Keep the rows while
   `list()` is not null, and show the skeleton only for the first load.

5. **Low: stale create scope.** `bots-page.component.ts:232,412-418`. `createScope` is not reset when the roots
   change. If the chosen root is gone, or the select is hidden (one root), the stale value is still sent to
   `newDraft`. Fix: validate against `store.workspaceRoots()` before use.

6. **Low: dynamic `<select [value]>`.** `:79`. The value binding can run before the `@for` options exist, so the
   shown choice can lag the signal. Bind `[selected]` on each option.

7. **Low: avatar recovery gives up after one try.** `:338-346`. After one recovery, a second eviction leaves the
   row blank with no error until the user pages away. Safe against loops, but the row has no Retry in that state.
   Acceptable for now. Note it for the visual review.

8. **Low: design drift on the dirty confirm.** `:381-387`. The design (design-spec line 134) names an inline
   confirm "Discard unsaved changes?". The page uses the shared `WORKSPACE_COORDINATOR.confirm` dialog with other
   text. Behaviour order (confirm, discard, select) is correct. List it for R01.

9. **Low: archived count text.** `:135`. N is the server total for all scopes. With the scope filter set to
   User, N can be higher than the archived rows the checkbox would reveal.

## Design deviations for R01

- **32-row pagination (decision 2).** It is a design deviation. The design and prototype show one roster list
  with no pager. Judgement: it does not hide data and does not break search or filter. Search, scope and archive
  filters run over all loaded summaries before the slice (`:258-283`), and each filter change resets to page 1.
  Selection lives in the store, so a selected bot on another page stays open in the editor. Costs:
  (a) the selected row highlight is not visible when it is on another page, and a new saved bot can land on
  another page; (b) defect 1 above; (c) the pager is new UI with no design. It is an acceptable way to meet the 64
  avatar limit only after defect 1 is fixed. Ask R01 to approve it or to ask for list virtualization.
  A page size of 32 against a cache of 64 is safe.
- Dirty confirm is a modal dialog, not the inline confirm (defect 8).
- Header is a plain `<header>`, not `ptah-page-header` (design-spec line 78).
- Scope select for new bot in multi-root is new UI, not in the design. It is needed by the carry-forward row.
- Preview-later row sits at the end of the list pane. The prototype position was not compared in a browser.
- No real Electron render was seen. The report states this. R01 must do it.

## Checked, no defect

- `setWorkspaceRoots` runs before `load` in one `untracked` block (`:297-303`). The effect re-runs on root or
  active change. The store drops stale list responses with `listSequence`. Catalog loads use their own sequence.
- Dirty navigation: `navigating` is set before the first await, so concurrent clicks are ignored (`:392,397`).
  A declined confirm leaves draft and selection unchanged. Discard runs before `select`. Same for New bot and Back.
  Select failure with a null draft shows `store.error` on the page.
- Avatars: requests come from the row `avatarNeeded` and `avatarRetry` outputs, deferred with `queueMicrotask`, and
  deduplicated with `pendingAvatars`. The microtask checks destroy and visibility. At most 32 image rows are
  mounted (limit 64). The recovery runs once per mount, so there is no loop.
- `catalogLoaded` is false while loading (initial value true) and after any failure. Failed calls and thrown
  errors both set `catalogFailed`. Stale catalog responses are ignored.
- Error ownership: the page shows `store.error()` only when `draft()` is null. The editor shows it only inside
  `@if (store.draft())` (editor line 66, 210). No double alert. `listError` shows only in the list with Retry.
- Multi-root: no implicit first-root scope. The select shows when `requiresCreateScope()` or there are no roots.
  The store refuses a missing scope with a visible message.
- Unreadable rows render as `role="note"` with no button. The unidentified count is one notice.
- `BotsProviderModelsLoader` is identical in behaviour to the chat `ProvidersModelsLoader`: same RPC, same throw
  text on failure, returns `result.data` (which carries a resolved `error` field) on success. It matches the port.
  It does not import chat. Only `providedIn: 'root'` differs (the chat class has none). Harmless, but the page
  also provides it by `useClass`, so the root registration is unused. Low, no action.
- Barrel exports only `BotsPageComponent`. No `innerHTML`, `ngClass`, `ngStyle`. Files are below 700 lines.

## Command results

- `npx jest ... --runTestsByPath bots-page.component.spec.ts`: 1 suite, 17 tests passed.
- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: no output (pass).
- `npx eslint` on the four TypeScript files: no output (pass).
- Coordinator lint, typecheck, related tests and typecheck-templates: pass (given).

## Safe to carry forward to U07

Yes. U07 adds a route and a surface id only, and it does not depend on the defects above. The page export and the
`ptah-bots-page` selector are stable. Fix defects 1 to 3 before R01. They need no change to the public API.

## Re-review 1

Review family: claude (implementer: codex)

Score: 8/10
Verdict: APPROVED (two low defects can go to R01 or a later fix)

### Status of defects 1-6 and 9

| # | Status | Evidence |
| --- | --- | --- |
| 1 | Fixed | `bots-page.component.ts:302-304` `currentPage` clamps `page()`. Slice (`:305-310`) and pager (`:192-202`) use it. Spec `:409`. |
| 2 | Fixed | `:243-247` `hasDraft` (boolean computed) feeds `linkedSignal`. Field edits do not change the boolean, so the detail stays open. Draft to null resets it to false. `newBot` sets `detailOpen` after `newDraft`. This is safe: `linkedSignal.set` recomputes a changed source first, then stores the value. `selectBot` also sets it after `await select`. Empty state follows (`:265-274`). Spec `:440`, `:470`. |
| 3 | Fixed, with one low gap (new defect A) | See the store check below. Generation guard at `:319-320, 342, 428, 436, 447-451, 463-465, 487-489`. Spec `:481`, `:514`. |
| 4 | Fixed | `:249-251` `firstLoading` needs `list() === null`. Search (`:120`) and skeleton (`:161`) use it. Spec `:537`. |
| 5 | Fixed | Reset on workspace change `:343`. `newBot` checks the choice against `store.workspaceRoots()` or `user` (`:467-472`). Spec `:560`, `:595`. |
| 6 | Fixed | `[selected]` on each option (`:82-89`), no `[value]` on the select. |
| 9 | Fixed | `matchingRows` (`:275-290`) applies scope and search. `archivedCount` (`:291-293`) counts archived matches. The list loads with `includeArchived: true`, so all archived rows are in `summaries`. Spec `:613`. |

### Workspace-change fix: store check (defect 3)

`newDraft({kind:'user'})` then `discard()` is correct. Evidence in `bots.store.ts`:

- `newDraft` (`:256-288`): a scope is given, so the refusal branch (`:258`) is skipped. `requiresCreateScope` and
  `readonly` cannot refuse it (`readonly` is not checked in `newDraft`). It returns true. The old bot cannot stay
  selected. It runs `invalidateEditor()` (`:495-507`), then `_selected.set(null)` (`:268`), then sets a blank draft.
- `discard` (`:319-325`): `invalidateEditor()` again, then `_selected()` is null, so `_draft.set(null)`.
- Result: `selected` null, `draft` null. `invalidateEditor` clears `error`, `conflict`, `diagnostics`, `upload`, staged
  avatar, sets `saveState` to `pristine`, `saving` and `selecting` to false, and bumps `selectRequestSequence`,
  `writeSequence`, `uploadSequence`. No RPC call. A pending select is ignored. A pending write result is ignored
  (it only refreshes the list on success). `hasDraft` is read after both writes, so the middle blank draft is never
  seen by the template.
- Pending confirm: `leaveDraft` returns false when the generation changed (`:436`), so no discard or select runs in
  the new workspace. `selectBot`, `newBot` and `back` check it again. After a select in flight, `detailOpen` is set
  from the draft, which is null.
- `bots.store.ts` has no change in the worktree. A `clearSelection()` method is not required.
  It would still be cleaner (two calls hide intent, and `draftEpoch` rises twice). Optional.

### New defects

A. **Low-medium: old roster stays during a workspace reload.** `bots-page.component.ts:249-251, 346-350`. The page
   clears the editor, but `store.list()` keeps the old workspace rows. `firstLoading` is false, so the old rows show
   and can be clicked until the new list arrives. If the reload fails, the old rows stay under the error
   (`bots.store.ts:225-234`). A click calls `select` for an ID of the old workspace in the new host context.
   Fix: add a page signal set at workspace change and cleared when `store.loading()` ends with a new list, and use it
   as `firstLoading`. Or add a store `clearList()`. Add a spec.

B. **Low: the notice never clears.** `:335-339`. `workspaceNotice` stays until the next workspace change, even after
   the user opens another bot. Fix: clear it in `selectBot`, `newBot` or after a timeout. Keep it as status text.

C. **Low (info): a confirm dialog that opened before the switch stays open.** `:436`. The user can confirm it and
   nothing happens, with no message. The notice partly covers this. Accept for R01.

Items 7 and 8 stay open for R01 as decided.

### Command results

- `npx jest ... --runTestsByPath bots-page.component.spec.ts`: 1 suite, 29 tests passed.
- `npx ngc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint` on the page and its spec: no output (pass).
- Coordinator lint, typecheck (ngc) and related tests: pass (given).

### Safe to carry forward

Yes. The public API is unchanged (`BotsPageComponent` only). U07 can start. Fix A before R01 if the coordinator agrees.

## Re-review 2

Review family: claude (implementer: codex)
Score: 9/10
Verdict: APPROVED

### Defect status

- **A (old rows visible during reload): FIXED.** `bots.store.ts:190` `clearList` increments `listSequence`, nulls `_list`, `_listError` and `listParams`, and clears `_loading`. `load` checks `token !== listSequence` after the await (`:214`). A stale success or stale failure returns early. It cannot fill rows or set an error. The page calls `clearList` before `load` (`bots-page.component.ts:331`), so the skeleton shows and no old row is clickable. Specs `bots.store.spec.ts:151` and `:168` cover a stale success and a stale failure.
- **B (notice never clears): FIXED.** `selectBot` (`:441`) and `newBot` (`:462`) clear `workspaceNotice` after the busy guard. Spec at `bots-page.component.spec.ts:693`.

### Checks requested

- **Same-workspace refresh keeps rows.** `refresh` calls `load`. `load` does not clear `_list`. Defect 4 stays fixed.
- **`clearSelection` equals the old pair.** It increments `selectionSequence`, calls `invalidateEditor` (resets select, write, upload sequences, saving, upload, conflict, diagnostics, error, saveState), nulls `selected` and `draft`, and bumps `draftEpoch` once. It makes no RPC call. Spec `:182` checks this.
- **Pending select.** `invalidateEditor` increments `selectRequestSequence`, so a late `get` result is dropped. Spec `:201` covers it.
- **Refresh after a save in flight.** The stale write takes the `selection !== selectionSequence` branch and calls `refresh`. With `listParams` null this does nothing. If the new workspace already set `listParams`, it reloads the new workspace. This is harmless and no stale row appears.
- **`deepEqual` move.** The code is identical in `bots-store-helpers.ts`. The store imports it. No behaviour change.

### New defects

None. One note (not a defect): `loadLaneChoices` has no clear on workspace change. It is outside A and B, and its own sequence guards it.

### Command results

- `npx jest ... bots.store.spec.ts bots-page.component.spec.ts`: 2 suites, 82 tests passed.
- `npx ngc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: exit 0.
- `npx eslint bots.store.ts bots-store-helpers.ts bots-page.component.ts`: exit 0.

Safe to carry forward to U07: yes.
