# Settings form controls: plan

Task: TASK_2026_919_8ffc. Related task: TASK_2026_904 (component system, top-down plan).
Date: 2026-11-10. Phase: design and plan only. This file does not change production code.

Companion files:

- `settings-forms-inventory.md`: the 114 controls of the Settings page.
- `prototype/settings-forms.html`: the proposed controls in each state, dark and light.

## 1. Problem

The Settings page has 114 form controls in 4 tabs: Providers 68, Advanced 24, Search and
Voice 15, Context Management 7. The inventory shows these facts:

- 17 native `<select>` elements use DaisyUI classes in three sizes (`select-xs`, `select-sm`,
  default). They have no search, no groups, no loading state and no empty state.
- 5 popovers and 1 custom menu do the work of a select. Each one has its own trigger, its own
  option rows and its own keyboard code. 3 more controls have the kind "other".
- 7 comboboxes use the polished `ptah-provider-model-picker` or
  `ptah-provider-model-search-field`. These are the only dropdowns that look the same as chat
  and setup.
- 26 text inputs, 12 secret inputs and 5 number inputs repeat the label, hint and error markup
  by hand. Some numeric values use `type="text"`.
- A boolean setting is a toggle in 7 places and a checkbox in other places. The toggles use two
  sizes (`toggle-xs`, `toggle-sm`) and two colors (`toggle-success`, `toggle-primary`).
- 14 radio controls use three different markups. Two groups are ad hoc Tailwind with no radio
  keyboard behavior.
- 110 of 114 controls use an event binding and a signal. 4 controls use `ngModel`. No control
  uses reactive forms or signal forms. No form has a shared validation or error model.

Result: the Settings dropdowns do not look the same as the chat and setup dropdowns, and they
do not use Angular features that the repository already has (Angular Aria, signal forms).

## 2. Rules that this plan obeys

These rules come from TASK_2026_904 and from the repository instructions. They are binding.

1. Top-down. Chat, canvas, voice and setup are the polished sources. Settings adopts. A
   polished page never changes to help Settings.
2. An extraction copies the markup and the classes of a polished source as-is into
   `libs/frontend/ui/src/lib/extracted/<name>/` with a star-only barrel (decision D4).
3. Zero changed pixels on the polished source in Electron before Settings adopts the
   extraction. The gate is a Playwright-Electron spec on
   `apps/ptah-electron-e2e/src/docs-screenshots/_harness` (decision D5).
4. `@angular/aria` gives headless behavior only inside a source-derived extraction. It does not
   give a look.
5. Composition uses named slots, `ngTemplateOutlet` with typed `TemplateRef` contexts,
   `hostDirectives`, and `provide*()` look defaults. No speculative variant matrix.
6. A token or a primitive is created only after an extraction is shared by two or more pages.
7. Electron first. Floating UI with `popover="manual"` stays the position base. Angular Aria
   does not replace it.
8. Each batch has a maximum of six write files and two Nx projects.

## 3. Angular facts (verified)

Repository versions: `@angular/core` and `@angular/forms` 22.2.3 (range `~22.2.0`),
`@angular/aria` 22.2.6, `@angular/cdk` `~22.2.0`, `@floating-ui/dom` `^1.7.4`.

### 3.1 Signal forms

| Item | Status in 22.2 | Evidence |
|---|---|---|
| `form()`, `FormField` (`[formField]`), `required`, `validate`, `disabled`, `debounce`, `submit` | Stable | `node_modules/@angular/forms/types/signals.d.ts` and `_structure-chunk.d.ts` mark them `@publicApi 22.0`. angular.dev/events/v22: "Signal Forms, Asynchronous Signals, and Angular Aria are now stable". |
| `FormValueControl<T>`, `FormCheckboxControl`, `FormUiControl` | Stable | Same type files. The angular.dev API page for `FormValueControl` says "stable since v22.0". |
| `provideExperimentalWebMcpForms`, `experimentalWebMcpTool` | Experimental | Marked `@experimental` in the same type files. This plan does not use them. |
| `@angular/forms/signals/compat` (interop with reactive forms) | Published, category "interop" | `signals-compat.d.ts`. Not necessary for Settings, because Settings has no reactive forms. |
| `disabled(path, fn)` direct form | Deprecated | Use `disabled(path, { when })`. |

Contract of a custom control:

- `FormValueControl<T>` requires only `value: ModelSignal<T>`. The control must not define
  `checked`.
