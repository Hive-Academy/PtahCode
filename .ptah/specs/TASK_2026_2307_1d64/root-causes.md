# Root causes - TASK_2026_2307_1d64 (items 1, 2, 3, 8, 9)

Scope: inventory only. No source edited, no nx/verify/tests run. Paths are relative to the worktree
`/home/amun/ptah-extension/.claude-worktrees/fix-settings-providers-polish-c6e14c260bd3`.
Items 1-3 come from the predecessor handoff
(`/home/amun/ptah-extension/.ptah/subagent-handoffs/toolu_013MS9sJWXhMsqG5LhrB4R1W.md`) and were not re-read.
Items 8 and 9 were traced in this pass. Items 4-7 and 10 are out of scope here.

---

## Item 1 - the select chevron renders below the Provider / Account / Save-to selects

- Responsible: `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html:78`,
  `:187`, `:322`. Each passes `class="block w-full"` to `<ptah-select>`.
- Root cause (confirmed): `ptah-select` is a one-cell grid. `.ptah-select { display: grid; grid-template-columns:
  minmax(0,1fr) }` is at `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css:13-18`. The trigger sits in
  `grid-area: 1/1` (:45-46), and `.ptah-select__actions` (the chevron) also sits in `grid-area: 1/1` with
  `justify-self: end` (:185-195). `apps/ptah-extension-webview/src/styles.css:22` imports ptah-select.css BEFORE
  `@tailwind utilities` (:27). The `.block` utility has the same specificity and comes later, so `display: block`
  wins. The grid is lost and the actions span drops onto its own line under the button.
- Smallest fix: remove `block` at the three call sites. Keep `w-full`, or drop it as well, because
  `:where(ptah-select){inline-size:100%}` already applies (ptah-select.css:22-24). Optional hardening: give the
  `display: grid` rule a higher specificity in ptah-select.css so a host utility class cannot override it. Other
  ptah-select users (agent-behaviour-section, voice-config) do not pass `block`.
- Specs: `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-look.spec.ts`,
  `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts` (title assertion
  :277). No spec asserts the `block` class.

## Item 2 - the `CLI agent` badge should sit on line 2 (secondary), not line 1

- Responsible: `libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts:172-179`. The badge is
  projected as `ptahRowInfo` into `.ptah-table-row-title-primary` (line 1).
- Root cause (confirmed): `PtahTableRowTitleComponent`
  (`libs/frontend/ui/src/lib/patterns/table/table-cells.ts:43-103`) renders `secondary` as plain text (:57-63) and has
  no projection slot on line 2. A container query in lane-row-identity.component.ts:131-145 (`max-width 13rem`)
  works around this only at narrow widths, using `position:absolute` and a 5rem padding on the secondary text.
- Other placement CSS: `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css:260-272`, `:422-428`
  (already `grid-row: 2` in the collapsed layout: `.ptah-table-row-title-kind { grid-column: 1 / -1; grid-row: 2 }`,
  verified this pass at :421-427) and `:605-612` (hidden below 640px, P-18).
- Smallest fix: (a) add a `<ng-content select="[ptahRowSecondary]">` slot beside the secondary text in
  table-cells.ts, project the badge there, and delete the container-query workaround and the dead grid-row rules.
  Or (b) render line 2 inside lane-row-identity itself (no ui-lib change, but it duplicates the title layout).
  Recommended: (a), the shared pattern owns the two-line layout.
- Specs asserting OLD behaviour (must change): `lane-row-identity.component.spec.ts:150-159` ("is in the first line,
  after the name": the badge parent is the primary span), `lanes-table.visual.component.spec.ts:565-585` (the kind is
  under primary). Also covered by `libs/frontend/ui/src/lib/patterns/table/table-cells.spec.ts`.

## Item 3 - the Memory curator / Enhancement trigger icon sits high and to the left

- Responsible: `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:183-219`
  (the `<ptah-provider-mark>` at :201-208 has no `size`, so it defaults to md, inside a `ptahButton size="sm"`).
