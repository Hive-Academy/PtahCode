# B2 frontend report — model picker "Other versions" section

Batch B2 of TASK_2026_908_2835.
Worktree: `D:\projects\ptah-extension\.claude-worktrees\model-catalog-refresh`
(branch `fix/model-catalog-refresh`).

## Changes

- `libs/frontend/chat/src/lib/components/molecules/chat-input/model-selector.component.ts`
  - Removed the `isRecommended` "Recommended" badge and every use of the field.
  - Split rows with `computed()` signals `primaryModels` / `otherModels`
    (order kept from the list).
  - Extracted one shared `ng-template` row used by both groups.
  - Added the "Other versions" toggle row (count, chevron, `aria-expanded`,
    `aria-controls`, `type="button"`), closed by default, open by default when
    the effective selected model sits in the `other` group.
  - Refresh on open: the dropdown's existing `opened` output now calls
    `ModelStateService.refreshModels()` fire-and-forget.
- `libs/frontend/chat/src/lib/components/molecules/chat-input/model-selector.component.spec.ts`
  - Kept the existing `effectiveModel` suite; extracted the stub builder shared
    by a direct-instantiation harness and a rendered harness
    (`renderHarness`, pattern of `peer-session-picker.component.spec.ts` with
    the `@floating-ui/dom` jsdom mock), and added coverage:
    - `primaryModels` / `otherModels` split keeps list order.
    - Section default closed; open when the selected model is `other`-group;
      explicit toggle choice resets on dropdown reopen.
    - Rendered: no badge and no "Recommended" text; no toggle without
      `other` rows; section closed by default with other rows absent from the
      DOM; toggle click shows the rows, emits no selection
      (`switchModel` / `setOverrideModel` untouched) and keeps the dropdown
      open; section starts open with the selected model in the `other` group;
      `refreshModels` called once per dropdown open (again on reopen).


## Decisions