- `FormCheckboxControl` requires only `checked: ModelSignal<boolean>`.
- Optional inputs that the `[formField]` directive binds when they are present: `errors`,
  `disabled`, `disabledReasons`, `readonly`, `hidden`, `invalid`, `pending`, `touched`,
  `required`, `min`, `max`, `minLength`, `maxLength`, `pattern`.
- Optional members: `touch: OutputRef<void>`, `focus()`, `reset()`.

Consequence: a control that has `value = model<T>()` is at the same time a plain signal
control (`[(value)]="x"`) and a signal forms control (`[formField]="f.x"`). The control does
not import `@angular/forms`. Thus the new controls do not force signal forms on a caller.

One claim is not verified: a secondary source says that a `FormValueControl` also works with
`ngModel` and `formControlName` in Angular 22. Batch 0 tests this claim. The plan does not
depend on it.

### 3.2 Angular Aria

The installed types of `@angular/aria` 22.2.6 have no `@developerPreview` and no
`@experimental` marks. The package is stable from v22.

| Pattern | Directives | Use in this plan |
|---|---|---|
| Select | `[ngCombobox]` with `readonly`, `ng-template[ngComboboxPopup]`, `[ngListbox]`, `[ngOption]` | `ptah-select` |
| Autocomplete | `[ngCombobox]` on an `<input>`, caller filters the options, `[ngListbox]`, `[ngOption]` | `ptah-combobox` |
| Multiselect | `[ngListbox]` with `multi` | Not in scope. No Settings control needs it. |
| Listbox alone | `[ngListbox]` (`orientation`, `wrap`, `focusMode`, `selectionMode`), `[ngOption]` (`value`, `disabled`, `label`) | Segmented control, radio cards |
| Menu, Tabs, Toolbar, Tree, Grid, Accordion | separate entry points | Not for value controls. Menu is for commands only. |

Angular Aria gives: roles, `aria-expanded`, `aria-activedescendant`, arrow keys, Home, End,
type-ahead, selection, disabled options. Angular Aria does not give: position, top layer,
filter logic, groups headings markup, loading, empty and error states. The extraction gives
those items from the polished sources.

## 4. Target control set

All controls go in `libs/frontend/ui/src/lib/extracted/<name>/` and export from
`@ptah-extension/ui`. Each control is a standalone `OnPush` component or directive with
`input()`, `model()` and `output()`.

Size rule: one control height for Settings, `h-8 min-h-8` (2 rem), which is the height of the
polished model picker. The `-xs` sizes stay only inside dense table cells (the CLI matrix).

### 4.1 Field shell: `ptah-field`

- Polished source: the label, hint, warning and error markup of
  `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts`
  and the setup shell in
  `libs/frontend/setup-wizard/src/lib/components/generation-model-picker.component.ts`
  (`div.space-y-1`, label, control, `p.text-xs.text-base-content-muted`).
- Note: PR #1042 extracted only a class skin (`select[ptahSetupField]`). It did not extract
  the shell. This extraction adds the shell.
- Angular Aria pattern: none. The shell uses a native `<label for>` and `aria-describedby`.
- API sketch:

```ts
@Component({ selector: 'ptah-field' })
export class FieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly warning = input<string>();
  readonly error = input<string>();          // replaces the hint, role="alert"
  readonly required = input(false);
  readonly disabledReason = input<string>(); // shown as hint when the control is disabled
  readonly layout = input<'stacked' | 'row'>('stacked'); // row = label left, control right
  // Slots: default = control, [ptahFieldAction] = trailing action (Retry, Replace)
}
export const FIELD_CONTEXT = new InjectionToken<FieldContext>('FIELD_CONTEXT');
export interface FieldContext {
  readonly controlId: Signal<string>;
  readonly describedBy: Signal<string | null>;
  readonly invalid: Signal<boolean>;
}
```

- A control inside the shell reads `FIELD_CONTEXT` (optional injection) and sets `id`,
  `aria-describedby` and `aria-invalid` on its focus element. The caller writes no ids.
- Forms integration: the shell does not hold a value. With signal forms the caller binds
  `[error]="f.name().errors()[0]?.message"`. A later helper `[ptahFieldFor]="f.name"` can do
  this binding. The helper is optional and is not in the first batches.

### 4.2 Select: `ptah-select` and the native skin

Two forms, one look.