- Root cause (confirmed): ProviderMark md is an `h-8 w-8` box holding `ptah-mark-svg class="h-6 w-6"`
  (`libs/frontend/ui/src/lib/native/provider-mark/provider-mark.component.ts:85-97`). The mark-svg host is a block, and
  its svg is `block h-full w-full` (mark-svg.component.ts:49-52). The button rule
  `.btn[data-ptah-button].btn-sm:is(.btn,#ptah-button) :where(svg){width/height:var(--ptah-icon-sm)}`
  (`libs/frontend/ui/src/lib/button/ptah-button.css:113-116`; the token is 0.875rem at ptah-tokens.css:43) has id
  specificity, so it shrinks the inner svg to 14px. The svg is then pinned top-left inside its 24px host, which sits
  in a 32px box.
- Smallest fix: `size="sm"` on that provider-mark. Optional ui hardening: exclude `ptah-mark-svg svg` from the
  button svg rule (`:where(svg):not(ptah-mark-svg svg)`), which also fixes every other provider-mark inside a ptahButton.
- Specs: `provider-consumer-assignments.component.spec.ts`, `provider-mark.component.spec.ts` (if present). None
  asserts the md size on this trigger. Check with a grep for `consumer-edit-` in the spec.

---

## Item 8 - provider and model dropdowns get out of sync (Memory curator / Enhancement, and the main agent)

Data path (verified):
- Rows: `provider-consumer-assignments.component.ts:637-646` calls `buildConsumerRows({memory, enhancement},
  route, scopeOf)` (`provider-consumer-rows.ts:224-271`). The memory row reads `curatorProvider`/`curatorModel` raw
  (:239-240). The enhancement row reads `model: toPickerModel(enhancement.data?.model)` (:261).
- Picker binding: `[provider]="currentDraft().provider" [model]="currentDraft().model"
  [disabled]="busy() || disabled()" (selectionChange)="onDraftChange(row.id, $event)"` (component :246-253).
  `busy = this.feedback.saving` (:591).
- Save: `onDraftChange` (:682-692) sets `currentDraft`, returns if `draftProviderReadiness()?.blocking`, otherwise calls
  `saveDraft`. `saveDraft` (:696-719) writes through `state.saveSettings(consumerPatch(...))` →
  `ProvidersCommitService.run` (`libs/frontend/core/src/lib/services/providers-commit.service.ts:334-395`).
  This calls `refreshScopes`, checks the context, writes, and always calls `hooks.refresh()` afterwards (:380-381).
- Refresh: `readSection` (`libs/frontend/core/src/lib/services/providers-settings-sections.ts`) sets
  `{status:'loading', data: previous}`, then `{status:'ready', data}`. The previous data stays visible, so the save
  is not applied optimistically and does not flash empty.

Candidate paths from the handoff, settled:

1. **Stale context after the first save - REJECTED.** `reviewContext()` holds only
   `{scopeKey, activePath}` (`providers-settings-state.service.ts:921-929`). `contextMatches` compares only those two
   fields (`providers-commit.service.ts:452-462`). A second save in the same popover and workspace passes.
   **Related finding, CONFIRMED:** `toggleEdit` snapshots `this.context = this.state.reviewContext()` (:666).
   `reviewContext()` returns `null` while `scopes().status !== 'ready'`. `saveDraft` then returns silently:
   `if (!row || !context || this.busy() || this.disabled()) return;` (:699-700). The picker keeps showing the draft
   while the cell and the store keep the old value. No feedback and no revert happen. This occurs when the popover
   opens during a scopes refresh, and every save ends with one (commit.service.ts:342 and :381).
