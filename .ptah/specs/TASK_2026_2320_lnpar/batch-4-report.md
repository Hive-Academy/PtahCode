# Batch 4 report: F1b model and effort pickers; selectors adopt them

Verdict: code complete for Tasks 4.1 and 4.2, but no check has run yet. Do not commit until the Batch 4 commands below pass.

Skills loaded: angular-frontend-patterns, angular-developer.

## Tasks completed

- Task 4.1: `ComposerModelPickerComponent`. `ModelSelectorComponent` now renders it.
- Task 4.2: `ComposerEffortPickerComponent`. `EffortSelectorComponent` now renders it.

## Files

- CREATED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-model-picker.component.ts`. This is the presentational model pill and menu. It carries main chat's markup, including the "Other versions" section, the loading state and the empty state. It adds the pending dot, an optional footer and gating.
- CREATED `...\composer-controls\composer-model-picker.component.spec.ts`. It covers the pill, the menu, other versions (the grouping tests moved here from the selector spec), the pending dot, the footer and gating.
- CREATED `...\composer-controls\composer-effort-picker.component.ts`. This is the presentational effort pill and menu. It now holds the exported `COMPOSER_EFFORT_OPTIONS`, which moved out of the selector, and the `ComposerEffortOption` type.
- CREATED `...\composer-controls\composer-effort-picker.component.spec.ts`. It covers the pill, the bars (the transition-colors pin), the menu, the footer, unique option ids and gating.
- MODIFIED `...\chat-input\model-selector.component.ts`. It is now the tab container only and renders `<ptah-composer-model-picker>`. Changes:
  - The menu state, `KeyboardNavigationService` and the unused `effectiveModelProviderHint` were removed.
  - `selectedModelId` was added.
  - `effectiveModel`, `effectiveModelDisplay` (used by chat-input :829), `selectModel` and `onDropdownOpened` are kept.
- MODIFIED `...\chat-input\effort-selector.component.ts`. It is now the tab container only and renders `<ptah-composer-effort-picker>`. It keeps `effectiveEffort`, `effortChanged` and `selectEffort(option: Pick<ComposerEffortOption,'value'>)`.
- MODIFIED `...\chat-input\model-selector.component.spec.ts`. These are selector-only changes:
  - The `modelGroups` describe moved to the picker spec.
  - One `effectiveAvailableModels()` assertion became `selectedModelId()`.
  - The rendered suite is unchanged.
- MODIFIED `...\chat-input\effort-selector.component.spec.ts`. One line that read the removed `selectedOption()` was dropped. The `effectiveEffort()` assertion on the next line already covers the same thing.

Contract as built:
- Both pickers take the inputs `options`, `selectedId`, `pending` (the dot), `footer` and `disabledReason`, and the output `selected`.
- The model picker also has `loading`, `loaded` and `opened`. Both pickers also emit `reasonRevealed` and `reasonCleared`.
- Neither picker injects `TabManagerService`, `ModelStateService` or `EffortStateService`. They provide only `KeyboardNavigationService`, as the selectors did before.

## Stack observed

- Angular `~22.2.7` (root `package.json`).
- Signals and `input()`/`output()`, standalone OnPush components, `NativeDropdownComponent`/`NativeOptionComponent` from `@ptah-extension/ui`, `lucide-angular`, Tailwind/DaisyUI. All read from `model-selector.component.ts` and `lane-approval-chip.component.ts`.

## Decisions

1. **Focus style**: the pickers keep main chat's current pill focus ring (`focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-base-content/30`). They do not use the outline in `COMPOSER_PILL_CLASS`.
   - Options considered: the ring, or the outline.
   - Evidence: the task says to match main chat's current look and keep it unchanged; this ring is what main chat's pills use today.
   - Reversible: yes, by swapping the class constant in each picker. The specs pin it with `focus-visible:ring-1`.
   - Consequence: `COMPOSER_PILL_CLASS` in chat-ui does not match the pills, and no picker uses it. See the out-of-scope notes.
2. **No main chat footer**: `ModelSelectorComponent` and `EffortSelectorComponent` pass no `footer`.
   - Evidence: design-spec 5.4 and the prototype show "Applies to this tab." in main chat, but main chat does not have that line today, and this batch must leave main chat's look unchanged.
   - Reversible: yes, with one input binding in each selector.
3. **Gated trigger as an `@if`/`@else` pair** sharing one `<ng-template>` of pill content. I did not put `ptahComposerGated` on a single button.
   - Reason: the directive's host binding `[attr.title]` writes `null` when the control is not gated. Directive host bindings run after template bindings, so that would remove the effort pill's `title="Reasoning effort: …"`.
   - Side benefit: main chat's DOM stays exactly as it was, with no extra sr-only node.
   - The effort spec pins the title in the enabled case and the reason title in the gated case.
4. **Effort options use `value`**, not `id`. This keeps the existing `selectEffort({ value })` spec call unchanged. `selectedId` is compared against `option.value`.
5. **Effort option ids now include an instance id** (`effort-<instance>-<i>`). Main chat and a lane composer can be on screen together, and the old `effort-<i>` ids would collide. No spec referenced the old ids.
6. **The model picker has extra inputs `loading` and `loaded`** beyond the planned contract. These keep main chat's spinner, its disabled-while-loading behaviour and its "No models available" row.

## Design fidelity

- design-spec 3 (pills), 5.1 (gated controls), 5.4 (footer copy slot and the 6 px primary dot) and prototype `index.html:235-252`.
- Gated pill: dashed edge from the directive, info glyph instead of the chevron, `aria-disabled`, reason in the title and `aria-describedby`, no `aria-expanded`. A click only reveals the reason.
- The pending dot sits after the icon, as in the prototype. It is `aria-hidden`; the status line announces the change.
- Deviation: the prototype's lane effort pill uses a gauge icon. I kept main chat's level bars, because one control must serve both composers.

## States covered

- Loading: spinner and a disabled pill (model).
- Empty catalog after a finished read (model).
- Interactive: open, close, select, the other-versions toggle, and reset of that toggle on reopen.
- Pending dot.
- Footer.
- Gated: stays focusable, a click reveals the reason, an open menu closes when a reason arrives, blur and pointer-leave clear the reason.
- Added `aria-haspopup="listbox"` on the enabled triggers. This is an attribute only, with no visual change.

## Verification: NOT RUN

| Command | Result |
| --- | --- |
| `npm run verify -- --related -p @ptah-extension/chat` (log `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\.ptah\tmp\b4-related.log`) | Queued on the verify lock from 22:13Z, waiting for memory. Free memory was 2.3 GB against the 5 GB needed. Ahead of it were another worktree's slot and pid 26632 (`typecheck-templates` in this worktree, not started by me). The host then killed it for low system memory before any test ran. The log holds only `waiting on queued pid …` lines: 0 `Tests:` lines and 0 `FAIL` lines. |
| `npm run verify -- -t lint,typecheck -p @ptah-extension/chat` | Not run. I did not restart heavy checks under memory pressure, as the host instructed. |
| `npm run verify -- -t typecheck-templates -p ptah-extension-webview` | Not run, for the same reason. This one is required: both selector templates changed, and the picker templates use `class="${CONST}"` interpolation, which ngc must resolve statically. |
| `npx prettier --write` on the 8 changed files | Ran. Formatting applied. |

The orchestrator must run all three Batch 4 commands before committing. Expected specs: `model-selector.component.spec.ts`, `effort-selector.component.spec.ts`, `composer-model-picker.component.spec.ts`, `composer-effort-picker.component.spec.ts`. Batches 3 (`shared`) and 5 (`chat-ui`) were running at the same time, so check that their edits are finished before checking `chat`, which imports both.

## Risk handling

- **Risk 1 (tab leak)**: the pickers inject nothing tab- or lane-bound. All state is inputs plus the local open and section state.
- **Main chat unchanged**:
  - The selectors keep their selectors, outputs, services and the `effectiveModelDisplay` that chat-input uses.
  - The host styles stay the same: the model selector host keeps `block`, min 3.5rem, max 12rem. The picker host is `block; min-width:0` and carries the dropdown-width rules.
  - Lane hosts should set their own min and max width on the picker.
- **Projection risk**: the rendered selector specs query `[trigger]` and `.dropdown-panel` through the nested picker. Whether `<button trigger>` inside `@if`/`@else` is projected into `ptah-native-dropdown` is proven only once the specs run.
- **Focus on gating**: if a reason arrives while the pill is focused, the trigger element is swapped and focus is lost. Capability changes while a pill is focused should be rare. This is accepted and noted here.

## Plan deviations

- The extra model inputs and outputs (`loading`, `loaded`, `opened`), and the `@if` gated trigger instead of a single directive-bound button (Decisions 3 and 6).

## Out-of-scope observations

- `libs/frontend/chat-ui/src/lib/molecules/composer-card.ts` `COMPOSER_PILL_CLASS` uses the outline focus style, while main chat's pills use a ring. Either align it to the ring or drop it, since nothing uses it now. This belongs to chat-ui, which Batch 5 is editing, so I did not touch it.
- `composer-gated-control.directive.ts`: its `[attr.title]` null write clobbers a title set on the same element. Batch 4 works around it. A fallback-title input would let gated controls keep a non-gated title.
- No barrel export for `composer-controls` yet. Batch 11 needs the pickers exported, or it should import them by relative path inside `chat`.