**A. Native skin `select[ptahSelectField]`** for a field with a small static list and plain
text options (for example "Session budget unit", "External MCP callers").

- Polished source: the native select of `ptah-provider-model-picker` (class string
  `select select-sm h-8 min-h-8 rounded-lg border border-surface-border bg-surface-0 …`).
- Decision: extend the existing `SetupFieldDirective` look map with a third look or add a new
  directive. Recommendation: a new directive `select[ptahSelectField]` in
  `extracted/select-field/`, because `ptahSetupField` names a setup look and rule 1 forbids a
  change of the setup look.
- Angular Aria pattern: none. The native element gives the behavior.
- Forms integration: native `<select>` works with `[formField]` directly and with
  `[value]`/`(change)`.

**B. `ptah-select`** for loaded options, groups, option detail (icon, badge, second line),
disabled options with a reason, and loading, empty and error states.

- Polished sources: panel and state rows of
  `libs/frontend/ui/src/lib/native/autocomplete/native-autocomplete.component.ts`
  (`suggestions-panel surface-3 z-50 max-h-80 flex flex-col rounded-xl p-1.5`), option row of
  `native/option/native-option.component.ts`, trigger frame of the model picker select, group
  headings of the chat `unified-suggestions-dropdown.component.ts`, top-layer position of
  `native/dropdown/native-dropdown.component.ts`.
- Angular Aria pattern: Select (readonly `ngCombobox` on a `<button>`, `ngComboboxPopup`,
  `ngListbox`, `ngOption`).
- API sketch:

```ts
export interface SelectOption<T> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly group?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}
@Component({ selector: 'ptah-select' })
export class SelectComponent<T> implements FormValueControl<T | null> {
  readonly value = model<T | null>(null);
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly placeholder = input('Select');
  readonly loading = input(false);
  readonly loadError = input<string>();       // shows the error row and the Retry action
  readonly emptyLabel = input('No options');
  readonly compareWith = input<(a: T, b: T) => boolean>(Object.is);
  // FormValueControl optional members
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly pending = input(false);
  readonly touch = output<void>();
  readonly retry = output<void>();
  // Typed template slots
  readonly optionTemplate = contentChild<TemplateRef<{ $implicit: SelectOption<T>; selected: boolean }>>('option');
  readonly triggerTemplate = contentChild<TemplateRef<{ $implicit: SelectOption<T> | null }>>('trigger');
}
```

- Focus rule from the polished picker: while a save is in progress the control uses
  `aria-disabled` and keeps the focus. It does not use the native `disabled` attribute.

### 4.3 Combobox: `ptah-combobox`

For a long loaded list with search: models, voices, providers.

- Polished source: `ptah-provider-model-search-field` (input with search icon or spinner,
  `aria-busy`, option templates, "Tool use" badge, 'No models match', limit of 50 rows) on
  `ptah-native-autocomplete`.
- Angular Aria pattern: Autocomplete (`ngCombobox` on the `<input>`, caller-side filter).
- Sequence, per the headless library evaluation of TASK_2026_904:
  1. Extract a generic `ptah-combobox<T>` from the model search field as-is. The first
     version keeps `ptah-native-autocomplete` inside.
  2. Make the model search field a thin wrapper of `ptah-combobox`. Gate: zero changed
     pixels in chat and setup.
  3. Replace the internal keyboard code with Angular Aria Combobox after a parity test
     (keys, `aria-activedescendant`, screen reader names). Gate: zero changed pixels again.
- API sketch: the `ptah-select` API plus:

```ts
readonly query = model('');                    // text in the input
readonly filter = input<'local' | 'none'>('local'); // 'none' = the caller filters (remote)
readonly allowCustomValue = input(false);      // free text, for "model ID" fields
readonly maxOptions = input(50);
readonly openOnFocus = input(true);
readonly pinnedOption = input<SelectOption<T>>();
```

- `allowCustomValue` replaces the pair "text input + suggestions combobox" that the inventory
  shows three times (rows A32/A33, A51/A52, A47).

### 4.4 Text field and secret field

- Polished source: the text input of the model picker
  (`input input-sm h-8 min-h-8 w-full … rounded-lg border border-surface-border bg-surface-0`).
- `input[ptahTextField]`, `textarea[ptahTextField]`: a class skin directive on the native
  element. Reads `FIELD_CONTEXT`. Native elements work with `[formField]` directly.