1. **Open hook: the dropdown's existing `opened` output.**
   - Options: (a) call `refreshModels()` inside `toggleDropdown()` when the
     signal flips to open; (b) bind `ptah-native-dropdown`'s existing
     `(opened)` output to a handler.
   - Evidence: `NativeDropdownComponent` already exposes `opened`
     (`native-dropdown.component.ts:199`, "Emitted when dropdown opens and is
     positioned") and the sibling `peer-session-picker` re-exposes the same
     event as its refresh hook; its spec ("refresh on open") is the rendered
     test pattern I copied. `toggleDropdown()` is the only open path, so both
     cover every open.
   - Decision: bind `(opened)="onDropdownOpened()"`. It is the open event the
     dropdown mechanism already owns, and it keeps the component free of a
     second open trigger. The handler is fire-and-forget with a
     `console.error('[ModelSelectorComponent] ...')` catch, matching
     `selectModel`'s error pattern. `fetchModels` never clears the list, so
     the rows stay on screen while the refresh runs (requirement 6).
   - Reversible: yes, one binding + one method.

2. **Section default: tri-state signal, reset on each open.**
   - Options: (a) boolean signal initialized once; (b) tri-state
     `signal<boolean | null>` where `null` means "follow the default"
     (open iff the effective selected model is in the `other` group), reset to
     `null` whenever the dropdown opens; (c) computed-only state the user
     cannot override.
   - Evidence: requirement 4 — closed by default, open by default when the
     selected row is `other`, and the selected row must stay visible. A plain
     boolean cannot react to a list that arrives after construction; a
     computed-only state would make the toggle un-closeable while the selected
     model sits in the group.
   - Decision: (b). `isOtherSectionOpen` reads the override, else
     `otherModels().some((m) => m.isSelected)` (`isSelected` there is the
     effective model, so both phrasings of "selected" in the requirement are
     covered by one check). `toggleDropdown()` clears the override on open, so
     every open starts from the default and the selected row is visible again.
   - Reversible: yes.

3. **Shared row markup: one `ng-template` + `NgTemplateOutlet`.**
   - Options: (a) duplicate the row block per group; (b) `ng-template
     #modelRow` instantiated from both `@for` loops with a context; (c) a loop
     over group objects.
   - Evidence: requirement 3 forbids copying the row markup; the repo already
     uses `[ngTemplateOutlet]` + `[ngTemplateOutletContext]`
     (`settings-toast.component.ts`, `canvas-lane-view.component.ts`).
   - Decision: (b). The row index continues across groups
     (`primaryModels().length + i`), so `optionId` stays unique and the visual
     order matches the index order. `NgTemplateOutlet` comes from
     `@angular/common`; no new package dependency.
   - Reversible: yes.

4. **`aria-controls` target stays mounted while the section is closed.**
   - Options: (a) render the other rows inside `@if` only and point
     `aria-controls` at a missing id while closed; (b) keep an empty
     `#model-other-versions` container mounted so the id always resolves.
   - Evidence: requirement 5 demands `aria-expanded` and `aria-controls` on
     the toggle; a control that points nowhere while closed fails that
     contract.
   - Decision: (b). The container renders no rows while closed (requirement:
     rows absent from the DOM) and is invisible (no classes). The toggle id
     `model-other-versions-toggle` is static per instance, matching the
     existing static `optionId` pattern (`'model-' + i`) in this listbox.
   - Reversible: yes.

5. **Toggle look: option-row classes, repo chevron pattern.**
   - Evidence: requirement 5 — follow the existing classes, no new colors.
     `NativeOptionComponent`'s host classes (`rounded-md px-3 py-2
     transition-colors hover:bg-surface-2 focus-visible:outline...`) are
     reused; the rotating chevron (`transition-transform duration-200
     [class.rotate-180]`, `[attr.aria-expanded]`) is the established toggle
     pattern (`previous-sessions-toolbar.component.ts:101-122`,
     `mcp-servers-card.component.ts:23`). A native `button type="button"` gives
     Enter/Space activation, so it is at least as keyboard-reachable as the
     rows.
   - Reversible: yes.

6. **Spec harness: `as unknown as` stub casts kept.**
   - Evidence: requirement 7 bans `as unknown as X` in component code; the
     component uses none. The spec's stub casts predate this batch and are the
     established spec pattern in this repo (`agent-card-header.component.spec`,
     `chat-input.component.spec`), so the harness keeps them for consistency.
   - Reversible: yes, as a follow-up cleanup if wanted.


## Verification

Run by the coordinator (the lane stopped at its budget before this step).

- Command: `npm run verify -- -p @ptah-extension/chat`
- Lint and typecheck: `NX 2 tasks: 2 succeeded` (1m 28s, no cache hit).
- Test: `NX 1 task: 1 succeeded` (15m 39s, no cache hit).
- Last line: `[verify 2026-11-09T23:19:41.482Z] lock released after 1072.2s, exit code 0`.

## Extra reads

- `libs/shared/src/lib/types/rpc/rpc-config.types.ts` (contract, read-only)
- `libs/frontend/core/src/lib/services/model-state.service.ts` (public API only)
- `libs/frontend/ui/src/lib/native/dropdown/native-dropdown.component.ts`
- `libs/frontend/ui/src/lib/native/option/native-option.component.ts`
- `libs/frontend/ui/src/lib/native/shared/keyboard-navigation.service.ts`
- `libs/frontend/ui/src/lib/native/peer-session-picker/peer-session-picker.component.spec.ts`
  (established rendered-dropdown test pattern, floating-ui mock)
- `libs/frontend/chat/src/lib/components/molecules/previous-sessions-toolbar/previous-sessions-toolbar.component.ts`
  (established chevron `aria-expanded` toggle pattern)

## Open items

- No Electron run and no screenshots: the project rules forbid `serve`,
  `build`, `dev`, `e2e` and `package` targets unless the user asks, so the
  rendered behaviour is proven by the jsdom spec only.
- The static DOM ids (`model-other-versions-toggle`,
  `model-other-versions`, `optionId` `'model-' + i`) repeat across multiple
  `ptah-model-selector` instances (main panel plus canvas tiles). That is the
  pre-existing pattern of this listbox; a per-instance unique id would be a
  separate cleanup across the component.
- The `KeyboardNavigationService` in this component is never `configure()`d,
  so `activeIndex` stays `-1` and hover/active highlighting is inert. That is
  pre-existing behaviour, unchanged by this batch; the group split keeps the
  index space continuous so a future `configure()` would work as before.