2. **Early return while busy leaves an unsaved draft - CONFIRMED (code), user path partly mitigated.**
   `onDraftChange` writes `currentDraft` BEFORE `saveDraft` checks `busy()` (:686-691 vs :700). The picker is disabled
   while busy, and the picker refuses a select change when disabled: `if (this.disabled()) { select.value =
   this.selectedProvider(); return; }` (`libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:689-694`).
   So the `<select>` path is safe. Hypothesis: the manual-model entry and the searchable field still emit while
   busy. `selectModel` (:712-715) has no disabled guard, but its callers were not read.
   The readiness-blocked return (:690) also leaves the draft unsaved. That is intended, because a blocking message
   is shown.
3. **A provider change saves an intermediate `{provider, model:''}` - CONFIRMED. Most likely cause of the
   reported desync.** `onProviderChange` does `this._model.set(''); void this.loadModels(value); this.emit();`
   (picker :695-701). `onDraftChange` saves at once. The save makes `busy()` true and disables the picker for the whole
   commit: refreshScopes + write + readBack + full `refresh()` of every section. The model list of the new provider
   loads in that same window. A model the user picks before the commit settles is refused and the select snaps
   back to `selectedModelId()` (:704-709). The user sees: new provider, model reset to Default, and their model pick
   lost. Memory then stores `curatorModel: ''` (consumerPatch, provider-consumer-rows.ts:282-283). Enhancement
   stores `'inherit'` (:284).
4. **Picker effect not re-run / draft not reset after 'saved' - REJECTED as a desync.** After `'saved'` the
   refreshed row equals the draft that was written. The picker effect (:665-672) copies `provider()`/`model()` into
   `_provider`/`_model` on every input change, and the `catalogueProvider` guard skips only the catalogue reload.
   Residual (hypothesis, low): an external change to the same setting while the popover is open is not shown in the
   picker, because the draft is not re-derived from the row after `'saved'` (:710).
5. **Model sentinels - REJECTED.** The enhancement row reads through `toPickerModel` ('inherit' → '')
   (rows :43-45, :261). It writes through `toBackendEnhancementModel` ('' → 'inherit') (:52-54, :284), and the commit
   op normalises again with `requested.trim() || 'inherit'` (commit.service.ts:147-152). The readBack compares against
   that same value (:158-160). Memory uses '' at both ends: the backend default is `curatorModel: ''`
   (`libs/backend/memory-curator/src/lib/triggers/memory-trigger-config.ts:118-119`), and readBack compares
   `triggers[field] === value` (commit.service.ts:141-143).
6. **saveSettings refresh vs optimistic patch - REJECTED.** Not optimistic: `run` always refreshes (:380-381), and
   `readSection` keeps the previous data while loading. Side effect (hypothesis, cosmetic):
   `activeProviderId` is `null` while `commit().status === 'saving'` (state.service.ts:199-209).
   `draftProviderReadiness` uses `!!this.state.activeProviderId()` (component :647-656). A row that follows the main
   agent (provider '') can therefore flash the blocking "Choose a provider to start the main agent." message during
   any save.

**Main-agent reassign popover - CONFIRMED desync.**
`libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts`:
- `onProvider(id)`: `if (id !== this.providerId()) this.modelDraft.set(null);` (:450-451).
- `selectedModel = computed(() => this.modelDraft() ?? this.currentModel())` (:252-254), and `currentModel` is the
  STORED model `this.state.model().data?.model ?? ''` (:249-251).
- `modelOptions = mainAgentModelOptions(this.catalogue().models, this.selectedModel())` (:260-262). For a selected id
  that is missing from the new catalogue, it prepends `` `${selected} · not in current catalog` ``
  (`main-agent-options.ts:40-45`).
- `modelChanged = !!selectedModel() && selectedModel() !== currentModel()` (:278-281). The save sends a model only
  when `modelChanged` (:692).
- Effect: after the user switches the provider connection, the Model select shows the PREVIOUS provider's model as
  "· not in current catalog" in the new provider's list. If the user does not pick a model, the save writes the new
  provider and keeps the old provider's model id.