- `ptah-secret-field`: a component, because 12 rows repeat the same structure (masked input,
  show or hide, saved state "Key saved", Replace, Save, error).

```ts
@Component({ selector: 'ptah-secret-field' })
export class SecretFieldComponent implements FormValueControl<string> {
  readonly value = model('');
  readonly savedHint = input<string>();   // for example "Key saved"; never the secret
  readonly saving = input(false);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly touch = output<void>();
  readonly submitted = output<string>();  // Enter or Save
}
```

- Security rule: the component never shows a stored secret and never writes a secret to a log.
- Angular Aria pattern: none.

### 4.5 Number field: `input[ptahNumberField]`

- Polished source: the same input frame as the text field.
- Native `type="number"` with `inputmode`, `min`, `max`, `step`, right-aligned
  `tabular-nums`, and an optional unit suffix slot from the shell.
- Replaces the numeric `type="text"` inputs (rows A2, B17, B18, A48).
- Forms integration: `[formField]` gives `min` and `max` and the error text.
- Angular Aria pattern: none.

### 4.6 Toggle, checkbox, radio

- Polished sources: toggle of the setup plugin catalog
  (`chat-ui/…/setup-plugins/plugin-catalog-panel.component.ts`, `toggle toggle-primary
  toggle-sm`), radio of `setup-plugins/install-scope-field.component.ts`
  (`radio radio-xs radio-primary`), checkbox of the same catalog
  (`checkbox checkbox-xs checkbox-primary`).
- `input[ptahToggle]`: one size (`toggle-sm`) and one color (`toggle-primary`) for each
  boolean setting. The glass rules in `styles.css` already style it.
- `ptah-setting-row`: label and description on the left, control on the right. This is the
  `row` layout of `ptah-field`, not a second component.
- Semantic rule: a boolean setting that applies immediately is a toggle. A checkbox is only
  for a list where the user selects more than one item (builtin tools, MCP namespaces).
- `ptah-radio-group` with `ptah-radio-card`: for 2 to 4 options that have a description
  (model source, save scope, protocol). Native `input[type=radio]` with one `name` gives the
  arrow-key behavior. It replaces the two ad hoc groups without keyboard behavior.
- Forms integration: native checkbox and radio work with `[formField]`.
  `ptah-radio-group` implements `FormValueControl<T>`.

### 4.7 Segmented control: `ptah-segmented`

- Source: the effort control of `settings/ptah-ai/cli-model-effort-popover.component.ts` and
  `providers/main-agent-reassign-popover.component.ts` (3 rows). The chat effort selector is
  the polished reference for the look. Batch 0 confirms the exact chat source file.
- Angular Aria pattern: `ngListbox` with `orientation="horizontal"` and `ngOption`.
  Alternative: native radio group. Recommendation: native radio group, because it needs no
  extra dependency for a control with five options.
- Implements `FormValueControl<T>`.

### 4.8 Not extracted now

- Slider: 1 row. Rule 6 forbids an extraction for one use. It gets the focus ring only.
- Textarea: 1 row in Settings. It uses the `ptahTextField` skin.
- The two "credential mode" buttons (A66, A67) become a `ptah-radio-group`.

## 5. Forms integration strategy

1. Controls first. Each custom control exposes `value = model<T>()` (or `checked`). It
   satisfies `FormValueControl` by structure. Existing callers keep their signal and bind
   `[(value)]`. No caller must change its state model to adopt a control.
2. Signal forms second, only where a form has validation or a submit step: the output style
   editor, the add account form, the add CLI instance modal, the connection drawer advanced
   tab, the provider setup wizard, the session budget and lane guard fields. Use `form()` with
   a schema (`required`, `min`, `max`, `pattern`, `validate`) and `[formField]`.
3. Settings that save immediately (toggles, single selects) stay on a signal plus an RPC
   call. A `form()` adds no value there.
4. Remove `ngModel` from the 4 template-driven controls when their file migrates. Then the
   Settings folder has one forms model.
5. No reactive forms. No `ControlValueAccessor` in new code.

## 6. Migration batches

Each batch has a maximum of six write files and two Nx projects. Spec files of a changed
component count as write files. The verify command of each batch is the scoped form.
The Electron screenshot gate uses the harness of decision D5. Run it under the verify lock:

```
node scripts/verify.mjs --exec --task shots -- npx nx run ptah-electron-e2e:<target> -- --grep <shot>
```

Batch 0 confirms the exact target name and adds a `settings-forms.shot.ts` file.

| # | Batch | Write files (max 6) | Nx projects | Verify | Screenshot gate (Electron) |
|---|---|---|---|---|---|
| 0 | Gate and proof. Add `settings-forms.shot.ts` (baseline shots of the 4 Settings tabs and of the chat and setup model pickers). Add a spec that proves `FormValueControl` with `[formField]` and tests the `ngModel` claim. | shot file, 1 spec, harness index | `ptah-electron-e2e`, `@ptah-extension/ui` | `npm run verify -- -p @ptah-extension/ui,ptah-electron-e2e` | Baselines recorded. No change expected. |
| 1 | `ptah-field` shell and `FIELD_CONTEXT`. | component, context token, spec, `extracted/field/index.ts`, `extracted/index.ts` | `@ptah-extension/ui` | `npm run verify -- -p @ptah-extension/ui` | Zero changed pixels (no adopter). |
| 2 | Skins: `select[ptahSelectField]`, `[ptahTextField]`, `[ptahNumberField]`, `[ptahToggle]`. | 4 directives, 1 spec, barrel | `@ptah-extension/ui` | same | Zero changed pixels. |
| 3 | `ptah-select` on Angular Aria Select. | component, option type, template, spec, barrel | `@ptah-extension/ui` | same | Zero changed pixels. Story shot of the new control in each state. |
| 4 | `ptah-combobox` extracted from the model search field. The model search field becomes a wrapper. | combobox, spec, search field, its spec, barrel | `@ptah-extension/ui` | `npm run verify -- -p @ptah-extension/ui,@ptah-extension/chat` | Zero changed pixels in chat and setup model pickers. This is the main risk gate. |
| 5 | `ptah-secret-field`, `ptah-radio-group`, `ptah-segmented`. | 3 components, 2 specs, barrel | `@ptah-extension/ui` | `npm run verify -- -p @ptah-extension/ui` | Zero changed pixels. |
| 6 | Context Management tab (7 rows): session budget, lane guards, cache TTL, host routing, lane rotation. | 5 components, 1 spec | `@ptah-extension/chat` | `npm run verify -- -p @ptah-extension/chat` | Context Management tab, dark and light. Reviewed against the prototype. |
| 7 | Search and Voice tab, part 1: ElevenLabs panel, voice config, web search config. | 3 components, 3 specs | `@ptah-extension/chat` | same | Search and Voice tab. |
| 8 | Search and Voice tab, part 2: local STT, local TTS, Go vet consent. | 3 components, 3 specs | `@ptah-extension/chat` | same | Search and Voice tab. |
| 9 | Advanced tab, part 1: advanced settings group, Codex sandbox, MCP port, VS Code LM, license key. | 5 components, 1 spec | `@ptah-extension/chat` | same | Advanced tab. |
| 10 | Advanced tab, part 2: agent behaviour section, Claude builtins, output style editor, list, parity section, instructions field. | 6 components | `@ptah-extension/chat` | same | Advanced tab and the output style drawer. |
| 11 | Providers tab, CLI matrix: lane default cell, Claude account cell, model effort popover, Copilot toggle, Cursor credential, CLI instances. | 6 components | `@ptah-extension/chat` | same | Providers tab, CLI matrix. Dense `-xs` sizes stay here. |
| 12 | Providers tab, decision models and main agent: decision model row and its 3 field components, main agent reassign popover, consumer assignments. | 6 components | `@ptah-extension/chat` | same | Providers tab. |
| 13 | Providers tab, connection drawer and modals: advanced tab, credentials tab, models tiers tab, add account form, add CLI instance modal, CLI tier mapping modal. | 6 components | `@ptah-extension/chat` | same | Connection drawer and the two modals. |
| 14 | Provider setup wizard. First split the 2478-line file behind its facade, then adopt (19 rows). Use three sub-batches of six files. | per sub-batch: max 6 | `@ptah-extension/chat` | same | Each wizard step. |
| 15 | Clean-up: remove dead local popover option code, remove `FormsModule` imports that are no longer used, update the inventory counts. | max 6 | `@ptah-extension/chat` | same | All 4 tabs. Final comparison with the batch 0 baselines. |

Order rules:

- Batches 1 to 5 create controls and have no adopter. They must leave each screen unchanged.
- A tab batch starts only after the controls that it uses passed their gate.
- Each tab batch is one pull request. The user examines the Electron screenshots before the
  next tab batch starts.