Smallest fixes (item 8):
- Consumer rows (paths 1 and 3), in `provider-consumer-assignments.component.ts`:
  (a) Resolve the context at save time, not only on open: `const context = this.context ?? this.state.reviewContext()`.
  When it is still null, revert the draft to the row (or show the blocked feedback) instead of returning silently.
  (b) Coalesce draft saves. When `onDraftChange` arrives while a save is in flight, keep the latest draft. When the
  in-flight save settles, re-run `saveDraft` if `currentDraft` differs from the refreshed row. The picker must then
  stay enabled for the model select during a save. This is a decision for the implementer and reviewer, because it
  touches the TASK_2026_555 54.1 "disabled while saving" contract. The alternative is to save on a provider change
  only after the new catalogue loads, so the provider and model are written as one patch.
  Recommended: (b) with the single-patch rule. One patch also removes the intermediate `model:''` write.
- Path 6 (optional): base readiness on the route data, not `activeProviderId` while saving. This is a one-line change
  in `draftProviderReadiness`.
- Main-agent popover: on a provider change to a provider that is not the driver, set an explicit "provider
  default" draft instead of `null`. For example, set `modelDraft` to a `''` sentinel and make `selectedModel` treat
  `''` as default. Make `modelChanged` true when the draft is `''` and the stored model is non-empty, so the save
  clears the old id. `resetProvider` (:468-481) already restores `null` when the user goes back to the driver.
  Assumption: the main-agent model setting is per-route, not per-provider, so clearing it is the correct behaviour.
  Check `auth:saveSettings`/model write semantics in `providers-commit.service.ts` before you implement.

Specs:
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.spec.ts` (consumer
  save/undo/revert). Any test that expects a provider change to save `{provider, model:''}` at once, or expects the
  picker to be disabled while saving, asserts the OLD behaviour. Grep `selectionChange` / `model: ''` in that spec.
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.spec.ts` (if present) for consumerPatch and
  the sentinels. These need no change.
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.spec.ts`: the
  "provider change resets model and emits" and "disabled refuses change" cases.
- `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts`: add a regression
  test for the provider switch clearing the stale model. Look for a test asserting `modelDraft` null / the
  "not in current catalog" option after a provider change.

---

## Item 9 - "All capabilities" squeezes the Ask and Yolo lines into one-character-wide columns

- Responsible rule: `libs/frontend/ui/src/lib/patterns/table/table.component.ts:88-93` (`ViewEncapsulation.None`,
  :31):
  ```css
  .ptah-table-detail-cell dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
  ```
- Victim markup: `libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-detail.component.ts:19-21`, where
  `<dl class="grid gap-2">` holds one `<div class="min-w-0">` per line (dt + dd + reason).
- Root cause (confirmed by code, not rendered): the capability detail renders inside the lanes-table detail cell
  `<td ptahDetailCell ...>` (`libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html:448-453`) →
  `ptah-lanes-table-detail` → `ptah-disclosure` (lanes-table-detail.component.html:118-129). The unscoped
  descendant rule `.ptah-table-detail-cell dl` (specificity 0,1,1) beats Tailwind `.grid` (0,1,0) and adds two
  columns to a list that was meant to have one. Each line wrapper becomes a grid item. Line 1, 3, ... sits in the
  `max-content` track, line 2, 4, ... in `minmax(0,1fr)`. The Permissions group has the lines Plan, Ask, Auto-edit,
  Yolo (`cli-capability-view.ts:41-48`), each with a long `reason` ("Native mode: ... Network: ..."). The max-content
  track grows to the unwrapped width of the Plan/Auto-edit reason, and the 1fr track gets almost nothing.
  `overflow-wrap: anywhere` (inherited from `ptah-lanes-table-detail`, lanes-table-detail.component.css:5-6, and set
  on dt/dd at :46-51) lets the Ask and Yolo text break at every character, so they end up one character wide. The
  same happens to the 2nd/4th line of Messaging (Interrupt, Resume saved session) and of Integration.
- Assumption: `ptahDetailCell` adds the class `ptah-table-detail-cell` to the td. Check the directive in
  `libs/frontend/ui/src/lib/patterns/table/` (grep `ptah-table-detail-cell`).
- Not the cause (checked): the outer `repeat(auto-fit, minmax(min(14rem,100%),1fr))` grid
  (cli-capability-detail.component.ts:15). The host `max-width: calc(100cqw - 4.75rem)` / sticky (:14) is overridden
  to `position: static; max-width: none` by `ptah-lanes-table-detail .lane-detail-all-capabilities`
  (lanes-table-detail.component.css:99-103, specificity 0,1,1 vs `[_nghost]` 0,1,0). The detail layout puts the
  disclosure in the full-width `body` area (table-detail-layout.ts:39, :96-97).
- Smallest fix: in `cli-capability-detail.component.ts` (the owner of the markup), add a component-scoped rule that
  wins over the leak, e.g. `:host dl { grid-template-columns: minmax(0, 1fr); }` in its `styles`. The emulated form
  is `[_nghost-x] dl[_ngcontent-x]`, specificity 0,2,1. A Tailwind `grid-cols-1` class alone does NOT work (0,1,0
  loses to 0,1,1). Better, optional ui hardening: narrow the leaking rule to the description lists it was meant for,
  for example `.ptah-table-detail-cell :where(dl:not([class~='grid']))`, or wrap it in `:where()` so a consumer's
  own layout wins. The ui fix changes every detail cell's dl, so check the other `ptahDetailCell` consumers before you
  choose it.
- Specs: `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts:248-254` (disclosure
  open), `cli-capability-view.spec.ts` (view model, unaffected). No spec asserts the column count. jsdom does not
  compute grid layout, so the regression check belongs in the Electron visual review / e2e
  (`lanes-table.visual.component.spec.ts` if it checks computed style), or in a unit test that asserts the
  component-scoped style is present.

---

## Decisions

- Item 9 fix location: component-scoped override in cli-capability-detail (chosen) vs narrowing the ui table rule
  (optional hardening). Evidence: table.component.ts:88-93 is shared by every detail cell. Reversible.
- Item 8 consumer save: a single provider+model patch with coalescing is recommended. It touches the
  TASK_2026_555 54.1 disabled-while-saving behaviour, so the implementer should confirm it with the existing picker
  specs. Reversible.

## File ownership map

| Item | Files to touch | Shared with |
| --- | --- | --- |
| 1 | `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html` (:78, :187, :322); optional `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css` | popover .html not touched by others; popover **.ts** is item 8 |
| 2 | `libs/frontend/ui/src/lib/patterns/table/table-cells.ts` (+ `table-cells.spec.ts`); `libs/frontend/chat/src/lib/settings/ptah-ai/lane-row-identity.component.ts` (+ spec :150-159); `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css` (:260-272, :421-427, :605-612); `lanes-table.visual.component.spec.ts` (:565-585) | ui `patterns/table/` folder with item 9 (different file: table.component.ts) |
| 3 | `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts` (:201-208); optional `libs/frontend/ui/src/lib/button/ptah-button.css` (:113-116) | **provider-consumer-assignments.component.ts shared with item 8** |
| 8 | `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts` (toggleEdit :657-668, onDraftChange :682-692, saveDraft :696-719, draftProviderReadiness :647-656) + its spec; `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts` (:249-281, :450-451) + its spec; possibly `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts` (:689-715) + spec | **shares provider-consumer-assignments.component.ts with item 3**; popover component (ts vs html) with item 1 |
| 9 | `libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-detail.component.ts` (:14-21); optional `libs/frontend/ui/src/lib/patterns/table/table.component.ts` (:88-93) | none for the chosen fix; the optional ui change touches the table folder item 2 also edits |

Ordering constraint: items 3 and 8 edit the same component file, so one executor handles them or they run in
sequence. Items 1 and 8 edit different files of the same popover component (html vs ts) and can run in parallel
with care. Items 2 and 9 are otherwise file-disjoint.