- The row counts per file come from the table `## Controls per file` of the inventory.

## 7. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| The combobox extraction changes the chat or setup model picker. | A polished page changes. This breaks rule 1. | Batch 4 has the zero-pixel gate. If the gate fails, keep the model search field as it is and build `ptah-combobox` as a copy. |
| Angular Aria popup and the Floating UI top layer disagree on focus or on outside click. | A dropdown closes at the wrong time in Electron. | Batch 3 proves the combination in one control before any adopter. `ngComboboxPopup` content goes inside the existing `popover="manual"` panel. |
| A dropdown inside a drawer or a modal is clipped or is below the backdrop. | The option list is not visible. | Use the top layer path of `ptah-native-dropdown`. Add a drawer case and a modal case to the batch 3 shots. |
| A native select has a system option list. The new select has a styled list. | Long lists behave differently (type-ahead, scroll). | Keep the native skin for small static lists. Use `ptah-select` only where the inventory shows loaded options, groups or states. |
| The provider setup wizard file is very large. | A batch exceeds six files or creates conflicts. | Split behind the facade first (batch 14). Do not extend the file. |
| Toggle color changes from success to primary in 3 places. | A visible change that the user did not request. | It is a decision for the user (D3). The prototype shows both. |
| Signal forms validation changes when an error shows. | Different error timing in a form. | Adopt signal forms per form, not per control. Keep the existing rule "show the error after touch or submit" in each schema. |
| Other sessions edit the same Settings files. | Merge conflicts. | Small tab batches, one pull request each, started from the current `main`. |
| The `-xs` controls in the CLI matrix become 2 rem high. | The matrix rows grow. | The matrix keeps a compact look through `provideSelectFieldLook('compact')` in that subtree. |

## 8. Decisions for the user

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Which select for a small static list. | (a) Native `<select>` with the polished skin. (b) `ptah-select` for all selects. | (a). The native select is fully accessible, costs nothing, and TASK_2026_904 selected it for simple forms. Use `ptah-select` where options are loaded, grouped or have detail. |
| D2 | Forms model for Settings. | (a) Signal-first controls, signal forms only for forms with validation. (b) Signal forms for all Settings. (c) Keep event bindings only. | (a). The APIs are stable in 22.2. Immediate-save settings get no value from a `form()`. |
| D3 | Look of a boolean setting. | (a) One toggle: `toggle-sm toggle-primary`, the setup look. (b) Keep `toggle-success` for routing toggles. (c) Keep both sizes. | (a). One look. Checkboxes stay only for multi-select lists. |
| D4 | Control height in Settings. | (a) 2 rem (`h-8`) everywhere, compact only in the CLI matrix. (b) Keep the `-xs` controls in the Advanced tab. | (a). It matches the polished model picker. |
| D5 | Popovers that act as a select (5 rows) and the custom menu (1 row). | (a) Replace with `ptah-select`. (b) Keep the popovers and only restyle the rows. | (a) for single-value choices. Keep a popover only where it holds more than one field (model plus effort). |
| D6 | "Model ID" text input plus a separate suggestions combobox (3 places). | (a) One `ptah-combobox` with `allowCustomValue`. (b) Keep two controls. | (a). |
| D7 | Angular Aria inside the combobox. | (a) Adopt after the parity test (batch 4, step 3). (b) Keep `ptah-native-autocomplete` keyboard code. | (a), but only if the zero-pixel gate and the parity test pass. |
| D8 | Extraction of the combobox. | (a) The model search field becomes a wrapper of `ptah-combobox`. (b) `ptah-combobox` is a copy and the model search field does not change. | (a). Fall back to (b) if the gate fails. |
| D9 | Order of the tabs. | (a) Context Management, Search and Voice, Advanced, Providers. (b) Providers first. | (a). Small tabs first prove the controls. Providers has 68 rows and the largest file. |
| D10 | Numeric settings that use `type="text"`. | (a) Change to the number field with `min`, `max` and an error. (b) Keep text. | (a). |

## 9. Assumptions

- AskUserQuestion is not available in this session. The decisions above use the
  recommendation until the user answers.
- The inventory counts come from two analysis lanes. A merge step examined a sample of rows
  against the source. The section `## Corrections made in the merge` of the inventory lists
  the differences.
- This phase did not run `npm run verify`, a build, or an Electron screenshot, per the task
  brief.
